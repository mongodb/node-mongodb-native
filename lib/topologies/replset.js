"use strict";

var inherits = require('util').inherits
  , f = require('util').format
  , b = require('bson')
  , bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain
  , debugOptions = require('../connection/utils').debugOptions
  , EventEmitter = require('events').EventEmitter
  , Server = require('./server')
  , ReadPreference = require('./read_preference')
  , MongoError = require('../error')
  , Ping = require('./strategies/ping')
  , Session = require('./session')
  , BasicCursor = require('../cursor')
  , BSON = require('bson').native().BSON
  , State = require('./replset_state')
  , MongoCR = require('../auth/mongocr')
  , X509 = require('../auth/x509')
  , Plain = require('../auth/plain')
  , GSSAPI = require('../auth/gssapi')
  , SSPI = require('../auth/sspi')
  , ScramSHA1 = require('../auth/scram')
  , Logger = require('../connection/logger');

/**
 * @fileOverview The **ReplSet** class is a class that represents a Replicaset topology and is
 * used to construct connecctions.
 *
 * @example
 * var ReplSet = require('mongodb-core').ReplSet
 *   , ReadPreference = require('mongodb-core').ReadPreference
 *   , assert = require('assert');
 *
 * var server = new ReplSet([{host: 'localhost', port: 30000}], {setName: 'rs'});
 * // Wait for the connection event
 * server.on('connect', function(server) {
 *   server.destroy();
 * });
 *
 * // Start connecting
 * server.connect();
 */

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

//
// ReplSet instance id
var replSetId = 1;

//
// Clone the options
var cloneOptions = function(options) {
  var opts = {};
  for(var name in options) {
    opts[name] = options[name];
  }
  return opts;
}

// All bson types
var bsonTypes = [b.Long, b.ObjectID, b.Binary, b.Code, b.DBRef, b.Symbol, b.Double, b.Timestamp, b.MaxKey, b.MinKey];
// BSON parser
var bsonInstance = null;

/**
 * Creates a new Replset instance
 * @class
 * @param {array} seedlist A list of seeds for the replicaset
 * @param {boolean} options.setName The Replicaset set name
 * @param {boolean} [options.secondaryOnlyConnectionAllowed=false] Allow connection to a secondary only replicaset
 * @param {number} [options.haInterval=10000] The High availability period for replicaset inquiry
 * @param {boolean} [options.emitError=false] Server will emit errors events
 * @param {Cursor} [options.cursorFactory=Cursor] The cursor factory class used for all query cursors
 * @param {number} [options.size=5] Server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=0] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=10000] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {number} [options.monitoringSocketTimeout=30000] TCP Socket timeout setting for replicaset monitoring socket
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @param {number} [options.pingInterval=5000] Ping interval to check the response time to the different servers
 * @param {number} [options.acceptableLatency=250] Acceptable latency for selecting a server for reading (in milliseconds)
 * @return {ReplSet} A cursor instance
 * @fires ReplSet#connect
 * @fires ReplSet#ha
 * @fires ReplSet#joined
 * @fires ReplSet#left
 */
var ReplSet = function(seedlist, options) {
  var self = this;
  options = options || {};
  // Clone the options
  options = cloneOptions(options);

  // Validate seedlist
  if(!Array.isArray(seedlist)) throw new MongoError("seedlist must be an array");
  // Validate list
  if(seedlist.length == 0) throw new MongoError("seedlist must contain at least one entry");
  // Validate entries
  seedlist.forEach(function(e) {
    if(typeof e.host != 'string' || typeof e.port != 'number')
      throw new MongoError("seedlist entry must contain a host and port");
  });

  // Add event listener
  EventEmitter.call(this);

  // Set the bson instance
  bsonInstance = bsonInstance == null ? new BSON(bsonTypes) : bsonInstance;

  // Internal state hash for the object
  this.s = {
      options: options
    // Logger instance
    , logger: Logger('ReplSet', options)
    // Uniquely identify the replicaset instance
    , id: replSetId++
    // Index
    , index: 0
    // Ha Index
    , haId: 0
    // Current credentials used for auth
    , credentials: []
    // Factory overrides
    , Cursor: options.cursorFactory || BasicCursor
    // BSON Parser, ensure we have a single instance
    , bsonInstance: bsonInstance
    // Pick the right bson parser
    , bson: options.bson ? options.bson : bsonInstance
    // Special replicaset options
    , secondaryOnlyConnectionAllowed: typeof options.secondaryOnlyConnectionAllowed == 'boolean'
    ? options.secondaryOnlyConnectionAllowed : false
    , haInterval: options.haInterval || 10000
    // Current haInterval
    , currentHaInterval: options.haInterval || 10000
    // Are we running in debug mode
    , debug: typeof options.debug == 'boolean' ? options.debug : false
    // The replicaset name
    , setName: options.setName
    // Swallow or emit errors
    , emitError: typeof options.emitError == 'boolean' ? options.emitError : false
    // Grouping tag used for debugging purposes
    , tag: options.tag
    // Do we have a not connected handler
    , disconnectHandler: options.disconnectHandler
    // Contains any alternate strategies for picking
    , readPreferenceStrategies: {}
    // Auth providers
    , authProviders: {}
    // All the servers
    , disconnectedServers: []
    // Initial connection servers
    , initialConnectionServers: []
    // High availability process running
    , highAvailabilityProcessRunning: false
    // Full setup
    , fullsetup: false
    // All servers accounted for (used for testing)
    , all: false
    // Seedlist
    , seedlist: seedlist
    // Authentication in progress
    , authInProgress: false
    // Servers added while auth in progress
    , authInProgressServers: []
    // Minimum heartbeat frequency used if we detect a server close
    , minHeartbeatFrequencyMS: 500
    // stores high availability timer to allow efficient destroy
    , haTimer : null
  }

  // Add bson parser to options
  options.bson = this.s.bson;
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 10000;

  // Replicaset state
  var replState = new State(this, {
      id: this.s.id, setName: this.s.setName
    // , connectingServers: this.s.connectingServers
    , secondaryOnlyConnectionAllowed: this.s.secondaryOnlyConnectionAllowed
  });

  // Add Replicaset state to our internal state
  this.s.replState = replState;

  // Add the authentication mechanisms
  this.addAuthProvider('mongocr', new MongoCR());
  this.addAuthProvider('x509', new X509());
  this.addAuthProvider('plain', new Plain());
  this.addAuthProvider('gssapi', new GSSAPI());
  this.addAuthProvider('sspi', new SSPI());
  this.addAuthProvider('scram-sha-1', new ScramSHA1());

  // BSON property (find a server and pass it along)
  Object.defineProperty(this, 'bson', {
    enumerable: true, get: function() {
      var servers = self.s.replState.getAll();
      return servers.length > 0 ? servers[0].bson : null;
    }
  });

  Object.defineProperty(this, 'id', {
    enumerable:true, get: function() { return self.s.id; }
  });

  Object.defineProperty(this, 'haInterval', {
    enumerable:true, get: function() { return self.s.haInterval; }
  });

  Object.defineProperty(this, 'state', {
    enumerable:true, get: function() { return self.s.replState; }
  });

  //
  // Debug options
  if(self.s.debug) {
    // Add access to the read Preference Strategies
    Object.defineProperty(this, 'readPreferenceStrategies', {
      enumerable: true, get: function() { return self.s.readPreferenceStrategies; }
    });
  }

  Object.defineProperty(this, 'type', {
    enumerable:true, get: function() { return 'replset'; }
  });

  // Add the ping strategy for nearest
  this.addReadPreferenceStrategy('nearest', new Ping(options));
}

