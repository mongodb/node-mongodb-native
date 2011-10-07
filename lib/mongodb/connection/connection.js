var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  EventEmitter = require("events").EventEmitter;

var Connection = exports.Connection = function(id, socketOptions) {
  // Store all socket options
  this.socketOptions = socketOptions;
  // Id for the connection
  this.id = id;
  // State of the connection
  this.connected = false;
}

// Inherit event emitter so we can emit stuff wohoo
inherits(Connection, EventEmitter);

Connection.prototype.start = function() {
  // Create new connection instance
  this.connection = net.createConnection(this.socketOptions.port, this.socketOptions.host);
  // Set options on the socket
  this.connection.setEncoding(this.socketOptions.encoding);
  this.connection.setTimeout(this.socketOptions.timeout);
  this.connection.setNoDelay(this.socketOptions.noDelay);
  // Set keep alive if defined
  if(this.socketOptions.keepAlive > 0) {
    this.connection.setKeepAlive(true, this.socketOptions.keepAlive);
  }
  
  // Add all handlers to the socket to manage it
  this.connection.on("connect", connectHandler(this));
  this.connection.on("data", dataHandler(this));
  this.connection.on("end", endHandler(this));
  this.connection.on("timeout", timeoutHandler(this));
  this.connection.on("drain", drainHandler(this));
  this.connection.on("error", errorHandler(this));
  this.connection.on("close", closeHandler(this));
}

//
// Handlers
//

// Connect handler
var connectHandler = function(self) {
  return function() {
    // Set connected
    self.connected = true;
    // Emit the connect event with no error
    self.emit("connect", null);
  }
}

var dataHandler = function(self) {
  return function(data) {
    console.log("========================= data");
  }
}

var endHandler = function(self) {
  return function() {
    console.log("========================= end");
  }
}

var timeoutHandler = function(self) {
  return function() {
    console.log("========================= timeout");
  }
}

var drainHandler = function(self) {
  return function() {
    console.log("========================= drain");
  }
}

var errorHandler = function(self) {
  return function(err) {
    console.log("========================= error");
  }
}

var closeHandler = function(self) {
  return function(hadError) {
    // If we have an error during the connection phase
    if(hadError && !self.connected) {
      self.emit("connect", {err: 'failed to connect to [' + self.socketOptions.host + ':' + self.socketOptions.port + ']'}, self);
    } else {
      
    }
    
    console.log("========================= close");
  }
}








