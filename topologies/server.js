 "use strict";

var inherits = require('util').inherits
  , f = require('util').format
  , bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain
  , EventEmitter = require('events').EventEmitter
  , Pool = require('../connection/pool')
  , b = require('bson')
  , Query = require('../connection/commands').Query
  , MongoError = require('../error')
  , ReadPreference = require('./read_preference')
  , BasicCursor = require('../cursor')
  , CommandResult = require('./command_result')
  , getSingleProperty = require('../connection/utils').getSingleProperty
  , getProperty = require('../connection/utils').getProperty
  , debugOptions = require('../connection/utils').debugOptions
  , BSON = require('bson').native().BSON
  , PreTwoSixWireProtocolSupport = require('../wireprotocol/2_4_support')
  , TwoSixWireProtocolSupport = require('../wireprotocol/2_6_support')
  , ThreeTwoWireProtocolSupport = require('../wireprotocol/3_2_support')
  , Session = require('./session')
  , Logger = require('../connection/logger')
  , MongoCR = require('../auth/mongocr')
  , X509 = require('../auth/x509')
  , Plain = require('../auth/plain')
  , GSSAPI = require('../auth/gssapi')
  , SSPI = require('../auth/sspi')
  , ScramSHA1 = require('../auth/scram');

/**
 * @fileOverview The **Server** class is a class that represents a single server topology and is
 * used to construct connections.
 *
 * @example
 * var Server = require('mongodb-core').Server
 *   , ReadPreference = require('mongodb-core').ReadPreference
 *   , assert = require('assert');
 *
 * var server = new Server({host: 'localhost', port: 27017});
 * // Wait for the connection event
 * server.on('connect', function(server) {
 *   server.destroy();
 * });
 *
 * // Start connecting
 * server.connect();
 */

// All bson types
var bsonTypes = [b.Long, b.ObjectID, b.Binary, b.Code, b.DBRef, b.Symbol, b.Double, b.Timestamp, b.MaxKey, b.MinKey];
// BSON parser
var bsonInstance = null;
// Server instance id
var serverId = 0;
// Callbacks instance id
var callbackId = 0;

// Single store for all callbacks
var Callbacks = function() {
  // EventEmitter.call(this);
  var self = this;
  // Callbacks
  this.callbacks = {};
  // Set the callbacks id
  this.id = callbackId++;
  // Set the type to server
  this.type = 'server';
}

//
// Clone the options
var cloneOptions = function(options) {
  var opts = {};
  for(var name in options) {
    opts[name] = options[name];
  }
  return opts;
}

//
// Flush all callbacks
Callbacks.prototype.flush = function(err) {
  for(var id in this.callbacks) {
    if(!isNaN(parseInt(id, 10))) {
      var callback = this.callbacks[id];
      delete this.callbacks[id];
      callback(err, null);
    }
  }
}

Callbacks.prototype.emit = function(id, err, value) {
  var callback = this.callbacks[id];
  delete this.callbacks[id];
  callback(err, value);
}

Callbacks.prototype.raw = function(id) {
  if(this.callbacks[id] == null) return false;
  return this.callbacks[id].raw == true ? true : false
}

Callbacks.prototype.documentsReturnedIn = function(id) {
  if(this.callbacks[id] == null) return false;
  return typeof this.callbacks[id].documentsReturnedIn == 'string' ? this.callbacks[id].documentsReturnedIn : null;
}

Callbacks.prototype.unregister = function(id) {
  delete this.callbacks[id];
}

Callbacks.prototype.register = function(id, callback) {
  this.callbacks[id] = bindToCurrentDomain(callback);
}

/**
 * @ignore
 */
var bindToCurrentDomain = function(callback) {
  var domain = process.domain;
  if(domain == null || callback == null) return callback;
  return domain.bind(callback);
}

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

// Supports server
var supportsServer = function(_s) {
  return _s.ismaster && typeof _s.ismaster.minWireVersion == 'number';
}

//
// createWireProtocolHandler
var createWireProtocolHandler = function(result) {
  // // 3.2 wire protocol handler
  // if(result && result.maxWireVersion >= 4) {
  //   return new ThreeTwoWireProtocolSupport(new TwoSixWireProtocolSupport());
  // }

  // 2.6 wire protocol handler
  if(result && result.maxWireVersion >= 2) {
    return new TwoSixWireProtocolSupport();
  }

  // 2.4 or earlier wire protocol handler
  return new PreTwoSixWireProtocolSupport();
}

