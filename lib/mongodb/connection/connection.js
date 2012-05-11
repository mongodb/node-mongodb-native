var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  binaryutils = require('../utils'),
  tls = require('tls');

var Connection = exports.Connection = function(id, socketOptions) {
  // Set up event emitter
  EventEmitter.call(this);  
  // Store all socket options
  this.socketOptions = socketOptions ? socketOptions : {host:'localhost', port:27017};
  // Id for the connection
  this.id = id;
  // State of the connection
  this.connected = false;
  
  //
  // Connection parsing state
  //
  this.maxBsonSize = socketOptions.maxBsonSize ? socketOptions.maxBsonSize : Connection.DEFAULT_MAX_BSON_SIZE;  
  // Contains the current message bytes
  this.buffer = null;
  // Contains the current message size
  this.sizeOfMessage = 0;
  // Contains the readIndex for the messaage
  this.bytesRead = 0;
  // Contains spill over bytes from additional messages
  this.stubBuffer = 0;

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[], timeout:[], end:[]};

  // Just keeps list of events we allow
  resetHandlers(this, false);
}

// Set max bson size
Connection.DEFAULT_MAX_BSON_SIZE = 1024 * 1024 * 4;

// Inherit event emitter so we can emit stuff wohoo
inherits(Connection, EventEmitter);

Connection.prototype.start = function() {
  // If we have a normal connection
  if(this.socketOptions.ssl) {
    // Create a new stream
    this.connection = new net.Socket();    
    // Set options on the socket
    this.connection.setTimeout(this.socketOptions.timeout);
    // Work around for 0.4.X
    if(process.version.indexOf("v0.4") == -1) this.connection.setNoDelay(this.socketOptions.noDelay);
    // Set keep alive if defined
    if(process.version.indexOf("v0.4") == -1) {
      if(this.socketOptions.keepAlive > 0) {
        this.connection.setKeepAlive(true, this.socketOptions.keepAlive);
      } else {
        this.connection.setKeepAlive(false);
      }         
    }
    
    // Set up pair for tls with server, accept self-signed certificates as well
    var pair = this.pair = tls.createSecurePair(false);
    // Set up encrypted streams
    this.pair.encrypted.pipe(this.connection);
    this.connection.pipe(this.pair.encrypted);
    
    // Setup clearText stream
    this.writeSteam = this.pair.cleartext;
    // Add all handlers to the socket to manage it
    this.pair.on("secure", connectHandler(this));
    this.pair.cleartext.on("data", createDataHandler(this));
    // Add handlers
    this.connection.on("error", errorHandler(this));
    // this.connection.on("connect", connectHandler(this));
    this.connection.on("end", endHandler(this));
    this.connection.on("timeout", timeoutHandler(this));
    this.connection.on("drain", drainHandler(this));
    this.writeSteam.on("close", closeHandler(this));
    // Start socket
    this.connection.connect(this.socketOptions.port, this.socketOptions.host);
  } else {
    // Create new connection instance
    this.connection = net.createConnection(this.socketOptions.port, this.socketOptions.host);
    // Set options on the socket
    this.connection.setTimeout(this.socketOptions.timeout);
    // Work around for 0.4.X
    if(process.version.indexOf("v0.4") == -1) this.connection.setNoDelay(this.socketOptions.noDelay);
    // Set keep alive if defined
    if(process.version.indexOf("v0.4") == -1) {
      if(this.socketOptions.keepAlive > 0) {
        this.connection.setKeepAlive(true, this.socketOptions.keepAlive);
      } else {
        this.connection.setKeepAlive(false);
      }         
    }

    // Set up write stream
    this.writeSteam = this.connection;
    // Add handlers
    this.connection.on("error", errorHandler(this));
    // Add all handlers to the socket to manage it
    this.connection.on("connect", connectHandler(this));
    // this.connection.on("end", endHandler(this));
    this.connection.on("data", createDataHandler(this));
    this.connection.on("timeout", timeoutHandler(this));
    this.connection.on("drain", drainHandler(this));
    this.connection.on("close", closeHandler(this));
  }  
}

// Check if the sockets are live
Connection.prototype.isConnected = function() {
  return this.connected && !this.connection.destroyed && this.connection.writable && this.connection.readable;
}

// Write the data out to the socket
Connection.prototype.write = function(command, callback) {
  try {
    // If we have a list off commands to be executed on the same socket
    if(Array.isArray(command)) {
      for(var i = 0; i < command.length; i++) {
        var binaryCommand = command[i].toBinary()
        if(binaryCommand.length > this.maxBsonSize) return callback(new Error("Document exceeds maximal allowed bson size of " + this.maxBsonSize + " bytes"));
        if(this.logger != null && this.logger.doDebug) this.logger.debug("writing command to mongodb", binaryCommand);
        var r = this.writeSteam.write(binaryCommand);
      }
    } else {
      var binaryCommand = command.toBinary()
      if(binaryCommand.length > this.maxBsonSize) return callback(new Error("Document exceeds maximal allowed bson size of " + this.maxBsonSize + " bytes"));
      if(this.logger != null && this.logger.doDebug) this.logger.debug("writing command to mongodb", binaryCommand);
      var r = this.writeSteam.write(binaryCommand);
    }    
  } catch (err) {   
    if(typeof callback === 'function') callback(err);    
  }
}

