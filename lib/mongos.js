var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , f = require('util').format
  , ServerCapabilities = require('./topology_base').ServerCapabilities
  , MongoCR = require('mongodb-core').MongoCR
  , CMongos = require('mongodb-core').Mongos
  , Cursor = require('./cursor')
  , Server = require('./server')
  , Store = require('./topology_base').Store
  , shallowClone = require('./utils').shallowClone;

var Mongos = function(servers, options) {
  if(!(this instanceof Mongos)) return new Mongos(servers, options);
  options = options || {};
  var self = this;

  // Ensure all the instances are Server
  for(var i = 0; i < servers.length; i++) {
    if(!(servers[i] instanceof Server)) {
      throw new MongoError("all seed list instances must be of the Server type");
    }
  }

  // Store option defaults
  var storeOptions = {
      force: false
    , bufferMaxEntries: -1
  }

  // Shared global store
  var store = options.store || new Store(self, storeOptions);

  // Set up event emitter
  EventEmitter.call(this);

  // Debug tag
  var tag = options.tag;

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

  // Add the store
  finalOptions.disconnectHandler = store;

  // Socket options passed down
  if(options.socketOptions) {
    if(options.socketOptions.connectTimeoutMS)
      finalOptions.connectionTimeout = options.socketOptions.connectTimeoutMS;
    if(options.socketOptions.socketTimeoutMS)
      finalOptions.socketTimeout = options.socketOptions.socketTimeoutMS;
  } 

  // Are we running in debug mode
  var debug = typeof options.debug == 'boolean' ? options.debug : false;
  if(debug) {
    finalOptions.debug = debug;
  }

  // Map keep alive setting
  if(options.socketOptions && typeof options.socketOptions.keepAlive == 'number') {
    finalOptions.keepAlive = true;
    if(typeof options.socketOptions.keepAlive == 'number') {
      finalOptions.keepAliveInitialDelay = options.socketOptions.keepAlive;
    }
  }

  // Connection timeout
  if(options.socketOptions && typeof options.socketOptions.connectionTimeout == 'number') {
    finalOptions.connectionTimeout = options.socketOptions.connectionTimeout;
  }

  // Socket timeout
  if(options.socketOptions && typeof options.socketOptions.socketTimeout == 'number') {
    finalOptions.socketTimeout = options.socketOptions.socketTimeout;
  }

  // noDelay
  if(options.socketOptions && typeof options.socketOptions.noDelay == 'boolean') {
    finalOptions.noDelay = options.socketOptions.noDelay;
  }

  if(typeof options.secondaryAcceptableLatencyMS == 'number') {
    finalOptions.acceptableLatency = options.secondaryAcceptableLatencyMS;
  }

  // Add the non connection store
  finalOptions.disconnectHandler = store;

  // Create the ReplSet
  var mongos = new CMongos(seedlist, finalOptions)
  // Server capabilities
  var sCapabilities = null;
  // Add auth prbufferMaxEntriesoviders
  mongos.addAuthProvider('mongocr', new MongoCR());

  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true, get: function() { return mongos.lastIsMaster(); }
  });

  // Last ismaster
  Object.defineProperty(this, 'numberOfConnectedServers', {
    enumerable:true, get: function() { return mongos.connectedServers().length; }
  });

  // BSON property
  Object.defineProperty(this, 'bson', { 
    enumerable: true, get: function() { 
      return mongos.bson; 
    }
  });

  Object.defineProperty(this, 'haInterval', {
    enumerable:true, get: function() { return mongos.haInterval; }
  });  

  this.parserType = function() {
    return mongos.parserType();
  }

  // Connect
  this.connect = function(db, _options, callback) {
    if('function' === typeof _options) callback = _options, _options = {};
    if(_options == null) _options = {};
    if(!('function' === typeof callback)) callback = null;
    options = _options;

    // Update bufferMaxEntries
    storeOptions.bufferMaxEntries = db.bufferMaxEntries;

    // Error handler
    var connectErrorHandler = function(event) {
      return function(err) {
        // Remove all event handlers
        var events = ['timeout', 'error', 'close'];
        events.forEach(function(e) {
          self.removeListener(e, connectErrorHandler);
        });

        mongos.removeListener('connect', connectErrorHandler);

        // Try to callback
        try {
          callback(err);
        } catch(err) { 
          process.nextTick(function() { throw err; })
        }
      }
    }

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
        if(event != 'error') {
          self.emit(event, err);
        }
      }
    }

    // Error handler
    var reconnectHandler = function(err) {
      self.emit('reconnect');
      store.execute();
    }

    // Connect handler
    var connectHandler = function() {
      // Clear out all the current handlers left over
      ["timeout", "error", "close"].forEach(function(e) {
        mongos.removeAllListeners(e);
      });

      // Set up listeners
      mongos.once('timeout',  errorHandler('timeout'));
      mongos.once('error',  errorHandler('error'));
      mongos.once('close', errorHandler('close'));

      // relay the event
      var relay = function(event) {
        return function(t, server) {
          self.emit(event, t, server);
        }
      }

      // Set up serverConfig listeners
      mongos.on('joined', relay('joined'));
      mongos.on('left', relay('left'));
      mongos.on('fullsetup', relay('fullsetup'));

      // Emit open event
      self.emit('open', null, self);      

      // Return correctly
      try {
        callback(null, self);
      } catch(err) { 
        process.nextTick(function() { throw err; })
      }      
    }

    // Set up listeners
    mongos.once('timeout',  connectErrorHandler('timeout'));
    mongos.once('error',  connectErrorHandler('error'));
    mongos.once('close', connectErrorHandler('close'));
    mongos.once('connect', connectHandler);
    // Reconnect server
    mongos.on('reconnect', reconnectHandler);

    // Start connection
    mongos.connect(_options);
  }

  // Server capabilities
  this.capabilities = function() {
    if(sCapabilities) return sCapabilities;
    sCapabilities = new ServerCapabilities(mongos.lastIsMaster());
    return sCapabilities;
  }

  // Command
  this.command = function(ns, cmd, options, callback) {
    mongos.command(ns, cmd, options, callback);
  }

  // Insert
  this.insert = function(ns, ops, options, callback) {
    mongos.insert(ns, ops, options, function(e, m) {
      callback(e, m)
    });
  }

  // Update
  this.update = function(ns, ops, options, callback) {
    mongos.update(ns, ops, options, callback);
  }

  // Remove
  this.remove = function(ns, ops, options, callback) {
    mongos.remove(ns, ops, options, callback);
  }

  // IsConnected
  this.isConnected = function() {
    return mongos.isConnected();
  }

  // Insert
  this.cursor = function(ns, cmd, options) {
    options.disconnectHandler = store;
    return mongos.cursor(ns, cmd, options);
  }

  this.setBSONParserType = function(type) {
    return mongos.setBSONParserType(type);
  }  

  this.lastIsMaster = function() {
    return mongos.lastIsMaster();
  }

  this.close = function(forceClosed) {
    mongos.destroy();
    // We need to wash out all stored processes
    if(forceClosed == true) {
      storeOptions.force = forceClosed;
      store.flush();
    }
  }

  this.auth = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    mongos.auth.apply(mongos, args);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.connections = function() {
    return mongos.connections();
  }      
}

/**
 * @ignore
 */
inherits(Mongos, EventEmitter);

module.exports = Mongos;