//
// Reconnect server
var reconnectServer = function(self, state) {
  // If the current reconnect retries is 0 stop attempting to reconnect
  if(state.currentReconnectRetry == 0) {
    return self.destroy(true, true);
  }

  // Adjust the number of retries
  state.currentReconnectRetry = state.currentReconnectRetry - 1;

  // Connect and retrieve the ismaster
  isMasterDiscovery(self, self.s.options, function(err, r) {
    // Set status to connecting
    state.state = CONNECTING;
    // Create a new Pool
    state.pool = new Pool(state.options);
    // error handler
    var reconnectErrorHandler = function(err) {
      state.state = DISCONNECTED;
      // Destroy the pool
      state.pool.destroy();
      // Adjust the number of retries
      state.currentReconnectRetry = state.currentReconnectRetry - 1;
      // No more retries
      if(state.currentReconnectRetry <= 0) {
        self.state = DESTROYED;
        self.emit('error', f('failed to connect to %s:%s after %s retries', state.options.host, state.options.port, state.reconnectTries));
      } else {
        setTimeout(function() {
          reconnectServer(self, state);
        }, state.reconnectInterval);
      }
    }

    //
    // Attempt to connect
    state.pool.once('connect', function() {
      // Reset retries
      state.currentReconnectRetry = state.reconnectTries;

      // Remove any non used handlers
      var events = ['error', 'close', 'timeout', 'parseError'];
      events.forEach(function(e) {
        state.pool.removeAllListeners(e);
      });

      // Set connected state
      state.state = CONNECTED;

      // Add proper handlers
      state.pool.once('error', reconnectErrorHandler);
      state.pool.once('close', closeHandler(self, state));
      state.pool.once('timeout', timeoutHandler(self, state));
      state.pool.once('parseError', fatalErrorHandler(self, state));

      // We need to ensure we have re-authenticated
      var keys = Object.keys(state.authProviders);
      if(keys.length == 0) return self.emit('reconnect', self);

      // Execute all providers
      var count = keys.length;
      // Iterate over keys
      for(var i = 0; i < keys.length; i++) {
        state.authProviders[keys[i]].reauthenticate(self, state.pool, function(err, r) {
          count = count - 1;
          // We are done, emit reconnect event
          if(count == 0) {
            return self.emit('reconnect', self);
          }
        });
      }
    });

    //
    // Handle connection failure
    state.pool.once('error', errorHandler(self, state));
    state.pool.once('close', errorHandler(self, state));
    state.pool.once('timeout', errorHandler(self, state));
    state.pool.once('parseError', errorHandler(self, state));

    // Connect pool
    state.pool.connect();
  });
}

//
// Handlers
var messageHandler = function(self, state) {
  return function(response, connection) {
    try {
      // Parse the message
      response.parse({raw: state.callbacks.raw(response.responseTo), documentsReturnedIn: state.callbacks.documentsReturnedIn(response.responseTo)});
      if(state.logger.isDebug()) state.logger.debug(f('message [%s] received from %s', response.raw.toString('hex'), self.name));
      state.callbacks.emit(response.responseTo, null, response);
    } catch (err) {
      state.callbacks.flush(new MongoError(err));
      self.destroy();
    }
  }
}

var errorHandler = function(self, state) {
  return function(err, connection) {
    if(state.state == DISCONNECTED || state.state == DESTROYED) return;
    // Set disconnected state
    state.state = DISCONNECTED;
    if(state.readPreferenceStrategies != null) notifyStrategies(self, self.s, 'error', [self]);
    if(state.logger.isInfo()) state.logger.info(f('server %s errored out with %s', self.name, JSON.stringify(err)));
    // Flush out all the callbacks
    if(state.callbacks) state.callbacks.flush(new MongoError(f("server %s received an error %s", self.name, JSON.stringify(err))));
    // Destroy all connections
    self.destroy();
    // Emit error event
    if(state.emitError && self.listeners('error').length > 0) self.emit('error', err, self);
    // If we specified the driver to reconnect perform it
    if(state.reconnect) setTimeout(function() {
      // state.currentReconnectRetry = state.reconnectTries,
      reconnectServer(self, state)
    }, state.reconnectInterval);
  }
}