// Force the closure of the connection
Connection.prototype.close = function() {  
  // clear out all the listeners
  resetHandlers(this, true);
  // Add a dummy error listener to catch any weird last moment errors (and ignore them)
  this.connection.on("error", function() {})
  // destroy connection
  this.connection.destroy();
}

// Reset all handlers
var resetHandlers = function(self, clearListeners) {  
  self.eventHandlers = {error:[], connect:[], close:[], end:[], timeout:[], parseError:[], message:[]};
    
  // If we want to clear all the listeners
  if(clearListeners && self.connection != null) {
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
            var emitBuffer = self.buffer;
            // Reset state of buffer
            self.buffer = null;
            self.sizeOfMessage = 0;
            self.bytesRead = 0;
            self.stubBuffer = null;
            // Emit the buffer
            self.emit("message", emitBuffer, self);            
          } catch(err) {
            var errorObject = {err:"socketHandler", trace:err, bin:buffer, parseState:{
              sizeOfMessage:self.sizeOfMessage, 
              bytesRead:self.bytesRead,
              stubBuffer:self.stubBuffer}};
            if(self.logger != null && self.logger.doError) self.logger.error("parseError", errorObject);
            // We got a parse Error fire it off then keep going
            self.emit("parseError", errorObject, self);
          }
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
            // If we have a negative sizeOfMessage emit error and return
            if(sizeOfMessage < 0 || sizeOfMessage > self.maxBsonSize) {
              var errorObject = {err:"socketHandler", trace:'', bin:self.buffer, parseState:{
                sizeOfMessage:sizeOfMessage, 
                bytesRead:self.bytesRead,
                stubBuffer:self.stubBuffer}};
              if(self.logger != null && self.logger.doError) self.logger.error("parseError", errorObject);
              // We got a parse Error fire it off then keep going
              self.emit("parseError", errorObject, self);
              return;
            }

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
                var emitBuffer = data;
                // Reset state of buffer
                self.buffer = null;
                self.sizeOfMessage = 0;
                self.bytesRead = 0;
                self.stubBuffer = null;
                // Exit parsing loop
                data = new Buffer(0);
                // Emit the message
                self.emit("message", emitBuffer, self);                
              } catch (err) {
                var errorObject = {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
                  sizeOfMessage:self.sizeOfMessage, 
                  bytesRead:self.bytesRead,
                  stubBuffer:self.stubBuffer}};
                if(self.logger != null && self.logger.doError) self.logger.error("parseError", errorObject);
                // We got a parse Error fire it off then keep going
                self.emit("parseError", errorObject, self);
              }              
            } else if(sizeOfMessage <= 4 || sizeOfMessage > self.maxBsonSize) {
              var errorObject = {err:"socketHandler", trace:null, bin:data, parseState:{
                sizeOfMessage:sizeOfMessage, 
                bytesRead:0,
                buffer:null,                
                stubBuffer:null}};
              if(self.logger != null && self.logger.doError) self.logger.error("parseError", errorObject);
              // We got a parse Error fire it off then keep going
              self.emit("parseError", errorObject, self);

              // Clear out the state of the parser           
              self.buffer = null;
              self.sizeOfMessage = 0;
              self.bytesRead = 0;
              self.stubBuffer = null;
              // Exit parsing loop
              data = new Buffer(0);

            } else {
              try {
                var emitBuffer = data.slice(0, sizeOfMessage);
                // Reset state of buffer
                self.buffer = null;
                self.sizeOfMessage = 0;
                self.bytesRead = 0;
                self.stubBuffer = null;
                // Copy rest of message
                data = data.slice(sizeOfMessage);                
                // Emit the message
                self.emit("message", emitBuffer, self);
              } catch (err) {
                var errorObject = {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
                  sizeOfMessage:sizeOfMessage, 
                  bytesRead:self.bytesRead,
                  stubBuffer:self.stubBuffer}};
                if(self.logger != null && self.logger.doError) self.logger.error("parseError", errorObject);
                // We got a parse Error fire it off then keep going
                self.emit("parseError", errorObject, self);
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
    self.emit("timeout", {err: 'connection to [' + self.socketOptions.host + ':' + self.socketOptions.port + '] timed out'}, self);
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
    // If we have an error during the connection phase
    if(hadError && !self.connected) {      
      // Set disconnected
      self.connected = false;
      // Emit error
      self.emit("error", {err: 'failed to connect to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);
    } else {
      // Set disconnected
      self.connected = false;
      // Emit close
      self.emit("close", {err: 'connection closed to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);      
    }
  }
}

// Some basic defaults
Connection.DEFAULT_PORT = 27017;







