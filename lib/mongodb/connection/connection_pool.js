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
  this.socketOptions.poolSize = poolSize;
  this.bson = bson;
  
  // Set host variable or default
  utils.setStringParameter(this.socketOptions, 'host', '127.0.0.1');
  // Set port variable or default
  utils.setIntegerParameter(this.socketOptions, 'port', 27017);
  // Set poolSize or default
  utils.setIntegerParameter(this.socketOptions, 'poolSize', 1);

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
  
  // Just keeps list of events we allow
  // this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};
  // Current connection to pick
  this.currentConnectionIndex = 0;
  // The pool state
  this._poolState = 'not connected';  
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

// Creates handlers
var connectHandler = function(self) {
  return function(err, connection) {    
    // Ensure we don't fire same error message multiple times
    var fireError = true;
    var performedOperation = false;
    
    // if we have an error and we have not already put the connection into the list of connections with errors
    if(err && Object.keys(self.waitingToOpen).length > 0 && self.openConnections[connection.id] == null && self.connectionsWithErrors[connection.id] == null) {
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Ensure we only fire an error if there was an operation to avoid duplicate errors
      performedOperation = true;
    } else if(err && self.openConnections[connection.id] != null){
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of open connections
      delete self.openConnections[connection.id];      
      // Ensure we only fire an error if there was an operation to avoid duplicate errors
      performedOperation = true;
    } else if(!err && self.waitingToOpen[connection.id] != null){
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Add to list of open connections
      self.openConnections[connection.id] = connection;
      // Ensure we only fire an error if there was an operation to avoid duplicate errors
      performedOperation = true;
    } else {
      fireError = false;
    }
    
    // Check if we are done meaning that the number of openconnections + errorconnections
    if(Object.keys(self.waitingToOpen).length == 0 && performedOperation) {
      // If we have any errors notify the application, only fire if we don't have the element already in
      // errors
      if(Object.keys(self.connectionsWithErrors).length > 0 && fireError) {
        // Set pool type to not connected
        self._poolState = 'not connected';  
        // Emit error
        self.emit("error", err, connection);        
      } else {
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
  
  // Let's boot up all the instances
  for(var i = 0; i < this.socketOptions.poolSize; i++) {    
    // Create a new connection instance
    var connection = new Connection(this.connectionId++, this.socketOptions);
    // Add connection to list of waiting connections
    this.waitingToOpen[connection.id] = connection;    
    connection.on("connect", connectHandler(this));
    connection.on("error", connectHandler(this));
    connection.on("close", connectHandler(this));
    connection.on("end", connectHandler(this));
    connection.on("timeout", connectHandler(this));    
    connection.on("parseError", function(err) {
      // Set pool type to not connected
      self._poolState = 'not connected';  
      // Only close the connection if it's still connected
      if(self.isConnected()) self.stop();        
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
  // Set not connected
  this._poolState = 'not connected';  

  // Get all open connections
  var keys = Object.keys(this.openConnections);  
  // Force close all open sockets
  for(var i = 0; i < keys.length; i++) {
    this.openConnections[keys[i]].close();
  } 

  // Get all error connections
  var keys = Object.keys(this.connectionsWithErrors);  
  // Force close all error sockets
  for(var i = 0; i < keys.length; i++) {
    this.connectionsWithErrors[keys[i]].close();
  } 

  // Get all waiting to open connections
  var keys = Object.keys(this.waitingToOpen);  
  // Force close all waiting sockets
  for(var i = 0; i < keys.length; i++) {
    this.waitingToOpen[keys[i]].close();
  } 
  
  // Clear out all the connection variables
  this.waitingToOpen = {};
  this.connectionsWithErrors = {};
  this.openConnections = {};   

  // Emit a close event so people can track the event
  this.emit("close");
}

// Check the status of the connection
ConnectionPool.prototype.isConnected = function() {
  return Object.keys(this.waitingToOpen).length == 0 
    && Object.keys(this.connectionsWithErrors).length == 0
    && Object.keys(this.openConnections).length > 0 && this._poolState === 'connected'
    && this.openConnections[Object.keys(this.openConnections)[0]].isConnected();
}

// Checkout a connection from the pool for usage, or grab a specific pool instance
ConnectionPool.prototype.checkoutConnection = function(id) {
  // If we have an id return that specific connection
  if(id != null) return this.openConnections[id];
  // Otherwise let's pick one using roundrobin
  var keys = Object.keys(this.openConnections);
  return this.openConnections[(keys[(this.currentConnectionIndex++ % keys.length)])]
}

ConnectionPool.prototype.getAllConnections = function() {
  return this.openConnections;
}

// Remove all non-needed event listeners
ConnectionPool.prototype.removeAllEventListeners = function() {
  this.removeAllListeners("close");
  this.removeAllListeners("error");
}























