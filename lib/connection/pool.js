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
 * @param {number} [options.size=1] Max server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=0] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=0] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {number} [options.monitoringSocketTimeout=30000] TCP Socket timeout setting for replicaset monitoring socket
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
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
  this.size = typeof options.size == 'number' && !isNaN(options.size) ? options.size : 5;
  this.waitMS = typeof options.waitMS == 'number' && !isNaN(options.waitMS) ? options.waitMS : 1000;

  // Save host and port
  this.host = options.host;
  this.port = options.port;

  // Message handler
  this.messageHandler = options.messageHandler;
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // // Contains all connections
  // this.connections = [];
  // Contains all available connections
  this.availableConnections = [];
  this.inUseConnections = [];
  this.newConnections = [];
  this.connectingConnections = [];
  // Current status of the pool
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
  // Operation work queue
  this.queue = [];
  // Currently executing
  this.executing = false;
  // Unref pool
  this.unreference = false;
  // Set the monitoring connection timeout
  this.monitoringSocketTimeout = typeof options.monitoringSocketTimeout == 'number'
    ? options.monitoringSocketTimeout : options.connectionTimeout;
  this.monitoringSocketTimeout = typeof this.monitoringSocketTimeout == 'number'
    ? this.monitoringSocketTimeout : 30000;
}

inherits(Pool, EventEmitter);

var removeConnection = function(self, connection) {
  // Destroy connection
  connection.destroy();

  // Remove connection method
  var remove = function(connections) {
    for(var i = 0; i < connections.length; i++) {
      if(connections[i] === connection) {
        connections.splice(i, 1);
        return true;
      }
    }
  }

  // Clean out the connection
  if(remove(self.availableConnections)) return;
  if(remove(self.inUseConnections)) return;
  if(remove(self.newConnections)) return;
  if(remove(self.connectingConnections)) return;
}

var errorHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] errored out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    // Destroy the connection
    connection.destroy();
    // Remove the connection
    removeConnection(self, connection);
    // Emit error
    if(self.listeners('error').length > 0) {
      self.emit('error', err, connection);
    }
  }
}

var timeoutHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] timed out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    // Destroy the connection
    connection.destroy();
    // Remove the connection
    removeConnection(self, connection);
    // Set disconnected if pool is empty
    if(self.getAll().length == 0) self.state = DISCONNECTED;
    // Emit connection timeout to server instance
    self.emit('timeout', err, connection);
  }
}

var closeHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] closed [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    // Destroy the connection
    connection.destroy();
    // Remove the connection
    removeConnection(self, connection);
    // Set disconnected if pool is empty
    if(self.getAll().length == 0) self.state = DISCONNECTED;
    // Emit connection close to server instance
    self.emit('close', err, connection);
  }
}

var parseErrorHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] errored out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    // Destroy the connection
    connection.destroy();
    // Remove the connection
    removeConnection(self, connection);
    // Set disconnected if pool is empty
    if(self.getAll().length == 0) self.state = DISCONNECTED;
    // Emit error to server instance
    self.emit('parseError', err, connection);
  }
}

/**
 * Unref the pool
 * @method
 */
Pool.prototype.unref = function() {
  this.unreference = true;
  this.getAll().forEach(function(c) {
    c.unref();
  });
}

/**
 * Destroy pool
 * @method
 */
Pool.prototype.destroy = function() {
  this.state = DESTROYED;
  // Set dead
  this.dead = true;
  // Get all the connections
  var connections = this.getAll();
  // Destroy all the connections
  connections.forEach(function(c) {
    // Destroy all event emitters
    ["close", "message", "error", "timeout", "parseError", "connect"].forEach(function(e) {
      c.removeAllListeners(e);
    });

    // Destroy the connection
    c.destroy();
  });

  // Wipe out all connection arrays
  this.availableConnections = [];
  this.connectingConnections = [];
  this.inUseConnections = [];
  this.newConnections = [];
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

  // Set the message handler
  self.options.messageHandler = self.messageHandler;
  // Create a new connection
  var connection = new Connection(self.options);

  // Delete all the event handlers
  ['close', 'error', 'timeout', 'parseError', 'connect'].forEach(function(x) {
    connection.removeAllListeners(x);
  })

  // Add all handlers
  connection.once('close', closeHandler(self));
  connection.once('error', errorHandler(self));
  connection.once('timeout', timeoutHandler(self));
  connection.once('parseError', parseErrorHandler(self));
  connection.on('connect', function(connection) {
    if(self.state == DESTROYED) {
      return connection.destroy();
    }

    if(self.state == CONNECTING) {
      self.state = CONNECTED;
    }

    // Add the connection to the list of available connections
    self.availableConnections.push(connection);
    // Emit connected event
    self.emit("connect", self);
  });

  // Start connection
  connection.connect(_options);
}

