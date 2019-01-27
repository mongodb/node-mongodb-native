'use strict';

const EventEmitter = require('events').EventEmitter;
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const debugOptions = require('./utils').debugOptions;
const parseHeader = require('../wireprotocol/shared').parseHeader;
const decompress = require('../wireprotocol/compression').decompress;
const Response = require('./commands').Response;
const BinMsg = require('./msg').BinMsg;
const MongoNetworkError = require('../error').MongoNetworkError;
const MongoError = require('../error').MongoError;
const Logger = require('./logger');
const OP_COMPRESSED = require('../wireprotocol/shared').opcodes.OP_COMPRESSED;
const OP_MSG = require('../wireprotocol/shared').opcodes.OP_MSG;
const MESSAGE_HEADER_SIZE = require('../wireprotocol/shared').MESSAGE_HEADER_SIZE;
const Buffer = require('safe-buffer').Buffer;

let _id = 0;
const DEBUG_FIELDS = [
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

let connectionAccountingSpy = undefined;
let connectionAccounting = false;
let connections = {};

/**
 * A class representing a single connection to a MongoDB server
 *
 * @fires Connection#connect
 * @fires Connection#close
 * @fires Connection#error
 * @fires Connection#timeout
 * @fires Connection#parseError
 */
class Connection extends EventEmitter {
  /**
   * Creates a new Connection instance
   *
   * @param {function} messageHandler A function called each time a complete message is received off the wire
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
   */
  constructor(messageHandler, options) {
    super();

    options = options || {};
    if (!options.bson) {
      throw new TypeError('must pass in valid bson parser');
    }

    this.id = _id++;
    this.options = options;
    this.logger = Logger('Connection', options);
    this.bson = options.bson;
    this.tag = options.tag;
    this.messageHandler = messageHandler;
    this.maxBsonMessageSize = options.maxBsonMessageSize || 1024 * 1024 * 16 * 4;

    // Debug information
    if (this.logger.isDebug()) {
      this.logger.debug(
        `creating connection ${this.id} with options [${JSON.stringify(
          debugOptions(DEBUG_FIELDS, options)
        )}]`
      );
    }

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

    this.destroyed = false;
    this.domainSocket = this.host.indexOf('/') !== -1;
    this.singleBufferSerializtion =
      typeof options.singleBufferSerializtion === 'boolean'
        ? options.singleBufferSerializtion
        : true;
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
    if (!this.ssl) {
      this.rejectUnauthorized = false;
    }

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
    this.socket = null;
    this.writeStream = null;

    // Create hash method
    const hash = crypto.createHash('sha1');
    hash.update(this.address);
    this.hashedName = hash.digest('hex');

    // All operations in flight on the connection
    this.workItems = [];
  }

  setSocketTimeout(value) {
    if (this.socket) {
      this.socket.setTimeout(value);
    }
  }

  resetSocketTimeout() {
    if (this.socket) {
      this.socket.setTimeout(this.socketTimeout);
    }
  }

  static enableConnectionAccounting(spy) {
    if (spy) {
      connectionAccountingSpy = spy;
    }

    connectionAccounting = true;
    connections = {};
  }

  static disableConnectionAccounting() {
    connectionAccounting = false;
    connectionAccountingSpy = undefined;
  }

  static connections() {
    return connections;
  }

  get address() {
    return `${this.host}:${this.port}`;
  }

  /**
   * Connect
   * @method
   */
  connect(_options) {
    _options = _options || {};
    // Set the connections
    if (connectionAccounting) addConnection(this.id, this);
    // Check if we are overriding the promoteLongs
    if (typeof _options.promoteLongs === 'boolean') {
      this.responseOptions.promoteLongs = _options.promoteLongs;
      this.responseOptions.promoteValues = _options.promoteValues;
      this.responseOptions.promoteBuffers = _options.promoteBuffers;
    }

    const _errorHandler = errorHandler(this);

    if (this.family !== void 0) {
      return doConnect(this, this.family, _options, _errorHandler);
    }

    return doConnect(this, 6, _options, err => {
      if (this.logger.isDebug()) {
        this.logger.debug(
          `connection ${this.id} for [${this.address}] errored out with [${JSON.stringify(err)}]`
        );
      }

      // clean up existing event handlers
      this.socket.removeAllListeners('error');
      this.socket.removeAllListeners('timeout');
      this.socket.removeAllListeners('close');
      this.socket.removeAllListeners('data');
      this.socket = undefined;

      return doConnect(this, 4, _options, _errorHandler);
    });
  }

  /**
   * Unref this connection
   * @method
   * @return {boolean}
   */
  unref() {
    if (this.socket == null) {
      this.once('connect', () => this.socket.unref());
      return;
    }

    this.socket.unref();
  }

  /**
   * Destroy connection
   * @method
   */
  destroy() {
    if (connectionAccounting) {
      deleteConnection(this.id);
    }

    if (this.socket) {
      // Catch posssible exception thrown by node 0.10.x
      try {
        this.socket.end();
      } catch (err) {} // eslint-disable-line

      this.socket.destroy();
    }

    this.destroyed = true;
  }

  /**
   * Write to connection
   * @method
   * @param {Command} command Command to write out need to implement toBin and toBinUnified
   */
  write(buffer) {
    // Debug Log
    if (this.logger.isDebug()) {
      if (!Array.isArray(buffer)) {
        this.logger.debug(`writing buffer [${buffer.toString('hex')}] to ${this.address}`);
      } else {
        for (let i = 0; i < buffer.length; i++)
          this.logger.debug(`writing buffer [${buffer[i].toString('hex')}] to ${this.address}`);
      }
    }

    // Double check that the connection is not destroyed
    if (this.socket.destroyed === false) {
      // Write out the command
      if (!Array.isArray(buffer)) {
        this.socket.write(buffer, 'binary');
        return true;
      }

      // Iterate over all buffers and write them in order to the socket
      for (let i = 0; i < buffer.length; i++) {
        this.socket.write(buffer[i], 'binary');
      }

      return true;
    }

    // Connection is destroyed return write failed
    return false;
  }

  /**
   * Return id of connection as a string
   * @method
   * @return {string}
   */
  toString() {
    return '' + this.id;
  }

  /**
   * Return json object of connection
   * @method
   * @return {object}
   */
  toJSON() {
    return { id: this.id, host: this.host, port: this.port };
  }

  /**
   * Is the connection connected
   * @method
   * @return {boolean}
   */
  isConnected() {
    if (this.destroyed) return false;
    return !this.socket.destroyed && this.socket.writable;
  }
}

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
function errorHandler(conn) {
  return function(err) {
    if (connectionAccounting) deleteConnection(conn.id);
    // Debug information
    if (conn.logger.isDebug()) {
      conn.logger.debug(
        `connection ${conn.id} for [${conn.address}] errored out with [${JSON.stringify(err)}]`
      );
    }

    conn.emit('error', new MongoNetworkError(err), conn);
  };
}

function timeoutHandler(conn) {
  return function() {
    if (connectionAccounting) deleteConnection(conn.id);

    if (conn.logger.isDebug()) {
      conn.logger.debug(`connection ${conn.id} for [${conn.address}] timed out`);
    }

    conn.emit(
      'timeout',
      new MongoNetworkError(`connection ${conn.id} to ${conn.address} timed out`),
      conn
    );
  };
}

function closeHandler(conn) {
  return function(hadError) {
    if (connectionAccounting) deleteConnection(conn.id);

    if (conn.logger.isDebug()) {
      conn.logger.debug(`connection ${conn.id} with for [${conn.address}] closed`);
    }

    if (!hadError) {
      conn.emit(
        'close',
        new MongoNetworkError(`connection ${conn.id} to ${conn.address} closed`),
        conn
      );
    }
  };
}

// Handle a message once it is received
function processMessage(conn, message) {
  const msgHeader = parseHeader(message);
  if (msgHeader.opCode !== OP_COMPRESSED) {
    const ResponseConstructor = msgHeader.opCode === OP_MSG ? BinMsg : Response;
    conn.messageHandler(
      new ResponseConstructor(
        conn.bson,
        message,
        msgHeader,
        message.slice(MESSAGE_HEADER_SIZE),
        conn.responseOptions
      ),
      conn
    );

    return;
  }

  msgHeader.fromCompressed = true;
  let index = MESSAGE_HEADER_SIZE;
  msgHeader.opCode = message.readInt32LE(index);
  index += 4;
  msgHeader.length = message.readInt32LE(index);
  index += 4;
  const compressorID = message[index];
  index++;

  decompress(compressorID, message.slice(index), function(err, decompressedMsgBody) {
    if (err) {
      conn.emit('error', err);
      return;
    }

    if (decompressedMsgBody.length !== msgHeader.length) {
      conn.emit(
        'error',
        new MongoError(
          'Decompressing a compressed message from the server failed. The message is corrupt.'
        )
      );

      return;
    }

    const ResponseConstructor = msgHeader.opCode === OP_MSG ? BinMsg : Response;
    conn.messageHandler(
      new ResponseConstructor(
        conn.bson,
        message,
        msgHeader,
        decompressedMsgBody,
        conn.responseOptions
      ),
      conn
    );
  });
}

function dataHandler(conn) {
  return function(data) {
    // Parse until we are done with the data
    while (data.length > 0) {
      // If we still have bytes to read on the current message
      if (conn.bytesRead > 0 && conn.sizeOfMessage > 0) {
        // Calculate the amount of remaining bytes
        const remainingBytesToRead = conn.sizeOfMessage - conn.bytesRead;
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
            const emitBuffer = conn.buffer;
            // Reset state of buffer
            conn.buffer = null;
            conn.sizeOfMessage = 0;
            conn.bytesRead = 0;
            conn.stubBuffer = null;

            processMessage(conn, emitBuffer);
          } catch (err) {
            const errorObject = {
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
            const newData = Buffer.alloc(conn.stubBuffer.length + data.length);
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
            const newStubBuffer = Buffer.alloc(conn.stubBuffer.length + data.length);
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
            const sizeOfMessage = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
            // If we have a negative sizeOfMessage emit error and return
            if (sizeOfMessage < 0 || sizeOfMessage > conn.maxBsonMessageSize) {
              const errorObject = {
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
                const emitBuffer = data;
                // Reset state of buffer
                conn.buffer = null;
                conn.sizeOfMessage = 0;
                conn.bytesRead = 0;
                conn.stubBuffer = null;
                // Exit parsing loop
                data = Buffer.alloc(0);
                // Emit the message
                processMessage(conn, emitBuffer);
              } catch (err) {
                conn.emit('parseError', err, conn);
              }
            } else if (sizeOfMessage <= 4 || sizeOfMessage > conn.maxBsonMessageSize) {
              const errorObject = {
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
              const emitBuffer = data.slice(0, sizeOfMessage);
              // Reset state of buffer
              conn.buffer = null;
              conn.sizeOfMessage = 0;
              conn.bytesRead = 0;
              conn.stubBuffer = null;
              // Copy rest of message
              data = data.slice(sizeOfMessage);
              // Emit the message
              processMessage(conn, emitBuffer);
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
}

// List of socket level valid ssl options
const LEGAL_SSL_SOCKET_OPTIONS = [
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
  for (const name in options2) {
    if (options2[name] != null && LEGAL_SSL_SOCKET_OPTIONS.indexOf(name) !== -1) {
      options1[name] = options2[name];
    }
  }
}

function makeSSLConnection(self, _options) {
  let sslOptions = {
    socket: self.socket,
    rejectUnauthorized: self.rejectUnauthorized
  };

  // Merge in options
  merge(sslOptions, self.options);
  merge(sslOptions, _options);

  // Set options for ssl
  if (self.ca) sslOptions.ca = self.ca;
  if (self.crl) sslOptions.crl = self.crl;
  if (self.cert) sslOptions.cert = self.cert;
  if (self.key) sslOptions.key = self.key;
  if (self.passphrase) sslOptions.passphrase = self.passphrase;

  // Override checkServerIdentity behavior
  if (self.checkServerIdentity === false) {
    // Skip the identiy check by retuning undefined as per node documents
    // https://nodejs.org/api/tls.html#tls_tls_connect_options_callback
    sslOptions.checkServerIdentity = function() {
      return undefined;
    };
  } else if (typeof self.checkServerIdentity === 'function') {
    sslOptions.checkServerIdentity = self.checkServerIdentity;
  }

  // Set default sni servername to be the same as host
  if (sslOptions.servername == null) {
    sslOptions.servername = self.host;
  }

  // Attempt SSL connection
  const connection = tls.connect(self.port, self.host, sslOptions, function() {
    // Error on auth or skip
    if (connection.authorizationError && self.rejectUnauthorized) {
      return self.emit('error', connection.authorizationError, self, { ssl: true });
    }

    // Set socket timeout instead of connection timeout
    connection.setTimeout(self.socketTimeout);
    // We are done emit connect
    self.emit('connect', self);
  });

  // Set the options for the connection
  connection.setKeepAlive(self.keepAlive, self.keepAliveInitialDelay);
  connection.setTimeout(self.connectionTimeout);
  connection.setNoDelay(self.noDelay);

  return connection;
}

function makeUnsecureConnection(self, family) {
  // Create new connection instance
  let connection_options;
  if (self.domainSocket) {
    connection_options = { path: self.host };
  } else {
    connection_options = { port: self.port, host: self.host };
    connection_options.family = family;
  }

  const connection = net.createConnection(connection_options);

  // Set the options for the connection
  connection.setKeepAlive(self.keepAlive, self.keepAliveInitialDelay);
  connection.setTimeout(self.connectionTimeout);
  connection.setNoDelay(self.noDelay);

  connection.once('connect', function() {
    // Set socket timeout instead of connection timeout
    connection.setTimeout(self.socketTimeout);
    // Emit connect event
    self.emit('connect', self);
  });

  return connection;
}

function doConnect(conn, family, _options, _errorHandler) {
  conn.socket = conn.ssl ? makeSSLConnection(conn, _options) : makeUnsecureConnection(conn, family);

  // Add handlers for events
  conn.socket.once('error', _errorHandler);
  conn.socket.once('timeout', timeoutHandler(conn));
  conn.socket.once('close', closeHandler(conn));
  conn.socket.on('data', dataHandler(conn));
}

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
