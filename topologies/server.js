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

  // Let's get the bson parser if none is passed in
  if(options.bson == null) {
    options.bson = new BSON(bsonTypes);
  }

  // Save bson
  var bson = options.bson;

  // Internal connection pool
  var pool = new Pool(options);

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
      pool.removeAllListeners('error');
      pool.removeAllListeners('close');
      pool.removeAllListeners('timeout');

      // Add proper handlers
      pool.on('error', errorHandler);
      pool.on('close', closeHandler);
      pool.on('timeout', timeoutHandler);
      pool.on('message', messageHandler);

      // Emit reconnect event
      self.emit("reconnect", self);
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
    self.destroy();
    self.emit('error', err, self);
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
  }

  var timeoutHandler = function(err, connection) {
    self.destroy();
    self.emit('timeout', err, self);
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
  }

  var closeHandler = function(err, connection) {
    self.destroy();
    self.emit('close', err, self);
    if(reconnect) setTimeout(function() { reconnectServer() }, reconnectInterval);
  }

  var connectHandler = function(connection) {
    self.emit("connect", self);
  }

  // connect
  this.connect = function() {
    // Connect the pool
    pool.connect(); 
    // Add all the event handlers
    pool.on('timeout', timeoutHandler);
    pool.on('close', closeHandler);
    pool.on('error', errorHandler);
    pool.on('message', messageHandler);
    pool.on('connect', connectHandler);
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

  // Execute a command
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }
    
    // Ensure we have no options
    options = options || {};
    // Create a query instance
    var query = new Query(bson, ns, cmd, {
      numberToSkip: 0, numberToReturn: -1, checkKeys: false
    });

    // Set slave OK
    query.slaveOk = slaveOk(options.readPreference);

    // If we have no connection error
    if(!pool.isConnected()) return callback(new MongoError("no connection available to server %s:%s", options.host, options.port));
    
    // Get a connection
    var connection = pool.get()   

    // Bind to current domain
    bindToCurrentDomain(callback);

    // Register the callback
    callbacks.once(query.requestId, function(err, result) {
      if(err) return callback(err);
      callback(null, new CommandResult(result.documents[0], connection));
    });

    // Execute the query
    connection.write(query);
  }

  // Are we connected
  this.isConnected = function() {
    return pool.isConnected();
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