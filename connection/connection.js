'use strict';

var inherits = require('util').inherits,
  EventEmitter = require('events').EventEmitter,
  net = require('net'),
  tls = require('tls'),
  crypto = require('crypto'),
  f = require('util').format,
  debugOptions = require('./utils').debugOptions,
  parseHeader = require('../wireprotocol/shared').parseHeader,
  decompress = require('../wireprotocol/compression').decompress,
  Response = require('./commands').Response,
  MongoNetworkError = require('../error').MongoNetworkError,
  Logger = require('./logger'),
  OP_COMPRESSED = require('../wireprotocol/shared').opcodes.OP_COMPRESSED,
  MESSAGE_HEADER_SIZE = require('../wireprotocol/shared').MESSAGE_HEADER_SIZE,
  Buffer = require('safe-buffer').Buffer;

var _id = 0;
var debugFields = [
  'host',
  'port',
  'size',
  'keepAlive',
  'keepAliveInitialDelay',
  'noDelay',
  'connectionTimeout',
  'socketTimeout',
  'singleBufferSerializtion',
  'ssl',
  'ca',
  'crl',
  'cert',
  'rejectUnauthorized',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'checkServerIdentity'
];

var connectionAccountingSpy = undefined;
var connectionAccounting = false;
var connections = {};

/**
 * Creates a new Connection instance
 * @class
 * @param {string} options.host The server host
 * @param {number} options.port The server port
 * @param {number} [options.family=null] IP version for DNS lookup, passed down to Node's [`dns.lookup()` function](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback). If set to `6`, will only look for ipv6 addresses.
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=300000] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=30000] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=360000] TCP Socket timeout setting
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.crl] SSL Certificate revocation store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @fires Connection#connect
 * @fires Connection#close
 * @fires Connection#error
 * @fires Connection#timeout
 * @fires Connection#parseError
 * @return {Connection} A cursor instance
 */
var Connection = function(messageHandler, options) {
  // Add event listener
  EventEmitter.call(this);
  // Set empty if no options passed
  this.options = options || {};
  // Identification information
  this.id = _id++;
  // Logger instance
  this.logger = Logger('Connection', options);
  // No bson parser passed in
  if (!options.bson) throw new Error('must pass in valid bson parser');
  // Get bson parser
  this.bson = options.bson;
  // Grouping tag used for debugging purposes
  this.tag = options.tag;
  // Message handler
  this.messageHandler = messageHandler;

  // Max BSON message size
  this.maxBsonMessageSize = options.maxBsonMessageSize || 1024 * 1024 * 16 * 4;
  // Debug information
  if (this.logger.isDebug())
    this.logger.debug(
      f(
        'creating connection %s with options [%s]',
        this.id,
        JSON.stringify(debugOptions(debugFields, options))
      )
    );

  // Default options
  this.port = options.port || 27017;
  this.host = options.host || 'localhost';
  this.family = typeof options.family === 'number' ? options.family : void 0;
  this.keepAlive = typeof options.keepAlive === 'boolean' ? options.keepAlive : true;
  this.keepAliveInitialDelay =
    typeof options.keepAliveInitialDelay === 'number' ? options.keepAliveInitialDelay : 300000;
  this.noDelay = typeof options.noDelay === 'boolean' ? options.noDelay : true;
  this.connectionTimeout =
    typeof options.connectionTimeout === 'number' ? options.connectionTimeout : 30000;
  this.socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;

  // Is the keepAliveInitialDelay > socketTimeout set it to half of socketTimeout
  if (this.keepAliveInitialDelay > this.socketTimeout) {
    this.keepAliveInitialDelay = Math.round(this.socketTimeout / 2);
  }

  // If connection was destroyed
  this.destroyed = false;

  // Check if we have a domain socket
  this.domainSocket = this.host.indexOf('/') !== -1;

  // Serialize commands using function
  this.singleBufferSerializtion =
    typeof options.singleBufferSerializtion === 'boolean' ? options.singleBufferSerializtion : true;
  this.serializationFunction = this.singleBufferSerializtion ? 'toBinUnified' : 'toBin';

  // SSL options
  this.ca = options.ca || null;
  this.crl = options.crl || null;
  this.cert = options.cert || null;
  this.key = options.key || null;
  this.passphrase = options.passphrase || null;
  this.ciphers = options.ciphers || null;
  this.ecdhCurve = options.ecdhCurve || null;
  this.ssl = typeof options.ssl === 'boolean' ? options.ssl : false;
  this.rejectUnauthorized =
    typeof options.rejectUnauthorized === 'boolean' ? options.rejectUnauthorized : true;
  this.checkServerIdentity =
    typeof options.checkServerIdentity === 'boolean' ||
    typeof options.checkServerIdentity === 'function'
      ? options.checkServerIdentity
      : true;

  // If ssl not enabled
  if (!this.ssl) this.rejectUnauthorized = false;

  // Response options
  this.responseOptions = {
    promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
    promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
    promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false
  };

  // Flushing
  this.flushing = false;
  this.queue = [];

  // Internal state
  this.connection = null;
  this.writeStream = null;

  // Create hash method
  var hash = crypto.createHash('sha1');
  hash.update(f('%s:%s', this.host, this.port));

  // Create a hash name
  this.hashedName = hash.digest('hex');

  // All operations in flight on the connection
  this.workItems = [];
};

