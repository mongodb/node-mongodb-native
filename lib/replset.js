var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , f = require('util').format
  , Server = require('./server')
  , Mongos = require('./mongos')
  , Cursor = require('./cursor')
  , ReadPreference = require('./read_preference')
  , MongoCR = require('mongodb-core').MongoCR
  , MongoError = require('mongodb-core').MongoError
  , ServerCapabilities = require('./topology_base').ServerCapabilities
  , Store = require('./topology_base').Store
  , CServer = require('mongodb-core').Server
  , CReplSet = require('mongodb-core').ReplSet
  , CoreReadPreference = require('mongodb-core').ReadPreference
  , shallowClone = require('./utils').shallowClone;

var ReplSet = function(servers, options) {  
  if(!(this instanceof ReplSet)) return new ReplSet(servers, options);
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

  // If no rs_name throw
  if(options.rs_name == null) 
    throw new MongoError('rs_name parameter must be set');

  // Set up options
  if(options.rs_name) {
    finalOptions.setName = options.rs_name;
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
  var replset = new CReplSet(seedlist, finalOptions)
  // Server capabilities
  var sCapabilities = null;
  // Add auth prbufferMaxEntriesoviders
  replset.addAuthProvider('mongocr', new MongoCR());

  // Listen to reconnect event
  replset.on('reconnect', function() {
    self.emit('reconnect');
    store.execute();
  });
  
  // Ensure the right read Preference object
  var translateReadPreference = function(options) {
    if(typeof options.readPreference == 'string') {
      options.readPreference = new CoreReadPreference(options.readPreference);
    } else if(options.readPreference instanceof ReadPreference) {
      options.readPreference = new CoreReadPreference(options.readPreference.mode
        , options.readPreference.tags);
    }  

    return options;  
  }

  // Debug
  if(debug) {
    // Last ismaster
    Object.defineProperty(this, 'replset', {
      enumerable:true, get: function() { return replset; }
    });    
  }

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
    return replset.parserType();
  }

  // Connect method
  this.connect = function(db, _options, callback) {
    var self = this;
    if('function' === typeof _options) callback = _options, _options = {};
    if(_options == null) _options = {};
    if(!('function' === typeof callback)) callback = null;
    options = _options;

    // Update bufferMaxEntries
    storeOptions.bufferMaxEntries = db.bufferMaxEntries;

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
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

      // Set up listeners
      replset.once('timeout',  errorHandler('timeout'));
      replset.once('error',  errorHandler('error'));
      replset.once('close', errorHandler('close'));

      // relay the event
      var relay = function(event) {
        return function(t, server) {
          self.emit(event, t, server);
        }
      }

      // Replset events relay
      var replsetRelay = function(event) {
        return function(t, server) {
          self.emit(event, t, server.lastIsMaster(), server);
        }
      }

      // Relay ha
      var relayHa = function(t, state) {
        self.emit('ha', t, state);          

        if(t == 'start') {
          self.emit('ha_connect', t, state);          
        } else if(t == 'end') {
          self.emit('ha_ismaster', t, state);          
        }
      }

      // Set up serverConfig listeners
      replset.on('joined', replsetRelay('joined'));
      replset.on('left', relay('left'));
      replset.on('ping', relay('ping'));
      replset.on('ha', relayHa);
      replset.on('fullsetup', relay('fullsetup'));

      // Emit open event
      self.emit('open', null, self);      

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
        ['timeout', 'error', 'close'].forEach(function(e) {
          replset.removeListener(e, connectErrorHandler);
        });

        replset.removeListener('connect', connectErrorHandler);

        // Try to callback
        try {
          callback(err);
        } catch(err) { 
          if(!replset.isConnected())
            process.nextTick(function() { throw err; })
        }
      }
    }    

    // Set up listeners
    replset.once('timeout',  connectErrorHandler('timeout'));
    replset.once('error',  connectErrorHandler('error'));
    replset.once('close', connectErrorHandler('close'));
    replset.once('connect', connectHandler);

    // Start connection
    replset.connect(_options);
  }  

  // Server capabilities
  this.capabilities = function() {
    if(sCapabilities) return sCapabilities;
    sCapabilities = new ServerCapabilities(replset.lastIsMaster());
    return sCapabilities;
  }

  // Command
  this.command = function(ns, cmd, options, callback) {
    options = translateReadPreference(options);
    replset.command(ns, cmd, options, callback);
  }

  // Insert
  this.insert = function(ns, ops, options, callback) {
    replset.insert(ns, ops, options, callback);
  }

  // Update
  this.update = function(ns, ops, options, callback) {
    replset.update(ns, ops, options, callback);
  }

  // Remove
  this.remove = function(ns, ops, options, callback) {
    replset.remove(ns, ops, options, callback);
  }

  // IsConnected
  this.isConnected = function() {
    return replset.isConnected();
  }

  this.setBSONParserType = function(type) {
    return replset.setBSONParserType(type);
  }  

  // Insert
  this.cursor = function(ns, cmd, options) {
    options = translateReadPreference(options);
    return replset.cursor(ns, cmd, options);
  }

  this.lastIsMaster = function() {
    return replset.lastIsMaster();
  }

  this.close = function(forceClosed) {
    replset.destroy();
    // We need to wash out all stored processes
    if(forceClosed == true) {
      storeOptions.force = forceClosed;
      store.flush();
    }

    var events = ['timeout', 'error', 'close', 'joined', 'left'];
    events.forEach(function(e) {
      self.removeAllListeners(e);
    });        
  }

  this.auth = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    replset.auth.apply(replset, args);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.connections = function() {
    return replset.connections();
  }    
}

/**
 * @ignore
 */
inherits(ReplSet, EventEmitter);

module.exports = ReplSet;