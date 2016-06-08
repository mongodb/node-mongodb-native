"use strict";

var inherits = require('util').inherits,
  EventEmitter = require('events').EventEmitter,
  Connection = require('./connection'),
  MongoError = require('../error'),
  Logger = require('./logger');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var Pool = function(options) {
  var self = this;
  // Add event listener
  EventEmitter.call(this);
  // Add the options
  this.options = Object.assign({
    // Host and port settings
    host: 'localhost',
    port: 27017,
    // Pool default max size
    size: 5,
    // socket settings
    connectionTimeout: 30000,
    socketTimeout: 30000,
    keepAlive: true,
    keepAliveInitialDelay: 0,
    noDelay: true,
    // SSL Settings
    ssl: false, checkServerIdentity: false,
    ca: null, cert: null, key: null, passPhrase: null,
    rejectUnauthorized: false,
    promoteLongs: true
  }, options);

  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Logger instance
  this.logger = Logger('Pool', options);
  // Pool state
  this.state = DISCONNECTED;
  // Connections
  this.availableConnections = [];
  this.inUseConnections = [];
  this.connectingConnections = [];
  // Currently executing
  this.executing = false;
  // Operation work queue
  this.queue = [];
}

inherits(Pool, EventEmitter);

function authenticate(auth, connection, cb) {
  if(!auth) return cb(null);
}

function reauthenticate(connection, cb) {
  cb(null);
}

function connectionFailureHandler(self, event) {
  return function(err) {
    removeConnection(self, this);
    // No more socket available propegate the event
    if(self.socketCount() == 0) {
      self.emit(event, err);
    }
  };
}

function moveConnectionBetween(connection, from, to) {
  var index = from.indexOf(connection);
  // Move the connection from connecting to available
  if(index != -1) {
    from.splice(index, 1);
    to.push(connection);
  }
}

function messageHandler(self) {
  return function(message, connection) {
    // Get the callback
    var workItem = connection.workItem;
    // Clear out workItem
    connection.workItem = null;
    // Release the connection back to the pool
    moveConnectionBetween(connection, self.inUseConnections, self.availableConnections);

    // Keep executing, ensure current message handler does not stop execution
    process.nextTick(function() {
      _execute(self)();
    });

    // Time to dispatch the message if we have a callback
    if(!workItem.immediateRelease) {
      workItem.cb(message);
    }
  }
}

Pool.prototype.socketCount = function() {
  return this.availableConnections.length
    + this.inUseConnections.length
    + this.connectingConnections.length;
}

Pool.prototype.connect = function(auth) {
  if(this.state != DISCONNECTED) throw new MongoError('connection in unlawful state ' + this.state);
  var self = this;
  // Create a connection
  var connection = new Connection(messageHandler(self), this.options);
  // Add to list of connections
  this.connectingConnections.push(connection);
  // Add listeners to the connection
  connection.once('connect', function(connection) {
    if(self.state == DESTROYED) return self.destroy();

    // Authenticate
    authenticate(auth, connection, function(err) {
      if(self.state == DESTROYED) return self.destroy();
      // We have an error emit it
      if(err) return self.emit('error', err);
      // Move the active connection
      moveConnectionBetween(connection, self.connectingConnections, self.availableConnections);
      // Emit the connect event
      self.emit('connect', self);
    });
  });

  // Add error handlers
  connection.once('error', connectionFailureHandler(this, 'error'));
  connection.once('close', connectionFailureHandler(this, 'close'));
  connection.once('timeout', connectionFailureHandler(this, 'timeout'));
  connection.once('parseError', connectionFailureHandler(this, 'parseError'));
  // console.log("!!!!!!!!!!!!!!!!!!!!!!! connect")
  // Initite connection
  connection.connect();
}

Pool.prototype.auth = function() {

}

Pool.prototype.destroy = function() {
  // Set state to destroyed
  this.state = DESTROYED;

  // Events
  var events = ['error', 'close', 'timeout', 'parseError', 'connect'];

  // Get all the known connections
  var connections = this.availableConnections
    .concat(this.inUseConnections)
    .concat(this.connectingConnections);

  // Destroy all the connections
  connections.forEach(function(c) {
    // Remove all listeners
    for(var i = 0; i < events.length; i++) {
      c.removeAllListeners(events[i]);
    }
    // Destroy connection
    c.destroy();
  });
}

/**
 * Write a message to MongoDB
 * @method
 * @return {Connection}
 */
