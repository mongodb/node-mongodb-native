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
  // Contains all connections
  this.connections = [];
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
  // If we are monitoring this server we will create an exclusive reserved socket for that
  this.monitoring = typeof options.monitoring == 'boolean' ? options.monitoring : false;
  // Maintain the monitoring connection
  this.monitorConnection = null;
  // Pool id
  this.id = _id++;
  // Grouping tag used for debugging purposes
  this.tag = options.tag;
  // Operation work queue
  this.queue = [];
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
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] timed out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
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

// execute = setTimeout;

/**
 * Connect pool
 * @method
 */
Pool.prototype.connect = function(_options) {
  // console.log("---------------------- CONNECT")
  var self = this;
  // Set to connecting
  this.state = CONNECTING
  // No dead
  this.dead = false;

  // Ensure we allow for a little time to setup connections
  var wait = 1;

  // Number of initial connections to perform
  var numberOfConnections = this.monitoring ? 2 : 1;

  // Connect all sockets
  for(var i = 0; i < numberOfConnections; i++) {
    setTimeout(function() {
      execute(function() {
        self.options.messageHandler = self.messageHandler;
        var connection = new Connection(self.options);

        // Add all handlers
        connection.once('close', closeHandler(self));
        connection.once('error', errorHandler(self));
        connection.once('timeout', timeoutHandler(self));
        connection.once('parseError', parseErrorHandler(self));
        connection.on('connect', function(connection) {
          // Add the connection to the list of available connections
          self.availableConnections.push(connection);

          // Have we finished the initial connection
          if(self.availableConnections.length == numberOfConnections) {
            // Reserve a monitoring socket
            if(self.monitoring) {
              self.monitorConnection = self.availableConnections.pop();
            }

            // Done connecting
            self.emit("connect", self);
          }
        });

        // Start connection
        connection.connect(_options);
      });
    }, wait);

    // wait for 1 miliseconds before attempting to connect, spacing out connections
    wait = wait + 1;
  }
}

var _createConnection = function(self) {
  self.options.messageHandler = self.messageHandler;
  var connection = new Connection(self.options);

  // Push the connection
  self.connectingConnections.push(connection);

  // Handle any errors
  var tempErrorHandler = function(err) {
    // self.emit('error', err);
  }

  // All event handlers
  var handlers = ["close", "message", "error", "timeout", "parseError", "connect"];

  // Handle successful connection
  var tempConnectHandler = function() {
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 0")
    // Destroy all event emitters
    handlers.forEach(function(e) {
      connection.removeAllListeners(e);
    });
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 1")

    // Add the final handlers
    connection.once('close', closeHandler(self));
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 3")
    connection.once('error', errorHandler(self));
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 4")
    connection.once('timeout', timeoutHandler(self));
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 5")
    connection.once('parseError', parseErrorHandler(self));

    // Remove the connection from the connectingConnections
    var index = self.connectingConnections.indexOf(connection);
    if(index != -1) {
      self.connectingConnections.splice(index, 1);
    }

    // Add to queue of new connection
    self.newConnections.push(connection);
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 8")
    // Emit connection to server instance
    // alowing it to apply any needed authentication
    self.emit('connection', connection);
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! tempConnectHandler 9")
  }

  // Add all handlers
  connection.once('close', tempErrorHandler);
  connection.once('error', tempErrorHandler);
  connection.once('timeout', tempErrorHandler);
  connection.once('parseError', tempErrorHandler);
  connection.once('connect', tempConnectHandler);

  // Start connection
  connection.connect();
}

var _execute = function(self) {
  return function() {
    console.log("----------------------- _execute")
    console.log("----------------------- pool.write _execute 0 :: availableConnections = " + self.availableConnections.length)
    console.log("----------------------- pool.write _execute 0 :: inUseConnections = " + self.inUseConnections.length)
    console.log("----------------------- pool.write _execute 0 :: newConnections = " + self.newConnections.length)
    console.log("----------------------- pool.write _execute 0 :: queue = " + self.queue.length)

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
      console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 0")
      // Create a new connection
      _createConnection(self);
      // Attempt to execute again
      return execute(_execute(self));
    }

    // Number of ops to do
    var numberOfOps = self.availableConnections.length > self.queue.length
      ? self.queue.length : self.availableConnections.length;

    // As long as we have available connections
    while(true) {
      if(self.availableConnections.length == 0) break;
      if(self.queue.length == 0) break;

      // Get a connection
      var connection = self.availableConnections.pop();
      var buffer = self.queue.shift();
      // Add connection to workers in flight
      self.inUseConnections.push(connection);
      // Write the data to the connection
      connection.write(buffer);
    }

    // Still got work that needs doing, keep executing
    if(self.queue.length > 0) {
      return execute(_execute(self));
    }
  }
}

/**
 * Write a message to MongoDB
 * @method
 * @return {Connection}
 */
Pool.prototype.write = function(buffer, options) {
  // We have a monitoring operation and need to use
  // the dedicated connection
  if(options && options.monitoring && this.monitorConnection) {
    return this.monitorConnection.write(buffer);
  }

  // Push the operation to the queue of operations in progress
  this.queue.push(buffer);
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

  // Add the connection to available connections
  this.availableConnections.push(connection);
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

  if(this.connections.length == 1) {
    return this.connections[0];
  } else if(this.monitoring && options.monitoring) {
    return this.connections[this.connections.length - 1];
  } else if(this.monitoring) {
    this.index = this.index % (this.connections.length - 1);
    return this.connections[this.index];
  } else {
    this.index = this.index % this.connections.length;
    return this.connections[this.index];
  }
}

/**
 * Reduce the poolSize to the provided max connections value
 * @method
 * @param {number} maxConnections reduce the poolsize to maxConnections
 */
Pool.prototype.capConnections = function(maxConnections) {
  // Do we have more connections than specified slice it
  if(this.connections.length > maxConnections) {
    // Get the rest of the connections
    var connections = this.connections.slice(maxConnections);
    // Cap the active connections
    this.connections = this.connections.slice(0, maxConnections);

    if (this.index >= maxConnections){
      // Go back to the beggining of the pool if capping connections
      this.index = 0;
    }

    // Remove all listeners
    for(var i = 0; i < connections.length; i++) {
      connections[i].removeAllListeners('close');
      connections[i].removeAllListeners('error');
      connections[i].removeAllListeners('timeout');
      connections[i].removeAllListeners('parseError');
      connections[i].removeAllListeners('connect');
      connections[i].destroy();
    }
  }
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
  // Available connections
  for(var i = 0; i < this.availableConnections.length; i++) {
    if(this.availableConnections[i].isConnected()) return true;
  }

  // inUseConnections
  for(var i = 0; i < this.inUseConnections.length; i++) {
    if(this.inUseConnections[i].isConnected()) return true;
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
