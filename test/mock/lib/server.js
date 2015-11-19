var net = require('net'),
  Long = require('bson').Long,
  BSON = require('bson').pure().BSON,
  Request = require('./request'),
  Query = require('./protocol').Query,
  GetMore = require('./protocol').GetMore,
  KillCursor = require('./protocol').KillCursor,
  Insert = require('./protocol').Insert,
  Update = require('./protocol').Update,
  Delete = require('./protocol').Delete,
  EventEmitter = require('events').EventEmitter,
  WireResponse = require('./wire_response'),
  inherits = require('util').inherits;

/*
 * Server class
 */
var Server = function(port, host, options) {
  EventEmitter.call(this);

  // Special handlers
  options = options || {};

  // Do we have an onRead function
  this.onRead = typeof options.onRead == 'function'
    ? options.onRead : null;

  // Create a bson instance
  this.bson = new BSON();
  // Save the settings
  this.host = host;
  this.port = port;
  // Create a server socket
  this.socket = net.createServer();
  // Responses
  this.messages = [];
}

inherits(Server, EventEmitter);

Server.prototype.destroy = function() {
  this.socket.close();
}

Server.prototype.start = function() {
  var self = this;

  // Return start promise
  return new Promise(function(resolve, reject) {
    self.socket.on('error', function(err) {
      reject(err);
    });

    self.socket.on('connection', function(c) {
      c.on('error', function(e) {});
      c.on('data', dataHandler(self, c));
    });

    self.socket.listen(self.port, self.host, function() {
      resolve(self);
    });

    self.on('message', function(message, connection) {
      self.messages.push(new Request(self, connection, message));
    });
  });
}

Server.prototype.receive = function() {
  var self = this;

  return new Promise(function(resolve, reject) {
    var waiting = function() {
      if(self.messages.length > 0) {
        return resolve(self.messages.shift());
      }

      setTimeout(waiting, 10);
    }

    waiting();
  });
}

var protocol = function(self, message) {
  var index = 0
  // Get the opCode for the message
  var size = message[index++] | message[index++] << 8 | message[index++] << 16 | message[index++] << 24;
  if(size != message.length) throw new Error('corrupt wire protocol message');
  // Adjust to opcode
  index = 12;
  // Get the opCode for the message
  var type = message[index++] | message[index++] << 8 | message[index++] << 16 | message[index++] << 24;
  // Switch on type
  if(type == 2001) return new Update(self.bson, message);
  if(type == 2002) return new Insert(self.bson, message);
  if(type == 2004) return new Query(self.bson, message);
  if(type == 2005) return new GetMore(self.bson, message);
  if(type == 2006) return new Delete(self.bson, message);
  if(type == 2007) return new KillCursor(self.bson, message);
  throw new Error('unknown wire protocol message type');
}

