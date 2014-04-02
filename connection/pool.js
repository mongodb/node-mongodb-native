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
  // Round robin index
  var index = 0;
  var dead = false;

  //
  // Handlers
  var messageHandler = function(response, connection) {    
    self.emit("message", response, connection)
  }

  var errorHandler = function(err, connection) {
    if(!dead) {
      // console.log("################# pool error ")
      // console.dir(err)
      self.emit('error', err, self);
      dead = true;
      self.destroy();
    }
  }

  var timeoutHandler = function(err, connection) {
    if(!dead) {
      // console.log("################# pool timeout " + err)
      dead = true;
      self.destroy();
      self.emit('timeout', err, self);
    }
  }

  var closeHandler = function(err, connection) {
    if(!dead) {
      // console.log("################# pool close " + err)
      self.emit('close', err, self);
      dead = true;
      self.destroy();
    }
  }

  var parseErrorHandler = function(err, connection) {
    if(!dead) {
      // console.log("################# pool error ")
      // console.dir(err)
      self.emit('error', err, self);
      dead = true;
      self.destroy();
    }
  }

  var connectHandler = function(connection) {
    connections.push(connection);
    // We have connected to all servers
    if(connections.length == size) {
      state = CONNECTED;
      // console.log("################# pool connected")
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
      // Destroy all event emitters
      ["close", "message", "error", "timeout", "parseError", "connect"].forEach(function(e) {
        c.removeAllListeners(e);
      });

      // Destroy the connection
      c.destroy();
    });
  }

  //
  // Connect pool
  this.connect = function() {
    // console.log("################# pool connect")
    // console.dir(options)
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

  //
  // Get a connection
  this.get = function() {
    var connection = connections[index++];
    index = index % connections.length;
    return connection;
  }

  //
  // Are we connected
  this.isConnected = function() {
    return state == CONNECTED;
  }
}

inherits(Pool, EventEmitter);

module.exports = Pool;