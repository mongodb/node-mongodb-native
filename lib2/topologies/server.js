"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  BSON = require('bson').native().BSON,
  ReadPreference = require('./read_preference'),
  Logger = require('../connection/logger'),
  debugOptions = require('../connection/utils').debugOptions,
  Pool = require('../connection/pool'),
  Query = require('../connection/commands').Query,
  MongoError = require('../error'),
  PreTwoSixWireProtocolSupport = require('../wireprotocol/2_4_support'),
  TwoSixWireProtocolSupport = require('../wireprotocol/2_6_support'),
  ThreeTwoWireProtocolSupport = require('../wireprotocol/3_2_support'),
  BasicCursor = require('../cursor');

// Used for filtering out fields for loggin
var debugFields = ['reconnect', 'reconnectTries', 'reconnectInterval', 'emitError', 'cursorFactory', 'host'
  , 'port', 'size', 'keepAlive', 'keepAliveInitialDelay', 'noDelay', 'connectionTimeout', 'checkServerIdentity'
  , 'socketTimeout', 'singleBufferSerializtion', 'ssl', 'ca', 'cert', 'key', 'rejectUnauthorized', 'promoteLongs'];

// Server instance id
var id = 0;
var serverAccounting = false;
var servers = {};

var Server = function(options) {
  options = options || {};

  // Add event listener
  EventEmitter.call(this);

  // Server instance id
  this.id = id++;
  // console.log("**** CREATE SERVER :: " + this.id)
  // console.dir(options)

  // Internal state
  this.s = {
    // Options
    options: options,
    // Logger
    logger: Logger('Server', options),
    // Factory overrides
    Cursor: options.cursorFactory || BasicCursor,
    // BSON instance
    bson: options.bson || new BSON(),
    // Pool
    pool: null,
    // Disconnect handler
    disconnectHandler: options.disconnectHandler,
    // Monitor thread (keeps the connection alive)
    monitoring: typeof options.monitoring == 'boolean' ? options.monitoring : true,
    // Monitoring timeout
    monitoringInterval: typeof options.monitoringInterval == 'number'
      ? options.monitoringInterval
      : 5000
  }

  // console.dir(this.s)

  // Curent ismaster
  this.ismaster = null;
  // Current ping time
  this.lastIsMasterMS = -1;
  // The monitoringProcessId
  this.monitoringProcessId = null;
}

inherits(Server, EventEmitter);

Server.enableServerAccounting = function() {
  serverAccounting = true;
  servers = {};
}

Server.disableServerAccounting = function() {
  serverAccounting = false;
}

Server.servers = function() {
  return servers;
}

Object.defineProperty(Server.prototype, 'name', {
  enumerable:true,
  get: function() { return this.s.options.host + ":" + this.s.options.port; }
});

function configureWireProtocolHandler(self, ismaster) {
  // 3.2 wire protocol handler
  if(ismaster.maxWireVersion >= 4) {
    return new ThreeTwoWireProtocolSupport(new TwoSixWireProtocolSupport());
  }

  // 2.6 wire protocol handler
  if(ismaster.maxWireVersion >= 2) {
    return new TwoSixWireProtocolSupport();
  }

  // 2.4 or earlier wire protocol handler
  return new PreTwoSixWireProtocolSupport();
}

function monitoringProcess(self) {
  return function() {
    // console.log("#### monitoringProcess :: " + self.id)
    // Pool was destroyed do not continue process
    if(self.s.pool.isDestroyed()) return;
    // console.log("#### monitoringProcess 1")
    // Emit monitoring Process event
    self.emit('monitoring', self);
    // console.log("#### monitoringProcess 2")
    // Perform ismaster call
    // Query options
    var queryOptions = { numberToSkip: 0, numberToReturn: -1, checkKeys: false, slaveOk: true };
    // Create a query instance
    var query = new Query(self.s.bson, 'admin.$cmd', {ismaster:true}, queryOptions);
    // console.log("#### monitoringProcess 3")
    // Execute the ismaster query
    self.s.pool.write(query.toBin(), {}, function(err, result) {
      // console.log("#### monitoringProcess 4")
      if(self.s.pool.isDestroyed()) return;
      // console.log("#### monitoringProcess 5")
      // Update the ismaster view if we have a result
      if(result) {
        self.ismaster = result.result;
      }
      // console.dir("=========== EXECUTE")
      // Re-schedule the monitoring process
      self.monitoringProcessId = setTimeout(monitoringProcess(self), self.s.monitoringInterval);
    });
  }
}

