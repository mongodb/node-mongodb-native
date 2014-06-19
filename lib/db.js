var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , getSingleProperty = require('./utils').getSingleProperty
  , f = require('util').format;

var Db = function(databaseName, topology, options) {
  if(!(this instanceof Db)) return new Db(databaseName, topology, options);
  EventEmitter.call(this);
  var self = this;

  // Add a read Only property
  getSingleProperty(this, 'serverConfig', topology);

  // Last ismaster
  Object.defineProperty(this, 'options', {
    enumerable:true,
    get: function() { return options; }
  });  

  /**
   * Open a database
   */
  this.open = function(callback) {
    topology.connect(self, options, function(err, topology) {
      if(err) return callback(err);
      callback(null, self);
    });
  }

  /**
   * Execute a command
   */
  this.command = function(selector, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    // Execute command
    topology.command('system.$cmd', selector, options, function(err, result) {
      if(err) return callback(err);
      callback(null, result.result);
    });
  }

  this.close = function() {
    topology.close();
  }

  // Add listeners to topology
  var createListener = function(e) {
    var listener = function(err) {
      if(e != 'error') {
        self.emit(e, err);
      }
    }
    return listener;
  }

  topology.once('error', createListener('error'));
  topology.once('timeout', createListener('timeout'));
  topology.once('close', createListener('close'));
  topology.once('parseError', createListener('parseError'));
}

inherits(Db, EventEmitter);

module.exports = Db;