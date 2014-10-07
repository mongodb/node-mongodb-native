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
  , BSON = require('bson').native().BSON
  , PreTwoSixWireProtocolSupport = require('../wireprotocol/2_4_support')
  , TwoSixWireProtocolSupport = require('../wireprotocol/2_6_support')
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
  EventEmitter.call(this);

  // Self reference
  var self = this;

  // Id
  var id = callbackId++;

  Object.defineProperty(this, 'id', {
    enumerable:true, get: function() { return id; }
  });

  Object.defineProperty(this, 'type', {
    enumerable:true, get: function() { return 'server'; }
  });

  //
  // Flush all callbacks
  this.flush = function(err) {
    var executeError = function(_id, _callbacks) {
      _callbacks.emit(_id, err, null);
      // Force removal as some node versions don't delete the properties on emit
      delete self._events[id];
    }

    // Error out any current callbacks
    for(var id in this._events) {
      if(!isNaN(parseInt(id, 10))) {
        executeError(id, self);
      }
    }
  }

  this.raw = function(id) {
    if(this._events[id] == null) return false;
    return this._events[id].listener.raw == true ? true : false;
  }

  this.unregister = function(id) {
    this.removeAllListeners(id);
  }

  this.register = function(id, callback) {
    this.once(id, bindToCurrentDomain(callback));
  }
}

