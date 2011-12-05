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
  this.socketOptions.poolSize = poolSize;
  
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
  this.waitingToOpen = {};
  this.connectionsWithErrors = {};
  this.openConnections = {};
  
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
  var keys = Object.keys(this.openConnections);

  if ( typeof maxBsonSize == 'undefined' ){
    maxBsonSize = Connection.DEFAULT_MAX_BSON_SIZE;
  }     

  for(var i = 0; i < keys.length; i++) {
    this.openConnections[keys[i]].maxBsonSize = maxBsonSize;
  }   
}

// Create timeout handler
var timeoutHandler = function(self) {
  return function(err, connection) {
    // Check if the open Connection
    if(self.openConnections[connection.id] != null) {
      // Move open connection to timedout connection
      self.connectionsWithErrors[connection.id] = self.openConnections[connection.id];
      // Delete the open connection
      delete self.openConnections[connection.id];      
    }
    
    // Ensure we don't send multiple timeout
    self._timeout = true;
    // Signal timeout
    self.emit("timeout", err);
    // Remove all listeners
    self.removeAllEventListeners();
  }
}

// Creates handlers
var connectHandler = function(self) {
  return function(err, connection) {    
    // Ensure we don't fire same error message multiple times
    var fireError = true;
    var performedOperation = false;
    // console.log("------------------------------------------------ connectHandler");
    // console.dir(err)
    
    // if we have an error and we have not already put the connection into the list of connections with errors
    if(err && Object.keys(self.waitingToOpen).length > 0 && self.openConnections[connection.id] == null && self.connectionsWithErrors[connection.id] == null) {
      // console.log("------------------------------------------------ connectHandler :: 0");
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Ensure we only fire an error if there was an operation to avoid duplicate errors
      performedOperation = true;
    } else if(err && self.openConnections[connection.id] != null){
      // console.log("------------------------------------------------ connectHandler :: 1");
      // console.log(self.openConnections[connection.id])
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of open connections
      delete self.openConnections[connection.id];      
      // Ensure we only fire an error if there was an operation to avoid duplicate errors
      performedOperation = true;
    } else if(!err && self.waitingToOpen[connection.id] != null){
      // console.log("------------------------------------------------ connectHandler :: 3");
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Add to list of open connections
      self.openConnections[connection.id] = connection;
      // Ensure we only fire an error if there was an operation to avoid duplicate errors
      performedOperation = true;
    } else {
      // console.log("------------------------------------------------ connectHandler :: 4");
      fireError = false;
    }
    
    // console.log("       ===== Object.keys(self.waitingToOpen).length = " + Object.keys(self.waitingToOpen).length)
    // console.log("       ===== Object.keys(self.connectionsWithErrors).length = " + Object.keys(self.connectionsWithErrors).length)
    // console.log("       ===== Object.keys(self.openConnections).length = " + Object.keys(self.openConnections).length)
    // console.log("       ===== fireError = " + fireError)
    // console.log("       ===== self._poolState = " + self._poolState)
    
    // Check if we are done meaning that the number of openconnections + errorconnections
    if(Object.keys(self.waitingToOpen).length == 0 && performedOperation) {
      // console.log("------------------------------------------------ connectHandler :: 5");
      // console.log("       ===== Object.keys(self.waitingToOpen).length = " + Object.keys(self.waitingToOpen).length)
      // console.log("       ===== Object.keys(self.connectionsWithErrors).length = " + Object.keys(self.connectionsWithErrors).length)
      // console.log("       ===== Object.keys(self.openConnections).length = " + Object.keys(self.openConnections).length)
      // console.log("       ===== fireError = " + fireError)
      // console.log("       ===== self._poolState = " + self._poolState)

      // If we have any errors notify the application, only fire if we don't have the element already in
      // errors
      if(Object.keys(self.connectionsWithErrors).length > 0 && Object.keys(self.openConnections).length == 0 && fireError) {
        // console.log("------------------------------------------------ connectHandler :: 6");
        // Set pool type to disconnected
        self._poolState = 'disconnected';  
        // Emit error
        // process.nextTick(function() {
          self.emit("error", err, connection);          
        // })
      } else {
        // console.log("------------------------------------------------ connectHandler :: 7");
        // Set pool state to connecting
        self._poolState = 'connected';  
        // Emit pool is ready
        self.emit("poolReady");        
      }
    }
  } 
}