inherits(Connection, EventEmitter);

Connection.prototype.setSocketTimeout = function(value) {
  if (this.connection) {
    this.connection.setTimeout(value);
  }
};

Connection.prototype.resetSocketTimeout = function() {
  if (this.connection) {
    this.connection.setTimeout(this.socketTimeout);
  }
};

Connection.enableConnectionAccounting = function(spy) {
  if (spy) {
    connectionAccountingSpy = spy;
  }

  connectionAccounting = true;
  connections = {};
};

Connection.disableConnectionAccounting = function() {
  connectionAccounting = false;
  connectionAccountingSpy = undefined;
};

Connection.connections = function() {
  return connections;
};

function deleteConnection(id) {
  // console.log("=== deleted connection " + id + " :: " + (connections[id] ? connections[id].port : ''))
  delete connections[id];

  if (connectionAccountingSpy) {
    connectionAccountingSpy.deleteConnection(id);
  }
}

function addConnection(id, connection) {
  // console.log("=== added connection " + id + " :: " + connection.port)
  connections[id] = connection;

  if (connectionAccountingSpy) {
    connectionAccountingSpy.addConnection(id, connection);
  }
}

//
// Connection handlers
var errorHandler = function(conn) {
  return function(err) {
    if (connectionAccounting) deleteConnection(conn.id);
    // Debug information
    if (conn.logger.isDebug())
      conn.logger.debug(
        f(
          'connection %s for [%s:%s] errored out with [%s]',
          conn.id,
          conn.host,
          conn.port,
          JSON.stringify(err)
        )
      );
    // Emit the error
    if (conn.listeners('error').length > 0) conn.emit('error', new MongoNetworkError(err), conn);
  };
};

var timeoutHandler = function(conn) {
  return function() {
    if (connectionAccounting) deleteConnection(conn.id);
    // Debug information
    if (conn.logger.isDebug())
      conn.logger.debug(f('connection %s for [%s:%s] timed out', conn.id, conn.host, conn.port));
    // Emit timeout error
    conn.emit(
      'timeout',
      new MongoNetworkError(f('connection %s to %s:%s timed out', conn.id, conn.host, conn.port)),
      conn
    );
  };
};

var closeHandler = function(conn) {
  return function(hadError) {
    if (connectionAccounting) deleteConnection(conn.id);
    // Debug information
    if (conn.logger.isDebug())
      conn.logger.debug(f('connection %s with for [%s:%s] closed', conn.id, conn.host, conn.port));

    // Emit close event
    if (!hadError) {
      conn.emit(
        'close',
        new MongoNetworkError(f('connection %s to %s:%s closed', conn.id, conn.host, conn.port)),
        conn
      );
    }
  };
};

