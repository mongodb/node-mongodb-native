const net = require('net');
const tls = require('tls');
const { snappy } = require('./snappy_importer');
const zlib = require('zlib');
const MESSAGE_HEADER_SIZE = require('./utils').MESSAGE_HEADER_SIZE;
const opcodes = require('./utils').opcodes;
const compressorIDs = require('./utils').compressorIDs;
const Request = require('./request');
const { Query } = require('./protocol');
const EventEmitter = require('events');
const { setTimeout } = require('timers');
const { HostAddress } = require('../../../mongodb');

/*
 * MockServer class
 */
class MockServer extends EventEmitter {
  constructor(port, host, options) {
    super();

    // Special handlers
    options = options || {};

    // Do we have an onRead function
    this.onRead = typeof options.onRead === 'function' ? options.onRead : null;

    // Save the settings
    this.host = host;
    this.port = port;
    this.family = 'ipv4';

    // Create a server socket
    this.server = options.tls ? tls.createServer(options) : net.createServer(options);
    this.tlsEnabled = !!options.tls;

    // Responses
    this.messages = [];

    // state
    this.state = 'stopped';

    // Number of connections
    this.connections = 0;

    // sockets
    this.sockets = [];

    // message handlers
    this.messageHandlers = Object.create(null);
  }

  hostAddress() {
    return new HostAddress(this.uri());
  }

  /**
   *
   */
  uri() {
    const { host, family, port } = this.address();
    const isIpv6Address = family.toLowerCase() === 'ipv6';
    return isIpv6Address ? `[${host}]:${port}` : `${host}:${port}`;
  }

  /**
   *
   */
  address() {
    return { host: this.host, port: this.port, family: this.family };
  }

  /**
   *
   */
  destroy() {
    const self = this;
    if (self.state === 'destroyed') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      self.sockets.forEach(socket => socket.destroy());
      self.server.close(err => {
        if (err) return reject(err);
        self.state = 'destroyed';
        resolve();
      });
    });
  }

  /**
   *
   */
  start() {
    const self = this;
    return new Promise((resolve, reject) => {
      self.server.on('error', err => {
        console.log('!!!!!!!!!!!!!!!!!!!! error reject');
        reject(err);
      });

      const connectionEventName = self.tlsEnabled ? 'secureConnection' : 'connection';
      self.server.on(connectionEventName, c => {
        self.connections = self.connections + 1;
        self.sockets.push(c);

        c.on('error', e => {
          // this is when the driver closes connections
          // change false to true to start printing the logs,
          // keep CI logs clear for test reporting
          false && console.warn('connection error: ', e);
        });

        c.on(
          'data',
          dataHandler(
            self,
            {
              buffer: Buffer.alloc(0),
              stubBuffer: Buffer.alloc(0),
              sizeOfMessage: 0,
              bytesRead: 0,
              maxBsonMessageSize: 1024 * 1024 * 48
            },
            c
          )
        );

        c.on('close', () => {
          self.connections = self.connections - 1;
          const index = self.sockets.indexOf(c);

          if (index !== -1) {
            self.sockets.splice(index, 1);
          }
        });
      });

      self.server.listen(self.port, self.host, () => {
        // update address information if necessary
        self.host = self.server.address().address;
        self.port = self.server.address().port;
        self.family = self.server.address().family;

        resolve(self);
      });

      self.on('message', function (message, connection) {
        const request = new Request(self, connection, message);
        if (self.genericMessageHandler) {
          try {
            self.genericMessageHandler(request);
          } catch (err) {
            console.log(err.stack);
          }

          return;
        }

        const command = Object.keys(request.document)[0];
        if (self.messageHandlers[command]) {
          let messageHandler = self.messageHandlers[command];
          if (Array.isArray(messageHandler)) {
            if (messageHandler.length === 0) {
              delete self.handlers[command];
            } else {
              messageHandler = messageHandler.shift();
            }
          }

          try {
            messageHandler(request);
          } catch (err) {
            console.log(err.stack);
          }
        } else {
          self.messages.push(request);
        }
      });

      self.state = 'running';
    });
  }

  /**
   *
   */
  receive() {
    const self = this;
    return new Promise((resolve, reject) => {
      const waiting = () => {
        if (self.state === 'destroyed') {
          return reject(new Error('mock server is in destroyed state'));
        }

        // If we have a message return it
        if (self.messages.length > 0) {
          const message = self.messages.shift();
          return resolve(message);
        }

        setTimeout(waiting, 10);
      };

      waiting();
    });
  }

  /**
   * Legacy method for registering a message handler. This method allows for setting a
   * generic message handler, if no command type is specified.
   *
   * @param {string|function} typeOrHandler the type of command to register a handler for, or the generic handler
   * @param {function} [messageHandler] the optional message handler, if a type was specified
   */
  setMessageHandler(type, messageHandler) {
    if (typeof type === 'function') (messageHandler = type), (type = undefined);

    if (type == null) {
      this.genericMessageHandler = messageHandler;
      return;
    }

    this.messageHandlers[type] = messageHandler;
  }

  /**
   * Adds a message handler to the mock server, optionally adding it to an array of
   * handlers.
   *
   * @param {string} type the command type to register this handler for
   * @param {function} messageHandler the handler for the message
   * @returns {MockServer} the mock server
   */
  addMessageHandler(type, messageHandler) {
    if (this.messageHandlers[type]) {
      if (Array.isArray(this.messageHandlers[type])) {
        this.messageHandlers[type].push(messageHandler);
      } else {
        this.messageHandlers[type] = [messageHandler, this.messageHandlers[type]];
      }
    } else {
      this.messageHandlers[type] = messageHandler;
    }

    return this;
  }
}