inherits(Callbacks, EventEmitter);

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
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=false] Reject unauthorized server certificates
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
  // Server callbacks
  var callbacks = new Callbacks();
  
  // Add event listener
  EventEmitter.call(this);

  // Logger
  var logger = Logger('Server', options);
  // Server state
  var state = DISCONNECTED;
  
  // Reconnect option
  var reconnect = typeof options.reconnect == 'boolean' ? options.reconnect :  true;
  var reconnectTries = options.reconnectTries || 30;
  var reconnectInterval = options.reconnectInterval || 1000;

  // Swallow or emit errors
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : false;

  // Current state
  var currentReconnectRetry = reconnectTries;
  // Contains the ismaster
  var ismaster = null;
  // Contains any alternate strategies for picking
  var readPreferenceStrategies = options.readPreferenceStrategies;
  // Auth providers
  var authProviders = options.authProviders || {};

  // Server instance id
  var id = serverId++;

  // Grouping tag used for debugging purposes
  var tag = options.tag;

  // Do we have a not connected handler
  var disconnectHandler = options.disconnectHandler;

  //
  // wireProtocolHandler methods
  //
  var wireProtocolHandler = options.wireProtocolHandler || new PreTwoSixWireProtocolSupport();

  //
  // Factory overrides
  //
  var Cursor = options.cursorFactory || BasicCursor;

  // BSON Parser, ensure we have a single instance
  if(bsonInstance == null) {
    bsonInstance = new BSON(bsonTypes);
  }

  // Pick the right bson parser
  var bson = options.bson ? options.bson : bsonInstance;
  // Add bson parser to options
  options.bson = bson;

  // Internal connection pool
  var pool = null;

  // Name of the server
  var serverDetails = {
      host: options.host
    , port: options.port
    , name: options.port ? f("%s:%s", options.host, options.port) : options.host
  }

  // Set error properties
  getProperty(this, 'name', 'name', serverDetails, {});
  getProperty(this, 'bson', 'bson', options, {});
  getProperty(this, 'wireProtocolHandler', 'wireProtocolHandler', options, {});
  getSingleProperty(this, 'id', id);

  // Supports server
  var supportsServer = function() {
    return ismaster && typeof ismaster.minWireVersion == 'number';
  }

  //
  // Reconnect server
  var reconnectServer = function() {
    state = CONNECTING;
    // Create a new Pool
    pool = new Pool(options);
    // error handler
    var errorHandler = function(err) {
      state = DISCONNECTED;
      // Destroy the pool
      pool.destroy();
      // Adjust the number of retries
      currentReconnectRetry = currentReconnectRetry - 1;
      // No more retries
      if(currentReconnectRetry <= 0) {
        self.emit('error', f('failed to connect to %s:%s after %s retries', options.host, options.port, reconnectTries));
      } else {
        setTimeout(function() {
          reconnectServer();
        }, reconnectInterval);
      }
    }

    //
    // Attempt to connect
    pool.once('connect', function() {
      // Remove any non used handlers
      var events = ['error', 'close', 'timeout', 'parseError'];
      events.forEach(function(e) {
        pool.removeAllListeners(e);
      })

      // Set connected state
      state = CONNECTED;

      // Add proper handlers
      pool.once('error', errorHandler);
      pool.once('close', closeHandler);
      pool.once('timeout', timeoutHandler);
      pool.on('message', messageHandler);
      pool.once('parseError', fatalErrorHandler);

      // We need to ensure we have re-authenticated
      var keys = Object.keys(authProviders);
      if(keys.length == 0) return self.emit('reconnect', self);

      // Execute all providers
      var count = keys.length;
      // Iterate over keys
      for(var i = 0; i < keys.length; i++) {
        authProviders[keys[i]].reauthenticate(self, pool, function(err, r) {
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
    pool.once('error', errorHandler);
    pool.once('close', errorHandler);
    pool.once('timeout', errorHandler);
    pool.once('parseError', errorHandler);

    // Connect pool
    pool.connect();
  }

  //
  // createWireProtocolHandler
  var createWireProtocolHandler = function(result) {
    // 2.6 wire protocol handler
    if(result && result.maxWireVersion >= 2) {
      return new TwoSixWireProtocolSupport();  
    }

    // 2.4 or earlier wire protocol handler
    return new PreTwoSixWireProtocolSupport();
  }

  //
  // Handlers
  var messageHandler = function(response, connection) {
    try {
      // Parse the message
      response.parse({raw: callbacks.raw(response.responseTo)});
      if(logger.isDebug()) logger.debug(f('message [%s] received from %s', response.raw.toString('hex'), self.name));
      callbacks.emit(response.responseTo, null, response);      
    } catch (err) {
      callbacks.flush(new MongoError(err));
      self.destroy();
    }
  }

  var errorHandler = function(err, connection) {
    if(state == DISCONNECTED || state == DESTROYED) return;
    // Set disconnected state
    state = DISCONNECTED;
    if(readPreferenceStrategies != null) notifyStrategies('error', [self]);
    if(logger.isInfo()) logger.info(f('server %s errored out with %s', self.name, JSON.stringify(err)));
    // Flush out all the callbacks
    if(callbacks) callbacks.flush(new MongoError(f("server %s received an error %s", self.name, JSON.stringify(err))));
    // Destroy all connections
    self.destroy();    
    // Emit error event
    if(emitError) self.emit('error', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { currentReconnectRetry = reconnectTries, reconnectServer() }, reconnectInterval);
  }

  var fatalErrorHandler = function(err, connection) {
    if(state == DISCONNECTED || state == DESTROYED) return;
    // Set disconnected state
    state = DISCONNECTED;

    if(readPreferenceStrategies != null) notifyStrategies('error', [self]);
    if(logger.isInfo()) logger.info(f('server %s errored out with %s', self.name, JSON.stringify(err)));    
    // Flush out all the callbacks
    if(callbacks) callbacks.flush(new MongoError(f("server %s received an error %s", self.name, JSON.stringify(err))));
    // Emit error event
    self.emit('error', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { currentReconnectRetry = reconnectTries, reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();
  }  

  var timeoutHandler = function(err, connection) {
    if(state == DISCONNECTED || state == DESTROYED) return;
    // Set disconnected state
    state = DISCONNECTED;

    if(readPreferenceStrategies != null) notifyStrategies('timeout', [self]);
    if(logger.isInfo()) logger.info(f('server %s timed out', self.name));
    // Flush out all the callbacks
    if(callbacks) callbacks.flush(new MongoError(f("server %s timed out", self.name)));
    // Emit error event
    self.emit('timeout', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { currentReconnectRetry = reconnectTries, reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();
  }

  var closeHandler = function(err, connection) {
    if(state == DISCONNECTED || state == DESTROYED) return;
    // Set disconnected state
    state = DISCONNECTED;

    if(readPreferenceStrategies != null) notifyStrategies('close', [self]);
    if(logger.isInfo()) logger.info(f('server %s closed', self.name));
    // Flush out all the callbacks
    if(callbacks) callbacks.flush(new MongoError(f("server %s sockets closed", self.name)));
    // Emit error event
    self.emit('close', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { currentReconnectRetry = reconnectTries, reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();
  }

  var connectHandler = function(connection) {
    // Apply any applyAuthentications
    applyAuthentications(function() {

      // Execute an ismaster
      self.command('system.$cmd', {ismaster:true}, function(err, r) {
        if(err) {
          state = DISCONNECTED;
          return self.emit('close', err, self);
        }

        // Set the current ismaster
        if(!err) {
          ismaster = r.result;
        }

        // Determine the wire protocol handler
        wireProtocolHandler = createWireProtocolHandler(ismaster);

        // Set the wireProtocolHandler
        options.wireProtocolHandler = wireProtocolHandler;

        // Log the ismaster if available
        if(logger.isInfo()) logger.info(f('server %s connected with ismaster [%s]', self.name, JSON.stringify(r.result)));

        // Validate if we it's a server we can connect to
        if(!supportsServer() && wireProtocolHandler == null) {
          state = DISCONNECTED
          return self.emit('error', new MongoError("non supported server version"), self);
        }

        // Set the details
        if(ismaster && ismaster.me) serverDetails.name = ismaster.me;

        // No read preference strategies just emit connect
        if(readPreferenceStrategies == null) {
          state = CONNECTED;
          return self.emit('connect', self);
        }

        // Signal connect to all readPreferences
        notifyStrategies('connect', [self], function(err, result) {
          state = CONNECTED;
          return self.emit('connect', self);
        });        
      });      
    });
  }

  /**
   * Execute a command
   * @method
   * @param {string} type Type of BSON parser to use (c++ or js)
   */
  this.setBSONParserType = function(type) {
    var nBSON = null;

    if(type == 'c++') {
      nBSON = require('bson').native().BSON;
    } else if(type == 'js') {
      nBSON = require('bson').pure().BSON;
    } else {
      throw new MongoError(f("% parser not supported", type));
    }

    options.bson = new nBSON(bsonTypes);
  }  

  /**
   * Returns the last known ismaster document for this server
   * @method
   * @return {object}
   */
  this.lastIsMaster = function() {
    return ismaster;
  }

  /**
   * Initiate server connect
   * @method
   */
  this.connect = function(_options) {
    // Set server specific settings
    _options = _options || {}
    if(typeof _options.promoteLongs == 'boolean') 
      options.promoteLongs = _options.promoteLongs;
    // Destroy existing pool
    if(pool) {
      pool.destroy();
      pool = null;
    }
    
    // Set the state to connection
    state = CONNECTING;
    // Create a new connection pool
    if(!pool) {
      pool = new Pool(options);      
    }

    // Add all the event handlers
    pool.once('timeout', timeoutHandler);
    pool.once('close', closeHandler);
    pool.once('error', errorHandler);
    pool.on('message', messageHandler);
    pool.once('connect', connectHandler);
    pool.once('parseError', fatalErrorHandler);

    // Connect the pool
    pool.connect(); 
  }

  /**
   * Destroy the server connection
   * @method
   */
  this.destroy = function() {
    if(logger.isDebug()) logger.debug(f('destroy called on server %s', self.name));
    // Set state as destroyed
    state = DESTROYED;
    // Close the pool
    pool.destroy();
    // Flush out all the callbacks
    if(callbacks) callbacks.flush(new MongoError(f("server %s sockets closed", self.name)));
  }

  /**
   * Figure out if the server is connected
   * @method
   * @return {boolean}
   */
  this.isConnected = function() {
    if(pool) return pool.isConnected();
    return false;
  }

  //
  // Execute readPreference Strategies
  var notifyStrategies = function(op, params, callback) {
    if(typeof callback != 'function') {
      // Notify query start to any read Preference strategies
      for(var name in readPreferenceStrategies) {
        if(readPreferenceStrategies[name][op]) {
          var strat = readPreferenceStrategies[name];
          strat[op].apply(strat, params);
        }
      }
      // Finish up
      return;
    }

    // Execute the async callbacks
    var nPreferences = Object.keys(readPreferenceStrategies).length;
    if(nPreferences == 0) return callback(null, null);
    for(var name in readPreferenceStrategies) {
      if(readPreferenceStrategies[name][op]) {
        var strat = readPreferenceStrategies[name];
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

  /**
   * Execute a command
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Connection} [options.connection] Specify connection object to execute command against
   * @param {opResultCallback} callback A callback function
   */
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    // Ensure we have no options
    options = options || {};
    // Do we have a read Preference it need to be of type ReadPreference
    if(options.readPreference && !(options.readPreference instanceof ReadPreference)) {
      throw new Error("readPreference must be an instance of ReadPreference");
    }

    // Debug log
    if(logger.isDebug()) logger.debug(f('executing command [%s] against %s', JSON.stringify({
      ns: ns, cmd: cmd, options: options
    }), self.name));

    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.isConnected() && disconnectHandler != null) {
      callback = bindToCurrentDomain(callback);
      return disconnectHandler.add('command', ns, cmd, options, callback);
    }

    // If we have no connection error
    if(!pool.isConnected()) return callback(new MongoError(f("no connection available to server %s", self.name)));
    
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

    // Create a query instance
    var query = new Query(bson, ns, cmd, queryOptions);

    // Set slave OK
    query.slaveOk = slaveOk(options.readPreference);

    // Notify query start to any read Preference strategies
    if(readPreferenceStrategies != null)
      notifyStrategies('startOperation', [self, query, new Date()]);

    // Get a connection (either passed or from the pool)
    var connection = options.connection || pool.get();

    // Double check if we have a valid connection
    if(!connection.isConnected()) {
      return callback(new MongoError(f("no connection available to server %s", self.name)));
    }

    // Print cmd and execution connection if in debug mode for logging
    if(logger.isDebug()) {
      var json = connection.toJSON();
      logger.debug(f('cmd [%s] about to be executed on connection with id %s at %s:%s', JSON.stringify(cmd), json.id, json.host, json.port));
    }

    // Execute multiple queries
    if(onAll) {
      var connections = pool.getAll();
      var total = connections.length;
      // We have an error
      var error = null;
      // Execute on all connections
      for(var i = 0; i < connections.length; i++) {
        try {
          query.incRequestId();
          connections[i].write(query);
        } catch(err) {
          total = total - 1;
          if(total == 0) return callback(MongoError.create(err));
        }

        // Register the callback
        callbacks.register(query.requestId, function(err, result) {
          if(err) error = err;
          total = total - 1;

          // Done
          if(total == 0) {
            // Notify end of command
            notifyStrategies('endOperation', [self, error, result, new Date()]);
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
      connection.write(query);
    } catch(err) {
      return callback(MongoError.create(err));
    }

    // Register the callback
    callbacks.register(query.requestId, function(err, result) {
      // Notify end of command
      notifyStrategies('endOperation', [self, err, result, new Date()]);
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
   * Insert one or more documents
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {array} ops An array of documents to insert
   * @param {boolean} [options.ordered=true] Execute in order or out of order
   * @param {object} [options.writeConcern={}] Write concern for the operation
   * @param {opResultCallback} callback A callback function
   */
  this.insert = function(ns, ops, options, callback) {
    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.isConnected() && disconnectHandler != null) {
      callback = bindToCurrentDomain(callback);
      return disconnectHandler.add('insert', ns, ops, options, callback);
    }

    // Setup the docs as an array
    ops = Array.isArray(ops) ? ops : [ops];
    // Execute write
    return wireProtocolHandler.insert(self, ismaster, ns, bson, pool, callbacks, ops, options, callback);
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
  this.update = function(ns, ops, options, callback) {
    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.isConnected() && disconnectHandler != null) {
      callback = bindToCurrentDomain(callback);
      return disconnectHandler.add('update', ns, ops, options, callback);
    }

    // Setup the docs as an array
    ops = Array.isArray(ops) ? ops : [ops];
    // Execute write
    return wireProtocolHandler.update(self, ismaster, ns, bson, pool, callbacks, ops, options, callback);
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
  this.remove = function(ns, ops, options, callback) {
    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.isConnected() && disconnectHandler != null) {
      callback = bindToCurrentDomain(callback);
      return disconnectHandler.add('remove', ns, ops, options, callback);
    }

    // Setup the docs as an array
    ops = Array.isArray(ops) ? ops : [ops];
    // Execute write
    return wireProtocolHandler.remove(self, ismaster, ns, bson, pool, callbacks, ops, options, callback);
  }

  /**
   * Authenticate using a specified mechanism
   * @method
   * @param {string} mechanism The Auth mechanism we are invoking
   * @param {string} db The db we are invoking the mechanism against
   * @param {...object} param Parameters for the specific mechanism
   * @param {authResultCallback} callback A callback function
   */
  this.auth = function(mechanism, db) {
    var args = Array.prototype.slice.call(arguments, 2);
    var callback = args.pop();

    // If we don't have the mechanism fail
    if(authProviders[mechanism] == null && mechanism != 'default') 
      throw new MongoError(f("auth provider %s does not exist", mechanism));

    // If we have the default mechanism we pick mechanism based on the wire
    // protocol max version. If it's >= 3 then scram-sha1 otherwise mongodb-cr
    if(mechanism == 'default' && ismaster && ismaster.maxWireVersion >= 3) {
      mechanism = 'scram-sha-1';
    } else if(mechanism == 'default') {
      mechanism = 'mongocr';
    }
    
    // Actual arguments
    var finalArguments = [self, pool, db].concat(args.slice(0)).concat([function(err, r) {
      if(err) return callback(err);
      if(!r) return callback(new MongoError('could not authenticate'));
      callback(null, new Session({}, self));
    }]);

    // Let's invoke the auth mechanism
    authProviders[mechanism].auth.apply(authProviders[mechanism], finalArguments);
  }

  // Apply all stored authentications
  var applyAuthentications = function(callback) {
    // We need to ensure we have re-authenticated
    var keys = Object.keys(authProviders);
    if(keys.length == 0) return callback(null, null);

    // Execute all providers
    var count = keys.length;
    // Iterate over keys
    for(var i = 0; i < keys.length; i++) {
      authProviders[keys[i]].reauthenticate(self, pool, function(err, r) {
        count = count - 1;
        // We are done, emit reconnect event
        if(count == 0) {
          return callback(null, null);
        }
      });
    }
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
  this.addReadPreferenceStrategy = function(name, strategy) {
    if(readPreferenceStrategies == null) readPreferenceStrategies = {};
    readPreferenceStrategies[name] = strategy;
  }

  /**
   * Add custom authentication mechanism
   * @method
   * @param {string} name Name of the authentication mechanism
   * @param {object} provider Authentication object instance
   */
  this.addAuthProvider = function(name, provider) {
    authProviders[name] = provider;
  }

  /**
   * Compare two server instances
   * @method
   * @param {Server} server Server to compare equality against
   * @return {boolean}
   */
  this.equals = function(server) {    
    if(typeof server == 'string') return server == this.name;
    return server.name == this.name;
  }

  /**
   * All raw connections
   * @method
   * @return {Connection[]}
   */
  this.connections = function() {
    return pool.getAll();
  }

  /**
   * Get server
   * @method
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @return {Server}
   */
  this.getServer = function(options) {
    return self;
  }

  /**
   * Get callbacks object
   * @method
   * @return {Callbacks}
   */
  this.getCallbacks = function() {
    return callbacks;
  }

  /**
   * Get connection
   * @method
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @return {Connection}
   */
  this.getConnection = function(options) {
    return pool.get();
  }

  /**
   * Name of BSON parser currently used
   * @method
   * @return {string}
   */
  this.parserType = function() {
    if(options.bson.serialize.toString().indexOf('[native code]') != -1)
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
  this.cursor = function(ns, cmd, cursorOptions) {
    cursorOptions = cursorOptions || {};
    var FinalCursor = cursorOptions.cursorFactory || Cursor;
    return new FinalCursor(bson, ns, cmd, cursorOptions, self, options);
  }

  var slaveOk = function(r) {
    if(r) return r.slaveOk()
    return false;
  }

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