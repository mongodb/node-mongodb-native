"use strict";

var inherits = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , net = require('net')
  , tls = require('tls')
  , f = require('util').format
  , getSingleProperty = require('./utils').getSingleProperty
  , debugOptions = require('./utils').debugOptions
  , Response = require('./commands').Response
  , MongoError = require('../error')
  , Logger = require('./logger');

var _id = 0;
var debugFields = ['host', 'port', 'size', 'keepAlive', 'keepAliveInitialDelay', 'noDelay'
  , 'connectionTimeout', 'socketTimeout', 'singleBufferSerializtion', 'ssl', 'ca', 'cert'
  , 'rejectUnauthorized', 'promoteLongs'];

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
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
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
  this.options = options || {};
  // Identification information
  this.id = _id++;
  // Logger instance
  this.logger = Logger('Connection', options);
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Get bson parser
  this.bson = options.bson;
  // Grouping tag used for debugging purposes
  this.tag = options.tag;
  // Message handler
  this.messageHandler = options.messageHandler;

  // Max BSON message size
  this.maxBsonMessageSize = options.maxBsonMessageSize || (1024 * 1024 * 16 * 4);
  // Debug information
  if(this.logger.isDebug()) this.logger.debug(f('creating connection %s with options [%s]', this.id, JSON.stringify(debugOptions(debugFields, options))));

  // Default options
  this.port = options.port || 27017;
  this.host = options.host || 'localhost';
  this.keepAlive = typeof options.keepAlive == 'boolean' ? options.keepAlive : true;
  this.keepAliveInitialDelay = options.keepAliveInitialDelay || 0;
  this.noDelay = typeof options.noDelay == 'boolean' ? options.noDelay : true;
  this.connectionTimeout = options.connectionTimeout || 0;
  this.socketTimeout = options.socketTimeout || 0;

  // If connection was destroyed
  this.destroyed = false;

  // Check if we have a domain socket
  this.domainSocket = this.host.indexOf('\/') != -1;

  // Serialize commands using function
  this.singleBufferSerializtion = typeof options.singleBufferSerializtion == 'boolean' ? options.singleBufferSerializtion : true;
  this.serializationFunction = this.singleBufferSerializtion ? 'toBinUnified' : 'toBin';

  // SSL options
  this.ca = options.ca || null;
  this.cert = options.cert || null;
  this.key = options.key || null;
  this.passphrase = options.passphrase || null;
  this.ssl = typeof options.ssl == 'boolean' ? options.ssl : false;
  this.rejectUnauthorized = typeof options.rejectUnauthorized == 'boolean' ? options.rejectUnauthorized : true

  // If ssl not enabled
  if(!this.ssl) this.rejectUnauthorized = false;

  // Response options
  this.responseOptions = {
    promoteLongs: typeof options.promoteLongs == 'boolean' ?  options.promoteLongs : true
  }

  // Flushing
  this.flushing = false;
  this.queue = [];

  // Internal state
  this.connection = null;
  this.writeStream = null;
}

inherits(Connection, EventEmitter);

//
// Connection handlers
var errorHandler = function(self) {
  return function(err) {
    // Debug information
    if(self.logger.isDebug()) self.logger.debug(f('connection %s for [%s:%s] errored out with [%s]', self.id, self.host, self.port, JSON.stringify(err)));
    // Emit the error
    if(self.listeners('error').length > 0) self.emit("error", MongoError.create(err), self);
  }
}

var timeoutHandler = function(self) {
  return function() {
    // Debug information
    if(self.logger.isDebug()) self.logger.debug(f('connection %s for [%s:%s] timed out', self.id, self.host, self.port));
    // Emit timeout error
    self.emit("timeout"
      , MongoError.create(f("connection %s to %s:%s timed out", self.id, self.host, self.port))
      , self);
  }
}

var closeHandler = function(self) {
  return function(hadError) {
    // Debug information
    if(self.logger.isDebug()) self.logger.debug(f('connection %s with for [%s:%s] closed', self.id, self.host, self.port));
    // Emit close event
    if(!hadError) {
      self.emit("close"
        , MongoError.create(f("connection %s to %s:%s closed", self.id, self.host, self.port))
        , self);
    }
  }
}