// Handle a message once it is recieved
var emitMessageHandler = function(conn, message) {
  var msgHeader = parseHeader(message);
  if (msgHeader.opCode === OP_COMPRESSED) {
    msgHeader.fromCompressed = true;
    var index = MESSAGE_HEADER_SIZE;
    msgHeader.opCode = message.readInt32LE(index);
    index += 4;
    msgHeader.length = message.readInt32LE(index);
    index += 4;
    var compressorID = message[index];
    index++;
    decompress(compressorID, message.slice(index), function(err, decompressedMsgBody) {
      if (err) {
        throw err;
      }
      if (decompressedMsgBody.length !== msgHeader.length) {
        throw new Error(
          'Decompressing a compressed message from the server failed. The message is corrupt.'
        );
      }
      conn.messageHandler(
        new Response(conn.bson, message, msgHeader, decompressedMsgBody, conn.responseOptions),
        conn
      );
    });
  } else {
    conn.messageHandler(
      new Response(
        conn.bson,
        message,
        msgHeader,
        message.slice(MESSAGE_HEADER_SIZE),
        conn.responseOptions
      ),
      conn
    );
  }
};

var dataHandler = function(conn) {
  return function(data) {
    // Parse until we are done with the data
    while (data.length > 0) {
      // If we still have bytes to read on the current message
      if (conn.bytesRead > 0 && conn.sizeOfMessage > 0) {
        // Calculate the amount of remaining bytes
        var remainingBytesToRead = conn.sizeOfMessage - conn.bytesRead;
        // Check if the current chunk contains the rest of the message
        if (remainingBytesToRead > data.length) {
          // Copy the new data into the exiting buffer (should have been allocated when we know the message size)
          data.copy(conn.buffer, conn.bytesRead);
          // Adjust the number of bytes read so it point to the correct index in the buffer
          conn.bytesRead = conn.bytesRead + data.length;

          // Reset state of buffer
          data = Buffer.alloc(0);
        } else {
          // Copy the missing part of the data into our current buffer
          data.copy(conn.buffer, conn.bytesRead, 0, remainingBytesToRead);
          // Slice the overflow into a new buffer that we will then re-parse
          data = data.slice(remainingBytesToRead);

          // Emit current complete message
          try {
            var emitBuffer = conn.buffer;
            // Reset state of buffer
            conn.buffer = null;
            conn.sizeOfMessage = 0;
            conn.bytesRead = 0;
            conn.stubBuffer = null;

            emitMessageHandler(conn, emitBuffer);
          } catch (err) {
            var errorObject = {
              err: 'socketHandler',
              trace: err,
              bin: conn.buffer,
              parseState: {
                sizeOfMessage: conn.sizeOfMessage,
                bytesRead: conn.bytesRead,
                stubBuffer: conn.stubBuffer
              }
            };
            // We got a parse Error fire it off then keep going
            conn.emit('parseError', errorObject, conn);
          }
        }
      } else {
        // Stub buffer is kept in case we don't get enough bytes to determine the
        // size of the message (< 4 bytes)
        if (conn.stubBuffer != null && conn.stubBuffer.length > 0) {
          // If we have enough bytes to determine the message size let's do it
          if (conn.stubBuffer.length + data.length > 4) {
            // Prepad the data
            var newData = Buffer.alloc(conn.stubBuffer.length + data.length);
            conn.stubBuffer.copy(newData, 0);
            data.copy(newData, conn.stubBuffer.length);
            // Reassign for parsing
            data = newData;

            // Reset state of buffer
            conn.buffer = null;
            conn.sizeOfMessage = 0;
            conn.bytesRead = 0;
            conn.stubBuffer = null;
          } else {
            // Add the the bytes to the stub buffer
            var newStubBuffer = Buffer.alloc(conn.stubBuffer.length + data.length);
            // Copy existing stub buffer
            conn.stubBuffer.copy(newStubBuffer, 0);
            // Copy missing part of the data
            data.copy(newStubBuffer, conn.stubBuffer.length);
            // Exit parsing loop
            data = Buffer.alloc(0);
          }
        } else {
          if (data.length > 4) {
            // Retrieve the message size
            // var sizeOfMessage = data.readUInt32LE(0);
            var sizeOfMessage = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
            // If we have a negative sizeOfMessage emit error and return
            if (sizeOfMessage < 0 || sizeOfMessage > conn.maxBsonMessageSize) {
              errorObject = {
                err: 'socketHandler',
                trace: '',
                bin: conn.buffer,
                parseState: {
                  sizeOfMessage: sizeOfMessage,
                  bytesRead: conn.bytesRead,
                  stubBuffer: conn.stubBuffer
                }
              };
              // We got a parse Error fire it off then keep going
              conn.emit('parseError', errorObject, conn);
              return;
            }

            // Ensure that the size of message is larger than 0 and less than the max allowed
            if (
              sizeOfMessage > 4 &&
              sizeOfMessage < conn.maxBsonMessageSize &&
              sizeOfMessage > data.length
            ) {
              conn.buffer = Buffer.alloc(sizeOfMessage);
              // Copy all the data into the buffer
              data.copy(conn.buffer, 0);
              // Update bytes read
              conn.bytesRead = data.length;
              // Update sizeOfMessage
              conn.sizeOfMessage = sizeOfMessage;
              // Ensure stub buffer is null
              conn.stubBuffer = null;
              // Exit parsing loop
              data = Buffer.alloc(0);
            } else if (
              sizeOfMessage > 4 &&
              sizeOfMessage < conn.maxBsonMessageSize &&
              sizeOfMessage === data.length
            ) {
              try {
                emitBuffer = data;
                // Reset state of buffer
                conn.buffer = null;
                conn.sizeOfMessage = 0;
                conn.bytesRead = 0;
                conn.stubBuffer = null;
                // Exit parsing loop
                data = Buffer.alloc(0);
                // Emit the message
                emitMessageHandler(conn, emitBuffer);
              } catch (err) {
                conn.emit('parseError', err, conn);
              }
            } else if (sizeOfMessage <= 4 || sizeOfMessage > conn.maxBsonMessageSize) {
              errorObject = {
                err: 'socketHandler',
                trace: null,
                bin: data,
                parseState: {
                  sizeOfMessage: sizeOfMessage,
                  bytesRead: 0,
                  buffer: null,
                  stubBuffer: null
                }
              };
              // We got a parse Error fire it off then keep going
              conn.emit('parseError', errorObject, conn);

              // Clear out the state of the parser
              conn.buffer = null;
              conn.sizeOfMessage = 0;
              conn.bytesRead = 0;
              conn.stubBuffer = null;
              // Exit parsing loop
              data = Buffer.alloc(0);
            } else {
              emitBuffer = data.slice(0, sizeOfMessage);
              // Reset state of buffer
              conn.buffer = null;
              conn.sizeOfMessage = 0;
              conn.bytesRead = 0;
              conn.stubBuffer = null;
              // Copy rest of message
              data = data.slice(sizeOfMessage);
              // Emit the message
              emitMessageHandler(conn, emitBuffer);
            }
          } else {
            // Create a buffer that contains the space for the non-complete message
            conn.stubBuffer = Buffer.alloc(data.length);
            // Copy the data to the stub buffer
            data.copy(conn.stubBuffer, 0);
            // Exit parsing loop
            data = Buffer.alloc(0);
          }
        }
      }
    }
  };
};

