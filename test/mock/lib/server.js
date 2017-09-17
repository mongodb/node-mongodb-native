var net = require('net'),
  BSON = require('bson'),
  Snappy = require('mongodb-core/lib/connection/utils').retrieveSnappy(),
  zlib = require('zlib'),
  MESSAGE_HEADER_SIZE = require('mongodb-core/lib/wireprotocol/shared').MESSAGE_HEADER_SIZE,
  opcodes = require('mongodb-core/lib/wireprotocol/shared').opcodes,
  compressorIDs = require('mongodb-core/lib/wireprotocol/compression').compressorIDs,
  Request = require('./request'),
  Query = require('./protocol').Query,
  GetMore = require('./protocol').GetMore,
  KillCursor = require('./protocol').KillCursor,
  Insert = require('./protocol').Insert,
  Update = require('./protocol').Update,
  Delete = require('./protocol').Delete,
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits;

/*
 * Server class
 */
var Server = function(port, host, options) {
  EventEmitter.call(this);

  // Special handlers
  options = options || {};

  // Do we have an onRead function
  this.onRead = typeof options.onRead == 'function' ? options.onRead : null;

  // Create a bson instance
  this.bson = new BSON();
  // Save the settings
  this.host = host;
  this.port = port;
  // Create a server socket
  this.server = net.createServer();
  // Responses
  this.messages = [];
  // state
  this.state = 'stopped';
  // Number of connections
  this.connections = 0;
  // sockets
  this.sockets = [];
};

inherits(Server, EventEmitter);

Server.prototype.destroy = function() {
  var self = this;
  if (self.state === 'destroyed') {
    return Promise.resolve();
  }

  return new Promise(function(resolve, reject) {
    self.sockets.forEach(function(x) {
      x.destroy();
    });

    self.server.close(function(err) {
      if (err) return reject(err);
      self.state = 'destroyed';
      resolve();
    });
  });
};

Server.prototype.start = function() {
  var self = this;

  // Return start promise
  return new Promise(function(resolve, reject) {
    self.server.on('error', function(err) {
      console.log('!!!!!!!!!!!!!!!!!!!! error reject');
      reject(err);
    });

    self.server.on('connection', function(c) {
      self.connections = self.connections + 1;
      self.sockets.push(c);

      c.on('error', function(e) {
        console.warn('connection error: ', e);
      });

      c.on(
        'data',
        dataHandler(
          self,
          {
            buffer: new Buffer(0),
            stubBuffer: new Buffer(0),
            sizeOfMessage: 0,
            bytesRead: 0,
            maxBsonMessageSize: 1024 * 1024 * 48
          },
          c
        )
      );

      c.on('close', function() {
        self.connections = self.connections - 1;
        var index = self.sockets.indexOf(c);

        if (index != -1) {
          self.sockets.splice(index, 1);
        }
      });
    });

    self.server.listen(self.port, self.host, function() {
      resolve(self);
    });

    self.on('message', function(message, connection) {
      var request = new Request(self, connection, message);
      if (self.messageHandler) {
        self.messageHandler(request);
      } else {
        self.messages.push(request);
      }
    });

    self.state = 'running';
  });
};

Server.prototype.receive = function() {
  var self = this;

  return new Promise(function(resolve, reject) {
    var waiting = function() {
      if (self.state == 'destroyed') {
        return reject(new Error('mock server is in destroyed state'));
      }

      // If we have a message return it
      if (self.messages.length > 0) {
        var message = self.messages.shift();
        return resolve(message);
      }

      setTimeout(waiting, 10);
    };

    waiting();
  });
};

Server.prototype.setMessageHandler = function(messageHandler) {
  this.messageHandler = messageHandler;
};

