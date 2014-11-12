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

/**
 * @fileOverview The **Mongos** class is a class that represents a Mongos Proxy topology and is
 * used to construct connections.
 * 
 * **Mongos Should not be used, use MongoClient.connect**
 * @example
 * var Db = require('mongodb').Db,
 *   Mongos = require('mongodb').Mongos,
 *   Server = require('mongodb').Server,
 *   test = require('assert');
 * // Connect using Mongos
 * var server = new Server('localhost', 27017);
 * var db = new Db('test', new Mongos([server]));
 * db.open(function(err, db) {
 *   // Get an additional db
 *   db.close();
 * });
 */

/**
 * Creates a new Mongos instance
 * @class
 * @deprecated
 * @param {Server[]} servers A seedlist of servers participating in the replicaset.
 * @param {object} [options=null] Optional settings.
 * @param {booelan} [options.ha=true] Turn on high availability monitoring.
 * @param {number} [options.haInterval=5000] Time between each replicaset status check.
 * @param {number} [options.poolSize=5] Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
 * @param {boolean} [options.ssl=false] Use ssl connection (needs to have a mongod server with ssl support) 
 * @param {object} [options.sslValidate=false] Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCA=null] Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslCert=null] String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslKey=null] String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslPass=null] String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {object} [options.socketOptions=null] Socket options 
 * @param {boolean} [options.socketOptions.noDelay=true] TCP Socket NoDelay option. 
 * @param {number} [options.socketOptions.keepAlive=0] TCP KeepAlive on the socket with a X ms delay before start. 
 * @param {number} [options.socketOptions.connectTimeoutMS=0] TCP Connection timeout setting 
 * @param {number} [options.socketOptions.socketTimeoutMS=0] TCP Socket timeout setting 
 * @fires Mongos#connect
 * @fires Mongos#ha
 * @fires Mongos#joined
 * @fires Mongos#left
 * @fires Mongos#fullsetup
 * @fires Mongos#open
 * @fires Mongos#close
 * @fires Mongos#error
 * @fires Mongos#timeout
 * @fires Mongos#parseError
 * @return {Mongos} a Mongos instance.
 */
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
  finalOptions.size = typeof options.poolSize == 'number' ? options.poolSize : 5;  
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

  // Create the Mongos
  var mongos = new CMongos(seedlist, finalOptions)
  // Server capabilities
  var sCapabilities = null;
  // Add auth prbufferMaxEntriesoviders
  mongos.addAuthProvider('mongocr', new MongoCR());

  // Internal state
  this.s = {
    // Create the Mongos
      mongos: mongos
    // Server capabilities
    , sCapabilities: sCapabilities
    // Debug turned on
    , debug: debug
    // Store option defaults
    , storeOptions: storeOptions
    // Actual store of callbacks
    , store: store
    // Options
    , options: options
  }


  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true, get: function() { return self.s.mongos.lastIsMaster(); }
  });

  // Last ismaster
  Object.defineProperty(this, 'numberOfConnectedServers', {
    enumerable:true, get: function() { return self.s.mongos.connectedServers().length; }
  });

  // BSON property
  Object.defineProperty(this, 'bson', { 
    enumerable: true, get: function() { 
      return self.s.mongos.bson; 
    }
  });

  Object.defineProperty(this, 'haInterval', {
    enumerable:true, get: function() { return self.s.mongos.haInterval; }
  });
}

/**
 * @ignore
 */
inherits(Mongos, EventEmitter);

