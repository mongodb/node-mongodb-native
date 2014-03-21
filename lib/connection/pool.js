var inherits = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , Connection = require('./connection')
  , Query = require('./commands').Query;

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var Pool = function(options) {
  // Add event listener
  EventEmitter.call(this);
  // Set empty if no options passed
  options = options || {};
  var size = options.size || 5;
  var logger = options.logger 
    ? options.logger.create("Pool") : null;
  var self = this;
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Contains all connections
  var connections = [];
  var closedConnections = [];
  var state = DISCONNECTED;

  //
  // Handlers
  var messageHandler = function(response, connection) {    
    self.emit("message", response, connection)
  }

  var errorHandler = function(err, connection) {
    self.destroy();
    self.emit('error', err, self);
  }

  var timeoutHandler = function(err, connection) {
    self.destroy();
    self.emit('timeout', err, self);
  }

  var closeHandler = function(err, connection) {
    self.destroy();
    self.emit('close', err, self);
  }

  var parseErrorHandler = function(err, connection) {
    this.destroy();
    self.emit('error', err, self);
  }

  var connectHandler = function(connection) {
    connections.push(connection);
    // We have connected to all servers
    if(connections.length == size) {
      state = CONNECTED;
      // Done connecting
      self.emit("connect", self);
    }
  }

  //
  // Destroy pool
  this.destroy = function() {
    state = DESTROYED;
    // Destroy all the connections
    connections.forEach(function(c) {
      c.destroy();
    });
  }

  //
  // Connect pool
  this.connect = function() {
    // Set to connecting
    state = CONNECTING
    // Connect all sockets
    for(var i = 0; i < size; i++) {
      var connection = new Connection(options);
      // Add all handlers
      connection.on('close', closeHandler);
      connection.on('message', messageHandler);
      connection.on('error', errorHandler);
      connection.on('timeout', timeoutHandler);
      connection.on('parseError', parseErrorHandler);
      connection.on('connect', connectHandler);

      // Start connection
      connection.connect();
    }
  }
}

inherits(Pool, EventEmitter);

module.exports = Pool;