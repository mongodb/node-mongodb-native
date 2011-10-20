var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  binary_utils = require('../bson/binary_utils'),
  EventEmitter = require("events").EventEmitter;

var Connection = exports.Connection = function(id, socketOptions) {
  // Store all socket options
  this.socketOptions = socketOptions;
  // Id for the connection
  this.id = id;
  // State of the connection
  this.connected = false;
  
  //
  // Connection parsing state
  //
  
  // Contains the current message bytes
  this.buffer = null;
  // Contains the current message size
  this.sizeOfMessage = 0;
  // Contains the readIndex for the messaage
  this.bytesRead = 0;
  // Contains spill over bytes from additional messages
  this.stubBuffer = 0;
}

// Inherit event emitter so we can emit stuff wohoo
inherits(Connection, EventEmitter);

Connection.prototype.start = function() {
  console.dir(this.socketOptions)
  
  // Create new connection instance
  this.connection = net.createConnection(this.socketOptions.port, this.socketOptions.host);  
  // Add all handlers to the socket to manage it
  this.connection.on("connect", connectHandler(this));
  this.connection.on("data", dataHandler(this));
  this.connection.on("end", endHandler(this));
  this.connection.on("timeout", timeoutHandler(this));
  this.connection.on("drain", drainHandler(this));
  this.connection.on("error", errorHandler(this));
  this.connection.on("close", closeHandler(this));
}

//
// Handlers
//

// Connect handler
var connectHandler = function(self) {
  return function() {
    // Set options on the socket
    this.setEncoding(self.socketOptions.encoding);
    this.setTimeout(self.socketOptions.timeout);
    this.setNoDelay(self.socketOptions.noDelay);
    // Set keep alive if defined
    if(self.socketOptions.keepAlive > 0) {
      this.setKeepAlive(true, self.socketOptions.keepAlive);
    }    
    
    // Set connected
    self.connected = true;
    // Emit the connect event with no error
    self.emit("connect", null);
  }
}

var dataHandler = function(self) {
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
          self.bytesRead = self.bytesRead + remainingBytesToRead;

        } else {

          // Copy the missing part of the data into our current buffer
          data.copy(self.buffer, self.bytesRead, 0, remainingBytesToRead);
          // Slice the overflow into a new buffer that we will then re-parse
          data = data.slice(self.sizeOfMessage);
          
          // Emit current complete message
          try {
            self.emit("message", self.buffer);
          } finally {
            // Reset state of buffer
            self.buffer = null;
            self.sizeOfMessage = 0;
            self.bytesRead = 0;
            self.stubBuffer = null;
          }
        }
      } else {
        // Stub buffer is kept in case we don't get enough bytes to determine the
        // size of the message (< 4 bytes)
        if(self.stubBuffer != null && self.stubBuffer.length > 0) {          

          // If we have enough bytes to determine the message size let's do it
          if(self.stubBuffer.length + data.length > 4) {            

            // Create temp buffer to keep the 4 bytes for the size
            var messageSizeBuffer = new Buffer(4);
            // Copy in the stubBuffer data
            self.stubBuffer.copy(messageSizeBuffer, 0);
            // Copy the remaining (4 - stubBuffer.length) bytes needed to determine the size
            data.copy(messageSizeBuffer, self.stubBuffer.length, 0, (4 - self.stubBuffer.length))
            
            // Determine the message Size
            self.sizeOfMessage = binary_utils.decodeUInt32(messageSizeBuffer, 0)
            // Do a single allocation for the buffer
            self.buffer = new Buffer(self.sizeOfMessage);
            // Set bytes read
            self.bytesRead = 4;
            // Slice the data so we can keep parsing
            data = data.slice((4 - self.stubBuffer.length));
            // Null out stub buffer
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

            // Write the data into the buffer
            if(sizeOfMessage > data.length) {
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
              
            } else if(sizeOfMessage == data.length) {
              try {
                emit("message", data);
              } finally {
                // Reset state of buffer
                self.buffer = null;
                self.sizeOfMessage = 0;
                self.bytesRead = 0;
                self.stubBuffer = null;
              }
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
    
    
    console.log("========================= data");
  }
}

var endHandler = function(self) {
  return function() {
    console.log("========================= end");
  }
}

var timeoutHandler = function(self) {
  return function() {
    console.log("========================= timeout");
  }
}

var drainHandler = function(self) {
  return function() {
    console.log("========================= drain");
  }
}

var errorHandler = function(self) {
  return function(err) {
    console.log("========================= error");
  }
}

var closeHandler = function(self) {
  return function(hadError) {
    // If we have an error during the connection phase
    if(hadError && !self.connected) {
      self.emit("connect", {err: 'failed to connect to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);
    } else {
      
    }
    
    console.log("========================= close");
  }
}








