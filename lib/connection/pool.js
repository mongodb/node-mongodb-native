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
  // Add event listener
  EventEmitter.call(this);
  // Set empty if no options passed
  options = options || {};
  var size = options.size || 5;
  // var size = 1;
  var logger = options.logger 
    ? options.logger.create("Pool") : null;
  var self = this;
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Contains all connections
  var connections = [];
  var closedConnections = [];
  var state = DISCONNECTED;
  // Round robin index
  var index = 0;
  var dead = false;
  // Logger instance
  var logger = Logger('Pool', options);
  // Pool id
  var id = _id++;
  // Grouping tag used for debugging purposes
  var tag = options.tag;

  //
  // Handlers
  var messageHandler = function(response, connection) {    
    self.emit("message", response, connection)
  }

  var errorHandler = function(err, connection) {
    if(logger.isDebug()) logger.debug(f('pool [%s] errored out [%s] with connection [%s]', dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!dead) {
      state = DISCONNECTED;
      dead = true;
      self.destroy();
      self.emit('error', err, self);
    }
  }

  var timeoutHandler = function(err, connection) {
    if(logger.isDebug()) logger.debug(f('pool [%s] timedout out [%s] with connection [%s]', dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!dead) {
      state = DISCONNECTED;
      dead = true;
      self.destroy();
      self.emit('timeout', err, self);
    }
  }

  var closeHandler = function(err, connection) {
    if(logger.isDebug()) logger.debug(f('pool [%s] closed [%s] with connection [%s]', dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!dead) {
      state = DISCONNECTED;
      dead = true;
      self.destroy();
      self.emit('close', err, self);
    }
  }

  var parseErrorHandler = function(err, connection) {
    if(logger.isDebug()) logger.debug(f('pool [%s] errored out [%s] with connection [%s]', dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!dead) {
      state = DISCONNECTED;
      dead = true;
      self.destroy();
      self.emit('parseError', err, self);
    }
  }

  var connectHandler = function(connection) {
    connections.push(connection);
    // We have connected to all servers
    if(connections.length == size) {
      state = DISCONNECTED;
      state = CONNECTED;
      // Done connecting
      self.emit("connect", self);
    }
  }

  /**
   * Destroy pool
   * @method
   */
  this.destroy = function() {
    state = DESTROYED;
    // Set dead
    dead = true;
    // Destroy all the connections
    connections.forEach(function(c) {
      // Destroy all event emitters
      ["close", "message", "error", "timeout", "parseError", "connect"].forEach(function(e) {
        c.removeAllListeners(e);
      });

      // Destroy the connection
      c.destroy();
    });
  }

  /**
   * Connect pool
   * @method
   */
  this.connect = function(_options) {
    // Set to connecting
    state = CONNECTING
    // No dead
    dead = false;
    // Connect all sockets
    for(var i = 0; i < size; i++) {
      var connection = new Connection(options);
      
      // Add all handlers
      connection.once('close', closeHandler);
      connection.on('message', messageHandler);
      connection.once('error', errorHandler);
      connection.once('timeout', timeoutHandler);
      connection.once('parseError', parseErrorHandler);
      connection.on('connect', connectHandler);

      // Start connection
      connection.connect(_options);
    }
  }

  /**
   * Get a pool connection (round-robin)
   * @method
   * @return {Connection}
   */
  this.get = function() {
    var connection = connections[index++];
    index = index % connections.length;
    return connection;
  }

  /**
   * Get all pool connections
   * @method
   * @return {array}
   */
  this.getAll = function() {
    return connections.slice(0);
  }

  /**
   * Is the pool connected
   * @method
   * @return {boolean}
   */
  this.isConnected = function() {
    for(var i = 0; i < connections.length; i++) {
      if(!connections[i].isConnected()) return false;
    }

    return state == CONNECTED;
  }

  /**
   * Was the pool destroyed
   * @method
   * @return {boolean}
   */
  this.isDestroyed = function() {
    return state == DESTROYED;
  }  
}

inherits(Pool, EventEmitter);

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