"use strict";

var inherits = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , Connection = require('./connection')
  , Query = require('./commands').Query
  , Logger = require('./logger')
  , f = require('util').format;

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var _id = 0;

/**
 * Creates a new Pool instance
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
 * @param {string} [options.passPhrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=false] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @fires Pool#connect
 * @fires Pool#close
 * @fires Pool#error
 * @fires Pool#timeout
 * @fires Pool#parseError
 * @return {Pool} A cursor instance
 */
var Pool = function(options) {
  var self = this;
  // Add event listener
  EventEmitter.call(this);
  // Set empty if no options passed
  this.options = options || {};
  this.size = typeof options.size == 'number' ? options.size : 5;  
  // Message handler
  this.messageHandler = options.messageHandler;
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Contains all connections
  this.connections = [];
  this.state = DISCONNECTED;
  // Round robin index
  this.index = 0;
  this.dead = false;
  // Logger instance
  this.logger = Logger('Pool', options);
  // Pool id
  this.id = _id++;
  // Grouping tag used for debugging purposes
  this.tag = options.tag;
}

inherits(Pool, EventEmitter);

var errorHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] errored out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('error', err, self);
    }
  }
}

var timeoutHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] timedout out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('timeout', err, self);
    }
  }
}

var closeHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] closed [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('close', err, self);
    }
  }
}

var parseErrorHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] errored out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('parseError', err, self);
    }
  }
}

var connectHandler = function(self) {
  return function(connection) {
    self.connections.push(connection);
    // We have connected to all servers
    if(self.connections.length == self.size) {
      self.state = CONNECTED;
      // Done connecting
      self.emit("connect", self);
    }
  }
}

/**
 * Destroy pool
 * @method
 */
Pool.prototype.destroy = function() {
  this.state = DESTROYED;
  // Set dead
  this.dead = true;
  // Destroy all the connections
  this.connections.forEach(function(c) {
    // Destroy all event emitters
    ["close", "message", "error", "timeout", "parseError", "connect"].forEach(function(e) {
      c.removeAllListeners(e);
    });

    // Destroy the connection
    c.destroy();
  });
}

var execute = null;

try {
  execute = setImmediate;
} catch(err) {
  execute = process.nextTick;
}

/**
 * Connect pool
 * @method
 */
Pool.prototype.connect = function(_options) {
  var self = this;
  // Set to connecting
  this.state = CONNECTING
  // No dead
  this.dead = false;
  // Connect all sockets
  for(var i = 0; i < this.size; i++) {
    execute(function() {
      self.options.messageHandler = self.messageHandler;
      var connection = new Connection(self.options);
      
      // Add all handlers
      connection.once('close', closeHandler(self));
      connection.once('error', errorHandler(self));
      connection.once('timeout', timeoutHandler(self));
      connection.once('parseError', parseErrorHandler(self));
      connection.on('connect', connectHandler(self));

      // Start connection
      connection.connect(_options);
    });
  }
}

/**
 * Get a pool connection (round-robin)
 * @method
 * @return {Connection}
 */
Pool.prototype.get = function() {
  // if(this.dead) return null;
  var connection = this.connections[this.index++];
  this.index = this.index % this.connections.length;
  return connection;
}

/**
 * Get all pool connections
 * @method
 * @return {array}
 */
Pool.prototype.getAll = function() {
  return this.connections.slice(0);
}

/**
 * Is the pool connected
 * @method
 * @return {boolean}
 */
Pool.prototype.isConnected = function() {
  for(var i = 0; i < this.connections.length; i++) {
    if(!this.connections[i].isConnected()) return false;
  }

  return this.state == CONNECTED;
}

/**
 * Was the pool destroyed
 * @method
 * @return {boolean}
 */
Pool.prototype.isDestroyed = function() {
  return this.state == DESTROYED;
}  


/**
 * A server connect event, used to verify that the connection is up and running
 *
 * @event Pool#connect
 * @type {Pool}
 */

/**
 * The server connection closed, all pool connections closed
 *
 * @event Pool#close
 * @type {Pool}
 */

/**
 * The server connection caused an error, all pool connections closed
 *
 * @event Pool#error
 * @type {Pool}
 */

/**
 * The server connection timed out, all pool connections closed
 *
 * @event Pool#timeout
 * @type {Pool}
 */

/**
 * The driver experienced an invalid message, all pool connections closed
 *
 * @event Pool#parseError
 * @type {Pool}
 */

module.exports = Pool;