var fatalErrorHandler = function(self, state) {
  return function(err, connection) {
    if(state.state == DISCONNECTED || state.state == DESTROYED) return;
    // Set disconnected state
    state.state = DISCONNECTED;

    if(state.readPreferenceStrategies != null) notifyStrategies(self, self.s, 'error', [self]);
    if(state.logger.isInfo()) state.logger.info(f('server %s errored out with %s', self.name, JSON.stringify(err)));
    // Flush out all the callbacks
    if(state.callbacks) state.callbacks.flush(new MongoError(f("server %s received an error %s", self.name, JSON.stringify(err))));
    // Emit error event
    self.emit('error', err, self);
    // If we specified the driver to reconnect perform it
    if(state.reconnect) setTimeout(function() {
      // state.currentReconnectRetry = state.reconnectTries,
      reconnectServer(self, state)
    }, state.reconnectInterval);
    // Destroy all connections
    self.destroy();
  }
}

var timeoutHandler = function(self, state) {
  return function(err, connection) {
    if(state.state == DISCONNECTED || state.state == DESTROYED) return;
    // Set disconnected state
    state.state = DISCONNECTED;

    if(state.readPreferenceStrategies != null) notifyStrategies(self, self.s, 'timeout', [self]);
    if(state.logger.isInfo()) state.logger.info(f('server %s timed out', self.name));
    // Flush out all the callbacks
    if(state.callbacks) state.callbacks.flush(new MongoError(f("server %s timed out", self.name)));
    // Emit error event
    self.emit('timeout', err, self);
    // If we specified the driver to reconnect perform it
    if(state.reconnect) setTimeout(function() {
      // state.currentReconnectRetry = state.reconnectTries,
      reconnectServer(self, state)
    }, state.reconnectInterval);
    // Destroy all connections
    self.destroy();
  }
}

var closeHandler = function(self, state) {
  return function(err, connection) {
    if(state.state == DISCONNECTED || state.state == DESTROYED) return;
    // Set disconnected state
    state.state = DISCONNECTED;

    if(state.readPreferenceStrategies != null) notifyStrategies(self, self.s, 'close', [self]);
    if(state.logger.isInfo()) state.logger.info(f('server %s closed', self.name));
    // Flush out all the callbacks
    if(state.callbacks) state.callbacks.flush(new MongoError(f("server %s sockets closed", self.name)));
    // Emit error event
    self.emit('close', err, self);
    // If we specified the driver to reconnect perform it
    if(state.reconnect) setTimeout(function() {
      // state.currentReconnectRetry = state.reconnectTries,
      reconnectServer(self, state)
    }, state.reconnectInterval);
    // Destroy all connections
    self.destroy();
  }
}

var connectHandler = function(self, state) {
  // Apply all stored authentications
  var applyAuthentications = function(callback) {
    // We need to ensure we have re-authenticated
    var keys = Object.keys(state.authProviders);
    if(keys.length == 0) return callback(null, null);

    // Execute all providers
    var count = keys.length;
    // Iterate over keys
    for(var i = 0; i < keys.length; i++) {
      state.authProviders[keys[i]].reauthenticate(self, state.pool, function(err, r) {
        count = count - 1;
        // We are done, emit reconnect event
        if(count == 0) {
          return callback(null, null);
        }
      });
    }
  }

  return function(connection) {
    // Apply any applyAuthentications
    applyAuthentications(function() {

      // Execute an ismaster
      self.command('system.$cmd', {ismaster:true}, function(err, r) {
        if(err) {
          state.state = DISCONNECTED;
          return self.emit('close', err, self);
        }

        // Set the current ismaster
        if(!err) {
          state.ismaster = r.result;
        }

        // Determine the wire protocol handler
        state.wireProtocolHandler = createWireProtocolHandler(state.ismaster);

        // Set the wireProtocolHandler
        state.options.wireProtocolHandler = state.wireProtocolHandler;

        // Log the ismaster if available
        if(state.logger.isInfo()) state.logger.info(f('server %s connected with ismaster [%s]', self.name, JSON.stringify(r.result)));

        // Validate if we it's a server we can connect to
        if(!supportsServer(state) && state.wireProtocolHandler == null) {
          state.state = DISCONNECTED
          return self.emit('error', new MongoError("non supported server version"), self);
        }

        // Set the details
        if(state.ismaster && state.ismaster.me) state.serverDetails.name = state.ismaster.me;

        // No read preference strategies just emit connect
        if(state.readPreferenceStrategies == null) {
          state.state = CONNECTED;
          return self.emit('connect', self);
        }

        // Signal connect to all readPreferences
        notifyStrategies(self, self.s, 'connect', [self], function(err, result) {
          state.state = CONNECTED;
          return self.emit('connect', self);
        });
      });
    });
  }
}