// Connect
Mongos.prototype.connect = function(db, _options, callback) {
  var self = this;
  if('function' === typeof _options) callback = _options, _options = {};
  if(_options == null) _options = {};
  if(!('function' === typeof callback)) callback = null;
  self.s.options = _options;

  // Update bufferMaxEntries
  self.s.storeOptions.bufferMaxEntries = db.bufferMaxEntries;

  // Error handler
  var connectErrorHandler = function(event) {
    return function(err) {
      // Remove all event handlers
      var events = ['timeout', 'error', 'close'];
      events.forEach(function(e) {
        self.removeListener(e, connectErrorHandler);
      });

      self.s.mongos.removeListener('connect', connectErrorHandler);

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
    self.s.store.execute();
  }

  // Connect handler
  var connectHandler = function() {
    // Clear out all the current handlers left over
    ["timeout", "error", "close"].forEach(function(e) {
      self.s.mongos.removeAllListeners(e);
    });

    // Set up listeners
    self.s.mongos.once('timeout', errorHandler('timeout'));
    self.s.mongos.once('error', errorHandler('error'));
    self.s.mongos.once('close', errorHandler('close'));

    // relay the event
    var relay = function(event) {
      return function(t, server) {
        self.emit(event, t, server);
      }
    }

    // Set up serverConfig listeners
    self.s.mongos.on('joined', relay('joined'));
    self.s.mongos.on('left', relay('left'));
    self.s.mongos.on('fullsetup', relay('fullsetup'));

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
  self.s.mongos.once('timeout', connectErrorHandler('timeout'));
  self.s.mongos.once('error', connectErrorHandler('error'));
  self.s.mongos.once('close', connectErrorHandler('close'));
  self.s.mongos.once('connect', connectHandler);
  // Reconnect server
  self.s.mongos.on('reconnect', reconnectHandler);

  // Start connection
  self.s.mongos.connect(_options);
}

Mongos.prototype.parserType = function() {
  return this.s.mongos.parserType();
}

// Server capabilities
Mongos.prototype.capabilities = function() {
  if(this.s.sCapabilities) return this.s.sCapabilities;
  this.s.sCapabilities = new ServerCapabilities(this.s.mongos.lastIsMaster());
  return this.s.sCapabilities;
}

// Command
Mongos.prototype.command = function(ns, cmd, options, callback) {
  this.s.mongos.command(ns, cmd, options, callback);
}

// Insert
Mongos.prototype.insert = function(ns, ops, options, callback) {
  this.s.mongos.insert(ns, ops, options, function(e, m) {
    callback(e, m)
  });
}

// Update
Mongos.prototype.update = function(ns, ops, options, callback) {
  this.s.mongos.update(ns, ops, options, callback);
}

// Remove
Mongos.prototype.remove = function(ns, ops, options, callback) {
  this.s.mongos.remove(ns, ops, options, callback);
}

// IsConnected
Mongos.prototype.isConnected = function() {
  return this.s.mongos.isConnected();
}

// Insert
Mongos.prototype.cursor = function(ns, cmd, options) {
  options.disconnectHandler = this.s.store;
  return this.s.mongos.cursor(ns, cmd, options);
}

Mongos.prototype.setBSONParserType = function(type) {
  return this.s.mongos.setBSONParserType(type);
}  

Mongos.prototype.lastIsMaster = function() {
  return this.s.mongos.lastIsMaster();
}

Mongos.prototype.close = function(forceClosed) {
  this.s.mongos.destroy();
  // We need to wash out all stored processes
  if(forceClosed == true) {
    this.s.storeOptions.force = forceClosed;
    this.s.store.flush();
  }
}

Mongos.prototype.auth = function() {
  var args = Array.prototype.slice.call(arguments, 0);
  this.s.mongos.auth.apply(this.s.mongos, args);
}

/**
 * All raw connections
 * @method
 * @return {array}
 */
Mongos.prototype.connections = function() {
  return this.s.mongos.connections();
}      

/**
 * A mongos connect event, used to verify that the connection is up and running
 *
 * @event Mongos#connect
 * @type {Mongos}
 */

/**
 * The mongos high availability event
 *
 * @event Mongos#ha
 * @type {function}
 * @param {string} type The stage in the high availability event (start|end)
 * @param {boolean} data.norepeat This is a repeating high availability process or a single execution only
 * @param {number} data.id The id for this high availability request
 * @param {object} data.state An object containing the information about the current replicaset
 */

/**
 * A server member left the mongos set
 *
 * @event Mongos#left
 * @type {function}
 * @param {string} type The type of member that left (primary|secondary|arbiter)
 * @param {Server} server The server object that left
 */

/**
 * A server member joined the mongos set
 *
 * @event Mongos#joined
 * @type {function}
 * @param {string} type The type of member that joined (primary|secondary|arbiter)
 * @param {Server} server The server object that joined
 */

/**
 * Mongos fullsetup event, emitted when all proxies in the topology have been connected to.
 *
 * @event Mongos#fullsetup
 * @type {Mongos}
 */

/**
 * Mongos open event, emitted when mongos can start processing commands.
 *
 * @event Mongos#open
 * @type {Mongos}
 */

/**
 * Mongos close event
 *
 * @event Mongos#close
 * @type {object}
 */

/**
 * Mongos error event, emitted if there is an error listener.
 *
 * @event Mongos#error
 * @type {MongoError}
 */

/**
 * Mongos timeout event
 *
 * @event Mongos#timeout
 * @type {object}
 */

/**
 * Mongos parseError event
 *
 * @event Mongos#parseError
 * @type {object}
 */

module.exports = Mongos;