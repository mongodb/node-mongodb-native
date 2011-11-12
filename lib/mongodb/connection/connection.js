var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  binaryutils = require('../bson/binary_utils');

var Connection = exports.Connection = function(id, socketOptions) {
  // Store all socket options
  this.socketOptions = socketOptions ? socketOptions : {host:'localhost', port:27017};
  // Id for the connection
  this.id = id;
  // State of the connection
  this.connected = false;
  
  //
  // Connection parsing state
  //
  
  this.maxBsonSize = socketOptions.maxBsonSize ? socketOptions.maxBsonSize : global.DEFAULT_MAX_BSON_SIZE;  
  // Contains the current message bytes
  this.buffer = null;
  // Contains the current message size
  this.sizeOfMessage = 0;
  // Contains the readIndex for the messaage
  this.bytesRead = 0;
  // Contains spill over bytes from additional messages
  this.stubBuffer = 0;

  // Just keeps list of events we allow
  resetHandlers(this, false);
}

// Set max bson size
Connection.DEFAULT_MAX_BSON_SIZE = 4 * 1024 * 1024 * 4 * 3;

// Inherit event emitter so we can emit stuff wohoo
inherits(Connection, EventEmitter);

Connection.prototype.start = function() {
  // Set up event emitter
  EventEmitter.call(this);  
  // Create new connection instance
  this.connection = net.createConnection(this.socketOptions.port, this.socketOptions.host);  
  // Add all handlers to the socket to manage it
  this.connection.on("connect", connectHandler(this));
  this.connection.on("data", createDataHandler(this));
  // this.connection.on("end", endHandler(this));
  this.connection.on("timeout", timeoutHandler(this));
  this.connection.on("drain", drainHandler(this));
  this.connection.on("error", errorHandler(this));
  this.connection.on("close", closeHandler(this));
}

// Check if the sockets are live
Connection.prototype.isConnected = function() {
  return this.connected;
}

// Write the data out to the socket
Connection.prototype.write = function(command, callback) {
  try {
    // If we have a list off commands to be executed on the same socket
    if(Array.isArray(command)) {
      for(var i = 0; i < command.length; i++) {
        var t = this.connection.write(command[i].toBinary());
      }
    } else {
      var r = this.connection.write(command.toBinary());    
    }    
  } catch (err) {    
    if(typeof callback === 'function') callback(err);    
  }
}

// Force the closure of the connection
Connection.prototype.close = function() {
  // clear out all the listeners
  resetHandlers(this, true);
  // destroy connection
  this.connection.destroy();
}

// Reset all handlers
var resetHandlers = function(self, clearListeners) {  
  self.eventHandlers = {error:[], connect:[], close:[], end:[], timeout:[], parseError:[], message:[]};
  
  // If we want to clear all the listeners
  if(clearListeners) {
    var keys = Object.keys(self.eventHandlers);    
    // Remove all listeners
    for(var i = 0; i < keys.length; i++) {
      self.connection.removeAllListeners(keys[i]);
    }    
  }
}

//
// Handlers
//

// Connect handler
var connectHandler = function(self) {
  return function() {
    // Set options on the socket
    // this.setEncoding(self.socketOptions.encoding);
    this.setTimeout(self.socketOptions.timeout);
    this.setNoDelay(self.socketOptions.noDelay);
    // Set keep alive if defined
    if(self.socketOptions.keepAlive > 0) {
      this.setKeepAlive(true, self.socketOptions.keepAlive);
    }    
    
    // Set connected
    self.connected = true;
    // Emit the connect event with no error
    self.emit("connect", null, self);
  }
}