var dataHandler = function(self, connection) {
  var buffer = null;
  var bytesRead = null;
  var sizeOfMessage = null;
  var stubBuffer = null;
  var maxBsonMessageSize = 1024 * 1024 * 48;

  return function(data) {
    // Parse until we are done with the data
    while(data.length > 0) {
      // Call the onRead function
      if(typeof self.onRead == 'function') {
        // If onRead returns true, terminate the reading for this connection as
        // it's dead
        if(self.onRead(self, connection, buffer, bytesRead)) {
          break;
        };
      }

      // If we still have bytes to read on the current message
      if(bytesRead > 0 && sizeOfMessage > 0) {
        // Calculate the amount of remaining bytes
        var remainingBytesToRead = sizeOfMessage - bytesRead;
        // Check if the current chunk contains the rest of the message
        if(remainingBytesToRead > data.length) {
          // Copy the new data into the exiting buffer (should have been allocated when we know the message size)
          data.copy(buffer, bytesRead);
          // Adjust the number of bytes read so it point to the correct index in the buffer
          bytesRead = bytesRead + data.length;

          // Reset state of buffer
          data = new Buffer(0);
        } else {
          // Copy the missing part of the data into our current buffer
          data.copy(buffer, bytesRead, 0, remainingBytesToRead);
          // Slice the overflow into a new buffer that we will then re-parse
          data = data.slice(remainingBytesToRead);

          // Emit current complete message
          try {
            var emitBuffer = buffer;
            // Reset state of buffer
            buffer = null;
            sizeOfMessage = 0;
            bytesRead = 0;
            stubBuffer = null;
            // Emit the buffer
            self.emit('message', protocol(self, emitBuffer), connection);
          } catch(err) {
            var errorObject = {err:"socketHandler", trace:err, bin:buffer, parseState:{
              sizeOfMessage:sizeOfMessage,
              bytesRead:bytesRead,
              stubBuffer:stubBuffer}};
            // We got a parse Error fire it off then keep going
            self.emit("parseError", errorObject, self);
          }
        }
      } else {
        // Stub buffer is kept in case we don't get enough bytes to determine the
        // size of the message (< 4 bytes)
        if(stubBuffer != null && stubBuffer.length > 0) {
          // If we have enough bytes to determine the message size let's do it
          if(stubBuffer.length + data.length > 4) {
            // Prepad the data
            var newData = new Buffer(stubBuffer.length + data.length);
            stubBuffer.copy(newData, 0);
            data.copy(newData, stubBuffer.length);
            // Reassign for parsing
            data = newData;

            // Reset state of buffer
            buffer = null;
            sizeOfMessage = 0;
            bytesRead = 0;
            stubBuffer = null;
          } else {
            // Add the the bytes to the stub buffer
            var newStubBuffer = new Buffer(stubBuffer.length + data.length);
            // Copy existing stub buffer
            stubBuffer.copy(newStubBuffer, 0);
            // Copy missing part of the data
            data.copy(newStubBuffer, stubBuffer.length);
            // Exit parsing loop
            data = new Buffer(0);
          }
        } else {
          if(data.length > 4) {
            // Retrieve the message size
            var sizeOfMessage = data[0] | data[1] << 8 | data[2] << 16 | data[3] << 24;
            // If we have a negative sizeOfMessage emit error and return
            if(sizeOfMessage < 0 || sizeOfMessage > maxBsonMessageSize) {
              var errorObject = {err:"socketHandler", trace:'', bin:buffer, parseState:{
                sizeOfMessage: sizeOfMessage,
                bytesRead: bytesRead,
                stubBuffer: stubBuffer}};
              // We got a parse Error fire it off then keep going
              self.emit("parseError", errorObject, self);
              return;
            }

            // Ensure that the size of message is larger than 0 and less than the max allowed
            if(sizeOfMessage > 4 && sizeOfMessage < maxBsonMessageSize && sizeOfMessage > data.length) {
              buffer = new Buffer(sizeOfMessage);
              // Copy all the data into the buffer
              data.copy(buffer, 0);
              // Update bytes read
              bytesRead = data.length;
              // Update sizeOfMessage
              sizeOfMessage = sizeOfMessage;
              // Ensure stub buffer is null
              stubBuffer = null;
              // Exit parsing loop
              data = new Buffer(0);

            } else if(sizeOfMessage > 4 && sizeOfMessage < maxBsonMessageSize && sizeOfMessage == data.length) {
              try {
                var emitBuffer = data;
                // Reset state of buffer
                buffer = null;
                sizeOfMessage = 0;
                bytesRead = 0;
                stubBuffer = null;
                // Exit parsing loop
                data = new Buffer(0);
                // Emit the message
                self.emit('message', protocol(self, emitBuffer), connection);
              } catch (err) {
                var errorObject = {err:"socketHandler", trace:err, bin:buffer, parseState:{
                  sizeOfMessage:sizeOfMessage,
                  bytesRead:bytesRead,
                  stubBuffer:stubBuffer}};
                // We got a parse Error fire it off then keep going
                self.emit("parseError", errorObject, self);
              }
            } else if(sizeOfMessage <= 4 || sizeOfMessage > maxBsonMessageSize) {
              var errorObject = {err:"socketHandler", trace:null, bin:data, parseState:{
                sizeOfMessage:sizeOfMessage,
                bytesRead:0,
                buffer:null,
                stubBuffer:null}};
              // We got a parse Error fire it off then keep going
              self.emit("parseError", errorObject, self);

              // Clear out the state of the parser
              buffer = null;
              sizeOfMessage = 0;
              bytesRead = 0;
              stubBuffer = null;
              // Exit parsing loop
              data = new Buffer(0);
            } else {
              var emitBuffer = data.slice(0, sizeOfMessage);
              // Reset state of buffer
              buffer = null;
              sizeOfMessage = 0;
              bytesRead = 0;
              stubBuffer = null;
              // Copy rest of message
              data = data.slice(sizeOfMessage);
              // Emit the message
              self.emit('message', protocol(self, emitBuffer), connection);
            }
          } else {
            // Create a buffer that contains the space for the non-complete message
            stubBuffer = new Buffer(data.length)
            // Copy the data to the stub buffer
            data.copy(stubBuffer, 0);
            // Exit parsing loop
            data = new Buffer(0);
          }
        }
      }
    }
  }
}

module.exports = Server;