var slaveOk = function(r) {
  if(r) return r.slaveOk()
  return false;
}

//
// Execute readPreference Strategies
var notifyStrategies = function(self, state, op, params, callback) {
  if(typeof callback != 'function') {
    // Notify query start to any read Preference strategies
    for(var name in state.readPreferenceStrategies) {
      if(state.readPreferenceStrategies[name][op]) {
        var strat = state.readPreferenceStrategies[name];
        strat[op].apply(strat, params);
      }
    }
    // Finish up
    return;
  }

  // Execute the async callbacks
  var nPreferences = Object.keys(state.readPreferenceStrategies).length;
  if(nPreferences == 0) return callback(null, null);
  for(var name in state.readPreferenceStrategies) {
    if(state.readPreferenceStrategies[name][op]) {
      var strat = state.readPreferenceStrategies[name];
      // Add a callback to params
      var cParams = params.slice(0);
      cParams.push(function(err, r) {
        nPreferences = nPreferences - 1;
        if(nPreferences == 0) {
          callback(null, null);
        }
      })
      // Execute the readPreference
      strat[op].apply(strat, cParams);
    }
  }
}

var debugFields = ['reconnect', 'reconnectTries', 'reconnectInterval', 'emitError', 'cursorFactory', 'host'
  , 'port', 'size', 'keepAlive', 'keepAliveInitialDelay', 'noDelay', 'connectionTimeout'
  , 'socketTimeout', 'singleBufferSerializtion', 'ssl', 'ca', 'cert', 'key', 'rejectUnauthorized', 'promoteLongs'];

/**
 * Creates a new Server instance
 * @class
 * @param {boolean} [options.reconnect=true] Server will attempt to reconnect on loss of connection
 * @param {number} [options.reconnectTries=30] Server attempt to reconnect #times
 * @param {number} [options.reconnectInterval=1000] Server will wait # milliseconds between retries
 * @param {boolean} [options.emitError=false] Server will emit errors events
 * @param {Cursor} [options.cursorFactory=Cursor] The cursor factory class used for all query cursors
 * @param {string} options.host The server host
 * @param {number} options.port The server port
 * @param {number} [options.size=5] Server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=0] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=0] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @return {Server} A cursor instance
 * @fires Server#connect
 * @fires Server#close
 * @fires Server#error
 * @fires Server#timeout
 * @fires Server#parseError
 * @fires Server#reconnect
 */
var Server = function(options) {
  var self = this;

  // Add event listener
  EventEmitter.call(this);

  // BSON Parser, ensure we have a single instance
  if(bsonInstance == null) {
    bsonInstance = new BSON(bsonTypes);
  }

  // Reconnect retries
  var reconnectTries = options.reconnectTries || 30;

  // Keeps all the internal state of the server
  this.s = {
    // Options
      options: options
    // Contains all the callbacks
    , callbacks: new Callbacks()
    // Logger
    , logger: Logger('Server', options)
    // Server state
    , state: DISCONNECTED
    // Reconnect option
    , reconnect: typeof options.reconnect == 'boolean' ? options.reconnect :  true
    , reconnectTries: reconnectTries
    , reconnectInterval: options.reconnectInterval || 1000
    // Swallow or emit errors
    , emitError: typeof options.emitError == 'boolean' ? options.emitError : false
    // Current state
    , currentReconnectRetry: reconnectTries
    // Contains the ismaster
    , ismaster: null
    // Contains any alternate strategies for picking
    , readPreferenceStrategies: options.readPreferenceStrategies
    // Auth providers
    , authProviders: options.authProviders || {}
    // Server instance id
    , id: serverId++
    // Grouping tag used for debugging purposes
    , tag: options.tag
    // Do we have a not connected handler
    , disconnectHandler: options.disconnectHandler
    // wireProtocolHandler methods
    , wireProtocolHandler: options.wireProtocolHandler || new PreTwoSixWireProtocolSupport()
    // Factory overrides
    , Cursor: options.cursorFactory || BasicCursor
    // BSON Parser, ensure we have a single instance
    , bsonInstance: bsonInstance
    // Pick the right bson parser
    , bson: options.bson ? options.bson : bsonInstance
    // Internal connection pool
    , pool: null
    // Server details
    , serverDetails: {
        host: options.host
      , port: options.port
      , name: options.port ? f("%s:%s", options.host, options.port) : options.host
    }
  }

  // Reference state
  var s = this.s;

  // Add bson parser to options
  options.bson = s.bson;

  // Set error properties
  getProperty(this, 'name', 'name', s.serverDetails, {});
  getProperty(this, 'bson', 'bson', s.options, {});
  getProperty(this, 'wireProtocolHandler', 'wireProtocolHandler', s.options, {});
  getSingleProperty(this, 'id', s.id);

  // Add auth providers
  this.addAuthProvider('mongocr', new MongoCR());
  this.addAuthProvider('x509', new X509());
  this.addAuthProvider('plain', new Plain());
  this.addAuthProvider('gssapi', new GSSAPI());
  this.addAuthProvider('sspi', new SSPI());
  this.addAuthProvider('scram-sha-1', new ScramSHA1());
}

