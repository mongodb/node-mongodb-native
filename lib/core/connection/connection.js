'use strict';

const EventEmitter = require('events').EventEmitter;
const crypto = require('crypto');
const debugOptions = require('./utils').debugOptions;
const parseHeader = require('../wireprotocol/shared').parseHeader;
const decompress = require('../wireprotocol/compression').decompress;
const Response = require('./commands').Response;
const BinMsg = require('./msg').BinMsg;
const MongoNetworkError = require('../error').MongoNetworkError;
const MongoNetworkTimeoutError = require('../error').MongoNetworkTimeoutError;
const MongoError = require('../error').MongoError;
const Logger = require('./logger');
const OP_COMPRESSED = require('../wireprotocol/shared').opcodes.OP_COMPRESSED;
const OP_MSG = require('../wireprotocol/shared').opcodes.OP_MSG;
const MESSAGE_HEADER_SIZE = require('../wireprotocol/shared').MESSAGE_HEADER_SIZE;
const Buffer = require('safe-buffer').Buffer;
const Query = require('./commands').Query;
const CommandResult = require('./command_result');

let _id = 0;

const DEFAULT_MAX_BSON_MESSAGE_SIZE = 1024 * 1024 * 16 * 4;
const DEBUG_FIELDS = [
  'host',
  'port',
  'size',
  'keepAlive',
  'keepAliveInitialDelay',
  'noDelay',
  'connectionTimeout',
  'socketTimeout',
  'ssl',
  'ca',
  'crl',
  'cert',
  'rejectUnauthorized',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'bsonRegExp',
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
 * @fires Connection#message
 */
class Connection extends EventEmitter {
  /**
   * Creates a new Connection instance
   *
   * **NOTE**: Internal class, do not instantiate directly
   *
   * @param {Socket} socket The socket this connection wraps
   * @param {Object} options Various settings
   * @param {object} options.bson An implementation of bson serialize and deserialize
   * @param {string} [options.host='localhost'] The host the socket is connected to
   * @param {number} [options.port=27017] The port used for the socket connection
   * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
   * @param {number} [options.keepAliveInitialDelay=120000] Initial delay before TCP keep alive enabled
   * @param {number} [options.connectionTimeout=30000] TCP Connection timeout setting
   * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
   * @param {boolean} [options.promoteLongs] Convert Long values from the db into Numbers if they fit into 53 bits
   * @param {boolean} [options.promoteValues] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
   * @param {boolean} [options.promoteBuffers] Promotes Binary BSON values to native Node Buffers.
   * @param {boolean} [options.bsonRegExp] By default, regex returned from MDB will be native to the language. Setting to true will ensure that a BSON.BSONRegExp object is returned.
   * @param {number} [options.maxBsonMessageSize=0x4000000] Largest possible size of a BSON message (for legacy purposes)
   */
  constructor(socket, options) {
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
    this.maxBsonMessageSize = options.maxBsonMessageSize || DEFAULT_MAX_BSON_MESSAGE_SIZE;
    this.helloOk = undefined;

    this.port = options.port || 27017;
    this.host = options.host || 'localhost';
    this.socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 0;

    // These values are inspected directly in tests, but maybe not necessary to keep around
    this.keepAlive = typeof options.keepAlive === 'boolean' ? options.keepAlive : true;
    this.keepAliveInitialDelay =
      typeof options.keepAliveInitialDelay === 'number' ? options.keepAliveInitialDelay : 120000;
    this.connectionTimeout =
      typeof options.connectionTimeout === 'number' ? options.connectionTimeout : 30000;
    if (this.keepAliveInitialDelay > this.socketTimeout) {
      this.keepAliveInitialDelay = Math.round(this.socketTimeout / 2);
    }

    // Debug information
    if (this.logger.isDebug()) {
      this.logger.debug(
        `creating connection ${this.id} with options [${JSON.stringify(
          debugOptions(DEBUG_FIELDS, options)
        )}]`
      );
    }

    // Response options
    this.responseOptions = {
      promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
      promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
      promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
      bsonRegExp: typeof options.bsonRegExp === 'boolean' ? options.bsonRegExp : false
    };

    // Flushing
    this.flushing = false;
    this.queue = [];

    // Internal state
    this.writeStream = null;
    this.destroyed = false;
    this.timedOut = false;

    // Create hash method
    const hash = crypto.createHash('sha1');
    hash.update(this.address);
    this.hashedName = hash.digest('hex');

    // All operations in flight on the connection
    this.workItems = [];

    // setup socket
    this.socket = socket;
    this.socket.once('error', errorHandler(this));
    this.socket.once('timeout', timeoutHandler(this));
    this.socket.once('close', closeHandler(this));
    this.socket.on('data', dataHandler(this));

    if (connectionAccounting) {
      addConnection(this.id, this);
    }
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
   * Unref this connection
   * @method
   * @return {boolean}
   * @deprecated This function is deprecated and will be removed in the next major version.
   */
  unref() {
    if (this.socket == null) {
      this.once('connect', () => this.socket.unref());
      return;
    }

    this.socket.unref();
  }

  /**
   * Flush all work Items on this connection
   *
   * @param {*} err The error to propagate to the flushed work items
   */
  flush(err) {
    while (this.workItems.length > 0) {
      const workItem = this.workItems.shift();
      if (workItem.cb) {
        workItem.cb(err);
      }
    }
  }

  /**
   * Destroy connection
   * @method
   */
  destroy(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = Object.assign({ force: false }, options);

    if (connectionAccounting) {
      deleteConnection(this.id);
    }

    if (this.socket == null) {
      this.destroyed = true;
      return;
    }

    if (options.force || this.timedOut) {
      this.socket.destroy();
      this.destroyed = true;
      if (typeof callback === 'function') callback(null, null);
      return;
    }

    this.socket.end(err => {
      this.destroyed = true;
      if (typeof callback === 'function') callback(err, null);
    });
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
        this.logger.debug(`writing buffer [ ${buffer.length} ] to ${this.address}`);
      } else {
        for (let i = 0; i < buffer.length; i++)
          this.logger.debug(`writing buffer [ ${buffer[i].length} ] to ${this.address}`);
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

  /**
   * @ignore
   */
  command(ns, command, options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});

    const conn = this;
    const socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 0;
    const bson = conn.options.bson;
    const query = new Query(bson, ns, command, {
      numberToSkip: 0,
      numberToReturn: 1
    });

    const noop = () => {};
    function _callback(err, result) {
      callback(err, result);
      callback = noop;
    }

    function errorHandler(err) {
      conn.resetSocketTimeout();
      CONNECTION_ERROR_EVENTS.forEach(eventName => conn.removeListener(eventName, errorHandler));
      conn.removeListener('message', messageHandler);

      if (err == null) {
        err = new MongoError(`runCommand failed for connection to '${conn.address}'`);
      }

      // ignore all future errors
      conn.on('error', noop);
      _callback(err);
    }

    function messageHandler(msg) {
      if (msg.responseTo !== query.requestId) {
        return;
      }

      conn.resetSocketTimeout();
      CONNECTION_ERROR_EVENTS.forEach(eventName => conn.removeListener(eventName, errorHandler));
      conn.removeListener('message', messageHandler);

      msg.parse({ promoteValues: true });

      const response = msg.documents[0];
      if (response.ok === 0 || response.$err || response.errmsg || response.code) {
        _callback(new MongoError(response));
        return;
      }

      _callback(undefined, new CommandResult(response, this, msg));
    }

    conn.setSocketTimeout(socketTimeout);
    CONNECTION_ERROR_EVENTS.forEach(eventName => conn.once(eventName, errorHandler));
    conn.on('message', messageHandler);
    conn.write(query.toBin());
  }
}

const CONNECTION_ERROR_EVENTS = ['error', 'close', 'timeout', 'parseError'];

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

    conn.timedOut = true;
    conn.emit(
      'timeout',
      new MongoNetworkTimeoutError(`connection ${conn.id} to ${conn.address} timed out`, {
        beforeHandshake: conn.ismaster == null
      }),
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
    conn.emit(
      'message',
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

  decompress(compressorID, message.slice(index), (err, decompressedMsgBody) => {
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
    conn.emit(
      'message',
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
          const emitBuffer = conn.buffer;
          // Reset state of buffer
          conn.buffer = null;
          conn.sizeOfMessage = 0;
          conn.bytesRead = 0;
          conn.stubBuffer = null;

          processMessage(conn, emitBuffer);
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

/**
 * An event emitted each time the connection receives a parsed message from the wire
 *
 * @event Connection#message
 * @type {Connection}
 */

module.exports = Connection;
