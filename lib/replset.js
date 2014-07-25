var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , f = require('util').format
  , Server = require('./server')
  , Cursor = require('./cursor')
  , MongoCR = require('mongodb-core').MongoCR
  , MongoError = require('mongodb-core').MongoError
  , ServerCapabilities = require('./topology_base').ServerCapabilities
  , Store = require('./topology_base').Store
  , CServer = require('mongodb-core').Server
  , CReplSet = require('mongodb-core').ReplSet
  , shallowClone = require('./utils').shallowClone;

var ReplSet = function(servers, options) {  
  if(!(this instanceof ReplSet)) return new ReplSet(servers, options);
  options = options || {};

  // Shared global store
  var store = new Store();

  // Set up event emitter
  EventEmitter.call(this);

  // Build seed list
  var seedlist = servers.map(function(x) {
    return {host: x.host, port: x.port}
  });

  // Final options
  var finalOptions = shallowClone(options);

  // Default values
  finalOptions.size = options.poolSize || 5;  
  finalOptions.reconnect = typeof options.auto_reconnect == 'boolean' ? options.auto_reconnect : true;
  finalOptions.emitError = typeof options.emitError == 'boolean' ? options.emitError : true;
  finalOptions.cursorFactory = Cursor;

  // Socket options passed down
  if(options.socketOptions) {
    if(options.socketOptions.connectTimeoutMS)
      finalOptions.connectionTimeout = options.socketOptions.connectTimeoutMS;
    if(options.socketOptions.socketTimeoutMS)
      finalOptions.socketTimeout = options.socketOptions.socketTimeoutMS;
  } 

  // If no rs_name throw
  if(options.rs_name == null) 
    throw new MongoError('rs_name parameter must be set');

  // Set up options
  if(options.rs_name) {
    finalOptions.setName = options.rs_name;
  }

  // console.log("=================================== ReplSet")
  // console.dir(finalOptions)

  // Create the ReplSet
  var replset = new CReplSet(seedlist, finalOptions)
  // Default buffer max entries
  var bufferMaxEntries = -1;
  // Destroyed connection
  var force = false;
  // Server capabilities
  var sCapabilities = null;
  // Add auth providers
  replset.addAuthProvider('mongocr', new MongoCR());

  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true, get: function() { return replset.lastIsMaster(); }
  });

  // BSON property
  Object.defineProperty(this, 'bson', { 
    enumerable: true, get: function() { 
      return replset.bson; 
    }
  });

  this.parserType = function() {
    return server.parserType();
  }

  // Connect method
  this.connect = function(db, _options, callback) {
    var self = this;
    if('function' === typeof _options) callback = _options, _options = {};
    if(_options == null) _options = {};
    if(!('function' === typeof callback)) callback = null;
    options = _options;

    // console.log("----------------------------- CONNECT CALLED 0")
    // console.dir(seedlist)

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
        // console.log("======================================= " + event)
        if(event != 'error') {
          self.emit(event, err);
        }
      }
    }

    // Connect handler
    var connectHandler = function() {
      // Clear out all the current handlers left over
      ["timeout", "error", "close"].forEach(function(e) {
        replset.removeAllListeners(e);
      });

      // console.log("----------------------------- CONNECTED")
      // console.dir(replset.connections().length)

      // Set up listeners
      replset.once('timeout',  errorHandler('timeout'));
      replset.once('error',  errorHandler('error'));
      replset.once('close', errorHandler('close'));

      // Return correctly
      try {
        callback(null, self);
      } catch(err) { 
        process.nextTick(function() { throw err; })
      }      
    }

    // Error handler
    var connectErrorHandler = function(event) {
      return function(err) {
        // console.log("----------------------------- CONNECT FAILED")
        // console.dir(err)
        ['timeout', 'error', 'close'].forEach(function(e) {
          replset.removeListener(e, connectErrorHandler);
        });

        replset.removeListener('connect', connectErrorHandler);
        // Try to callback
        try {
          callback(err);
        } catch(err) { 
          process.nextTick(function() { throw err; })
        }
      }
    }    


    // console.log("----------------------------- CONNECT CALLED 1")

    // Set up listeners
    replset.once('timeout',  connectErrorHandler('timeout'));
    replset.once('error',  connectErrorHandler('error'));
    replset.once('close', connectErrorHandler('close'));
    replset.once('connect', connectHandler);
    // // Reconnect server
    // server.on('reconnect', reconnectHandler);

    // console.log("----------------------------- CONNECT CALLED 2")
    // console.dir(_options);

    // Start connection
    replset.connect(_options);
  }  

  // Server capabilities
  this.capabilities = function() {
    // console.log("---------------------------- capabilities")
    if(sCapabilities) return sCapabilities;
    sCapabilities = new ServerCapabilities(replset.lastIsMaster());
    return sCapabilities;
  }

  // Command
  this.command = function(ns, cmd, options, callback) {
    // console.log("---------------------------- command")
    // console.log(ns)
    // console.dir(cmd)
    // console.dir(options)
    replset.command(ns, cmd, options, callback);
  }

  // Insert
  this.insert = function(ns, ops, options, callback) {
    // console.log("---------------------------- insert")
    if(!replset.isConnected()) {
      return store.add('insert', ns, ops, options, force, bufferMaxEntries, finalOptions, callback);
    }
    replset.insert(ns, ops, options, callback);
  }

  // Update
  this.update = function(ns, ops, options, callback) {
    // console.log("---------------------------- update")
    if(!replset.isConnected()) {
      return store.add('update', ns, ops, options, force, bufferMaxEntries, finalOptions, callback);
    }
    replset.update(ns, ops, options, callback);
  }

  // Remove
  this.remove = function(ns, ops, options, callback) {
    // console.log("---------------------------- remove")
    if(!replset.isConnected()) {
      return store.add('remove', ns, ops, options, force, bufferMaxEntries, finalOptions, callback);
    }
    replset.remove(ns, ops, options, callback);
  }

  // IsConnected
  this.isConnected = function() {
    // console.log("---------------------------- isConnected")
    return replset.isConnected();
  }

  // Insert
  this.cursor = function(ns, cmd, options) {
    // console.log("---------------------------- cursor")
    return replset.cursor(ns, cmd, options);
  }

  this.lastIsMaster = function() {
    // console.log("---------------------------- lastIsMaster")
    return replset.lastIsMaster();
  }

  this.close = function(forceClosed) {
    // console.log("---------------------------- close")
    replset.destroy();
    // We need to wash out all stored processes
    if(forceClosed == true) {
      force = forceClosed;
      store.flush();
    }
  }

  this.auth = function() {
    // console.log("---------------------------- auth")
    var args = Array.prototype.slice.call(arguments, 0);
    replset.auth.apply(replset, args);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.connections = function() {
    // console.log("---------------------------- connections")
    return replset.connections();
  }    
}

/**
 * @ignore
 */
inherits(ReplSet, EventEmitter);

module.exports = ReplSet;