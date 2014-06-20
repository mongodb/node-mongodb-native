var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , getSingleProperty = require('./utils').getSingleProperty
  , f = require('util').format
  , Collection = require('./collection');

var Db = function(databaseName, topology, options) {
  options = options || {};
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

  // Last ismaster
  Object.defineProperty(this, 'slaveOk', {
    enumerable:true,
    get: function() {
      if(options.readPreference != null
        && (options.readPreference != 'primary' || options.readPreference.mode != 'primary')) {
        return true;
      }
      return false;
    }
  });  

  Object.defineProperty(this, 'writeConcern', {
    enumerable:true,
    get: function() { 
      var ops = {};
      if(options.w) ops.w = options.w;
      if(options.j) ops.w = options.j;
      if(options.fsync) ops.w = options.fsync;
      if(options.wtimeout) ops.w = options.wtimeout;
      return ops;
    }
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

  this.collection = function(name, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    try {
      var collection = new Collection(self, topology, databaseName, name, self.pkFactory, options);
      if(callback) callback(null, collection);
      return collection;
    } catch(err) {
      if(callback) return callback(err);
      throw err;
    }
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