inherits(Server, EventEmitter);

/**
 * Execute a command
 * @method
 * @param {string} type Type of BSON parser to use (c++ or js)
 */
Server.prototype.setBSONParserType = function(type) {
  var nBSON = null;

  if(type == 'c++') {
    nBSON = require('bson').native().BSON;
  } else if(type == 'js') {
    nBSON = require('bson').pure().BSON;
  } else {
    throw new MongoError(f("% parser not supported", type));
  }

  this.s.options.bson = new nBSON(bsonTypes);
}

/**
 * Returns the last known ismaster document for this server
 * @method
 * @return {object}
 */
Server.prototype.lastIsMaster = function() {
  return this.s.ismaster;
}

var isMasterDiscovery = function(self, options, callback) {
  if(options.noismaster) return callback();
  // Clone the options
  var options = cloneOptions(options);
  // Set the pool size to a single socket
  options.size = 1;
  options.noismaster = true;
  // Create a new server instance
  var server = new Server(options)

  // Add handlers
  server.on('connect', function(_server) {
    // Remove all listeners
    _server.removeAllListeners('close');
    _server.removeAllListeners('error');
    _server.removeAllListeners('timeout');
    _server.removeAllListeners('parseError');
    // Destroy socket
    _server.destroy();
    // Return lastIsMaster for this server
    callback(null, _server.lastIsMaster());
  });

  // Handle all errors
  var errorHandler = function() {
    if(callback) {
      var _internalCallback = callback;
      callback = null;
      _internalCallback();
    }
  }

  // Intercept all the errors
  server.on('close', errorHandler);
  server.on('error', errorHandler);
  server.on('timeout', errorHandler);
  server.on('parseError', errorHandler);

  // Connect
  server.connect();
}

/**
 * Initiate server connect
 * @method
 */
Server.prototype.connect = function(_options) {
  var self = this;
  // Set server specific settings
  _options = _options || {}
  // Set the promotion
  if(typeof _options.promoteLongs == 'boolean')  {
    self.s.options.promoteLongs = _options.promoteLongs;
  }

  // Connect and retrieve the ismaster
  isMasterDiscovery(self, self.s.options, function(err, r) {
    // If we have an ismaster
    if(r) {
      self.emit('ismaster', r, self);
    }

    // Destroy existing pool
    if(self.s.pool) {
      self.s.pool.destroy();
      self.s.pool = null;
    }

    // Set the state to connection
    self.s.state = CONNECTING;
    // Create a new connection pool
    if(!self.s.pool) {
      self.s.options.messageHandler = messageHandler(self, self.s);
      self.s.pool = new Pool(self.s.options);
    }

    // Add all the event handlers
    self.s.pool.once('timeout', timeoutHandler(self, self.s));
    self.s.pool.once('close', closeHandler(self, self.s));
    self.s.pool.once('error', errorHandler(self, self.s));
    self.s.pool.once('connect', connectHandler(self, self.s));
    self.s.pool.once('parseError', fatalErrorHandler(self, self.s));

    // Connect the pool
    self.s.pool.connect();
  });
}

/**
 * Destroy the server connection
 * @method
 */
Server.prototype.destroy = function(emitClose, emitDestroy) {
  var self = this;
  if(self.s.logger.isDebug()) self.s.logger.debug(f('destroy called on server %s', self.name));
  // Emit close
  if(emitClose && self.listeners('close').length > 0) self.emit('close', self);

  // Emit destroy event
  if(emitDestroy) self.emit('destroy', self);
  // Set state as destroyed
  self.s.state = DESTROYED;
  // Close the pool
  self.s.pool.destroy();
  // Flush out all the callbacks
  if(self.s.callbacks) self.s.callbacks.flush(new MongoError(f("server %s sockets closed", self.name)));
}

/**
 * Figure out if the server is connected
 * @method
 * @return {boolean}
 */