var dataHandler = function(self) {
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
            self.messageHandler(new Response(self.bson, emitBuffer, self.responseOptions), self);
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
            // var sizeOfMessage = data.readUInt32LE(0);
            var sizeOfMessage = data[0] | data[1] << 8 | data[2] << 16 | data[3] << 24;
            // If we have a negative sizeOfMessage emit error and return
            if(sizeOfMessage < 0 || sizeOfMessage > self.maxBsonMessageSize) {
              var errorObject = {err:"socketHandler", trace:'', bin:self.buffer, parseState:{
                sizeOfMessage: sizeOfMessage,
                bytesRead: self.bytesRead,
                stubBuffer: self.stubBuffer}};
              // We got a parse Error fire it off then keep going
              self.emit("parseError", errorObject, self);
              return;
            }

            // Ensure that the size of message is larger than 0 and less than the max allowed
            if(sizeOfMessage > 4 && sizeOfMessage < self.maxBsonMessageSize && sizeOfMessage > data.length) {
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

            } else if(sizeOfMessage > 4 && sizeOfMessage < self.maxBsonMessageSize && sizeOfMessage == data.length) {
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
                self.messageHandler(new Response(self.bson, emitBuffer, self.responseOptions), self);
              } catch (err) {
                var errorObject = {err:"socketHandler", trace:err, bin:self.buffer, parseState:{
                  sizeOfMessage:self.sizeOfMessage,
                  bytesRead:self.bytesRead,
                  stubBuffer:self.stubBuffer}};
                // We got a parse Error fire it off then keep going
                self.emit("parseError", errorObject, self);
              }
            } else if(sizeOfMessage <= 4 || sizeOfMessage > self.maxBsonMessageSize) {
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
              self.messageHandler(new Response(self.bson, emitBuffer, self.responseOptions), self);
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

/**
 * Connect
 * @method
 */
Connection.prototype.connect = function(_options) {
  var self = this;
  _options = _options || {};
  // Check if we are overriding the promoteLongs
  if(typeof _options.promoteLongs == 'boolean') {
    self.responseOptions.promoteLongs = _options.promoteLongs;
  }

  // Create new connection instance
  self.connection = self.domainSocket
    ? net.createConnection(self.host)
    : net.createConnection(self.port, self.host);

  // Set the options for the connection
  self.connection.setKeepAlive(self.keepAlive, self.keepAliveInitialDelay);
  self.connection.setTimeout(self.connectionTimeout);
  self.connection.setNoDelay(self.noDelay);

  // If we have ssl enabled
  if(self.ssl) {
    var sslOptions = {
        socket: self.connection
      , rejectUnauthorized: self.rejectUnauthorized
    }

    if(self.ca) sslOptions.ca = self.ca;
    if(self.cert) sslOptions.cert = self.cert;
    if(self.key) sslOptions.key = self.key;
    if(self.passphrase) sslOptions.passphrase = self.passphrase;

    // Attempt SSL connection
    self.connection = tls.connect(self.port, self.host, sslOptions, function() {
      // Error on auth or skip
      if(self.connection.authorizationError && self.rejectUnauthorized) {
        return self.emit("error", self.connection.authorizationError, self, {ssl:true});
      }

      // Set socket timeout instead of connection timeout
      self.connection.setTimeout(self.socketTimeout);
      // We are done emit connect
      self.emit('connect', self);
    });
    self.connection.setTimeout(self.connectionTimeout);
  } else {
    self.connection.on('connect', function() {
      // Set socket timeout instead of connection timeout
      self.connection.setTimeout(self.socketTimeout);
      // Emit connect event
      self.emit('connect', self);
    });
  }

  // Add handlers for events
  self.connection.once('error', errorHandler(self));
  self.connection.once('timeout', timeoutHandler(self));
  self.connection.once('close', closeHandler(self));
  self.connection.on('data', dataHandler(self));
}

/**
 * Destroy connection
 * @method
 */
Connection.prototype.destroy = function() {
  if(this.connection) this.connection.destroy();
  this.destroyed = true;
}

/**
 * Write to connection
 * @method
 * @param {Command} command Command to write out need to implement toBin and toBinUnified
 */
Connection.prototype.write = function(buffer) {
  // Debug log
  if(this.logger.isDebug()) this.logger.debug(f('writing buffer [%s] to %s:%s', buffer.toString('hex'), this.host, this.port));
  // Write out the command
  if(!Array.isArray(buffer)) return this.connection.write(buffer, 'binary');
  // Iterate over all buffers and write them in order to the socket
  for(var i = 0; i < buffer.length; i++) this.connection.write(buffer[i], 'binary');
}

/**
 * Return id of connection as a string
 * @method
 * @return {string}
 */
Connection.prototype.toString = function() {
  return "" + this.id;
}

/**
 * Return json object of connection
 * @method
 * @return {object}
 */
Connection.prototype.toJSON = function() {
  return {id: this.id, host: this.host, port: this.port};
}

/**
 * Is the connection connected
 * @method
 * @return {boolean}
 */
Connection.prototype.isConnected = function() {
  if(this.destroyed) return false;
  return !this.connection.destroyed && this.connection.writable;
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