var eventHandler = function(self, event) {
  return function(err) {
    // console.log("========== server :: eventHandler :: " + event)
    if(event == 'connect') {
      // Issue an ismaster command at connect
      // Query options
      var queryOptions = { numberToSkip: 0, numberToReturn: -1, checkKeys: false, slaveOk: true };
      // Create a query instance
      var query = new Query(self.s.bson, 'admin.$cmd', {ismaster:true}, queryOptions);
      // Execute the ismaster query
      self.s.pool.write(query.toBin(), {}, function(err, result) {
        if(err) {
          self.destroy();
          if(self.listeners('error').length > 0) self.emit('error', err);
          return;
        }

        // Save the ismaster
        self.ismaster = result.result;
        // Add the correct wire protocol handler
        self.wireProtocolHandler = configureWireProtocolHandler(self, self.ismaster);
        // Have we defined self monitoring
        if(self.s.monitoring) {
          // console.log("%%%%%%%%%%%%%%%%%% :: " + self.s.monitoringInterval)
          self.monitoringProcessId = setTimeout(monitoringProcess(self), self.s.monitoringInterval);
        }
        // Emit connect
        self.emit('connect', self);
      });
    } else if(event == 'error' || event == 'parseError'
      || event == 'close' || event == 'timeout' || event == 'reconnect'
      || event == 'attemptReconnect') {

      // Remove server instance from accounting
      if(serverAccounting && ['close', 'timeout', 'error', 'parseError'].indexOf(event) != -1) {
        delete servers[this.id];
      }

      // Emit the event
      self.emit(event, err);
    }
  }
}

Server.prototype.connect = function(options) {
  var self = this;
  options = options || {};

  // Set the connections
  if(serverAccounting) servers[this.id] = this;

//   if(self.s.pool) {
//   console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Server.prototype.connect")
//   console.dir(self.s.pool.state)
// }

  // Do not allow connect to be called on anything that's not disconnected
  if(self.s.pool && !self.s.pool.isDisconnected() && !self.s.pool.isDestroyed()) {
    throw MongoError.create(f('server instance in invalid state %s', self.s.state));
  }

  // Create a pool
  self.s.pool = new Pool(Object.assign(self.s.options, options, {bson: this.s.bson}));

  // Set up listeners
  self.s.pool.on('close', eventHandler(self, 'close'));
  self.s.pool.on('error', eventHandler(self, 'error'));
  self.s.pool.on('timeout', eventHandler(self, 'timeout'));
  self.s.pool.on('parseError', eventHandler(self, 'parseError'));
  self.s.pool.on('connect', eventHandler(self, 'connect'));
  self.s.pool.on('reconnect', eventHandler(self, 'reconnect'));

  // Connect with optional auth settings
  self.s.pool.connect(options.auth)
}

Server.prototype.getDescription = function() {
  var self = this;
}

Server.prototype.lastIsMaster = function() {
  return this.ismaster;
}

Server.prototype.isMasterLatencyMS = function() {
}

Server.prototype.unref = function() {
  // this.s.pool.unref();
}

Server.prototype.isConnected = function() {
  if(!this.s.pool) return false;
  return this.s.pool.isConnected();
}

Server.prototype.isDestroyed = function() {
  if(!this.s.pool) return false;
  return this.s.pool.isDestroyed();
}

function basicWriteValidations(self, options) {
  if(!self.s.pool) return MongoError.create('server instance is not connected');
  if(self.s.pool.isDestroyed()) return MongoError.create('server instance pool was destroyed');
}

function basicReadValidations(self, options) {
  basicWriteValidations(self, options);

  if(options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    throw new Error("readPreference must be an instance of ReadPreference");
  }
}

function disconnectHandler(self, type, ns, cmd, options, callback) {
  // console.log("  ^^^ disconnectHandler 0")
  // console.log("  self.s.pool.isConnected() = " + self.s.pool.isConnected())
  // console.log("  self.s.disconnectHandler != null = " + (self.s.disconnectHandler != null))
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.s.pool.isConnected() && self.s.disconnectHandler != null) {
    self.s.disconnectHandler.add(type, ns, cmd, options, callback);
    return true;
  }
  // console.log("  ^^^ disconnectHandler 1")

  // If we have no connection error
  if(!self.s.pool.isConnected()) {
    callback(MongoError.create(f("no connection available to server %s", self.name)));
    return true;
  }

  // console.log("  ^^^ disconnectHandler 2")
}