var createDataHandler = exports.Connection.createDataHandler = function(self) {
  // We need to handle the parsing of the data
  // and emit the messages when there is a complete one
  return function(data) {
    // Parse until we are done with the data
    while(data.length > 0) {
      // If we still have bytes to read on the current message
      if(self.bytesRead > 0 && self.sizeOfMessage > 0) {
        // Calculate the amount of remaining bytes
        var remainingBytesToRead = self.sizeOfMessage - self.bytesRead;
        // Check if the current chunk contains the rest of the message
        if(remainingBytesToRead > data.length) {
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
            self.emit("message", self.buffer);
            
          } catch(err) {
            // We got a parse Error fire it off then keep going
            self.emit("parseError", {err:"socketHandler", trace:err, bin:buffer, parseState:{
              sizeOfMessage:self.sizeOfMessage, 
              bytesRead:self.bytesRead,
              stubBuffer:self.stubBuffer}});
          }
          
          // Reset state of buffer
          self.buffer = null;
          self.sizeOfMessage = 0;
          self.bytesRead = 0;
          self.stubBuffer = null;
        }
      } else {
        // Stub buffer is kept in case we don't get enough bytes to determine the
        // size of the message (< 4 bytes)
        if(self.stubBuffer != null && self.stubBuffer.length > 0) {          

          // If we have enough bytes to determine the message size let's do it
          if(self.stubBuffer.length + data.length > 4) {            
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
          if(data.length > 4) {
            // Retrieve the message size
            var sizeOfMessage = binaryutils.decodeUInt32(data, 0);

            // Ensure that the size of message is larger than 0 and less than the max allowed
            if(sizeOfMessage > 4 && sizeOfMessage < self.maxBsonSize && sizeOfMessage > data.length) {
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
              
            } else if(sizeOfMessage > 4 && sizeOfMessage < self.maxBsonSize && sizeOfMessage == data.length) {
              try {
                self.emit("message", data);
                // Reset state of buffer
                self.buffer = null;
                self.sizeOfMessage = 0;
                self.bytesRead = 0;
                self.stubBuffer = null;
                // Exit parsing loop
                data = new Buffer(0);
                
              } catch (err) {
                // We got a parse Error fire it off then keep going
                self.emit("parseError", {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
                  sizeOfMessage:self.sizeOfMessage, 
                  bytesRead:self.bytesRead,
                  stubBuffer:self.stubBuffer}});                
              }              
            } else if(sizeOfMessage <= 4 || sizeOfMessage > self.maxBsonSize) {
              // We got a parse Error fire it off then keep going
              self.emit("parseError", {err:"socketHandler", trace:null, bin:data, parseState:{
                sizeOfMessage:sizeOfMessage, 
                bytesRead:0,
                buffer:null,                
                stubBuffer:null}});     

              // Clear out the state of the parser           
              self.buffer = null;
              self.sizeOfMessage = 0;
              self.bytesRead = 0;
              self.stubBuffer = null;
              // Exit parsing loop
              data = new Buffer(0);

            } else {
              self.emit("message", data.slice(0, sizeOfMessage));
              // Reset state of buffer
              self.buffer = null;
              self.sizeOfMessage = 0;
              self.bytesRead = 0;
              self.stubBuffer = null;
              // Copy rest of message
              data = data.slice(sizeOfMessage);

            }            
            
          } else {
            // Create a buffer that contains the space for the non-complete message
            self.stubBuffer = new Buffer(data.length)
            // Copy the data to the stub buffer
            data.copy(self.stubBuffer, 0);
            // Exit parsing loop
            data = new Buffer(0);
          }
        }
      }      
    }
  }
}

var endHandler = function(self) {
  return function() {
    // Set connected to false
    self.connected = false;
    // Emit end event
    self.emit("end", {err: 'connection received Fin packet from [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);      
  }
}

var timeoutHandler = function(self) {
  return function() {
    self.emit("end", {err: 'connection to [' + self.socketOptions.host + ':' + self.socketOptions.port + '] timed out'}, self);      
  }
}

var drainHandler = function(self) {
  return function() {
  }
}

var errorHandler = function(self) {
  return function(err) {
    // Set connected to false
    self.connected = false;
    // Emit error
    self.emit("error", {err: 'failed to connect to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);
  }
}

var closeHandler = function(self) {
  return function(hadError) {
    // Set connected to false
    self.connected = false;
    // If we have an error during the connection phase
    if(hadError && !self.connected) {      
      self.emit("error", {err: 'failed to connect to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);
    } else {
      self.emit("close", {err: 'connection closed to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);      
    }
  }
}

// Some basic defaults
Connection.DEFAULT_PORT = 27017;







