var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  MongoReply = require("../responses/mongo_reply").MongoReply,
  Connection = require("./connection").Connection;

var ConnectionPool = exports.ConnectionPool = function(host, port, poolSize, bson, socketOptions) {
  if(typeof host !== 'string' || typeof port !== 'number') throw "host and port must be specified [" + host + ":"  + port + "]";
  // Set up event emitter
  EventEmitter.call(this);  
  // Keep all options for the socket in a specific collection allowing the user to specify the 
  // Wished upon socket connection parameters
  this.socketOptions = typeof socketOptions === 'object' ? socketOptions : {};
  this.socketOptions.host = host;
  this.socketOptions.port = port;
  this.bson = bson;
  // PoolSize is always + 1 for special reserved "measurment" socket (like ping, stats etc)
  this.poolSize = poolSize;
  
  // Set default settings for the socket options
  utils.setIntegerParameter(this.socketOptions, 'timeout', 0);
  // Delay before writing out the data to the server
  utils.setBooleanParameter(this.socketOptions, 'noDelay', true);
  // Delay before writing out the data to the server
  utils.setIntegerParameter(this.socketOptions, 'keepAlive', 0);
  // Set the encoding of the data read, default is binary == null
  utils.setStringParameter(this.socketOptions, 'encoding', null);
  // Allows you to set a throttling bufferSize if you need to stop overflows
  utils.setIntegerParameter(this.socketOptions, 'bufferSize', 0);  
  
  // Internal structures
  // this.waitingToOpen = {};
  // this.connectionsWithErrors = {};
  // this.openConnections = {};
  // this.connectionsWithErrors = [];
  this.openConnections = [];
  this.connections = [];
  
  // Assign connection id's
  this.connectionId = 0;
  
  // Current index for selection of pool connection
  this.currentConnectionIndex = 0;
  // The pool state
  this._poolState = 'disconnected';  
  // timeout control
  this._timeout = false;
}

inherits(ConnectionPool, EventEmitter);

ConnectionPool.prototype.setMaxBsonSize = function(maxBsonSize) {
  if(maxBsonSize == null){
    maxBsonSize = Connection.DEFAULT_MAX_BSON_SIZE;
  }     

  for(var i = 0; i < this.openConnections.length; i++) {
    this.openConnections[i].maxBsonSize = maxBsonSize;
  }   
}

// Start a function
var _connect = function(_self) {
  return new function() {
    var connectionStatus = _self._poolState;
    // Create a new connection instance
    var connection = new Connection(_self.connectionId++, _self.socketOptions);
    // Set logger on pool
    connection.logger = _self.logger;
    // Connect handler
    connection.on("connect", function(err, connection) {
      // Add connection to list of open connections
      _self.openConnections.push(connection);
      _self.connections.push(connection)

      // If the number of open connections is equal to the poolSize signal ready pool
      if(_self.connections.length === _self.poolSize && _self._poolState !== 'disconnected') {
        // Set connected
        _self._poolState = 'connected';
        // Emit pool ready
        _self.emit("poolReady");
      } else if(_self.connections.length < _self.poolSize) {
        // We need to open another connection, make sure it's in the next
        // tick so we don't get a cascade of errors
        process.nextTick(function() {
          _connect(_self);
        });
      }
    });

    var numberOfErrors = 0

    // Error handler
    connection.on("error", function(err, connection) {
      numberOfErrors++;
      // If we are already disconnected ignore the event
      if(connectionStatus !== 'disconnected') {
        _self.emit("error", err);        
      }

      // Set disconnected
      connectionStatus = 'disconnected';
      // Set disconnected
      _self._poolState = 'disconnected'; 
      // Clean up
      _self.openConnections = [];    
      _self.connections = [];
    });

    // Close handler
    connection.on("close", function() {
      // If we are already disconnected ignore the event
      if(connectionStatus !== 'disconnected') {
        _self.emit("close");        
      }

      // Set disconnected
      connectionStatus = 'disconnected';
      // Set disconnected
      _self._poolState = 'disconnected'; 
      // Clean up
      _self.openConnections = [];    
      _self.connections = [];
    });

    // Timeout handler
    connection.on("timeout", function(err, connection) {
      // If we are already disconnected ignore the event
      if(connectionStatus !== 'disconnected') {
        _self.emit("error", err);        
      }

      // Set disconnected
      connectionStatus = 'disconnected';
      // Set disconnected
      _self._poolState = 'disconnected'; 
      // Clean up
      _self.openConnections = [];    
      _self.connections = [];
    });

    // Parse error, needs a complete shutdown of the pool
    connection.on("parseError", function() {
      // Set disconnected
      connectionStatus = 'disconnected';
      _self.stop();
    });

    connection.on("message", function(message) {  
      _self.emit("message", message);
    });

    // Start connection in the next tick
    connection.start();    
  }();
}


// Start method, will throw error if no listeners are available
// Pass in an instance of the listener that contains the api for 
// finding callbacks for a given message etc.
ConnectionPool.prototype.start = function() {
  var markerDate = new Date().getTime();
  var self = this;

  if(this.listeners("poolReady").length == 0) {
    throw "pool must have at least one listener ready that responds to the [poolReady] event";
  }
  
  // Set pool state to connecting
  this._poolState = 'connecting';  
  this._timeout = false;

  _connect(self);
}

// Restart a connection pool (on a close the pool might be in a wrong state)
ConnectionPool.prototype.restart = function() {
  // Close all connections
  this.stop(false);
  // Now restart the pool
  this.start();
}

// Stop the connections in the pool
ConnectionPool.prototype.stop = function(removeListeners) {
  removeListeners = removeListeners == null ? true : removeListeners;
  // Set disconnected
  this._poolState = 'disconnected';  

  // Clear all listeners if specified
  if(removeListeners) {
    this.removeAllEventListeners();    
  }

  // Close all connections
  for(var i = 0; i < this.connections.length; i++) {
    this.connections[i].close();
  }
  
  // Clean up
  // this.connectionsWithErrors = [];
  this.openConnections = [];    
  this.connections = []; 
}

// Check the status of the connection
ConnectionPool.prototype.isConnected = function() {
  return this._poolState === 'connected';
}

// Checkout a connection from the pool for usage, or grab a specific pool instance
ConnectionPool.prototype.checkoutConnection = function(id) {
  var index = (this.currentConnectionIndex++ % (this.openConnections.length));
  var connection = this.openConnections[index];
  return connection;
}

ConnectionPool.prototype.getAllConnections = function() {
  return this.connections;
}

// Remove all non-needed event listeners
ConnectionPool.prototype.removeAllEventListeners = function() {
  this.removeAllListeners("close");
  this.removeAllListeners("error");
  this.removeAllListeners("timeout");
  this.removeAllListeners("connect");
  this.removeAllListeners("end");
  this.removeAllListeners("parseError");
  this.removeAllListeners("message");
  this.removeAllListeners("poolReady");
}






















