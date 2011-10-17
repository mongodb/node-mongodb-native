var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  Connection = require("./connection").Connection;

var ConnectionPool = exports.ConnectionPool = function(host, port, poolSize, socketOptions) {
  if(typeof host !== 'string' || typeof port !== 'number') throw "host and port must be specified";
  // Keep all options for the socket in a specific collection allowing the user to specify the 
  // Wished upon socket connection parameters
  this.socketOptions = typeof socketOptions === 'object' ? socketOptions : {};
  this.socketOptions.host = host;
  this.socketOptions.port = port;
  this.socketOptions.poolSize = poolSize;
  
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
  
  // Just keeps list of events we allow
  this.eventHandlers = {error:[], poolReady:[]};
}

// Creates handlers
var connectHandler = function(self) {
  return function(err, connection) {
    // this references the connection object
    if(err) {
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Emit error so rest of code knows
      self.emit("error", err, connection);
    } else {
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Add to list of open connections
      self.openConnections[connection.id] = connection;
    } 
    
    // Check if we are done meaning that the number of openconnections + errorconnections
    if(Object.keys(self.waitingToOpen).length == 0) {
      // Emit pool is ready
      self.emit("poolReady");
    }
  } 
}

// Start method, will throw error if no listeners are available
ConnectionPool.prototype.start = function() {
  if(this.eventHandlers["poolReady"].length == 0) {
    throw "pool must have at least one listener ready that responds to the [poolReady] event";
  }
  
  // Let's boot up all the instances
  for(var i = 0; i < this.socketOptions.poolSize; i++) {
    // Create a new connection instance
    var connection = new Connection(i, this.socketOptions);
    // Add connection to list of waiting connections
    this.waitingToOpen[connection.id] = connection;
    // Add a connection handler
    connection.on("connect", connectHandler(this));
    // Start connection
    connection.start();
  }  
}

// Restart a connection pool (on a close the pool might be in a wrong state)
ConnectionPool.prototype.restart = function() {
  // Force close any sockets that are not already closed
  // for(var i = 0; i < this.openConnections.length; i++) {
  //   this.openConnections[i].
  // }
}

//
// My own simple synchronous emit support, We don't need the overhead of the built in flexible node.js
// event emitter as we are looking for as low latency as possible.
//
ConnectionPool.prototype.on = function(event, callback) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Just add callback to our event handler (avoiding the cost of the node.js event handler)
  this.eventHandlers[event].push(callback);
}

ConnectionPool.prototype.emit = function(event, err, object) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Fire off all the callbacks
  var callbacks = this.eventHandlers[event];
  // Perform a callback on all the registered callback handlers
  for(var i = 0; i < callbacks.length; i++) {
    callbacks[i](err, object);
  }
}

























