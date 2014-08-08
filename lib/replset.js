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

  // // Shared global store
  // var store = new Store(self);

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

  // console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++ CReplSet")
  // console.dir(finalOptions)

  // Create the ReplSet
  var replset = new CReplSet(seedlist, finalOptions)
  // Server capabilities
  var sCapabilities = null;
  // Add auth prbufferMaxEntriesoviders
  replset.addAuthProvider('mongocr', new MongoCR());

  // Store option defaults
  var storeOptions = {
      force: false
    , bufferMaxEntries: -1
  }

  // Shared global store
  var store = options.store || new Store(self, storeOptions);

  // Listen to reconnect event
  replset.on('reconnect', function() {
    console.log("----------------------------------------- reconnect happened :: " + store.length)
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

    // console.log("----------------------------- CONNECT CALLED 0")
    // console.dir(seedlist)

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
        // console.log("======================================= " + event)
        // console.dir(err)
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

        // console.log("----------------------------- CONNECT FAILED")
        // console.dir(err)

        replset.removeListener('connect', connectErrorHandler);
        // Try to callback
        try {
          callback(err);
        } catch(err) { 
          // console.log("======================================== :: " +tag)
          // console.dir(err)
          // console.dir(replset.isConnected())
          // console.dir(replset.state())
          if(callback) console.log(callback.toString())
          if(!replset.isConnected())
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
    options = translateReadPreference(options);
    replset.command(ns, cmd, options, callback);
  }

  // Insert
  this.insert = function(ns, ops, options, callback) {
    // // console.log("---------------------------- insert")
    // // console.dir(replset.isConnected())
    // // console.dir(options)
    // if(!replset.isConnected()) {
    //   return store.add('insert', ns, ops, options, force, bufferMaxEntries, callback);
    // }
    replset.insert(ns, ops, options, callback);
  }

  // Update
  this.update = function(ns, ops, options, callback) {
    // // console.log("---------------------------- update")
    // if(!replset.isConnected()) {
    //   return store.add('update', ns, ops, options, force, bufferMaxEntries, callback);
    // }
    replset.update(ns, ops, options, callback);
  }

  // Remove
  this.remove = function(ns, ops, options, callback) {
    // // console.log("---------------------------- remove")
    // if(!replset.isConnected()) {
    //   return store.add('remove', ns, ops, options, force, bufferMaxEntries, callback);
    // }
    replset.remove(ns, ops, options, callback);
  }

  // IsConnected
  this.isConnected = function() {
    // console.log("---------------------------- isConnected")
    return replset.isConnected();
  }

  // // Handles the store
  // var CallbackCursor = function(ns, cmd, options) {
  //   // Get the read preferences
  //   Object.defineProperty(this, 'readPreference', {
  //     enumerable:true,
  //     get: function() { return options.readPreference; }
  //   });

  //   this.next = function(callback) {      
  //     console.log("############################# next")
  //     store.add('next', ns, cmd, options, force, bufferMaxEntries, callback);
  //   }

  //   this.nextObject = function(callback) {
  //     console.log("############################# nextObject")
  //     store.add('nextObject', ns, cmd, options, force, bufferMaxEntries, callback);
  //   }

  //   this.each = function(callback) {
  //     console.log("############################# each")
  //     store.add('each', ns, cmd, options, force, bufferMaxEntries, callback);
  //   }

  //   this.toArray = function(callback) {      
  //     console.log("############################# toArray")
  //     store.add('toArray', ns, cmd, options, force, bufferMaxEntries, callback);
  //   }

  //   this.limit = function(value) {
  //     options.limit = value;
  //     return this;
  //   }

  //   this.setReadPreference = function(value) {
  //     options.readPreference = value;
  //     return this;
  //   }    
  // }


  // Insert
  this.cursor = function(ns, cmd, options) {
    // console.log("############################# CURSOR 0")
    options = translateReadPreference(options);
    return replset.cursor(ns, cmd, options);
    // try {
    //   // console.log("############################# CURSOR 1")
    //   var replCursor = replset.cursor(ns, cmd, options);
    //   return replCursor;
    // } catch(err) {
    //   // console.log("############################# CURSOR 2")
    //   // console.dir(err)
    //   return new CallbackCursor(ns, cmd, options);
    // }
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
      storeOptions.force = forceClosed;
      store.flush();
    }

    var events = ['timeout', 'error', 'close', 'joined', 'left'];
    events.forEach(function(e) {
      self.removeAllListeners(e);
    });        
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