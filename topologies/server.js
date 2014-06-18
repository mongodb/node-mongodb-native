var inherits = require('util').inherits
  , f = require('util').format
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
  , LegacySupport = require('../legacy/legacy_support')
  , Session = require('./session')
  , Logger = require('../connection/logger');  

// All bson types
var bsonTypes = [b.Long, b.ObjectID, b.Binary, b.Code, b.DBRef, b.Symbol, b.Double, b.Timestamp, b.MaxKey, b.MinKey];

// Single store for all callbacks
var Callbacks = function() {
  EventEmitter.call(this);

  // Self reference
  var self = this;

  //
  // Flush all callbacks
  this.flush = function(err) {
    process.nextTick(function() {
      // Error out any current callbacks
      for(var id in this._events) {
        var executeError = function(_id, _callbacks) {
          _callbacks.emit(_id, err, null);
        }

        executeError(id, self);
      }
    });
  }
}

inherits(Callbacks, EventEmitter);

/**
 * @ignore
 */
var bindToCurrentDomain = function(callback) {
  var domain = process.domain;
  if(domain == null || callback == null) {
    return callback;
  } else {
    return domain.bind(callback);
  }
}

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
 * @param {string} [options.passPhrase] SSL Certificate pass phrase
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
  var callbacks = new Callbacks;
  
  // Add event listener
  EventEmitter.call(this);

  // Logger
  var logger = Logger('Server', options);
  
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

  //
  // Fallback methods
  //
  var fallback = options.fallback || new LegacySupport();

  //
  // Factory overrides
  //
  var Cursor = options.cursorFactory || BasicCursor;

  // Let's get the bson parser if none is passed in
  if(options.bson == null) {
    options.bson = new BSON(bsonTypes);
  }

  // Save bson
  var bson = options.bson;

  // Internal connection pool
  var pool = null;

  // Name of the server
  var serverDetails = {
      host: options.host
    , port: options.port
    , name: options.port ? f("%s:%s", options.host, options.port) : options.host
  }

  // Set error properties
  getProperty(this, 'name', 'name', serverDetails);

  // Supports server
  var supportsServer = function() {
    return ismaster && typeof ismaster.minWireVersion == 'number';
  }

  //
  // Reconnect server
  var reconnectServer = function() {
    // Set the max retries
    currentReconnectRetry = reconnectTries;
    // Create a new Pool
    pool = new Pool(options);
    // error handler
    var errorHandler = function() {
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
      ['error', 'close', 'timeout', 'parseError'].forEach(function(e) {
        pool.removeAllListeners(e);
      })

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
  // Handlers
  var messageHandler = function(response, connection) {
    if(logger.isDebug()) logger.debug(f('message [%s] received from %s', response.raw.toString('hex'), self.name));
    // Execute callback
    callbacks.emit(response.responseTo, null, response);      
  }

  var errorHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('error', [self]);
    if(logger.isInfo()) logger.info(f('server %s errored out with %s', self.name, JSON.stringify(err)));
    // Flush out all the callbacks
    callbacks.flush(new MongoError(f("server %s received an error %s", self.name, JSON.stringify(err))));
    // Emit error event
    if(emitError) self.emit('error', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();    
  }

  var fatalErrorHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('error', [self]);
    if(logger.isInfo()) logger.info(f('server %s errored out with %s', self.name, JSON.stringify(err)));    
    // Flush out all the callbacks
    callbacks.flush(new MongoError(f("server %s received an error %s", self.name, JSON.stringify(err))));
    // Emit error event
    self.emit('error', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();
  }  

  var timeoutHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('timeout', [self]);
    if(logger.isInfo()) logger.info(f('server %s timed out', self.name));
    // Flush out all the callbacks
    callbacks.flush(new MongoError(f("server %s timed out", self.name)));
    // Emit error event
    self.emit('timeout', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();
  }

  var closeHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('close', [self]);
    if(logger.isInfo()) logger.info(f('server %s closed', self.name));
    // Flush out all the callbacks
    callbacks.flush(new MongoError(f("server %s sockets closed", self.name)));
    // Emit error event
    self.emit('close', err, self);
    // If we specified the driver to reconnect perform it
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
    // Destroy all connections
    self.destroy();
  }

  var connectHandler = function(connection) {
    // Apply any applyAuthentications
    applyAuthentications(function() {

      // Execute an ismaster
      self.command('system.$cmd', {ismaster:true}, function(err, r) {
        if(err) return self.emit('close', err, self);

        if(!err) {
          ismaster = r.result;
        }

        if(logger.isInfo()) logger.info(f('server %s connected with ismaster [%s]', self.name, JSON.stringify(r.result)));

        // Validate if we it's a server we can connect to
        if(!supportsServer() && fallback == null) {
          return self.emit('error', new MongoError("non supported server version"), self);
        }

        // Set the details
        if(ismaster && ismaster.me) serverDetails.name = ismaster.me;

        // No read preference strategies just emit connect
        if(readPreferenceStrategies == null) {
          return self.emit('connect', self);
        }

        // Signal connect to all readPreferences
        notifyStrategies('connect', [self], function(err, result) {
          return self.emit('connect', self);
        });        
      });      
    });
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
  this.connect = function() {
    // Destroy existing pool
    if(pool) {
      pool.destroy();
    }

    // Create a new connection pool
    pool = new Pool(options);
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
    // Destroy all event emitters
    ["close", "message", "error", "timeout", "connect", "parseError"].forEach(function(e) {
      pool.removeAllListeners(e);
    });

    // Close pool
    pool.destroy();
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
  // Execute a write operation
  var executeWrite = function(self, type, opsField, ns, ops, options, callback) {
    if(ops.length == 0) throw new MongoError("insert must contain at least one document");
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Split the ns up to get db and collection
    var p = ns.split(".");
    // Options
    var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
    var writeConcern = options.writeConcern || {};
    // return skeleton
    var writeCommand = {};
    writeCommand[type] = p[1];
    writeCommand[opsField] = ops;
    writeCommand.ordered = ordered;
    writeCommand.writeConcern = writeConcern;    
    // Execute command
    self.command(f("%s.$cmd", p[0]), writeCommand, {}, callback);    
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
   * @param {object} [options.readPreference] Specify read preference if command supports it
   * @param {object} [options.connection] Specify connection object to execute command against
   * @param {opResultCallback} callback A callback function
   */
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }
    
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

    // If we have no connection error
    if(!pool.isConnected()) return callback(new MongoError(f("no connection available to server %s", self.name)));
    
    // Get a connection (either passed or from the pool)
    var connection = options.connection || pool.get();

    // Create a query instance
    var query = new Query(bson, ns, cmd, {
      numberToSkip: 0, numberToReturn: -1, checkKeys: false
    });

    // Print cmd and execution connection if in debug mode for logging
    if(logger.isDebug()) {
      var json = connection.toJSON();
      logger.debug(f('cmd [%s] about to be executed on connection with id %s at %s:%s', JSON.stringify(cmd), json.id, json.host, json.port));
    }

    // Set slave OK
    query.slaveOk = slaveOk(options.readPreference);

    // Bind to current domain
    callback = bindToCurrentDomain(callback);

    // Notify query start to any read Preference strategies
    if(readPreferenceStrategies != null)
      notifyStrategies('startOperation', [self, query, new Date()]);

    // Double check if we have a valid connection
    if(!connection.isConnected()) {
      return callback(new MongoError(f("no connection available to server %s", self.name)));
    }

    // Register the callback
    callbacks.once(query.requestId, function(err, result) {
      // Notify end of command
      notifyStrategies('endOperation', [self, err, result, new Date()]);
      if(err) return callback(err);
      callback(null, new CommandResult(result.documents[0], connection));
    });

    // Execute the query
    connection.write(query);
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
    if(fallback && ismaster.minWireVersion == null) return fallback.insert(ismaster, ns, bson, pool, callbacks, ops, options, callback);
    executeWrite(this, 'insert', 'documents', ns, ops, options, callback);
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
    if(fallback && ismaster.minWireVersion == null) return fallback.update(ismaster, ns, bson, pool, callbacks, ops, options, callback);
    executeWrite(this, 'update', 'updates', ns, ops, options, callback);
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
    if(fallback && ismaster.minWireVersion == null) return fallback.remove(ismaster, ns, bson, pool, callbacks, ops, options, callback);
    executeWrite(this, 'delete', 'deletes', ns, ops, options, callback);
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
    if(authProviders[mechanism] == null) throw new MongoError(f("auth provider %s does not exist", mechanism));
    
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
  // }  
  // // Options
  // {
  //     raw: <boolean>
  //   , readPreference: <ReadPreference>
  //   , maxTimeMS: <n>
  //   , tailable: <boolean>
  //   , oplogReply: <boolean>
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
   * @param {boolean} [options.tailable=false] Tailable flag set
   * @param {boolean} [options.oplogReply=false] oplogReply flag set
   * @param {boolean} [options.awaitdata=false] awaitdata flag set
   * @param {boolean} [options.exhaust=false] exhaust flag set
   * @param {boolean} [options.partial=false] partial flag set
   * @param {opResultCallback} callback A callback function
   */
  this.cursor = function(ns, cmd, options) {
    options = options || {};
    return new Cursor(bson, ns, cmd, options.connection ? options.connection : pool.get(), callbacks, options || {});
  }

  var slaveOk = function(r) {
    if(r) return r.slaveOk()
    return false;
  }
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