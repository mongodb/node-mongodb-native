var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  EventEmitter = require("events").EventEmitter;

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
  // Set the encoding of the data read, default is binary == null
  utils.setStringParameter(this.socketOptions, 'encoding', null);
  // Allows you to set a throttling bufferSize if you need to stop overflows
  utils.setIntegerParameter(this.socketOptions, 'bufferSize', 0);  
  
  // Internal structures
  this.waitingToOpen = [];
  this.connectionsWithErrors = [];
  this.openConnections = [];
}

// Inherit event emitter so we can emit stuff wohoo
inherits(ConnectionPool, EventEmitter);

// Start method, will throw error if no listeners are available
ConnectionPool.prototype.start = function() {
  if(this.listeners("poolReady").length == 0) {
    throw "pool must have at least one listener ready that responds to the [poolReady] event";
  }
  
  this.emit("poolReady")

  // Let's boot up all the instances
  for(var i = 0; i < this.socketOptions.poolSize; i++) {
    // Create an instance and add it to the waiting to be ready list
    // var 
  }
  
}
