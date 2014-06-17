var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter;

var Session = function(options, topology) {
  // Add event listener
  EventEmitter.call(this);

  // Execute a command
  this.command = function(ns, cmd, options, callback) {
    topology.command(ns, cmd, options, callback);
  }

  // Execute a write
  this.insert = function(ns, ops, options, callback) {
    topology.insert(ns, ops, options, callback);
  }

  // Execute a write
  this.update = function(ns, ops, options, callback) {
    topology.update(ns, ops, options, callback);
  }

  // Execute a write
  this.remove = function(ns, ops, options, callback) {
    topology.remove(ns, ops, options, callback);
  }

  this.cursor = function(ns, cmd, options) {
    return topology.cursor(ns, cmd, options);
  }  
}

inherits(Session, EventEmitter);

module.exports = Session;