const protocol = function (self, message) {
  let index = 0;
  self.isCompressed = false;
  // Get the size for the message
  const size =
    message[index++] |
    (message[index++] << 8) |
    (message[index++] << 16) |
    (message[index++] << 24);
  if (size !== message.length) throw new Error('corrupt wire protocol message');
  // Adjust to opcode
  index = 12;
  // Get the opCode for the message
  let type =
    message[index++] |
    (message[index++] << 8) |
    (message[index++] << 16) |
    (message[index++] << 24);

  // Unpack and decompress if the message is OP_COMPRESSED
  if (type === opcodes.OP_COMPRESSED) {
    const requestID = message.readInt32LE(4);
    const responseTo = message.readInt32LE(8);
    const originalOpcode = message.readInt32LE(16);
    const uncompressedSize = message.readInt32LE(20);
    const compressorID = message.readUInt8(24);

    const compressedData = message.slice(25);
    let uncompressedData;
    switch (compressorID) {
      case compressorIDs.snappy:
        uncompressedData = snappy.uncompressSync(compressedData);
        break;
      case compressorIDs.zlib:
        uncompressedData = zlib.inflateSync(compressedData);
        break;
      default:
        uncompressedData = compressedData;
    }

    if (uncompressedData.length !== uncompressedSize) {
      throw new Error(
        'corrupt wire protocol message: uncompressed message is not the correct size'
      );
    }

    // Reconstruct the msgHeader of the uncompressed opcode
    const newMsgHeader = Buffer(MESSAGE_HEADER_SIZE);
    newMsgHeader.writeInt32LE(MESSAGE_HEADER_SIZE + uncompressedData.length, 0);
    newMsgHeader.writeInt32LE(requestID, 4);
    newMsgHeader.writeInt32LE(responseTo, 8);
    newMsgHeader.writeInt32LE(originalOpcode, 12);

    // Full uncompressed message
    message = Buffer.concat([newMsgHeader, uncompressedData]);
    type = originalOpcode;

    // Compressed flag
    self.isCompressed = true;
  }

  // Switch on type
  if (type === opcodes.OP_QUERY) return new Query(message);
  if (type === opcodes.OP_MSG) throw new Error('does not support OP_MSG protocol');
  throw new Error('unknown wire protocol message type');
};