Pool.prototype.write = function(buffer, options, cb) {
  if(this.state == DESTROYED) {
    if(cb) cb(new MongoError('pool destroyed'));
    return;
  }

  // Ensure we have a callback
  if(typeof options == 'function') {
    cb = options, options = {};
  }

  // We need to have a callback function
  if(!(typeof cb == 'function')) throw new MongoError('write method must provide a callback');

  // Do we have an operation
  var operation = {buffer:buffer, cb: cb};

  // Do we immediately release the connection back to available (fire and forget)
  if(options && options.immediateRelease) {
    operation.immediateRelease = true;
  }

  // Push the operation to the queue of operations in progress
  this.queue.push(operation);
  // Attempt to write all buffers out
  _execute(this)();
}

// Remove connection method
function remove(connection, connections) {
  for(var i = 0; i < connections.length; i++) {
    if(connections[i] === connection) {
      connections.splice(i, 1);
      return true;
    }
  }
}

function removeConnection(self, connection) {
  if(remove(connection, self.availableConnections)) return;
  if(remove(connection, self.inUseConnections)) return;
  if(remove(connection, self.connectingConnections)) return;
}

function _createConnection(self) {
  // console.log("===== _createConnection")
  var connection = new Connection(messageHandler(self), self.options);

  // Push the connection
  self.connectingConnections.push(connection);

  // Handle any errors
  var tempErrorHandler = function(_connection) {
    return function(err) {
      console.log("===== _createConnection error")
      // Destroy the connection
      _connection.destroy();
      // Remove the connection from the connectingConnections list
      removeConnection(self, _connection);
    }
  }

  // All event handlers
  var handlers = ["close", "message", "error", "timeout", "parseError", "connect"];

  // Handle successful connection
  var tempConnectHandler = function(_connection) {
    return function() {
      // console.log("===== _createConnection 1")
      // Destroyed state return
      if(self.state == DESTROYED) {
        // Remove the connection from the list
        removeConnection(self, _connection);
        return _connection.destroy();
      }

      // Destroy all event emitters
      handlers.forEach(function(e) {
        _connection.removeAllListeners(e);
      });

      // Add the final handlers
      _connection.once('close', connectionFailureHandler(self, 'close'));
      _connection.once('error', connectionFailureHandler(self, 'error'));
      _connection.once('timeout', connectionFailureHandler(self, 'timeout'));
      _connection.once('parseError', connectionFailureHandler(self, 'parseError'));

      // Signal
      reauthenticate(_connection, function(err) {
        // Remove the connection from the connectingConnections list
        removeConnection(self, _connection);

        // Handle error
        if(err) {
          _connection.destroy();
        }

        // Push to available
        self.availableConnections.push(_connection);
        // console.log("===== _createConnection 3")
        // Execute any work waiting
        _execute(self)();
      });
    }
  }

  // Add all handlers
  connection.once('close', tempErrorHandler(connection));
  connection.once('error', tempErrorHandler(connection));
  connection.once('timeout', tempErrorHandler(connection));
  connection.once('parseError', tempErrorHandler(connection));
  connection.once('connect', tempConnectHandler(connection));

  // Start connection
  connection.connect();
}

function _execute(self) {
  return function() {
    if(self.state == DESTROYED) return;
    // Already executing, skip
    if(self.executing) return;
    // Set pool as executing
    self.executing = true;

    // As long as we have available connections
    while(true) {
      // console.log("====== _execute queue depth :: " + self.queue.length)
      // Total availble connections
      var totalConnections = self.availableConnections.length
        + self.connectingConnections.length
        + self.inUseConnections.length;

      // Have we not reached the max connection size yet
      if(self.availableConnections.length == 0
        && self.connectingConnections.length == 0
        && totalConnections < self.options.size
        && self.queue.length > 0) {
        // Create a new connection
        _createConnection(self);
        // Attempt to execute again
        self.executing = false;
        return;
      }

      // No available connections available
      if(self.availableConnections.length == 0) break;
      if(self.queue.length == 0) break;

      // Get a connection
      var connection = self.availableConnections.pop();
      // console.log("======= availableConnections.pop")
      if(connection.isConnected()) {
        // Get the next work item
        var workItem = self.queue.shift();

        // // Add connection to callback so we can flush out
        // // only ops for that connection on a socket closure
        // if(workItem.cb) {
        //   workItem.cb.connection = connection;
        // }

        // Get actual binary commands
        var buffer = workItem.buffer;

        // Add connection to workers in flight
        self.inUseConnections.push(connection);

        // Put operation on the wire
        connection.write(buffer);
        // Add current associated callback to the connection
        connection.workItem = workItem

        // Fire and forgot message, release the socket
        if(workItem.immediateRelease) {
          self.availableConnections.push(connection);
          self.inUseConnections.pop();
        }
      }
    }

    self.executing = false;
  }
}

module.exports = Pool;
