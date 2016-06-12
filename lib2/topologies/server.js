"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain,
  EventEmitter = require('events').EventEmitter,
  BSON = require('bson').native().BSON,
  Logger = require('../connection/logger'),
  Pool = require('../connection/pool'),
  PreTwoSixWireProtocolSupport = require('../wireprotocol/2_4_support'),
  TwoSixWireProtocolSupport = require('../wireprotocol/2_6_support'),
  ThreeTwoWireProtocolSupport = require('../wireprotocol/3_2_support');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var Server = function(options) {
  options = options || {};

  // Add event listener
  EventEmitter.call(this);

  // Internal state
  this.s = {
    // Options
    options: options,
    // State variable
    state: DISCONNECTED,
    // Logger
    logger: Logger('Server', options),
    // BSON instance
    bson: options.bson || new BSON()
  }
}

inherits(Server, EventEmitter);

var eventHandler = function(self, event) {
  return function(err) {
    if(event == 'connect') {
      self.emit('connect', self);
    } else if(event == 'error' || event == 'parseError'
      || event == 'close' || event == 'timeout') {
      self.emit(event, err);
    }
  }
}

Server.prototype.connect = function(options) {
  var self = this;
  options = options || {};

  // Do not allow connect to be called on anything that's not disconnected
  if(self.s.state != DISCONNECTED) {
    throw MongoError.create(f('server instnace in invalid state %s', self.s.state));
  }

  // Create a pool
  self.s.pool = new Pool(Object.assign(self.s.options, options));

  // Set up listeners
  self.s.pool.on('close', eventHandler(self, 'close'));
  self.s.pool.on('error', eventHandler(self, 'error'));
  self.s.pool.on('timeout', eventHandler(self, 'timeout'));
  self.s.pool.on('parseError', eventHandler(self, 'parseError'));
  self.s.pool.on('connect', eventHandler(self, 'connect'));

  // Connect with optional auth settings
  self.s.pool.connect(options.auth)
}

Server.prototype.getDescription = function() {
  var self = this;
}

// Server.prototype.setBSONParserType = function(type) {
// }

Server.prototype.lastIsMaster = function() {
  var self = this;
}

Server.prototype.isMasterLatencyMS = function() {
}

Server.prototype.unref = function() {
  // this.s.pool.unref();
}

Server.prototype.isConnected = function() {
  // return this.s.state == CONNECTED && this.s.pool.isConnected();
}

Server.prototype.isDestroyed = function() {
  // return this.s.state == DESTROYED;
}

Server.prototype.command = function(ns, cmd, options, callback) {
  var self = this;
}

Server.prototype.insert = function(ns, ops, options, callback) {
  var self = this;
}

Server.prototype.update = function(ns, ops, options, callback) {
  var self = this;
}

Server.prototype.remove = function(ns, ops, options, callback) {
  var self = this;
}

Server.prototype.auth = function(mechanism, db) {
  var self = this;
}

// Server.prototype.addReadPreferenceStrategy = function(name, strategy) {
// Server.prototype.addAuthProvider = function(name, provider) {

Server.prototype.equals = function(server) {
  var self = this;
}

Server.prototype.connections = function() {
  var self = this;
}

Server.prototype.getServer = function(options) {
  return this;
}

Server.prototype.getServerFrom = function(connection) {
  return this;
}

// Server.prototype.getCallbacks = function() {
//   return this.s.callbacks;
// }

// Server.prototype.parserType = function() {
//   var s = this.s;
//   if(s.options.bson.serialize.toString().indexOf('[native code]') != -1)
//     return 'c++';
//   return 'js';
// }

Server.prototype.cursor = function(ns, cmd, cursorOptions) {
  var self = this;
}

// Server.prototype.getConnection = function(options) {
//   return this.s.pool.get();
// }

var listeners = ['close', 'error', 'timeout', 'parseError', 'connect'];

Server.prototype.destroy = function() {
  var self = this;

  // Remove all listeners
  listeners.forEach(function(event) {
    self.s.pool.removeAllListeners(event);
  });

  // Destroy the pool
  this.s.pool.destroy();
}

module.exports = Server;
