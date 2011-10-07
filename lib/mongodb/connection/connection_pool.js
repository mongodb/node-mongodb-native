var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  EventEmitter = require("events").EventEmitter,
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
}

// Inherit event emitter so we can emit stuff wohoo
inherits(ConnectionPool, EventEmitter);

// Creates handlers
var connectHandler = function(self) {
  return function(err) {
    // this references the connection object
    if(err) {
      // Add to list of error connections
      self.connectionsWithErrors[this.id] = this;
      // Remove from list of waiting to connect
      delete self.waitingToOpen[this.id];
      // Emit error so rest of code knows
      self.emit("error", err, this);
    } else {
      // Remove from list of waiting to connect
      delete self.waitingToOpen[this.id];
      // Add to list of open connections
      self.openConnections[this.id] = this;
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
  if(this.listeners("poolReady").length == 0) {
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

