const dataHandler = function (server, self, connection) {
  return function (data) {
    // Parse until we are done with the data
    while (data.length > 0) {
      // Call the onRead function
      if (typeof server.onRead === 'function') {
        // If onRead returns true, terminate the reading for this connection as
        // it's dead
        if (server.onRead(server, connection, self.buffer, self.bytesRead)) {
          break;
        }
      }

      // If we still have bytes to read on the current message
      if (self.bytesRead > 0 && self.sizeOfMessage > 0) {
        // Calculate the amount of remaining bytes
        let remainingBytesToRead = self.sizeOfMessage - self.bytesRead;
        // Check if the current chunk contains the rest of the message
        if (remainingBytesToRead > data.length) {
          // Copy the new data into the exiting buffer (should have been allocated when we know the message size)
          data.copy(self.buffer, self.bytesRead);
          // Adjust the number of bytes read so it point to the correct index in the buffer
          self.bytesRead = self.bytesRead + data.length;

          // Reset state of buffer
          data = Buffer.alloc(0);
        } else {
          // Copy the missing part of the data into our current buffer
          data.copy(self.buffer, self.bytesRead, 0, remainingBytesToRead);
          // Slice the overflow into a new buffer that we will then re-parse
          data = data.slice(remainingBytesToRead);

          // Emit current complete message
          try {
            let emitBuffer = self.buffer;
            // Reset state of buffer
            self.buffer = null;
            self.sizeOfMessage = 0;
            self.bytesRead = 0;
            self.stubBuffer = null;
            // Emit the buffer
            server.emit('message', protocol(server, emitBuffer), connection);
          } catch (err) {
            let errorObject = {
              err: 'socketHandler',
              trace: err,
              bin: self.buffer,
              parseState: {
                sizeOfMessage: self.sizeOfMessage,
                bytesRead: self.bytesRead,
                stubBuffer: self.stubBuffer
              }
            };
            // We got a parse Error fire it off then keep going
            server.emit('parseError', errorObject, self);
          }
        }
      } else {
        // Stub buffer is kept in case we don't get enough bytes to determine the
        // size of the message (< 4 bytes)
        if (self.stubBuffer != null && self.stubBuffer.length > 0) {
          // If we have enough bytes to determine the message size let's do it
          if (self.stubBuffer.length + data.length > 4) {
            // Prepad the data
            let newData = Buffer.alloc(self.stubBuffer.length + data.length);
            self.stubBuffer.copy(newData, 0);
            data.copy(newData, self.stubBuffer.length);
            // Reassign for parsing
            data = newData;

            // Reset state of buffer
            self.buffer = null;
            self.sizeOfMessage = 0;
            self.bytesRead = 0;
            self.stubBuffer = null;
          } else {
            // Add the the bytes to the stub buffer
            let newStubBuffer = Buffer.alloc(self.stubBuffer.length + data.length);
            // Copy existing stub buffer
            self.stubBuffer.copy(newStubBuffer, 0);
            // Copy missing part of the data
            data.copy(newStubBuffer, self.stubBuffer.length);
            // Exit parsing loop
            data = Buffer.alloc(0);
          }
        } else {
          if (data.length > 4) {
            // Retrieve the message size
            let sizeOfMessage = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
            // If we have a negative sizeOfMessage emit error and return
            if (sizeOfMessage < 0 || sizeOfMessage > self.maxBsonMessageSize) {
              let errorObject = {
                err: 'socketHandler',
                trace: '',
                bin: self.buffer,
                parseState: {
                  sizeOfMessage: sizeOfMessage,
                  bytesRead: self.bytesRead,
                  stubBuffer: self.stubBuffer
                }
              };
              // We got a parse Error fire it off then keep going
              server.emit('parseError', errorObject, self);
              return;
            }

            // Ensure that the size of message is larger than 0 and less than the max allowed
            if (
              sizeOfMessage > 4 &&
              sizeOfMessage < self.maxBsonMessageSize &&
              sizeOfMessage > data.length
            ) {
              self.buffer = Buffer.alloc(sizeOfMessage);
              // Copy all the data into the buffer
              data.copy(self.buffer, 0);
              // Update bytes read
              self.bytesRead = data.length;
              // Update sizeOfMessage
              self.sizeOfMessage = sizeOfMessage;
              // Ensure stub buffer is null
              self.stubBuffer = null;
              // Exit parsing loop
              data = Buffer.alloc(0);
            } else if (
              sizeOfMessage > 4 &&
              sizeOfMessage < self.maxBsonMessageSize &&
              sizeOfMessage === data.length
            ) {
              try {
                let emitBuffer = data;
                // Reset state of buffer
                self.buffer = null;
                self.sizeOfMessage = 0;
                self.bytesRead = 0;
                self.stubBuffer = null;
                // Exit parsing loop
                data = Buffer.alloc(0);
                // Emit the message
                server.emit('message', protocol(server, emitBuffer), connection);
              } catch (err) {
                let errorObject = {
                  err: 'socketHandler',
                  trace: err,
                  bin: self.buffer,
                  parseState: {
                    sizeOfMessage: self.sizeOfMessage,
                    bytesRead: self.bytesRead,
                    stubBuffer: self.stubBuffer
                  }
                };
                // We got a parse Error fire it off then keep going
                server.emit('parseError', errorObject, self);
              }
            } else if (sizeOfMessage <= 4 || sizeOfMessage > self.maxBsonMessageSize) {
              let errorObject = {
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
              server.emit('parseError', errorObject, self);

              // Clear out the state of the parser
              self.buffer = null;
              self.sizeOfMessage = 0;
              self.bytesRead = 0;
              self.stubBuffer = null;
              // Exit parsing loop
              data = Buffer.alloc(0);
            } else {
              let emitBuffer = data.slice(0, sizeOfMessage);
              // Reset state of buffer
              self.buffer = null;
              self.sizeOfMessage = 0;
              self.bytesRead = 0;
              self.stubBuffer = null;
              // Copy rest of message
              data = data.slice(sizeOfMessage);
              // Emit the message
              server.emit('message', protocol(server, emitBuffer), connection);
            }
          } else {
            // Create a buffer that contains the space for the non-complete message
            self.stubBuffer = Buffer.alloc(data.length);
            // Copy the data to the stub buffer
            data.copy(self.stubBuffer, 0);
            // Exit parsing loop
            data = Buffer.alloc(0);
          }
        }
      }
    }
  };
};

module.exports = { MockServer };
