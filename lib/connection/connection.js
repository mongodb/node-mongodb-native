var inherits = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , net = require('net')
  , tls = require('tls')
  , f = require('util').format
  , getSingleProperty = require('./utils').getSingleProperty
  , Response = require('./commands').Response
  , MongoError = require('../error')
  , Logger = require('./logger');  

var _id = 0;

/**
 * Creates a new Connection instance
 * @class
 * @param {string} options.host The server host
 * @param {number} options.port The server port
 * @param {number} [options.size=5] Server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=0] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=0] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=false] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @fires Connection#connect
 * @fires Connection#close
 * @fires Connection#error
 * @fires Connection#timeout
 * @fires Connection#parseError
 * @return {Connection} A cursor instance
 */
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
  // Grouping tag used for debugging purposes
  var tag = options.tag;

  // Max BSON message size
  var maxBsonMessageSize = options.maxBsonMessageSize || (1024 * 1024 * 16 * 4);
  // Debug information
  if(logger.isDebug()) logger.debug(f('creating connection %s with options [%s]', id, JSON.stringify(options)));

  // Default options
  var port = options.port || 27017;
  var host = options.host || 'localhost';
  var keepAlive = typeof options.keepAlive == 'boolean' ? options.keepAlive : true;
  var keepAliveInitialDelay = options.keepAliveInitialDelay || 0;
  var noDelay = typeof options.noDelay == 'boolean' ? options.noDelay : true;
  var connectionTimeout = options.connectionTimeout || 0;
  var socketTimeout = options.socketTimeout || 0;

  // Check if we have a domain socket
  var domainSocket = host.indexOf('\/') != -1;

  // Serialize commands using function
  var singleBufferSerializtion = typeof options.singleBufferSerializtion == 'boolean' ? options.singleBufferSerializtion : true;
  var serializationFunction = singleBufferSerializtion ? 'toBinUnified' : 'toBin';
  
  // SSL options
  var ca = options.ca || null;
  var cert = options.cert || null;
  var key = options.key || null;
  var passphrase = options.passphrase || null;
  var ssl = typeof options.ssl == 'boolean' ? options.ssl : false;
  var rejectUnauthorized = typeof options.rejectUnauthorized == 'boolean' ? options.rejectUnauthorized : false

  // Response options
  var responseOptions = {
    promoteLongs: typeof options.promoteLongs == 'boolean' ?  options.promoteLongs : true
  }

  // Flushing
  var flushing = false;
  var queue = [];

  // Internal state
  var connection = null;
  var writeStream = null;

  // Set the single properties
  getSingleProperty(this, 'id', id);
  getSingleProperty(this, 'host', host);
  getSingleProperty(this, 'port', port);
  getSingleProperty(this, 'connectionTimeout', connectionTimeout);
  getSingleProperty(this, 'socketTimeout', socketTimeout);
  getSingleProperty(this, 'noDelay', noDelay);
  getSingleProperty(this, 'keepAlive', keepAlive);
  getSingleProperty(this, 'keepAliveInitialDelay', keepAliveInitialDelay);

  // Internal reference
  var self = this;

  /**
   * Connect
   * @method
   */
  this.connect = function(_options) {
    _options = _options || {};
    // Check if we are overriding the promoteLongs
    if(typeof _options.promoteLongs == 'boolean')
      responseOptions.promoteLongs = _options.promoteLongs;

    // Create new connection instance
    connection = domainSocket 
      ? net.createConnection(host)
      : net.createConnection(port, host);

    // Set the options for the connection
    connection.setKeepAlive(keepAlive, keepAliveInitialDelay);
    connection.setTimeout(connectionTimeout);
    connection.setNoDelay(noDelay);

    // If we have ssl enabled
    if(ssl) {
      var sslOptions = {
          socket: connection
        , rejectUnauthorized: rejectUnauthorized
      }

      if(ca) sslOptions.ca = ca;
      if(cert) sslOptions.cert = cert;
      if(key) sslOptions.key = key;
      if(passphrase) sslOptions.passphrase = passphrase;

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
    connection.once('error', errorHandler);
    connection.once('timeout', timeoutHandler);
    connection.once('close', closeHandler);
    connection.on('data', dataHandler);
  }

  /**
   * Destroy connection
   * @method
   */
  this.destroy = function() {
    if(connection) connection.destroy();
  }

  /**
   * Write to connection
   * @method
   * @param {Command} command Command to write out need to implement toBin and toBinUnified
   */
  this.write = function(command) {
    // Get the raw buffer
    var buffer = Buffer.isBuffer(command) 
      ? command 
      : (command[serializationFunction] ? command[serializationFunction]() : command.toBin());
    // Debug log
    if(logger.isDebug()) logger.debug(f('writing buffer [%s] to %s:%s', buffer.toString('hex'), host, port));
    // Write out the command
    connection.write(buffer, 'binary');
  }

  /**
   * Return id of connection as a string
   * @method
   * @return {string}
   */
  this.toString = function() {
    return "" + id;
  }

  /**
   * Return json object of connection
   * @method
   * @return {object}
   */
  this.toJSON = function() {
    return {id: id, host: host, port: port};
  }

  /**
   * Is the connection connected
   * @method
   * @return {boolean}
   */
  this.isConnected = function() {
    return !connection.destroyed && connection.writable;
  }

  //
  // Connection handlers
  var errorHandler = function(err) {  
    // Debug information
    if(logger.isDebug()) logger.debug(f('connection %s for [%s:%s] errored out with [%s]', id,host, port, JSON.stringify(err)));
    // Emit the error
    if(self.listeners('error').length > 0) self.emit("error", MongoError.create(err), self);
  }

  var timeoutHandler = function() {
    // Debug information
    if(logger.isDebug()) logger.debug(f('connection %s for [%s:%s] timeout out', id,host, port));
    // Emit timeout error
    self.emit("timeout"
      , MongoError.create(f("connection %s to %s:%s timed out", id, host, port))
      , self);
  }

  var closeHandler = function(hadError) {
    // Debug information
    if(logger.isDebug()) logger.debug(f('connection %s with for [%s:%s] closed', id,host, port));
    // Emit close event
    if(!hadError) {
      self.emit("close"
        , MongoError.create(f("connection %s to %s:%s closed", id, host, port))
        , self);        
    }
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
            if(sizeOfMessage < 0 || sizeOfMessage > maxBsonMessageSize) {
              var errorObject = {err:"socketHandler", trace:'', bin:self.buffer, parseState:{
                sizeOfMessage: sizeOfMessage,
                bytesRead: self.bytesRead,
                stubBuffer: self.stubBuffer}};
              // We got a parse Error fire it off then keep going
              self.emit("parseError", errorObject, self);
              return;
            }

            // Ensure that the size of message is larger than 0 and less than the max allowed
            if(sizeOfMessage > 4 && sizeOfMessage < maxBsonMessageSize && sizeOfMessage > data.length) {
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

            } else if(sizeOfMessage > 4 && sizeOfMessage < maxBsonMessageSize && sizeOfMessage == data.length) {
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
            } else if(sizeOfMessage <= 4 || sizeOfMessage > maxBsonMessageSize) {
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