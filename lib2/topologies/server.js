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