// List of socket level valid ssl options
var legalSslSocketOptions = [
  'pfx',
  'key',
  'passphrase',
  'cert',
  'ca',
  'ciphers',
  'NPNProtocols',
  'ALPNProtocols',
  'servername',
  'ecdhCurve',
  'secureProtocol',
  'secureContext',
  'session',
  'minDHSize'
];

function merge(options1, options2) {
  // Merge in any allowed ssl options
  for (var name in options2) {
    if (options2[name] != null && legalSslSocketOptions.indexOf(name) !== -1) {
      options1[name] = options2[name];
    }
  }
}

function prepareConnectionOptions(conn, _options) {
  let options;
  if (conn.ssl) {
    options = {
      socket: conn.connection,
      rejectUnauthorized: conn.rejectUnauthorized
    };

    // Merge in options
    merge(options, conn.options);
    merge(options, _options);

    // Set options for ssl
    if (conn.ca) options.ca = conn.ca;
    if (conn.crl) options.crl = conn.crl;
    if (conn.cert) options.cert = conn.cert;
    if (conn.key) options.key = conn.key;
    if (conn.passphrase) options.passphrase = conn.passphrase;

    // Override checkServerIdentity behavior
    if (conn.checkServerIdentity === false) {
      // Skip the identiy check by returning undefined as per node documents
      // https://nodejs.org/api/tls.html#tls_tls_connect_options_callback
      options.checkServerIdentity = function() {
        return undefined;
      };
    } else if (typeof conn.checkServerIdentity === 'function') {
      options.checkServerIdentity = conn.checkServerIdentity;
    }

    // Set default sni servername to be the same as host
    if (options.servername == null) {
      options.servername = conn.host;
    }

    options = Object.assign({}, options, { host: conn.host, port: conn.port });
  } else {
    if (conn.domainSocket) {
      options = { path: conn.host };
    } else {
      options = { port: conn.port, host: conn.host };
    }
  }

  return options;
}