/**
 * Execute a command
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {object} cmd The command hash
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {Boolean} [options.fullResult=false] Return the full envelope instead of just the result document.
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.command = function(ns, cmd, options, callback) {
  // console.log("== Server:: command ");
  // console.dir(cmd)
  // console.dir(options)
  // console.dir(cmd)
  var self = this;
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  var result = basicReadValidations(self, options);
  if(result) return callback(result);

  // Debug log
  if(self.s.logger.isDebug()) self.s.logger.debug(f('executing command [%s] against %s', JSON.stringify({
    ns: ns, cmd: cmd, options: debugOptions(debugFields, options)
  }), self.name));

  // If we are not connected or have a disconnectHandler specified
  if(disconnectHandler(self, 'command', ns, cmd, options, callback)) return;

  // Query options
  var queryOptions = {
    numberToSkip: 0,
    numberToReturn: -1,
    checkKeys: typeof options.checkKeys == 'boolean' ? options.checkKeys: false,
    serializeFunctions: typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false,
    ignoreUndefined: typeof options.ignoreUndefined == 'boolean' ? options.ignoreUndefined : false
  };

  // Create a query instance
  var query = new Query(self.s.bson, ns, cmd, queryOptions);
  // Set slave OK of the query
  query.slaveOk = options.readPreference ? options.readPreference.slaveOk() : false;

  // Write options
  var writeOptions = {
    raw: typeof options.raw == 'boolean' ? options.raw : false,
    promoteLongs: typeof options.promoteLongs == 'boolean' ? options.promoteLongs : true,
    command: true,
    monitoring: typeof options.monitoring == 'boolean' ? options.monitoring : false,
  };

  // Write the operation to the pool
  self.s.pool.write(query.toBin(), writeOptions, callback);
}

Server.prototype.insert = function(ns, ops, options, callback) {
  var self = this;
  // console.log("== Server:: insert ");
  // console.dir(options)
  // console.dir(ops)
  // console.log("== server.insert")
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  // console.log("== Server:: insert 1");
  var result = basicWriteValidations(self, options);
  // console.log("== Server:: insert 2");
  if(result) return callback(result);
  // console.log("== Server:: insert 3");

  // console.log(options)
  // If we are not connected or have a disconnectHandler specified
  if(disconnectHandler(self, 'insert', ns, ops, options, callback)) return;
  // console.log(options)
  // console.log("== Server:: insert 4");

  // Setup the docs as an array
  ops = Array.isArray(ops) ? ops : [ops];
  // console.log(options)
  // console.log("== Server:: insert 5");

  // Execute write
  return self.wireProtocolHandler.insert(self.s.pool, self.ismaster, ns, self.s.bson, ops, options, callback);
}

Server.prototype.update = function(ns, ops, options, callback) {
  var self = this;
  // console.log("== Server:: update ");
  // console.dir(ops)
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  var result = basicWriteValidations(self, options);
  if(result) return callback(result);

  // If we are not connected or have a disconnectHandler specified
  if(disconnectHandler(self, 'update', ns, ops, options, callback)) return;

  // Setup the docs as an array
  ops = Array.isArray(ops) ? ops : [ops];
  // Execute write
  return self.wireProtocolHandler.update(self.s.pool, self.ismaster, ns, self.s.bson, ops, options, callback);
}

Server.prototype.remove = function(ns, ops, options, callback) {
  var self = this;
  // console.log("== Server:: remove ");
  // console.dir(ops)
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  var result = basicWriteValidations(self, options);
  if(result) return callback(result);

  // If we are not connected or have a disconnectHandler specified
  if(disconnectHandler(self, 'remove', ns, ops, options, callback)) return;

  // Setup the docs as an array
  ops = Array.isArray(ops) ? ops : [ops];
  // Execute write
  return self.wireProtocolHandler.remove(self.s.pool, self.ismaster, ns, self.s.bson, ops, options, callback);
}

/**
 * Get a new cursor
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {{object}|{Long}} cmd Can be either a command returning a cursor or a cursorId
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.cursor = function(ns, cmd, cursorOptions) {
  var s = this.s;
  cursorOptions = cursorOptions || {};
  // Set up final cursor type
  var FinalCursor = cursorOptions.cursorFactory || s.Cursor;
  // Return the cursor
  return new FinalCursor(s.bson, ns, cmd, cursorOptions, this, s.options);
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
  // var args = Array.prototype.slice.call(arguments, 2);

  // If we have the default mechanism we pick mechanism based on the wire
  // protocol max version. If it's >= 3 then scram-sha1 otherwise mongodb-cr
  if(mechanism == 'default' && self.ismaster && self.ismaster.maxWireVersion >= 3) {
    mechanism = 'scram-sha-1';
  } else if(mechanism == 'default') {
    mechanism = 'mongocr';
  }

  // Slice all the arguments off
  var args = Array.prototype.slice.call(arguments, 0);
  // Set the mechanism
  args[0] = mechanism;
  // Apply the arguments to the pool
  self.s.pool.auth.apply(self.s.pool, args);
}
// Server.prototype.addReadPreferenceStrategy = function(name, strategy) {
// Server.prototype.addAuthProvider = function(name, provider) {

Server.prototype.equals = function(server) {
  if(typeof server == 'string') return this.name == server;
  if(server.name) return this.name == server.name;
  return false;
}

Server.prototype.connections = function() {
  return this.s.pool.allConnections();
}

Server.prototype.getServer = function(options) {
  return this;
}

Server.prototype.getServerFrom = function(connection) {
  return this;
}

// Server.prototype.getCallbacks = function() {
//   return this.s.callbacks;
// }

// Server.prototype.parserType = function() {
//   var s = this.s;
//   if(s.options.bson.serialize.toString().indexOf('[native code]') != -1)
//     return 'c++';
//   return 'js';
// }

Server.prototype.getConnection = function(options) {
  return this.s.pool.get();
}

var listeners = ['close', 'error', 'timeout', 'parseError', 'connect'];

Server.prototype.destroy = function() {
  var self = this;

  // Set the connections
  if(serverAccounting) delete servers[this.id];

  // Destroy the monitoring process if any
  if(this.monitoringProcessId) {
    clearTimeout(this.monitoringProcessId);
  }

  // Remove all listeners
  listeners.forEach(function(event) {
    self.s.pool.removeAllListeners(event);
  });

  // Destroy the pool
  this.s.pool.destroy();
}

module.exports = Server;
