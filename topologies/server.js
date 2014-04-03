var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter
  , Pool = require('../connection/pool')
  , b = require('bson')
  , Query = require('../connection/commands').Query
  , MongoError = require('../error')
  , ReadPreference = require('./read_preference')
  , Cursor = require('../cursor')
  , CommandResult = require('./command_result')
  , BSON = require('bson').native().BSON;

// All bson types
var bsonTypes = [b.Long, b.ObjectID, b.Binary, b.Code, b.DBRef, b.Symbol, b.Double, b.Timestamp, b.MaxKey, b.MinKey];

// Single store for all callbacks
var Callbacks = function() {
  EventEmitter.call(callbacks);
}

inherits(Callbacks, EventEmitter);

var callbacks = new Callbacks;

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
 * Server implementation
 */
var Server = function(options) {
  var self = this;
  
  // Add event listener
  EventEmitter.call(this);
  
  // Reconnect option
  var reconnect = typeof options.reconnect == 'boolean' ? options.reconnect :  true;
  var reconnectTries = options.reconnectTries || 30;
  var reconnectInterval = options.reconnectInterval || 1000;

  // Current state
  var currentReconnectRetry = reconnectTries;
  // Contains the ismaster
  var ismaster = null;
  // Contains any alternate strategies for picking
  var readPreferenceStrategies = null;
  // Auth providers
  var authProviders = options.authProviders || {};

  // Let's get the bson parser if none is passed in
  if(options.bson == null) {
    options.bson = new BSON(bsonTypes);
  }

  // Save bson
  var bson = options.bson;

  // Internal connection pool
  var pool = null;

  //
  // Reconnect server
  var reconnectServer = function() {
    // Set the max retries
    currentReconnectRetry = reconnectTries;

    // Error out any current callbacks
    for(var id in callbacks._events) {
      var executeError = function(_id, _callbacks) {
        process.nextTick(function() {
          _callbacks.emit(_id, new MongoError(f("server %s:%s closed the socket", options.host, options.port)), null);
        });
      }

      executeError(id, callbacks);
    }

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
      ['error', 'close', 'timeout'].forEach(function(e) {
        pool.removeAllListeners(e);
      })

      // Add proper handlers
      pool.on('error', errorHandler);
      pool.on('close', closeHandler);
      pool.on('timeout', timeoutHandler);
      pool.on('message', messageHandler);

      // We need to ensure we have re-authenticated
      var keys = Object.keys(authProviders);
      if(keys.length == 0) return self.emit("reconnect", self);

      // Execute all providers
      var count = keys.length;
      // Iterate over keys
      for(var i = 0; i < keys.length; i++) {
        authProviders[keys[i]].reauthenticate(self, pool, function(err, r) {
          count = count - 1;
          // We are done, emit reconnect event
          if(count == 0) {
            return self.emit("reconnect", self);
          }
        });
      }
    });

    //
    // Handle connection failure
    pool.once('error', errorHandler);
    pool.once('close', errorHandler);
    pool.once('timeout', errorHandler);

    // Connect pool
    pool.connect();
  }

  //
  // Handlers
  var messageHandler = function(response, connection) {
    callbacks.emit(response.responseTo, null, response);
  }

  var errorHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('error', [self]);
    self.destroy();
    self.emit('error', err, self);
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
  }

  var timeoutHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('timeout', [self]);
    self.destroy();
    self.emit('timeout', err, self);
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
  }

  var closeHandler = function(err, connection) {
    if(readPreferenceStrategies != null) notifyStrategies('close', [self]);
    self.destroy();
    self.emit('close', err, self);
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
  }

  var connectHandler = function(connection) {
    if(readPreferenceStrategies != null) notifyStrategies('connect', [self]);
    // Execute an ismaster
    self.command('system.$cmd', {ismaster:true}, function(err, r) {
      if(!err) ismaster = r.result;

      // Apply any authentications
      applyAuthentications(function() {
        self.emit('connect', self);
      })
    });
  }

  // Return last IsMaster document
  this.lastIsMaster = function() {
    return ismaster;
  }

  // connect
  this.connect = function() {
    // Destroy existing pool
    if(pool) {
      pool.destroy();
    }

    // Create a new connection pool
    pool = new Pool(options);
    // Add all the event handlers
    pool.on('timeout', timeoutHandler);
    pool.on('close', closeHandler);
    pool.on('error', errorHandler);
    pool.on('message', messageHandler);
    pool.on('connect', connectHandler);
    // Connect the pool
    pool.connect(); 
  }

  // destroy the server instance
  this.destroy = function() {
    // Destroy all event emitters
    ["close", "message", "error", "timeout", "connect"].forEach(function(e) {
      pool.removeAllListeners(e);
    });

    // Close pool
    pool.destroy();
  }

  // is the server connected
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
    var ordered = options.ordered || true;
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
  var notifyStrategies = function(op, params) {
    // Notify query start to any read Preference strategies
    for(var name in readPreferenceStrategies) {
      if(readPreferenceStrategies[name][op]) {
        var strat = readPreferenceStrategies[name];
        strat[op].apply(strat, params);
      }
    }
  }

  // Execute a command
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }
    
    // Ensure we have no options
    options = options || {};

    // If we have no connection error
    if(!pool.isConnected()) return callback(new MongoError("no connection available to server %s:%s", options.host, options.port));
    
    // Get a connection (either passed or from the pool)
    var connection = options.connection || pool.get();

    // Create a query instance
    var query = new Query(bson, ns, cmd, {
      numberToSkip: 0, numberToReturn: -1, checkKeys: false
    });

    // Set slave OK
    query.slaveOk = slaveOk(options.readPreference);

    // Bind to current domain
    bindToCurrentDomain(callback);

    // Notify query start to any read Preference strategies
    if(readPreferenceStrategies != null)
      notifyStrategies('startOperation', [self, query, new Date()]);

    // Register the callback
    callbacks.once(query.requestId, function(err, result) {
      // Notify end of command
      notifyStrategies('startOperation', [self, err, result, new Date()]);

      if(err) return callback(err);
      callback(null, new CommandResult(result.documents[0], connection));
    });

    // Execute the query
    connection.write(query);
  }

  // Execute a write
  this.insert = function(ns, ops, options, callback) {
    executeWrite(this, 'insert', 'documents', ns, ops, options, callback);
  }

  // Execute a write
  this.update = function(ns, ops, options, callback) {
    executeWrite(this, 'update', 'updates', ns, ops, options, callback);
  }

  // Execute a write
  this.remove = function(ns, ops, options, callback) {
    executeWrite(this, 'delete', 'deletes', ns, ops, options, callback);
  }

  // Authentication method
  this.auth = function(mechanism, db) {
    var args = Array.prototype.slice.call(arguments, 2);
    var callback = args.pop();
    // If we don't have the mechanism fail
    if(authProviders[mechanism] == null) throw new MongoError(f("auth provider %s does not exist", mechanism));
    // Actual arguments
    var finalArguments = [self, pool, db].concat(args.slice(0)).concat([callback]);
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

  // Add additional picking strategy
  this.addReadPreferenceStrategy = function(name, strategy) {
    if(readPreferenceStrategies == null) readPreferenceStrategies = {};
    readPreferenceStrategies[name] = strategy;
  }

  this.addAuthProvider = function(name, provider) {
    authProviders[name] = provider;
  }

  // Match
  this.equal = function(server) {    
    if(ismaster == null) return false;
    if(server instanceof Server) {
      return server.lastIsMaster().me == ismaster.me;
    }

    if(typeof server == 'string') {
      return server == ismaster.me; 
    }

    return false;
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
  //   , byMongos: <boolean>
  //   , tailable: <boolean>
  //   , oplogReply: <boolean>
  //   , noCursorTimeout: <boolean>
  //   , awaitdata: <boolean>
  //   , exhaust: <boolean>
  //   , partial: <boolean>
  // }

  // Create a cursor for the command
  this.cursor = function(ns, cmd, options) {
    options = options || {};
    return new Cursor(bson, ns, cmd, options, pool.get(), callbacks, options);
  }

  var slaveOk = function(r) {
    if(r == 'secondary' || r =='secondaryPreferred') return true;
    return false;
  }
}

inherits(Server, EventEmitter);

module.exports = Server;