inherits(ReplSet, EventEmitter);

//
// Plugin methods
//

/**
 * Add custom read preference strategy
 * @method
 * @param {string} name Name of the read preference strategy
 * @param {object} strategy Strategy object instance
 */
ReplSet.prototype.addReadPreferenceStrategy = function(name, func) {
  this.s.readPreferenceStrategies[name] = func;
}

/**
 * Add custom authentication mechanism
 * @method
 * @param {string} name Name of the authentication mechanism
 * @param {object} provider Authentication object instance
 */
ReplSet.prototype.addAuthProvider = function(name, provider) {
  if(this.s.authProviders == null) this.s.authProviders = {};
  this.s.authProviders[name] = provider;
}

/**
 * Name of BSON parser currently used
 * @method
 * @return {string}
 */
ReplSet.prototype.parserType = function() {
  if(this.s.bson.serialize.toString().indexOf('[native code]') != -1)
    return 'c++';
  return 'js';
}

/**
 * Execute a command
 * @method
 * @param {string} type Type of BSON parser to use (c++ or js)
 */
ReplSet.prototype.setBSONParserType = function(type) {
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
ReplSet.prototype.lastIsMaster = function() {
  return this.s.replState.lastIsMaster();
}

/**
 * Get connection
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {Connection}
 */
ReplSet.prototype.getConnection = function(options) {
  // Ensure we have no options
  options = options || {};
  // Pick the right server based on readPreference
  var server = pickServer(this, this.s, options.readPreference);
  if(server == null) return null;
  // Return connection
  return server.getConnection();
}

/**
 * All raw connections
 * @method
 * @return {Connection[]}
 */
ReplSet.prototype.connections = function() {
  return this.s.replState.getAllConnections({includeArbiters:true});
}

/**
 * Get server
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {Server}
 */
ReplSet.prototype.getServer = function(options) {
  // Ensure we have no options
  options = options || {};
  // Pick the right server based on readPreference
  return pickServer(this, this.s, options.readPreference);
}

/**
 * Get correct server for a given connection
 * @method
 * @param {Connection} [connection] A Connection showing a current server
 * @return {Server}
 */
ReplSet.prototype.getServerFrom = function(connection) {
  var servers = this.s.replState.getAll();
  // Go through all the server
  for(var i = 0; i < servers.length; i++) {
    if(servers[i].equals(connection.name)) return servers[i];
  }

  return null;
}

/**
 * Perform one or more remove operations
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
ReplSet.prototype.cursor = function(ns, cmd, cursorOptions) {
  cursorOptions = cursorOptions || {};
  var FinalCursor = cursorOptions.cursorFactory || this.s.Cursor;
  return new FinalCursor(this.s.bson, ns, cmd, cursorOptions, this, this.s.options);
}

//
// Execute write operation
var executeWriteOperation = function(self, op, ns, ops, options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  var server = null;
  // Ensure we have no options
  options = options || {};
  // Get a primary
  try {
    server = pickServer(self, self.s, ReadPreference.primary);
    if(self.s.debug) self.emit('pickedServer', ReadPreference.primary, server);
  } catch(err) {
    return callback(err);
  }

  // No server returned we had an error
  if(server == null) return callback(new MongoError("no server found"));

  // Handler
  var handler = function(err, r) {
    // We have a no master error, immediately refresh the view of the replicaset
    if((notMasterError(r) || notMasterError(err)) && !self.s.highAvailabilityProcessRunning) {
      // Set he current interval to minHeartbeatFrequencyMS
      self.s.currentHaInterval = self.s.minHeartbeatFrequencyMS;
      // Attempt to locate the current master immediately
      replicasetInquirer(self, self.s, true)();
    }
    // Return the result
    callback(err, r);
  }

  // Add operationId if existing
  if(callback.operationId) handler.operationId = callback.operationId;
  // Execute the command
  server[op](ns, ops, options, handler);
}

/**
 * Execute a command
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {object} cmd The command hash
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {Connection} [options.connection] Specify connection object to execute command against
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.command = function(ns, cmd, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.replState.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  var server = null;
  var self = this;
  // Ensure we have no options
  options = options || {};

  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected(options) && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  // We need to execute the command on all servers
  if(options.onAll) {
    var servers = this.s.replState.getAll();
    var count = servers.length;
    var cmdErr = null;

    for(var i = 0; i < servers.length; i++) {
      servers[i].command(ns, cmd, options, function(err, r) {
        count = count - 1;
        // Finished executing command
        if(count == 0) {
          // Was it a logout command clear any credentials
          if(cmd.logout) clearCredentials(self.s, ns);
          // We have a no master error, immediately refresh the view of the replicaset
          if((notMasterError(r) || notMasterError(err)) && !self.s.highAvailabilityProcessRunning) {
            replicasetInquirer(self, self.s, true)();
          }

          // Return the error
          callback(err, r);
        }
      });
    }

    return;
  }

  // Pick the right server based on readPreference
  try {
    server = pickServer(self, self.s, options.writeConcern ? ReadPreference.primary : options.readPreference);
    if(self.s.debug) self.emit('pickedServer', options.writeConcern ? ReadPreference.primary : options.readPreference, server);
  } catch(err) {
    return callback(err);
  }

  // No server returned we had an error
  if(server == null) return callback(new MongoError("no server found"));
  // Execute the command
  server.command(ns, cmd, options, function(err, r) {
    // Was it a logout command clear any credentials
    if(cmd.logout) clearCredentials(self.s, ns);
    // We have a no master error, immediately refresh the view of the replicaset
    if((notMasterError(r) || notMasterError(err)) && !self.s.highAvailabilityProcessRunning) {
      replicasetInquirer(self, self.s, true)();
    }
    // Return the error
    callback(err, r);
  });
}

/**
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of removes
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.remove = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.replState.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected() && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('remove', ns, ops, options, callback);
  }

  executeWriteOperation(this, 'remove', ns, ops, options, callback);
}

/**
 * Insert one or more documents
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of documents to insert
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.insert = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.replState.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected() && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  executeWriteOperation(this, 'insert', ns, ops, options, callback);
}

/**
 * Perform one or more update operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of updates
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.update = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.replState.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected() && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('update', ns, ops, options, callback);
  }

  executeWriteOperation(this, 'update', ns, ops, options, callback);
}

/**
 * Authenticate using a specified mechanism
 * @method
 * @param {string} mechanism The Auth mechanism we are invoking
 * @param {string} db The db we are invoking the mechanism against
 * @param {...object} param Parameters for the specific mechanism
 * @param {authResultCallback} callback A callback function
 */
ReplSet.prototype.auth = function(mechanism, db) {
  var allArgs = Array.prototype.slice.call(arguments, 0).slice(0);
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  var callback = args.pop();

  // If we don't have the mechanism fail
  if(this.s.authProviders[mechanism] == null && mechanism != 'default') {
    throw new MongoError(f("auth provider %s does not exist", mechanism));
  }

  // Authenticate against all the servers
  var servers = this.s.replState.getAll().slice(0);
  var count = servers.length;
  // Correct authentication
  var authenticated = true;
  var authErr = null;
  // Set auth in progress
  this.s.authInProgress = true;

  // Authenticate against all servers
  while(servers.length > 0) {
    var server = servers.shift();

    // Arguments without a callback
    var argsWithoutCallback = [mechanism, db].concat(args.slice(0));
    // Create arguments
    var finalArguments = argsWithoutCallback.concat([function(err, r) {
      count = count - 1;
      if(err) authErr = err;
      if(!r) authenticated = false;

      // We are done
      if(count == 0) {
        // We have more servers that are not authenticated, let's authenticate
        if(self.s.authInProgressServers.length > 0) {
          self.s.authInProgressServers = [];
          return self.auth.apply(self, [mechanism, db].concat(args).concat([callback]));
        }

        // Auth is done
        self.s.authInProgress = false;
        // Add successful credentials
        if(authErr == null) addCredentials(self.s, db, argsWithoutCallback);
        // Return the auth error
        if(authErr) return callback(authErr, false);
        // Successfully authenticated session
        callback(null, new Session({}, self));
      }
    }]);

    // Execute the auth
    server.auth.apply(server, finalArguments);
  }
}

ReplSet.prototype.state = function() {
  return this.s.replState.state;
}

/**
 * Ensure single socket connections to arbiters and hidden servers
 * @method
 */
var handleIsmaster = function(self) {
  return function(ismaster, _server) {
    if(ismaster.arbiterOnly) {
      _server.s.options.size = 1;
    } else if(ismaster.hidden) {
      _server.s.options.size = 1;
    }
  }
}

/**
 * Emit event if it exists
 * @method
 */
function emitSDAMEvent(self, event, description) {
  if(self.listeners(event).length > 0) {
    self.emit(event, description);
  }
}

/**
 * Initiate server connect
 * @method
 */
ReplSet.prototype.connect = function(_options) {
  var self = this;
  // Start replicaset inquiry process
  setHaTimer(self, self.s);
  // Additional options
  if(_options) for(var name in _options) this.s.options[name] = _options[name];

  // Set the state as connecting
  this.s.replState.state = CONNECTING;

  // No fullsetup reached
  this.s.fullsetup = false;

  // Reset the replState
  this.s.replState.resetDescription();

  // For all entries in the seedlist build a server instance
  this.s.seedlist.forEach(function(e) {
    // Clone options
    var opts = cloneOptions(self.s.options);
    // Add host and port
    opts.host = e.host;
    opts.port = e.port;
    opts.reconnect = false;
    opts.readPreferenceStrategies = self.s.readPreferenceStrategies;
    opts.emitError = true;
    // Add a reserved connection for monitoring
    opts.size = opts.size + 1;
    opts.monitoring = true;
    opts.topologyId = self.s.id;
    // Server is in topology
    opts.inTopology = true;
    // Set up tags if any
    if(self.s.tag) opts.tag = self.s.tag;
    // Share the auth store
    opts.authProviders = self.s.authProviders;
    // Create a new Server
    var server = new Server(opts);
    // Handle the ismaster
    server.on('ismaster', handleIsmaster(self));
    // Add to list of disconnected servers
    self.s.disconnectedServers.push(server);
    // Add to list of inflight Connections
    self.s.initialConnectionServers.push(server);
  });

  // Emit the topology opening event
  emitSDAMEvent(this, 'topologyOpening', { topologyId: this.s.id });

  // Attempt to connect to all the servers
  while(this.s.disconnectedServers.length > 0) {
    // Get the server
    var server = self.s.disconnectedServers.shift();
    // Ensure the server is properly disconnected
    server.destroy();

    // Set up the event handlers
    server.once('error', errorHandlerTemp(self, self.s, 'error'));
    server.once('close', errorHandlerTemp(self, self.s, 'close'));
    server.once('timeout', errorHandlerTemp(self, self.s, 'timeout'));
    server.once('connect', connectHandler(self, self.s, false));

    // SDAM Monitoring events
    server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
    server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
    server.on('serverHeartbeatStarted', function(e) { self.emit('serverHeartbeatStarted', e); });
    server.on('serverHeartbeatSucceeded', function(e) { self.emit('serverHeartbeatSucceeded', e); });
    server.on('serverHearbeatFailed', function(e) { self.emit('serverHearbeatFailed', e); });
    server.on('serverClosed', function(e) { self.emit('serverClosed', e); });

    // Ensure we schedule the opening of new socket
    // on separate ticks of the event loop
    var execute = function(_server) {
      // Attempt to connect
      process.nextTick(function() {
        _server.connect();
      });
    }

    execute(server);
  }
}

/**
 * Figure out if the server is connected
 * @method
 * @return {boolean}
 */
ReplSet.prototype.isConnected = function(options) {
  options = options || {};
  // If we specified a read preference check if we are connected to something
  // than can satisfy this
  if(options.readPreference
    && options.readPreference.equals(ReadPreference.secondary)) {
    return this.s.replState.isSecondaryConnected();
  }

  if(options.readPreference
    && options.readPreference.equals(ReadPreference.primary)) {
    return this.s.replState.isPrimaryConnected();
  }

  if(options.readPreference
    && options.readPreference.equals(ReadPreference.primaryPreferred)) {
    return this.s.replState.isSecondaryConnected() || this.s.replState.isPrimaryConnected();
  }

  if(options.readPreference
    && options.readPreference.equals(ReadPreference.secondaryPreferred)) {
    return this.s.replState.isSecondaryConnected() || this.s.replState.isPrimaryConnected();
  }

  if(this.s.secondaryOnlyConnectionAllowed
    && this.s.replState.isSecondaryConnected()) {
      return true;
  }

  return this.s.replState.isPrimaryConnected();
}

/**
 * Figure out if the replicaset instance was destroyed by calling destroy
 * @method
 * @return {boolean}
 */
ReplSet.prototype.isDestroyed = function() {
  return this.s.replState.state == DESTROYED;
}

/**
 * Unref all connections belong to this server
 * @method
 */
ReplSet.prototype.unref = function(emitClose) {
  var self = this;
  if(this.s.logger.isInfo()) this.s.logger.info(f('[%s] unreferenced', this.s.id));

  // Emit close
  if(emitClose && self.listeners('close').length > 0) self.emit('close', self);

  // Unref sockets
  this.s.replState.unref();

  // Clear out any listeners
  var events = ['timeout', 'error', 'close', 'joined', 'left',
    'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
    'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'];
  events.forEach(function(e) {
    self.removeAllListeners(e);
  });

  clearTimeout(self.s.haTimer);
}

/**
 * Destroy the server connection
 * @method
 */
ReplSet.prototype.destroy = function(emitClose) {
  var self = this;
  if(this.s.logger.isInfo()) this.s.logger.info(f('[%s] destroyed', this.s.id));
  this.s.replState.state = DESTROYED;

  // Clear the ha timer
  if(self.s.haTimer) clearTimeout(self.s.haTimer);

  // Emit close
  if(emitClose && self.listeners('close').length > 0) self.emit('close', self);

  // Destroy state
  this.s.replState.destroy();

  // Emit toplogy closing event
  emitSDAMEvent(this, 'topologyClosed', { topologyId: this.s.id });

  // Clear out any listeners
  var events = ['timeout', 'error', 'close', 'joined', 'left',
    'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
    'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'];
  events.forEach(function(e) {
    self.removeAllListeners(e);
  });

  clearTimeout(self.s.haTimer);
}

/**
 * A replset connect event, used to verify that the connection is up and running
 *
 * @event ReplSet#connect
 * @type {ReplSet}
 */

/**
 * The replset high availability event
 *
 * @event ReplSet#ha
 * @type {function}
 * @param {string} type The stage in the high availability event (start|end)
 * @param {boolean} data.norepeat This is a repeating high availability process or a single execution only
 * @param {number} data.id The id for this high availability request
 * @param {object} data.state An object containing the information about the current replicaset
 */

/**
 * A server member left the replicaset
 *
 * @event ReplSet#left
 * @type {function}
 * @param {string} type The type of member that left (primary|secondary|arbiter)
 * @param {Server} server The server object that left
 */

/**
 * A server member joined the replicaset
 *
 * @event ReplSet#joined
 * @type {function}
 * @param {string} type The type of member that joined (primary|secondary|arbiter)
 * @param {Server} server The server object that joined
 */

//
// Inquires about state changes
//

// Add the new credential for a db, removing the old
// credential from the cache
var addCredentials = function(s, db, argsWithoutCallback) {
  // Remove any credentials for the db
  clearCredentials(s, db + ".dummy");
  // Add new credentials to list
  s.credentials.push(argsWithoutCallback);
}

// Clear out credentials for a namespace
var clearCredentials = function(s, ns) {
  var db = ns.split('.')[0];
  var filteredCredentials = [];

  // Filter out all credentials for the db the user is logging out off
  for(var i = 0; i < s.credentials.length; i++) {
    if(s.credentials[i][1] != db) filteredCredentials.push(s.credentials[i]);
  }

  // Set new list of credentials
  s.credentials = filteredCredentials;
}

//
// Filter serves by tags
var filterByTags = function(readPreference, servers) {
  if(readPreference.tags == null) return servers;
  var filteredServers = [];
  var tagsArray = !Array.isArray(readPreference.tags) ? [tags] : tags;

  // Iterate over the tags
  for(var j = 0; j < tagsArray.length; j++) {
    var tags = tagsArray[j];

    // Iterate over all the servers
    for(var i = 0; i < servers.length; i++) {
      var serverTag = servers[i].lastIsMaster().tags || {};
      // Did we find the a matching server
      var found = true;
      // Check if the server is valid
      for(var name in tags) {
        if(serverTag[name] != tags[name]) found = false;
      }

      // Add to candidate list
      if(found) {
        filteredServers.push(servers[i]);
      }
    }

    // We found servers by the highest priority
    if(found) break;
  }

  // Returned filtered servers
  return filteredServers;
}

var eventHandler = {
  fullsetup: function(self, state) {
    // If no more initial servers and new scheduled servers to connect
    if (!state.replState.primary) return;
    if (state.replState.secondaries.length === 0) return;
    if (state.fullsetup) return;

    // Only emit if there is a listener
    if(self.listeners('fullsetup').length > 0) {
      state.fullsetup = true;
      self.emit('fullsetup', self);
    }
  },
  all: function(self, state) {
    // If all servers are accounted for and we have not sent the all event
    if (!state.replState.primary) return;
    if (!self.lastIsMaster()) return;
    if (!Array.isArray(self.lastIsMaster().hosts)) return;
    if (state.all) return;

    var length = 1 + state.replState.secondaries.length;
    // If we have all secondaries + primary
    if (length !== self.lastIsMaster().hosts.length) return;

    // Only emit if there is a listener
    if(self.listeners('all').length > 0) {
      state.all = true;
      self.emit('all', self);
    }
  }
}

var checkAndEmitEvent = function(self, state, event) {
  var handler = eventHandler[event];
  if (!handler) throw new MongoError(event + " event not implemented");

  handler(self, state);
}

//
// Pick a server based on readPreference
var pickServer = function(self, s, readPreference) {
  // If no read Preference set to primary by default
  readPreference = readPreference || ReadPreference.primary;

  // Do we have a custom readPreference strategy, use it
  if(s.readPreferenceStrategies != null && s.readPreferenceStrategies[readPreference.preference] != null) {
    if(s.readPreferenceStrategies[readPreference.preference] == null) throw new MongoError(f("cannot locate read preference handler for %s", readPreference.preference));
    var server = s.readPreferenceStrategies[readPreference.preference].pickServer(s.replState, readPreference);
    if(s.debug) self.emit('pickedServer', readPreference, server);
    return server;
  }

  // Get all the secondaries
  var secondaries = s.replState.getSecondaries();

  // Check if we can satisfy and of the basic read Preferences
  if(readPreference.equals(ReadPreference.secondary)
    && secondaries.length == 0)
      throw new MongoError("no secondary server available");

  if(readPreference.equals(ReadPreference.secondaryPreferred)
      && secondaries.length == 0
      && s.replState.primary == null)
    throw new MongoError("no secondary or primary server available");

  if(readPreference.equals(ReadPreference.primary)
    && s.replState.primary == null)
      throw new MongoError("no primary server available");

  // Secondary
  if(readPreference.equals(ReadPreference.secondary)) {
    s.index = (s.index + 1) % secondaries.length;
    return secondaries[s.index];
  }

  // Secondary preferred
  if(readPreference.equals(ReadPreference.secondaryPreferred)) {
    if(secondaries.length > 0) {
      // Apply tags if present
      var servers = filterByTags(readPreference, secondaries);
      // If have a matching server pick one otherwise fall through to primary
      if(servers.length > 0) {
        s.index = (s.index + 1) % servers.length;
        return servers[s.index];
      }
    }

    return s.replState.primary;
  }

  // Primary preferred
  if(readPreference.equals(ReadPreference.primaryPreferred)) {
    if(s.replState.primary) return s.replState.primary;

    if(secondaries.length > 0) {
      // Apply tags if present
      var servers = filterByTags(readPreference, secondaries);
      // If have a matching server pick one otherwise fall through to primary
      if(servers.length > 0) {
        s.index = (s.index + 1) % servers.length;
        return servers[s.index];
      }

      // Throw error a we have not valid secondary or primary servers
      throw new MongoError("no secondary or primary server available");
    }
  }

  // Return the primary
  return s.replState.primary;
}

var setHaTimer = function(self, state) {
  if(state.highAvailabilityProcessRunning) return;
  // all haTimers are set to to repeat, so we pass norepeat false
  self.s.haTimer = setTimeout(replicasetInquirer(self, state, false), state.currentHaInterval);
  return self.s.haTimer;
}

var haveAvailableServers = function(state) {
  if(state.disconnectedServers.length == 0
    && state.replState.secondaries.length == 0
    && state.replState.arbiters.length == 0
    && state.replState.primary == null) return false;
    return true;
}

var merge = function(list, newList) {
  var finalList = list.slice(0)

  for(var i = 0; i < newList.length; i++) {
    if(finalList.indexOf(newList[i]) == -1) finalList.push(newList[i]);
  }

  return finalList;
}

var replicasetInquirer = function(self, state, norepeat) {
  return function() {
    // Process already running or state destroyed, don't rerun
    if(state.highAvailabilityProcessRunning || state.replState.state == DESTROYED) {
      return;
    }

    // Do we have a primary, ensure we only monitor by the haInterval
    if(state.replState.isPrimaryConnected()) {
      self.s.currentHaInterval = self.s.haInterval;
    } else {
      self.s.currentHaInterval = self.s.minHeartbeatFrequencyMS;
    }

    // Clean out any failed connection attempts
    state.replState.clearConnectingServers();

    // Cleanup state (removed disconnected servers)
    state.replState.clean();

    // Started processes
    state.highAvailabilityProcessRunning = true;
    // We have no connections we need to reseed the disconnected list
    if(!haveAvailableServers(state)) {
      // For all entries in the seedlist build a server instance
      state.disconnectedServers = state.seedlist.map(function(e) {
        // Clone options
        var opts = cloneOptions(state.options);
        // Add host and port
        opts.host = e.host;
        opts.port = e.port;
        opts.reconnect = false;
        opts.readPreferenceStrategies = state.readPreferenceStrategies;
        opts.emitError = true;
        // Add a reserved connection for monitoring
        opts.size = opts.size + 1;
        opts.monitoring = true;
        opts.topologyId = self.s.id;
        // Server is in topology
        opts.inTopology = true;
        // Set up tags if any
        if(state.tag) opts.tag = state.tag;
        // Share the auth store
        opts.authProviders = state.authProviders;
        // Create a new Server
        var server = new Server(opts);
        // Handle the ismaster
        server.on('ismaster', handleIsmaster(self));
        return server;
      });
    }

    if(state.logger.isInfo()) state.logger.info(f('[%s] monitoring process running %s', state.id, JSON.stringify(state.replState)));

    // Unique HA id to identify the current look running
    var localHaId = state.haId++;

    // Controls if we are doing a single inquiry or repeating
    norepeat = typeof norepeat == 'boolean' ? norepeat : false;

    // If we have a primary and a disconnect handler, execute
    // buffered operations
    if(state.replState.isPrimaryConnected() && state.replState.isSecondaryConnected() && state.disconnectHandler) {
      state.disconnectHandler.execute();
    }

    // Emit replicasetInquirer
    self.emit('ha', 'start', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});

    // Let's process all the disconnected servers
    while(state.disconnectedServers.length > 0) {
      // Get the first disconnected server
      var server = state.disconnectedServers.shift();
      if(state.logger.isInfo()) state.logger.info(f('[%s] monitoring attempting to connect to %s', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
      // Set up the event handlers
      server.once('error', errorHandlerTemp(self, state, 'error'));
      server.once('close', errorHandlerTemp(self, state, 'close'));
      server.once('timeout', errorHandlerTemp(self, state, 'timeout'));
      server.once('connect', connectHandler(self, state, true));

      // SDAM Monitoring events
      server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
      server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
      server.on('serverHeartbeatStarted', function(e) { self.emit('serverHeartbeatStarted', e); });
      server.on('serverHeartbeatSucceeded', function(e) { self.emit('serverHeartbeatSucceeded', e); });
      server.on('serverHearbeatFailed', function(e) { self.emit('serverHearbeatFailed', e); });
      server.on('serverClosed', function(e) { self.emit('serverClosed', e); });

      // Ensure we schedule the opening of new socket
      // on separate ticks of the event loop
      var execute = function(_server) {
        // Attempt to connect
        process.nextTick(function() {
          _server.connect();
        });
      }

      execute(server);
    }

    // We need to query all servers
    var servers = state.replState.getAll({includeArbiters:true});
    var serversLeft = servers.length;

    // If no servers and we are not destroyed keep pinging
    if(servers.length == 0 && state.replState.state == CONNECTED) {
      // Emit ha process end
      self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
      // Ended highAvailabilityProcessRunning
      state.highAvailabilityProcessRunning = false;
      // Restart ha process
      if(!norepeat) {
        setHaTimer(self, state);
      }

      return;
    }

    //
    // ismaster for Master server
    var primaryIsMaster = null;

    //
    // Inspect a specific servers ismaster
    var inspectServer = function(server, callback) {
      // If the server is not connected or the topology was destroyed
      if((server && !server.isConnected()) || state.replState.state == DESTROYED) {
        return callback();
      }

      // Did we get a server
      if(server && server.isConnected()) {
        // Execute ismaster
        server.command('admin.$cmd', { ismaster:true }, {monitoring: true}, function(err, r) {
          // If the state was destroyed
          if(state.replState.state == DESTROYED) {
            return callback();
          }

          // Count down the number of servers left
          serversLeft = serversLeft - 1;

          // If we have an error but still outstanding server request return
          if(err && serversLeft > 0) {
            return callback();
          }

          // We had an error and have no more servers to inspect, schedule a new check
          if(err && serversLeft == 0) {
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunning
            state.highAvailabilityProcessRunning = false;
            // Return the replicasetInquirer
            return callback();
          }

          // Let all the read Preferences do things to the servers
          var rPreferencesCount = Object.keys(state.readPreferenceStrategies).length;

          // Handle the primary
          var ismaster = r.result;
          if(state.logger.isDebug()) state.logger.debug(f('[%s] monitoring process ismaster %s', state.id, JSON.stringify(ismaster)));

          // Update server instance ismaster to ensure proper sync
          // when producing SDAM monitoring events
          server.s.ismaster = ismaster;

          // Update the replicaset state
          if(!state.replState.update(ismaster, server) && !state.replState.contains(server)) {
            // Destroy the instance
            server.destroy();
            // Return
            return callback();
          }

          //
          // Process hosts list from ismaster under two conditions
          // 1. Ismaster result is from primary
          // 2. There is no primary and the ismaster result is from a non-primary
          if(err == null
            && (ismaster.ismaster || (!state.primary))
            && Array.isArray(ismaster.hosts)) {
            // Hosts to process
            var hosts = ismaster.hosts;
            // Add arbiters to list of hosts if we have any
            if(Array.isArray(ismaster.arbiters)) {
              hosts = hosts.concat(ismaster.arbiters.map(function(x) {
                return {host: x, arbiter:true};
              }));
            }

            if(Array.isArray(ismaster.passives)) hosts = hosts.concat(ismaster.passives);
            // Process all the hsots
            processHosts(self, state, hosts, true);
          } else if(err == null && !Array.isArray(ismaster.hosts)) {
            // Destroy the instance
            server.destroy();
            // Return
            return callback();
          }

          // No read Preferences strategies
          if(rPreferencesCount == 0) {
            // Don't schedule a new inquiry
            if(serversLeft > 0) {
              return callback();
            }

            // Emit ha process end
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunning
            state.highAvailabilityProcessRunning = false;
            return callback();
          }

          // No servers left to query, execute read preference strategies
          if(serversLeft == 0) {
            // Go over all the read preferences
            for(var name in state.readPreferenceStrategies) {
              state.readPreferenceStrategies[name].ha(self, state.replState, function() {
                rPreferencesCount = rPreferencesCount - 1;

                if(rPreferencesCount == 0) {
                  // Add any new servers in primary ismaster
                  if(err == null
                    && ismaster.ismaster
                    && Array.isArray(ismaster.hosts)) {
                      processHosts(self, state, ismaster.hosts, true);
                  }

                  // Emit ha process end
                  self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
                  // Ended highAvailabilityProcessRunning
                  state.highAvailabilityProcessRunning = false;
                  return callback();
                }
              });
            }
          }

          callback();
        });
      }
    }

    // Go over all the servers
    if(servers.length == 0) {
      // Set the high availability
      state.highAvailabilityProcessRunning = false;
      // Check if we need to emit a fullsetup event
      checkAndEmitEvent(self, state, 'fullsetup');
      // Check if we need to emit the all event
      checkAndEmitEvent(self, state, 'all');
      // Repeat the process
      if(!norepeat) {
        setHaTimer(self, state);
      }
    }

    // Ge the number of servers left
    var left = servers.length;
    // Call ismaster on all servers
    for(var i = 0; i < servers.length; i++) {
      inspectServer(servers[i], function() {
        left = left - 1;

        if(left == 0) {
          // Do not schedule any more replica monitoring checks
          if(state.replState.state == DESTROYED) {
            return;
          }

          // Set the high availability
          state.highAvailabilityProcessRunning = false;
          // Check if we need to emit a fullsetup event
          checkAndEmitEvent(self, state, 'fullsetup');
          // Check if we need to emit the all event
          checkAndEmitEvent(self, state, 'all');
          // Repeat the process
          if(!norepeat) {
            setHaTimer(self, state);
          }
        }
      });
    }
  }
}

// Error handler for initial connect
var errorHandlerTemp = function(self, state, event) {
  return function(err, server) {
    // Destroy the server
    server.destroy();
    // Log the information
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s disconnected', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    // Filter out any connection servers
    state.initialConnectionServers = state.initialConnectionServers.filter(function(_server) {
      return server.name != _server.name;
    });

    // Remove from list of connected servers
    state.replState.removeConnectingServer(server.name);

    // Connection is destroyed, ignore
    if(state.replState.state == DESTROYED) return;

    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect',
      'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
      'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'].forEach(function(e) {
      server.removeAllListeners(e);
    })

    // Push to list of disconnected servers
    addToListIfNotExist(state.disconnectedServers, server);

    // End connection operation if we have no legal replicaset state
    if(state.initialConnectionServers == 0 && state.replState.state == CONNECTING) {
       if((state.secondaryOnlyConnectionAllowed && !state.replState.isSecondaryConnected() && !state.replState.isPrimaryConnected())
        || (!state.secondaryOnlyConnectionAllowed && !state.replState.isPrimaryConnected())) {
          if(state.logger.isInfo()) state.logger.info(f('[%s] no valid seed servers in list', state.id));

          if(self.listeners('error').length > 0) {
            return self.emit('error', new MongoError('no valid seed servers in list'));
          }
       }
    }

    // If the number of disconnected servers is equal to
    // the number of seed servers we cannot connect
    if(state.disconnectedServers.length == state.seedlist.length && state.replState.state == CONNECTING) {
      if(state.emitError && self.listeners('error').length > 0) {
        if(state.logger.isInfo()) state.logger.info(f('[%s] no valid seed servers in list', state.id));

        if(self.listeners('error').length > 0) {
          self.emit('error', new MongoError('no valid seed servers in list'));
        }
      }
    }
  }
}

// Connect handler
var connectHandler = function(self, state, calledFromSDAM) {
  return function(server) {
    if(state.logger.isInfo()) state.logger.info(f('[%s] connected to %s', state.id, server.name));
    // Destroyed connection
    if(state.replState.state == DESTROYED) {
      return server.destroy(false, false);
    }

    // Filter out any connection servers
    state.initialConnectionServers = state.initialConnectionServers.filter(function(_server) {
      return server.name != _server.name;
    });

    var ismaster = server.lastIsMaster();

    // Process the new server
    var processNewServer = function() {
      // Discover any additional servers
      var ismaster = server.lastIsMaster();

      // Deal with events
      var events = ['error', 'close', 'timeout', 'connect', 'message',
        'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
        'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'];
      // Remove any non used handlers
      events.forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Clean up
      // delete state.connectingServers[server.name];
      state.replState.removeConnectingServer(server.name);

      // Update the replicaset state, destroy if not added
      if(!state.replState.update(ismaster, server) && !state.replState.contains(server)) {
        // Destroy the server instance
        server.destroy();
        // No more candiate servers
        if(state.state == CONNECTING && state.initialConnectionServers.length == 0
          && state.replState.primary == null && state.replState.secondaries.length == 0) {
            return self.emit('error', new MongoError("no replicaset members found in seedlist"));
        }

        return;
      }

      // Add the server handling code
      if(server.isConnected()) {
        server.on('error', errorHandler(self, state));
        server.on('close', closeHandler(self, state));
        server.on('timeout', timeoutHandler(self, state));

        // SDAM Monitoring events
        server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
        server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
        server.on('serverHeartbeatStarted', function(e) { self.emit('serverHeartbeatStarted', e); });
        server.on('serverHeartbeatSucceeded', function(e) { self.emit('serverHeartbeatSucceeded', e); });
        server.on('serverHearbeatFailed', function(e) { self.emit('serverHearbeatFailed', e); });
        server.on('serverClosed', function(e) { self.emit('serverClosed', e); });
      }

      // Hosts to process
      var hosts = ismaster.hosts;
      // Add arbiters to list of hosts if we have any
      if(Array.isArray(ismaster.arbiters)) {
        hosts = hosts.concat(ismaster.arbiters.map(function(x) {
          return {host: x, arbiter:true};
        }));
      }

      if(Array.isArray(ismaster.passives)) hosts = hosts.concat(ismaster.passives);

      // Add any new servers
      processHosts(self, state, hosts, calledFromSDAM);

      // If have the server instance already destroy it
      if(!calledFromSDAM && state.initialConnectionServers.length == 0 && state.replState.connectingServersCount() == 0
        && !state.replState.isPrimaryConnected() && !state.secondaryOnlyConnectionAllowed && state.replState.state == CONNECTING) {
        if(state.logger.isInfo()) state.logger.info(f('[%s] no primary found in replicaset', state.id));
        self.emit('error', new MongoError("no primary found in replicaset"));
        return self.destroy();
      }

      // Check if we need to emit a fullsetup event
      checkAndEmitEvent(self, state, 'fullsetup');
      // Check if we need to emit the all event
      checkAndEmitEvent(self, state, 'all');
    }

    // Save up new members to be authenticated against
    if(self.s.authInProgress) {
      self.s.authInProgressServers.push(server);
    }

    // No credentials just process server
    if(state.credentials.length == 0) {
      return processNewServer();
    }

    // Apply all the credentials serially
    var applyCredentials = function(server, index, credentials, callback) {
      // Do not apply credentials if we have an arbiter
      if(server.lastIsMaster() && server.lastIsMaster().arbiterOnly) return callback();
      // Done applying the credentials return
      if(index >= credentials.length || credentials.length == 0) return callback();
      // Apply the credential
      server.auth.apply(server, credentials[index].concat([function(err, r) {
        if(err) return callback(err);
        applyCredentials(server, index + 1, credentials, callback);
      }]));
    }

    applyCredentials(server, 0, state.credentials, function(err) {
      if(err || state.replState.state == DESTROYED) {
        return server.destroy(false, false);
      }

      // Did not fail the authentication, process the instance
      processNewServer();
    });
  }
}

//
// Detect if we need to add new servers
var processHosts = function(self, state, hosts, calledFromSDAM) {
  if(state.replState.state == DESTROYED) return;
  if(Array.isArray(hosts)) {
    // Check any hosts exposed by ismaster
    for(var i = 0; i < hosts.length; i++) {
      // Get the object
      var host = hosts[i];
      var options = {};

      // Do we have an arbiter
      if(typeof host == 'object') {
        host = host.host;
        options.arbiter = host.arbiter;
      }

      // If not found we need to create a new connection
      if(!state.replState.contains(host)) {
        if(!state.replState.isConnectingServer(host) && !inInitialConnectingServers(self, state, host)) {
          if(state.logger.isInfo()) state.logger.info(f('[%s] scheduled server %s for connection', state.id, host));
          // Make sure we know what is trying to connect
          state.replState.addConnectingServer(host, host);
          // Connect the server
          connectToServer(self, state, host.split(':')[0], parseInt(host.split(':')[1], 10), calledFromSDAM, options);
        }
      }
    }
  }
}

var inInitialConnectingServers = function(self, state, address) {
  for(var i = 0; i < state.initialConnectionServers.length; i++) {
    if(state.initialConnectionServers[i].name == address) return true;
  }
  return false;
}

// Connect to a new server
var connectToServer = function(self, state, host, port, calledFromSDAM, options) {
  options = options || {};
  var opts = cloneOptions(state.options);
  opts.host = host;
  opts.port = port;
  opts.reconnect = false;
  opts.readPreferenceStrategies = state.readPreferenceStrategies;
  if(state.tag) opts.tag = state.tag;
  // Share the auth store
  opts.authProviders = state.authProviders;
  opts.emitError = true;
  // Server is in topology
  opts.inTopology = true;
  // Set the size to size + 1 and mark monitoring
  opts.size = opts.size + 1;
  opts.monitoring = true;
  opts.topologyId = self.s.id;

  // Do we have an arbiter set the poolSize to 1
  if(options.arbiter) {
    opts.size = 1;
  }

  // Do not create a new server instance
  if(self.s.replState.state == DESTROYED) return;

  // Create a new server instance
  var server = new Server(opts);
  // Handle the ismaster
  server.on('ismaster', handleIsmaster(self));
  // Set up the event handlers
  server.once('error', errorHandlerTemp(self, state, 'error'));
  server.once('close', errorHandlerTemp(self, state, 'close'));
  server.once('timeout', errorHandlerTemp(self, state, 'timeout'));
  server.once('connect', connectHandler(self, state, calledFromSDAM));

  // SDAM Monitoring events
  server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
  server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
  server.on('serverHeartbeatStarted', function(e) { self.emit('serverHeartbeatStarted', e); });
  server.on('serverHeartbeatSucceeded', function(e) { self.emit('serverHeartbeatSucceeded', e); });
  server.on('serverHearbeatFailed', function(e) { self.emit('serverHearbeatFailed', e); });
  server.on('serverClosed', function(e) { self.emit('serverClosed', e); });

  // Ensure we schedule the opening of new socket
  // on separate ticks of the event loop
  var execute = function(_server) {
    // Attempt to connect
    process.nextTick(function() {
      if(self.s.replState.state == DESTROYED) return;
      _server.connect();
    });
  }

  // Add server as connecting
  state.replState.addConnectingServer(server.name, host);
  // Attempt connection of server
  execute(server);
}

//
// Add server to the list if it does not exist
var addToListIfNotExist = function(list, server) {
  var found = false;
  // If the server is a null value return false
  if(server == null) return found;

  // Remove any non used handlers
  ['error', 'close', 'timeout', 'connect',
    'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
    'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'].forEach(function(e) {
    server.removeAllListeners(e);
  })

  // Check if the server already exists
  for(var i = 0; i < list.length; i++) {
    if(list[i].equals(server)) found = true;
  }

  if(!found) {
    list.push(server);
  }

  return found;
}

var errorHandler = function(self, state) {
  return function(err, server) {
    // Destroy the server
    server.destroy();
    // Remove from list of connected servers
    state.replState.removeConnectingServer(server.name);
    // Check if destroyed the topology
    if(state.replState.state == DESTROYED) return;
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s errored out with %s', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name, JSON.stringify(err)));
    var found = addToListIfNotExist(state.disconnectedServers, server);
    if(!found) self.emit('left', state.replState.remove(server), server);
    if(found && state.emitError && self.listeners('error').length > 0) self.emit('error', err, server);
  }
}

var timeoutHandler = function(self, state) {
  return function(err, server) {
    // Destroy the server
    server.destroy();
    // Remove from list of connected servers
    state.replState.removeConnectingServer(server.name);
    // Check if destroyed the topology
    if(state.replState.state == DESTROYED) return;
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s timed out', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    var found = addToListIfNotExist(state.disconnectedServers, server);
    if(!found) self.emit('left', state.replState.remove(server), server);
  }
}

var closeHandler = function(self, state) {
  return function(err, server) {
    // Destroy the server
    server.destroy();
    // Remove from list of connected servers
    state.replState.removeConnectingServer(server.name);
    // Check if destroyed the topology
    if(state.replState.state == DESTROYED) return;
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s closed', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    var found = addToListIfNotExist(state.disconnectedServers, server);
    if(!found) {
      self.emit('left', state.replState.remove(server), server);
    }
  }
}

//
// Validate if a non-master or recovering error
var notMasterError = function(r) {
  // Get result of any
  var result = r && r.result ? r.result : r;

  // Explore if we have a not master error
  if(result && (result.err == 'not master'
    || result.errmsg == 'not master' || (result['$err'] && result['$err'].indexOf('not master or secondary') != -1)
    || (result['$err'] && result['$err'].indexOf("not master and slaveOk=false") != -1)
    || result.errmsg == 'node is recovering')) {
    return true;
  }

  return false;
}

module.exports = ReplSet;
