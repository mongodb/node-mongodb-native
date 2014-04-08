var inherits = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , net = require('net')
  , tls = require('tls')
  , f = require('util').format
  , Response = require('./commands').Response
  , MongoError = require('../error')
  , Logger = require('./logger');  

var _id = 0;

var Connection = function(options) {  
  // Add event listener
  EventEmitter.call(this);
  // Set empty if no options passed
  var options = options || {};
  // Identification information
  var id = _id++;
  // Logger instance
  var logger = Logger('Connection', options);
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Get bson parser
  var bson = options.bson;

  // Default options
  var port = options.port || 27017;
  var host = options.host || 'localhost';
  var keepAlive = options.keepAlive || true;
  var keepAliveInitialDelay = options.keepAliveInitialDelay || 0;
  var noDelay = options.noDelay || true;
  var connectionTimeout = options.connectionTimeout || 0;
  var socketTimeout = options.socketTimeout || 0;

  // Check if we have a domain socket
  var domainSocket = host.indexOf("@") != -1;
  
  // SSL options
  var ca = options.ca || null;
  var cert = options.cert || null;
  var key = options.key || null;
  var passPhrase = options.passPhrase || null;
  var ssl = options.ssl || null;
  var rejectUnauthorized = options.rejectUnauthorized || false;

  // Response options
  var responseOptions = {
    promoteLongs: options.promoteLongs || true
  }

  // Internal state
  var connection = null;
  var writeStream = null;

  // Internal reference
  var self = this;

  // 
  // Connection function
  this.connect = function() {
    // Create new connection instance
    connection = domainSocket 
      ? net.createConnection(host)
      : net.createConnection(port, host);

    // Set the options for the connection
    connection.setKeepAlive(keepAlive, keepAliveInitialDelay);
    connection.setTimeout(connectionTimeout);

    // If we have ssl enabled
    if(ssl) {
      var sslOptions = {
          socket: connection
        , rejectUnauthorized: rejectUnauthorized
      }

      if(ca) sslOptions.ca = ca;
      if(cert) sslOptions.cert = cert;
      if(key) sslOptions.key = key;
      if(passphrase) sslOptions.passPhrase;

      // Attempt SSL connection
      connection = tls.connect(port, host, sslOptions, function() {      
        // Error on auth or skip
        if(connection.authorizationError && rejectUnauthorized) {          
          return self.emit("error", connection.authorizationError, self, {ssl:true});        
        }

        // Set socket timeout instead of connection timeout
        connection.setTimeout(socketTimeout);
        // We are done emit connect
        self.emit('connect', self);
      });
    } else {
      connection.on('connect', function() {
        // Set socket timeout instead of connection timeout
        connection.setTimeout(socketTimeout);
        // Emit connect event
        self.emit('connect', self);        
      });
    }

    // Add handlers for events
    connection.on('error', errorHandler);
    connection.on('timeout', timeoutHandler);
    connection.on('close', closeHandler);
    connection.on('data', dataHandler);
  }

  this.destroy = function() {
    if(connection) connection.destroy();
  }

  this.write = function(command) {
    // Debug log
    if(logger.isDebug()) logger.debug(f('writing buffer [%s] to %s:%s', command.toBin().toString('hex'), host, port));
    // Write out the command    
    connection.write(command.toBin ? command.toBin() : command, 'binary');
  }

  //
  // Connection handlers
  var errorHandler = function(err) {    
    self.emit("error", MongoError.create(err), self);
  }

  var timeoutHandler = function() {
    self.emit("timeout"
      , MongoError.create(f("connection %s to %s:%s timed out", id, host, port))
      , self);
  }

  var closeHandler = function(hadError) {
    if(!hadError)
      self.emit("close"
        , MongoError.create(f("connection %s to %s:%s closed", id, host, port))
        , self);        
  }

  var dataHandler = function(data) {
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
            self.emit("message", new Response(bson, emitBuffer, responseOptions), self);
          } catch(err) {
            var errorObject = {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
              sizeOfMessage:self.sizeOfMessage,
              bytesRead:self.bytesRead,
              stubBuffer:self.stubBuffer}};
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
            var sizeOfMessage = data.readUInt32LE(0);
            // If we have a negative sizeOfMessage emit error and return
            if(sizeOfMessage < 0 || sizeOfMessage > self.maxBsonSize) {
              var errorObject = {err:"socketHandler", trace:'', bin:self.buffer, parseState:{
                sizeOfMessage: sizeOfMessage,
                bytesRead: self.bytesRead,
                stubBuffer: self.stubBuffer}};
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
                self.emit("message", new Response(bson, emitBuffer, responseOptions), self);
              } catch (err) {
                var errorObject = {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
                  sizeOfMessage:self.sizeOfMessage,
                  bytesRead:self.bytesRead,
                  stubBuffer:self.stubBuffer}};
                // We got a parse Error fire it off then keep going
                self.emit("parseError", errorObject, self);
              }
            } else if(sizeOfMessage <= 4 || sizeOfMessage > self.maxBsonSize) {
              var errorObject = {err:"socketHandler", trace:null, bin:data, parseState:{
                sizeOfMessage:sizeOfMessage,
                bytesRead:0,
                buffer:null,
                stubBuffer:null}};
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
                self.emit("message", new Response(bson, emitBuffer, responseOptions), self);
              } catch (err) {                
                var errorObject = {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
                  sizeOfMessage:sizeOfMessage,
                  bytesRead:self.bytesRead,
                  stubBuffer:self.stubBuffer}};
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

inherits(Connection, EventEmitter);

module.exports = Connection;