// Start method, will throw error if no listeners are available
// Pass in an instance of the listener that contains the api for 
// finding callbacks for a given message etc.
ConnectionPool.prototype.start = function() {
  var self = this;

  if(this.listeners("poolReady").length == 0) {
    throw "pool must have at least one listener ready that responds to the [poolReady] event";
  }
  
  // Set pool state to connecting
  this._poolState = 'connecting';  
  this._timeout = false;
  
  // Let's boot up all the instances
  for(var i = 0; i < this.socketOptions.poolSize; i++) {    
    // Create a new connection instance
    var connection = new Connection(this.connectionId++, this.socketOptions);
    // Set logger on pool
    connection.logger = this.logger;
    // Add connection to list of waiting connections
    this.waitingToOpen[connection.id] = connection;    
    connection.on("connect", connectHandler(this));
    connection.on("error", connectHandler(this));
    connection.on("close", connectHandler(this));
    connection.on("end", connectHandler(this));
    connection.on("timeout", timeoutHandler(this));    
    connection.on("parseError", function(err) {
      // Set pool type to disconnected
      self._poolState = 'disconnected';  
      // Only close the connection if it's still connected
      // if(self.isConnected()) self.stop();        
      // Emit the error
      self.emit("parseError", err);
    });    
    
    connection.on("message", function(message) {  
      self.emit("message", message);
    });
    
    // Start connection
    connection.start();
  }  
}

// Restart a connection pool (on a close the pool might be in a wrong state)
ConnectionPool.prototype.restart = function() {
  // Close all connections
  this.stop();
  // Now restart the pool
  this.start();
}

// Stop the connections in the pool
ConnectionPool.prototype.stop = function() {
  // Set disconnected
  this._poolState = 'disconnected';  

  // Clear all listeners
  this.removeAllEventListeners();
  
  // Get all open connections
  var keys = Object.keys(this.openConnections);  
  // Force close all open sockets
  for(var i = 0; i < keys.length; i++) {
    if(this.openConnections[keys[i]] != null) this.openConnections[keys[i]].close();
  } 

  // Get all error connections
  var keys = Object.keys(this.connectionsWithErrors);  
  // Force close all error sockets
  for(var i = 0; i < keys.length; i++) {
    if(this.connectionsWithErrors[keys[i]] != null) this.connectionsWithErrors[keys[i]].close();
  } 

  // Get all waiting to open connections
  var keys = Object.keys(this.waitingToOpen);  
  // Force close all waiting sockets
  for(var i = 0; i < keys.length; i++) {
    if(this.waitingToOpen[keys[i]] != null) this.waitingToOpen[keys[i]].close();
  } 
  
  // Clear out all the connection variables
  this.waitingToOpen = {};
  this.connectionsWithErrors = {};
  this.openConnections = {};   
}

// Check the status of the connection
ConnectionPool.prototype.isConnected = function() {
  // console.log("+++++++++++++++++++++++++++++++++++++++++++++++ ConnectionPool.prototype.isConnected")
  // console.log(Object.keys(this.waitingToOpen).length)
  // console.log(Object.keys(this.connectionsWithErrors).length)
  // console.log(Object.keys(this.openConnections).length)
  // console.log(this._poolState)
  
  return Object.keys(this.waitingToOpen).length == 0 
    && Object.keys(this.connectionsWithErrors).length == 0
    && Object.keys(this.openConnections).length > 0 && this._poolState === 'connected';
}

// Checkout a connection from the pool for usage, or grab a specific pool instance
ConnectionPool.prototype.checkoutConnection = function(id) {
  // If we have an id return that specific connection
  if(id != null) return this.openConnections[id];
  // Otherwise let's pick one using roundrobin
  var keys = Object.keys(this.openConnections);
  return this.openConnections[(keys[(this.currentConnectionIndex++ % (keys.length))])]
}

ConnectionPool.prototype.getAllConnections = function() {
  // Get all keys
  var allKeys = Object.keys(this.openConnections);
  var allConnections = new Array(allKeys.length);
  // Collect all connections
  for(var i = 0; i < allKeys.length; i++) {
    allConnections[i] = this.openConnections[allKeys[i]];
  }
  // Return list of connections
  return allConnections;
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
}






