Server.prototype.isConnected = function() {
  var self = this;
  if(self.s.pool) return self.s.pool.isConnected();
  return false;
}

/**
 * Figure out if the server instance was destroyed by calling destroy
 * @method
 * @return {boolean}
 */
Server.prototype.isDestroyed = function() {
  return this.s.state == DESTROYED;
}

var executeSingleOperation = function(self, ns, cmd, queryOptions, options, onAll, callback) {
  // Create a query instance
  var query = new Query(self.s.bson, ns, cmd, queryOptions);

  // Set slave OK
  query.slaveOk = slaveOk(options.readPreference);

  // Notify query start to any read Preference strategies
  if(self.s.readPreferenceStrategies != null)
    notifyStrategies(self, self.s, 'startOperation', [self, query, new Date()]);

  // Get a connection (either passed or from the pool)
  var connection = options.connection || self.s.pool.get();

  // Double check if we have a valid connection
  if(!connection.isConnected()) {
    return callback(new MongoError(f("no connection available to server %s", self.name)));
  }

  // Print cmd and execution connection if in debug mode for logging
  if(self.s.logger.isDebug()) {
    var json = connection.toJSON();
    self.s.logger.debug(f('cmd [%s] about to be executed on connection with id %s at %s:%s', JSON.stringify(cmd), json.id, json.host, json.port));
  }

  // Execute multiple queries
  if(onAll) {
    var connections = self.s.pool.getAll();
    var total = connections.length;
    // We have an error
    var error = null;
    // Execute on all connections
    for(var i = 0; i < connections.length; i++) {
      try {
        query.incRequestId();
        connections[i].write(query.toBin());
      } catch(err) {
        total = total - 1;
        if(total == 0) return callback(MongoError.create(err));
      }

      // Register the callback
      self.s.callbacks.register(query.requestId, function(err, result) {
        if(err) error = err;
        total = total - 1;

        // Done
        if(total == 0) {
          // Notify end of command
          notifyStrategies(self, self.s, 'endOperation', [self, error, result, new Date()]);
          if(error) return callback(MongoError.create(error));
          // Execute callback, catch and rethrow if needed
          try { callback(null, new CommandResult(result.documents[0], connections)); }
          catch(err) { process.nextTick(function() { throw err}); }
        }
      });
    }

    return;
  }

  // Execute a single command query
  try {
    connection.write(query.toBin());
  } catch(err) {
    return callback(MongoError.create(err));
  }

  // Register the callback
  self.s.callbacks.register(query.requestId, function(err, result) {
    // Notify end of command
    notifyStrategies(self, self.s, 'endOperation', [self, err, result, new Date()]);
    if(err) return callback(err);
    if(result.documents[0]['$err']
      || result.documents[0]['errmsg']
      || result.documents[0]['err']
      || result.documents[0]['code']) return callback(MongoError.create(result.documents[0]));
      // Execute callback, catch and rethrow if needed
      try { callback(null, new CommandResult(result.documents[0], connection)); }
      catch(err) { process.nextTick(function() { throw err}); }
  });
}