var _createConnection = function(self) {
  self.options.messageHandler = self.messageHandler;
  var connection = new Connection(self.options);

  // Push the connection
  self.connectingConnections.push(connection);

  // Handle any errors
  var tempErrorHandler = function(_connection) {
    return function(err) {
      // Destroy the connection
      _connection.destroy();
      // Remove the connection from the connectingConnections list
      removeConnection(self, connection);
    }
  }

  // All event handlers
  var handlers = ["close", "message", "error", "timeout", "parseError", "connect"];

  // Handle successful connection
  var tempConnectHandler = function(_connection) {
    return function() {
      if(self.state == DESTROYED) {
        // Remove the connection from the connectingConnections
        var index = self.connectingConnections.indexOf(_connection);
        if(index != -1) {
          self.connectingConnections.splice(index, 1);
        }

        return _connection.destroy();
      }

      // Destroy all event emitters
      handlers.forEach(function(e) {
        _connection.removeAllListeners(e);
      });

      // Add the final handlers
      _connection.once('close', closeHandler(self));
      _connection.once('error', errorHandler(self));
      _connection.once('timeout', timeoutHandler(self));
      _connection.once('parseError', parseErrorHandler(self));

      // Remove the connection from the connectingConnections
      var index = self.connectingConnections.indexOf(_connection);
      if(index != -1) {
        self.connectingConnections.splice(index, 1);
      }

      // Add to queue of new connection
      self.newConnections.push(_connection);
      // Emit connection to server instance
      // alowing it to apply any needed authentication
      self.emit('connection', _connection);

      // Execute any work waiting
      _execute(self)();
    }
  }

  // Add all handlers
  connection.once('close', tempErrorHandler(connection));
  connection.once('error', tempErrorHandler(connection));
  connection.once('timeout', tempErrorHandler(connection));
  connection.once('parseError', tempErrorHandler(connection));
  connection.once('connect', tempConnectHandler(connection));

  // Start connection
  connection.connect();
}

var _execute = function(self) {
  return function() {
    if(self.state == DESTROYED) return;
    // Already executing, skip
    if(self.executing) return;
    // Set pool as executing
    self.executing = true;

    // Total availble connections
    var totalConnections = self.availableConnections.length
      + self.connectingConnections.length
      + self.inUseConnections.length
      + self.newConnections.length;

    // Have we not reached the max connection size yet
    if(self.availableConnections.length == 0
      && self.connectingConnections.length == 0
      && totalConnections < self.size
      && self.queue.length > 0) {
      // Create a new connection
      _createConnection(self);
      // Attempt to execute again
      self.executing = false;
      return;
    }

    // Number of ops to do
    var numberOfOps = self.availableConnections.length > self.queue.length
      ? self.queue.length : self.availableConnections.length;

    // As long as we have available connections
    while(true) {
      // No available connections available
      if(self.availableConnections.length == 0) break;
      if(self.queue.length == 0) break;

      // Get a connection
      var connection = self.availableConnections.pop();
      if(connection.isConnected()) {
        var workItem = self.queue.shift();

        // Add connection to callback so we can flush out
        // only ops for that connection on a socket closure
        if(workItem.cb) {
          workItem.cb.connection = connection;
        }

        // Get actual binary commands
        var buffer = workItem.buffer;

        // Add connection to workers in flight
        self.inUseConnections.push(connection);

        if(Array.isArray(buffer)) {
          for(var i = 0; i < buffer.length; i++) {
            connection.write(buffer[i]);
          }
        } else {
          connection.write(buffer);
        }

        // If we are monitoring, set the socket timeout to
        // different value until it returns
        if(workItem.monitoring) {
          connection.socketTimeoutMS = self.monitoringSocketTimeout;
        }

        // Fire and forgot message
        if(workItem.immediateRelease) {
          self.availableConnections.push(connection);
          self.inUseConnections.pop();
        }
      }
    }

    self.executing = false;
  }
}

/**
 * Write a message to MongoDB
 * @method
 * @return {Connection}
 */
Pool.prototype.write = function(buffer, cb, options) {
  // Do we have an operation
  var operation = {buffer:buffer, cb: cb};

  // Is it a monitoring operation
  if(options && options.monitoring) {
    operation.monitoring = true;
  }

  // Do we immediately release the connection back to available (fire and forget)
  if(options && options.immediateRelease) {
    operation.immediateRelease = true;
  }

  // Push the operation to the queue of operations in progress
  this.queue.push(operation);
  // Attempt to write all buffers out
  _execute(this)();
}

/**
 * Make a passed connection available
 * @method
 * @return {Connection}
 */
Pool.prototype.connectionAvailable = function(connection) {
  // Get the connection from the newConnections
  var index = this.newConnections.indexOf(connection);
  if(index != -1) {
    this.newConnections.splice(index, 1);
  }

  // If it's in the inUseConnections
  index = this.inUseConnections.indexOf(connection);
  if(index != -1) {
    this.inUseConnections.splice(index, 1);
  }

  // Add the connection to available connections if it's not a monitoring threads
  if(this.availableConnections.indexOf(connection) == -1) {
    this.availableConnections.push(connection);
  }

  // Fire execute loop
  _execute(this)();
}

/**
 * Get a pool connection (round-robin)
 * @method
 * @return {Connection}
 */
Pool.prototype.get = function(options) {
  options = options || {};

  // Set the current index
  this.index = this.index + 1;

  // Get all connections
  var connections = this.availableConnections.slice(0);

  if(connections.length == 1) {
    return connections[0];
  } else {
    this.index = this.index % connections.length;
    return connections[this.index];
  }
}

/**
 * Get all pool connections
 * @method
 * @return {array}
 */
Pool.prototype.getAll = function() {
  return this.availableConnections
    .concat(this.inUseConnections)
    .concat(this.connectingConnections)
    .concat(this.newConnections);
}

/**
 * Is the pool connected
 * @method
 * @return {boolean}
 */
Pool.prototype.isConnected = function() {
  // Available connections
  for(var i = 0; i < this.availableConnections.length; i++) {
    if(this.availableConnections[i].isConnected()) return true;
  }

  // inUseConnections
  for(var i = 0; i < this.inUseConnections.length; i++) {
    if(this.inUseConnections[i].isConnected()) return true;
  }

  for(var i = 0; i < this.newConnections.length; i++) {
    if(this.newConnections[i].isConnected()) return true;
  }

  return false;
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