function makeConnection(conn, options, callback) {
  const netModule = options.ssl ? tls : net;

  const connection = netModule.connect(options, function() {
    if (conn.ssl) {
      // Error on auth or skip
      if (connection.authorizationError && conn.rejectUnauthorized) {
        return conn.emit('error', connection.authorizationError, conn, { ssl: true });
      }
    }
    // Set socket timeout instead of connection timeout

    connection.setTimeout(conn.socketTimeout);
    return callback(null, connection);
  });

  // Set the options for the connection
  connection.setKeepAlive(conn.keepAlive, conn.keepAliveInitialDelay);
  connection.setTimeout(conn.connectionTimeout);
  connection.setNoDelay(conn.noDelay);

  // Add handlers for events
  connection.once('error', err => callback(err, null));
}

function normalConnect(conn, family, _options, callback) {
  const options = prepareConnectionOptions(conn, _options);
  makeConnection(conn, Object.assign({ family }, options), (err, connection) => {
    if (err) return callback(err, null);
    callback(null, connection);
  });
}

function fastFallbackConnect(conn, _options, callback) {
  const options = prepareConnectionOptions(conn, _options);

  let errors = [];
  let connection;
  const connectionHandler = (err, _connection) => {
    if (err) {
      if (errors.length > 0) {
        // an error occurred for the second time, we have officially failed
        // return mongo error to be emitted
        return callback(err, null);
      }

      // otherwise push the error, and wait for subsequent connects
      errors.push(err);
      return;
    }

    if (_connection) {
      if (connection) {
        _connection.removeAllListeners('error');
        _connection.unref();
        return;
      }

      connection = _connection;
      return callback(null, connection);
    }
  };

  makeConnection(conn, Object.assign({ family: 6 }, options), connectionHandler);

  // IPv4 attempts to connect 250ms after IPv6 to give IPv6 preference
  setTimeout(() => {
    makeConnection(conn, Object.assign({ family: 4 }, options), connectionHandler);
  }, 250);
}

/**
 * Connect
 * @method
 */