/**
 * Execute a command
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {object} cmd The command hash
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {Connection} [options.connection] Specify connection object to execute command against
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.command = function(ns, cmd, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var self = this;
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Ensure we have no options
  options = options || {};
  // Do we have a read Preference it need to be of type ReadPreference
  if(options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    throw new Error("readPreference must be an instance of ReadPreference");
  }

  // Debug log
  if(self.s.logger.isDebug()) self.s.logger.debug(f('executing command [%s] against %s', JSON.stringify({
    ns: ns, cmd: cmd, options: debugOptions(debugFields, options)
  }), self.name));

  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.isConnected() && self.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return self.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  // If we have no connection error
  if(!self.s.pool.isConnected()) return callback(new MongoError(f("no connection available to server %s", self.name)));

  // Execute on all connections
  var onAll = typeof options.onAll == 'boolean' ? options.onAll : false;

  // Check keys
  var checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys: false;

  // Serialize function
  var serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;

  // Query options
  var queryOptions = {
    numberToSkip: 0, numberToReturn: -1, checkKeys: checkKeys
  };

  if(serializeFunctions) queryOptions.serializeFunctions = serializeFunctions;

  // Single operation execution
  if(!Array.isArray(cmd)) {
    return executeSingleOperation(self, ns, cmd, queryOptions, options, onAll, callback);
  }

  // Build commands for each of the instances
  var queries = new Array(cmd.length);
  for(var i = 0; i < cmd.length; i++) {
    queries[i] = new Query(self.s.bson, ns, cmd[i], queryOptions);
    queries[i].slaveOk = slaveOk(options.readPreference);
  }

  // Notify query start to any read Preference strategies
  if(self.s.readPreferenceStrategies != null)
    notifyStrategies(self, self.s, 'startOperation', [self, queries, new Date()]);

  // Get a connection (either passed or from the pool)
  var connection = options.connection || self.s.pool.get();

  // Double check if we have a valid connection
  if(!connection.isConnected()) {
    return callback(new MongoError(f("no connection available to server %s", self.name)));
  }

  // Print cmd and execution connection if in debug mode for logging
  if(self.s.logger.isDebug()) {
    var json = connection.toJSON();
    self.s.logger.debug(f('cmd [%s] about to be executed on connection with id %s at %s:%s', JSON.stringify(queries), json.id, json.host, json.port));
  }

  // Canceled operations
  var canceled = false;
  // Number of operations left
  var operationsLeft = queries.length;
  // Results
  var results = [];

  // We need to nest the callbacks
  for(var i = 0; i < queries.length; i++) {
    // Get the query object
    var query = queries[i];

    // Execute a single command query
    try {
      connection.write(query.toBin());
    } catch(err) {
      return callback(MongoError.create(err));
    }

    // Register the callback
    self.s.callbacks.register(query.requestId, function(err, result) {
      // If it's canceled ignore the operation
      if(canceled) return;
      // Update the current index
      operationsLeft = operationsLeft - 1;

      // If we have an error cancel the operation
      if(err) {
        canceled = true;
        return callback(err);
      }

      // Return the result
      if(result.documents[0]['$err']
        || result.documents[0]['errmsg']
        || result.documents[0]['err']
        || result.documents[0]['code']) {

        // Set to canceled
        canceled = true;
        // Return the error
        return callback(MongoError.create(result.documents[0]));
      }

      // Push results
      results.push(result.documents[0]);

      // We are done, return the result
      if(operationsLeft == 0) {
        // Notify end of command
        notifyStrategies(self, self.s, 'endOperation', [self, err, result, new Date()]);

        // Turn into command results
        var commandResults = new Array(results.length);
        for(var i = 0; i < results.length; i++) {
          commandResults[i] = new CommandResult(results[i], connection);
        }

        // Execute callback, catch and rethrow if needed
        try { callback(null, commandResults); }
        catch(err) { process.nextTick(function() { throw err}); }
      }
    });
  }
}

/**
 * Insert one or more documents
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of documents to insert
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.insert = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var self = this;
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.isConnected() && self.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return self.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  // Setup the docs as an array
  ops = Array.isArray(ops) ? ops : [ops];
  // Execute write
  return self.s.wireProtocolHandler.insert(self, self.s.ismaster, ns, self.s.bson, self.s.pool, self.s.callbacks, ops, options, callback);
}

/**
 * Perform one or more update operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of updates
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.update = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var self = this;
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.isConnected() && self.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return self.s.disconnectHandler.add('update', ns, ops, options, callback);
  }

  // Setup the docs as an array
  ops = Array.isArray(ops) ? ops : [ops];
  // Execute write
  return self.s.wireProtocolHandler.update(self, self.s.ismaster, ns, self.s.bson, self.s.pool, self.s.callbacks, ops, options, callback);
}

/**
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of removes
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.remove = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var self = this;
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.isConnected() && self.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return self.s.disconnectHandler.add('remove', ns, ops, options, callback);
  }

  // Setup the docs as an array
  ops = Array.isArray(ops) ? ops : [ops];
  // Execute write
  return self.s.wireProtocolHandler.remove(self, self.s.ismaster, ns, self.s.bson, self.s.pool, self.s.callbacks, ops, options, callback);
}

/**
 * Authenticate using a specified mechanism
 * @method
 * @param {string} mechanism The Auth mechanism we are invoking
 * @param {string} db The db we are invoking the mechanism against
 * @param {...object} param Parameters for the specific mechanism
 * @param {authResultCallback} callback A callback function
 */