var protocol = function(self, message) {
  var index = 0;
  self.isCompressed = false;
  // Get the size for the message
  var size =
    message[index++] |
    (message[index++] << 8) |
    (message[index++] << 16) |
    (message[index++] << 24);
  if (size != message.length) throw new Error('corrupt wire protocol message');
  // Adjust to opcode
  index = 12;
  // Get the opCode for the message
  var type =
    message[index++] |
    (message[index++] << 8) |
    (message[index++] << 16) |
    (message[index++] << 24);

  // Unpack and decompress if the message is OP_COMPRESSED
  if (type == opcodes.OP_COMPRESSED) {
    var requestID = message.readInt32LE(4);
    var responseTo = message.readInt32LE(8);
    var originalOpcode = message.readInt32LE(16);
    var uncompressedSize = message.readInt32LE(20);
    var compressorID = message.readUInt8(24);

    var compressedData = message.slice(25);
    var uncompressedData;
    switch (compressorID) {
      case compressorIDs.snappy:
        uncompressedData = Snappy.uncompressSync(compressedData);
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
    var newMsgHeader = Buffer(MESSAGE_HEADER_SIZE);
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
  if (type == opcodes.OP_UPDATE) return new Update(self.bson, message);
  if (type == opcodes.OP_INSERT) return new Insert(self.bson, message);
  if (type == opcodes.OP_QUERY) return new Query(self.bson, message);
  if (type == opcodes.OP_GETMORE) return new GetMore(self.bson, message);
  if (type == opcodes.OP_DELETE) return new Delete(self.bson, message);
  if (type == opcodes.OP_KILL_CURSORS) return new KillCursor(self.bson, message);
  throw new Error('unknown wire protocol message type');
};

var dataHandler = function(server, self, connection) {
  return function(data) {
    // Parse until we are done with the data
    while (data.length > 0) {
      // Call the onRead function
      if (typeof server.onRead == 'function') {
        // If onRead returns true, terminate the reading for this connection as
        // it's dead
        if (server.onRead(server, connection, self.buffer, self.bytesRead)) {
          break;
        }
      }

      // If we still have bytes to read on the current message
      if (self.bytesRead > 0 && self.sizeOfMessage > 0) {
        // Calculate the amount of remaining bytes
        var remainingBytesToRead = self.sizeOfMessage - self.bytesRead;
        // Check if the current chunk contains the rest of the message
        if (remainingBytesToRead > data.length) {
          // Copy the new data into the exiting buffer (should have been allocated when we know the message size)
          data.copy(self.buffer, self.bytesRead);
          // Adjust the number of bytes read so it point to the correct index in the buffer
          self.bytesRead = self.bytesRead + data.length;

          // Reset state of buffer
          data = new Buffer(0);
        } else {
          // Copy the missing part of the data into our current buffer
          data.copy(self.buffer, self.bytesRead, 0, remainingBytesToRead);
          // Slice the overflow into a new buffer that we will then re-parse
          data = data.slice(remainingBytesToRead);

          // Emit current complete message
          try {
            var emitBuffer = self.buffer;
            // Reset state of buffer
            self.buffer = null;
            self.sizeOfMessage = 0;
            self.bytesRead = 0;
            self.stubBuffer = null;
            // Emit the buffer
            server.emit('message', protocol(server, emitBuffer), connection);
          } catch (err) {
            var errorObject = {
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
            var newData = new Buffer(self.stubBuffer.length + data.length);
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
            var newStubBuffer = new Buffer(self.stubBuffer.length + data.length);
            // Copy existing stub buffer
            self.stubBuffer.copy(newStubBuffer, 0);
            // Copy missing part of the data
            data.copy(newStubBuffer, self.stubBuffer.length);
            // Exit parsing loop
            data = new Buffer(0);
          }
        } else {
          if (data.length > 4) {
            // Retrieve the message size
            var sizeOfMessage = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
            // If we have a negative sizeOfMessage emit error and return
            if (sizeOfMessage < 0 || sizeOfMessage > self.maxBsonMessageSize) {
              errorObject = {
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
              self.buffer = new Buffer(sizeOfMessage);
              // Copy all the data into the buffer
              data.copy(self.buffer, 0);
              // Update bytes read
              self.bytesRead = data.length;
              // Update sizeOfMessage
              self.sizeOfMessage = sizeOfMessage;
              // Ensure stub buffer is null
              self.stubBuffer = null;
              // Exit parsing loop
              data = new Buffer(0);
            } else if (
              sizeOfMessage > 4 &&
              sizeOfMessage < self.maxBsonMessageSize &&
              sizeOfMessage == data.length
            ) {
              try {
                emitBuffer = data;
                // Reset state of buffer
                self.buffer = null;
                self.sizeOfMessage = 0;
                self.bytesRead = 0;
                self.stubBuffer = null;
                // Exit parsing loop
                data = new Buffer(0);
                // Emit the message
                server.emit('message', protocol(server, emitBuffer), connection);
              } catch (err) {
                errorObject = {
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
              server.emit('parseError', errorObject, self);

              // Clear out the state of the parser
              self.buffer = null;
              self.sizeOfMessage = 0;
              self.bytesRead = 0;
              self.stubBuffer = null;
              // Exit parsing loop
              data = new Buffer(0);
            } else {
              emitBuffer = data.slice(0, sizeOfMessage);
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
            self.stubBuffer = new Buffer(data.length);
            // Copy the data to the stub buffer
            data.copy(self.stubBuffer, 0);
            // Exit parsing loop
            data = new Buffer(0);
          }
        }
      }
    }
  };
};

module.exports = Server;