Connection.prototype.connect = function(_options) {
  _options = _options || {};
  // Set the connections
  if (connectionAccounting) addConnection(this.id, this);
  // Check if we are overriding the promoteLongs
  if (typeof _options.promoteLongs === 'boolean') {
    this.responseOptions.promoteLongs = _options.promoteLongs;
    this.responseOptions.promoteValues = _options.promoteValues;
    this.responseOptions.promoteBuffers = _options.promoteBuffers;
  }

  const connectHandler = (err, connection) => {
    const connectionErrorHandler = errorHandler(this);

    if (err) {
      connectionErrorHandler(err);
      return;
    }

    // Add handlers for events
    connection.once('error', connectionErrorHandler);
    connection.once('timeout', timeoutHandler(this));
    connection.once('close', closeHandler(this));
    connection.on('data', dataHandler(this));
    this.connection = connection;
    this.emit('connect', this);
    return;
  };

  if (this.family !== void 0) {
    return normalConnect(this, this.family, _options, connectHandler);
  }

  return fastFallbackConnect(this, _options, connectHandler);
};

/**
 * Unref this connection
 * @method
 * @return {boolean}
 */
Connection.prototype.unref = function() {
  if (this.connection) this.connection.unref();
  else {
    var conn = this;
    this.once('connect', function() {
      conn.connection.unref();
    });
  }
};

/**
 * Destroy connection
 * @method
 */
Connection.prototype.destroy = function() {
  // Set the connections
  if (connectionAccounting) deleteConnection(this.id);
  if (this.connection) {
    // Catch posssible exception thrown by node 0.10.x
    try {
      this.connection.end();
    } catch (err) {} // eslint-disable-line
    // Destroy connection
    this.connection.destroy();
  }

  this.destroyed = true;
};

/**
 * Write to connection
 * @method
 * @param {Command} command Command to write out need to implement toBin and toBinUnified
 */
Connection.prototype.write = function(buffer) {
  var i;
  // Debug Log
  if (this.logger.isDebug()) {
    if (!Array.isArray(buffer)) {
      this.logger.debug(
        f('writing buffer [%s] to %s:%s', buffer.toString('hex'), this.host, this.port)
      );
    } else {
      for (i = 0; i < buffer.length; i++)
        this.logger.debug(
          f('writing buffer [%s] to %s:%s', buffer[i].toString('hex'), this.host, this.port)
        );
    }
  }

  // Double check that the connection is not destroyed
  if (this.connection.destroyed === false) {
    // Write out the command
    if (!Array.isArray(buffer)) {
      this.connection.write(buffer, 'binary');
      return true;
    }

    // Iterate over all buffers and write them in order to the socket
    for (i = 0; i < buffer.length; i++) this.connection.write(buffer[i], 'binary');
    return true;
  }

  // Connection is destroyed return write failed
  return false;
};

/**
 * Return id of connection as a string
 * @method
 * @return {string}
 */
Connection.prototype.toString = function() {
  return '' + this.id;
};

/**
 * Return json object of connection
 * @method
 * @return {object}
 */
Connection.prototype.toJSON = function() {
  return { id: this.id, host: this.host, port: this.port };
};

/**
 * Is the connection connected
 * @method
 * @return {boolean}
 */
Connection.prototype.isConnected = function() {
  if (this.destroyed) return false;
  return !this.connection.destroyed && this.connection.writable;
};

/**
 * A server connect event, used to verify that the connection is up and running
 *
 * @event Connection#connect
 * @type {Connection}
 */

/**
 * The server connection closed, all pool connections closed
 *
 * @event Connection#close
 * @type {Connection}
 */

/**
 * The server connection caused an error, all pool connections closed
 *
 * @event Connection#error
 * @type {Connection}
 */

/**
 * The server connection timed out, all pool connections closed
 *
 * @event Connection#timeout
 * @type {Connection}
 */

/**
 * The driver experienced an invalid message, all pool connections closed
 *
 * @event Connection#parseError
 * @type {Connection}
 */

module.exports = Connection;