Server.prototype.auth = function(mechanism, db) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  var callback = args.pop();

  // If we don't have the mechanism fail
  if(self.s.authProviders[mechanism] == null && mechanism != 'default')
    throw new MongoError(f("auth provider %s does not exist", mechanism));

  // If we have the default mechanism we pick mechanism based on the wire
  // protocol max version. If it's >= 3 then scram-sha1 otherwise mongodb-cr
  if(mechanism == 'default' && self.s.ismaster && self.s.ismaster.maxWireVersion >= 3) {
    mechanism = 'scram-sha-1';
  } else if(mechanism == 'default') {
    mechanism = 'mongocr';
  }

  // Actual arguments
  var finalArguments = [self, self.s.pool, db].concat(args.slice(0)).concat([function(err, r) {
    if(err) return callback(err);
    if(!r) return callback(new MongoError('could not authenticate'));
    callback(null, new Session({}, self));
  }]);

  // Let's invoke the auth mechanism
  self.s.authProviders[mechanism].auth.apply(self.s.authProviders[mechanism], finalArguments);
}

//
// Plugin methods
//

/**
 * Add custom read preference strategy
 * @method
 * @param {string} name Name of the read preference strategy
 * @param {object} strategy Strategy object instance
 */
Server.prototype.addReadPreferenceStrategy = function(name, strategy) {
  var self = this;
  if(self.s.readPreferenceStrategies == null) self.s.readPreferenceStrategies = {};
  self.s.readPreferenceStrategies[name] = strategy;
}

/**
 * Add custom authentication mechanism
 * @method
 * @param {string} name Name of the authentication mechanism
 * @param {object} provider Authentication object instance
 */
Server.prototype.addAuthProvider = function(name, provider) {
  var self = this;
  self.s.authProviders[name] = provider;
}

/**
 * Compare two server instances
 * @method
 * @param {Server} server Server to compare equality against
 * @return {boolean}
 */
Server.prototype.equals = function(server) {
  if(typeof server == 'string') return server == this.name;
  return server.name == this.name;
}

/**
 * All raw connections
 * @method
 * @return {Connection[]}
 */
Server.prototype.connections = function() {
  return this.s.pool.getAll();
}

/**
 * Get server
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {Server}
 */
Server.prototype.getServer = function(options) {
  return this;
}

/**
 * Get connection
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {Connection}
 */
Server.prototype.getConnection = function(options) {
  return this.s.pool.get();
}

/**
 * Get callbacks object
 * @method
 * @return {Callbacks}
 */
Server.prototype.getCallbacks = function() {
  return this.s.callbacks;
}

/**
 * Name of BSON parser currently used
 * @method
 * @return {string}
 */
Server.prototype.parserType = function() {
  var s = this.s;
  if(s.options.bson.serialize.toString().indexOf('[native code]') != -1)
    return 'c++';
  return 'js';
}

// // Command
// {
//     find: ns
//   , query: <object>
//   , limit: <n>
//   , fields: <object>
//   , skip: <n>
//   , hint: <string>
//   , explain: <boolean>
//   , snapshot: <boolean>
//   , batchSize: <n>
//   , returnKey: <boolean>
//   , maxScan: <n>
//   , min: <n>
//   , max: <n>
//   , showDiskLoc: <boolean>
//   , comment: <string>
//   , maxTimeMS: <n>
//   , raw: <boolean>
//   , readPreference: <ReadPreference>
//   , tailable: <boolean>
//   , oplogReplay: <boolean>
//   , noCursorTimeout: <boolean>
//   , awaitdata: <boolean>
//   , exhaust: <boolean>
//   , partial: <boolean>
// }

/**
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {{object}|{Long}} cmd Can be either a command returning a cursor or a cursorId
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.cursor = function(ns, cmd, cursorOptions) {
  var s = this.s;
  cursorOptions = cursorOptions || {};
  var FinalCursor = cursorOptions.cursorFactory || s.Cursor;
  return new FinalCursor(s.bson, ns, cmd, cursorOptions, this, s.options);
}

/**
 * A server connect event, used to verify that the connection is up and running
 *
 * @event Server#connect
 * @type {Server}
 */

/**
 * The server connection closed, all pool connections closed
 *
 * @event Server#close
 * @type {Server}
 */

/**
 * The server connection caused an error, all pool connections closed
 *
 * @event Server#error
 * @type {Server}
 */

/**
 * The server connection timed out, all pool connections closed
 *
 * @event Server#timeout
 * @type {Server}
 */

/**
 * The driver experienced an invalid message, all pool connections closed
 *
 * @event Server#parseError
 * @type {Server}
 */

/**
 * The server reestablished the connection
 *
 * @event Server#reconnect
 * @type {Server}
 */

/**
 * This is an insert result callback
 *
 * @callback opResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {CommandResult} command result
 */

/**
 * This is an authentication result callback
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {Session} an authenticated session
 */

module.exports = Server;
