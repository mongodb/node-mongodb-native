"use strict";

var inherits = require('util').inherits
  , f = require('util').format
  , b = require('bson')
  , bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain
  , EventEmitter = require('events').EventEmitter
  , BasicCursor = require('../cursor')
  , BSON = require('bson').native().BSON
  , BasicCursor = require('../cursor')
  , Server = require('./server')
  , MongoCR = require('../auth/mongocr')
  , X509 = require('../auth/x509')
  , Plain = require('../auth/plain')
  , GSSAPI = require('../auth/gssapi')
  , SSPI = require('../auth/sspi')
  , ScramSHA1 = require('../auth/scram')
  , Logger = require('../connection/logger')
  , ReadPreference = require('./read_preference')
  , Session = require('./session')
  , MongoError = require('../error');

/**
 * @fileOverview The **Mongos** class is a class that represents a Mongos Proxy topology and is
 * used to construct connections.
 *
 * @example
 * var Mongos = require('mongodb-core').Mongos
 *   , ReadPreference = require('mongodb-core').ReadPreference
 *   , assert = require('assert');
 *
 * var server = new Mongos([{host: 'localhost', port: 30000}]);
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

// All bson types
var bsonTypes = [b.Long, b.ObjectID, b.Binary, b.Code, b.DBRef, b.Symbol, b.Double, b.Timestamp, b.MaxKey, b.MinKey];
// BSON parser
var bsonInstance = null;

// Instance id
var mongosId = 0;

//
// Clone the options
var cloneOptions = function(options) {
  var opts = {};
  for(var name in options) {
    opts[name] = options[name];
  }
  return opts;
}

var State = function(readPreferenceStrategies, localThresholdMS) {
  // Internal state
  this.s = {
      connectedServers: []
    , disconnectedServers: []
    , readPreferenceStrategies: readPreferenceStrategies
    , lowerBoundLatency: Number.MAX_VALUE
    , localThresholdMS: localThresholdMS
    , index: 0
    , topologyDescription: null
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
 * Is there a secondary connected
 * @method
 * @return {boolean}
 */
State.prototype.resetDescription = function() {
  this.s.topologyDescription = {
    "topologyType": "Sharded",
    "servers": []
  }
}

function emitTopologyDescriptionChanged(self, state) {
  if(self.listeners('topologyDescriptionChanged').length > 0 && state) {
    var state = state.s;
    // Generate description
    var description = {
      topologyType: 'Sharded',
      servers: []
    }

    // Add all the secondaries
    description.servers = description.servers.concat(state.connectedServers.map(function(x) {
      var description = x.getDescription();
      description.type = 'Mongos';
      return description;
    }));

    description.servers = description.servers.concat(state.disconnectedServers.map(function(x) {
      var description = x.getDescription();
      description.type = 'Unknown';
      return description;
    }));

    // Create the result
    var result = {
      topologyId: self.id,
      previousDescription: state.topologyDescription,
      newDescription: description
    };

    // Emit the topologyDescription change
    self.emit('topologyDescriptionChanged', result);

    // Set the new description
    state.topologyDescription = description;
  }
}

//
// A Mongos connected
State.prototype.connected = function(server) {
  // Locate in disconnected servers and remove
  this.s.disconnectedServers = this.s.disconnectedServers.filter(function(s) {
    return !s.equals(server);
  });

  var found = false;
  // Check if the server exists
  this.s.connectedServers.forEach(function(s) {
    if(s.equals(server)) found = true;
  });

  // Add to disconnected list if it does not already exist
  if(!found) this.s.connectedServers.push(server);

  // Adjust lower bound
  if(this.s.lowerBoundLatency > server.s.isMasterLatencyMS) {
    this.s.lowerBoundLatency = server.s.isMasterLatencyMS;
  }
}

//
// A Mongos disconnected
State.prototype.disconnected = function(server) {
  // Locate in disconnected servers and remove
  this.s.connectedServers = this.s.connectedServers.filter(function(s) {
    return !s.equals(server);
  });

  var found = false;
  // Check if the server exists
  this.s.disconnectedServers.forEach(function(s) {
    if(s.equals(server)) found = true;
  });

  // Add to disconnected list if it does not already exist
  if(!found) this.s.disconnectedServers.push(server);
}

//
// Return the list of disconnected servers
State.prototype.disconnectedServers = function() {
  return this.s.disconnectedServers.slice(0);
}

//
// Get connectedServers
State.prototype.connectedServers = function() {
  return this.s.connectedServers.slice(0)
}

//
// Get all servers
State.prototype.getAll = function() {
  return this.s.connectedServers.slice(0).concat(this.s.disconnectedServers);
}

//
// Get all connections
State.prototype.getAllConnections = function() {
  var connections = [];

  this.s.connectedServers.forEach(function(e) {
    connections = connections.concat(e.connections());
  });
  return connections;
}

//
// Unref the state
State.prototype.unref = function() {
  // Unref all the servers
  for(var i = 0; i < this.s.connectedServers.length; i++) {
    // Get each of the servers
    var server = this.s.connectedServers[i];
    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
      server.removeAllListeners(e);
    })
    // Unreference the server
    server.unref();
  }
}

//
// Destroy the state
State.prototype.destroy = function() {
  // Destroy any connected servers
  while(this.s.connectedServers.length > 0) {
    var server = this.s.connectedServers.shift();

    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
      server.removeAllListeners(e);
    })

    // Server destroy
    server.destroy();
    // Add to list of disconnected servers
    this.s.disconnectedServers.push(server);
  }
}

var pickProxies = function(self, options) {
  options = options || {};
  var readPreference = options.readPreference || ReadPreference.primary;

  // All connected servers
  var servers = self.s.connectedServers.slice(0);

  // Do we have a custom readPreference strategy, use it
  if(self.s.readPreferenceStrategies != null && self.s.readPreferenceStrategies[readPreference] != null) {
    var server = self.s.readPreferenceStrategies[readPreference].pickServer(servers, readPreference);
    // Return the server if one is found
    return !server ? [] : [server];
  }

  // Filter out the possible servers
  servers = self.s.connectedServers.filter(function(server) {
    if((server.s.isMasterLatencyMS <= (self.s.lowerBoundLatency + self.s.localThresholdMS))
      && server.isConnected()) {
      return true;
    }
  });

  // If no servers found return the lowest latency proxy
  if(servers.length == 0 && self.s.connectedServers.length > 0) {
    servers = self.s.connectedServers.sort(function(server1, server2) {
      return server1.s.isMasterLatencyMS - server2.s.isMasterLatencyMS;
    });

    // Return the lowest latency server if none is found
    return [servers[0]];
  }

  // Return all the servers found
  return servers;
}

//
// Are we connected
State.prototype.isConnected = function(options) {
  // Get all the servers
  var servers = pickProxies(this, options);
  // Return if the server is connected
  return servers.length > 0 ? true : false;
}

//
// Pick a server
State.prototype.pickServer = function(readPreference) {
  // Get all the servers
  var servers = pickProxies(this, {readPreference:readPreference});
  // No valid connections
  if(servers.length == 0) throw new MongoError("no mongos proxy available");
  // Update index
  this.s.index = (this.s.index + 1) % servers.length;
  // Pick first one
  return servers[this.s.index];
}

/**
 * Creates a new Mongos instance
 * @class
 * @param {array} seedlist A list of seeds for the replicaset
 * @param {number} [options.reconnectTries=30] Reconnect retries for HA if no servers available
 * @param {number} [options.haInterval=5000] The High availability period for replicaset inquiry
 * @param {boolean} [options.emitError=false] Server will emit errors events
 * @param {Cursor} [options.cursorFactory=Cursor] The cursor factory class used for all query cursors
 * @param {number} [options.size=5] Server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=0] Initial delay before TCP keep alive enabled
 * @param {number} [options.localThresholdMS=15] Cutoff latency point in MS for MongoS proxy selection
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=1000] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @return {Mongos} A cursor instance
 * @fires Mongos#connect
 * @fires Mongos#joined
 * @fires Mongos#left
 */
var Mongos = function(seedlist, options) {
  var self = this;
  options = options || {};

  // Add event listener
  EventEmitter.call(this);

  // Validate seedlist
  if(!Array.isArray(seedlist)) throw new MongoError("seedlist must be an array");
  // Validate list
  if(seedlist.length == 0) throw new MongoError("seedlist must contain at least one entry");
  // Validate entries
  seedlist.forEach(function(e) {
    if(typeof e.host != 'string' || typeof e.port != 'number')
      throw new MongoError("seedlist entry must contain a host and port");
  });

  // BSON Parser, ensure we have a single instance
  bsonInstance = bsonInstance == null ? new BSON(bsonTypes) : bsonInstance;
  // Pick the right bson parser
  var bson = options.bson ? options.bson : bsonInstance;
  // Add bson parser to options
  options.bson = bson;

  // The Mongos state
  this.s = {
    // Seed list for sharding passed in
      seedlist: seedlist
    // Passed in options
    , options: options
    // Logger
    , logger: Logger('Mongos', options)
    // Reconnect tries
    , reconnectTries: options.reconnectTries || 30
    // Ha interval
    , haInterval: options.haInterval || 5000
    // localThresholdMS
    , localThresholdMS: options.localThresholdMS || 15
    // Have omitted fullsetup
    , fullsetup: false
    // Cursor factory
    , Cursor: options.cursorFactory || BasicCursor
    // Current credentials used for auth
    , credentials: []
    // BSON Parser
    , bsonInstance: bsonInstance
    , bson: bson
    // Pings
    , pings: {}
    // Default state
    , state: DISCONNECTED
    // Swallow or emit errors
    , emitError: typeof options.emitError == 'boolean' ? options.emitError : false
    // Contains any alternate strategies for picking
    , readPreferenceStrategies: {}
    // Auth providers
    , authProviders: {}
    // Unique instance id
    , id: mongosId++
    // Authentication in progress
    , authInProgress: false
    // Servers added while auth in progress
    , authInProgressServers: []
    // Current retries left
    , retriesLeft: options.reconnectTries || 30
    // Do we have a not connected handler
    , disconnectHandler: options.disconnectHandler
  }

  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 1000;

  // Create a new state for the mongos
  this.s.mongosState = new State(this.s.readPreferenceStrategies, this.s.localThresholdMS);

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
      var servers = self.s.mongosState.getAll();
      return servers.length > 0 ? servers[0].bson : null;
    }
  });

  Object.defineProperty(this, 'id', {
    enumerable:true, get: function() { return self.s.id; }
  });

  Object.defineProperty(this, 'type', {
    enumerable:true, get: function() { return 'mongos'; }
  });

  Object.defineProperty(this, 'haInterval', {
    enumerable:true, get: function() { return self.s.haInterval; }
  });

  Object.defineProperty(this, 'state', {
    enumerable:true, get: function() { return self.s.mongosState; }
  });
}

inherits(Mongos, EventEmitter);

/**
 * Name of BSON parser currently used
 * @method
 * @return {string}
 */
Mongos.prototype.parserType = function() {
  if(this.s.bson.serialize.toString().indexOf('[native code]') != -1)
    return 'c++';
  return 'js';
}

/**
 * Execute a command
 * @method
 * @param {string} type Type of BSON parser to use (c++ or js)
 */
Mongos.prototype.setBSONParserType = function(type) {
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
Mongos.prototype.lastIsMaster = function() {
  var connectedServers = this.s.mongosState.connectedServers();
  if(connectedServers.length > 0) return connectedServers[0].lastIsMaster();
  return null;
}

/**
 * Initiate server connect
 * @method
 */
Mongos.prototype.connect = function(_options) {
  var self = this;
  // Start replicaset inquiry process
  setTimeout(mongosInquirer(self, self.s), self.s.haInterval);
  // Additional options
  if(_options) for(var name in _options) self.s.options[name] = _options[name];
  // For all entries in the seedlist build a server instance
  self.s.seedlist.forEach(function(e) {
    // Clone options
    var opts = cloneOptions(self.s.options);
    // Add host and port
    opts.host = e.host;
    opts.port = e.port;
    opts.reconnect = false;
    opts.readPreferenceStrategies = self.s.readPreferenceStrategies;
    // Share the auth store
    opts.authProviders = self.s.authProviders;
    // Don't emit errors
    opts.emitError = true;
    // Set that server is in a topology
    opts.inTopology = true;
    opts.topologyId = self.s.id;
    opts.monitoring = true;
    // Create a new Server
    self.s.mongosState.disconnected(new Server(opts));
  });

  // Reset the replState
  this.s.mongosState.resetDescription();

  // Emit the topology opening event
  emitSDAMEvent(this, 'topologyOpening', { topologyId: this.s.id });

  // Get the disconnected servers
  var servers = self.s.mongosState.disconnectedServers();

  // Set connecting state
  this.s.state = CONNECTING;

  // Attempt to connect to all the servers
  while(servers.length > 0) {
    // Get the server
    var server = servers.shift();

    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect', 'message', 'parseError',
      'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
      'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'].forEach(function(e) {
      server.removeAllListeners(e);
    });

    // Set up the event handlers
    server.once('error', errorHandlerTemp(self, self.s, server));
    server.once('close', errorHandlerTemp(self, self.s, server));
    server.once('timeout', errorHandlerTemp(self, self.s, server));
    server.once('parseError', errorHandlerTemp(self, self.s, server));
    server.once('connect', connectHandler(self, self.s, 'connect'));

    // SDAM Monitoring events
    server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
    server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
    server.on('serverHeartbeatStarted', function(e) { self.emit('serverHeartbeatStarted', e); });
    server.on('serverHeartbeatSucceeded', function(e) { self.emit('serverHeartbeatSucceeded', e); });
    server.on('serverHearbeatFailed', function(e) { self.emit('serverHearbeatFailed', e); });
    server.on('serverClosed', function(e) { self.emit('serverClosed', e); });

    if(self.s.logger.isInfo()) self.s.logger.info(f('connecting to server %s', server.name));

    // Execute the connect
    var execute = function(_server) {
      process.nextTick(function() {
        _server.connect();
      });
    }

    // Connect
    execute(server);
  }
}

/**
 * Unref all connections belong to this server
 * @method
 */
Mongos.prototype.unref = function(emitClose) {
  if(this.s.logger.isInfo()) this.s.logger.info(f('[%s] unreferenced', this.s.id));
  // Emit close
  if(emitClose && this.listeners('close').length > 0) this.emit('close', this);
  // Unref sockets
  this.s.mongosState.unref();
}

/**
 * Destroy the server connection
 * @method
 */
Mongos.prototype.destroy = function(emitClose) {
  this.s.state = DESTROYED;
  // Emit toplogy closing event
  emitSDAMEvent(this, 'topologyClosed', { topologyId: this.s.id });
  // Emit close
  if(emitClose && self.listeners('close').length > 0) self.emit('close', self);
  // Destroy the state
  this.s.mongosState.destroy();
}

/**
 * Figure out if the server is connected
 * @method
 * @return {boolean}
 */
Mongos.prototype.isConnected = function(options) {
  return this.s.mongosState.isConnected(options);
}

/**
 * Figure out if the server instance was destroyed by calling destroy
 * @method
 * @return {boolean}
 */
Mongos.prototype.isDestroyed = function() {
  return this.s.state  == DESTROYED;
}

//
// Operations
//

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
Mongos.prototype.insert = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected() && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  executeWriteOperation(this.s, 'insert', ns, ops, options, callback);
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
Mongos.prototype.update = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected() && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('update', ns, ops, options, callback);
  }

  executeWriteOperation(this.s, 'update', ns, ops, options, callback);
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
Mongos.prototype.remove = function(ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!this.isConnected() && this.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return this.s.disconnectHandler.add('remove', ns, ops, options, callback);
  }

  executeWriteOperation(this.s, 'remove', ns, ops, options, callback);
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
Mongos.prototype.command = function(ns, cmd, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(this.s.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  var self = this;

  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.isConnected() && self.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    return self.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  var server = null;
  // Ensure we have no options
  options = options || {};

  // We need to execute the command on all servers
  if(options.onAll) {
    var servers = self.s.mongosState.getAll();
    var count = servers.length;
    var cmdErr = null;

    for(var i = 0; i < servers.length; i++) {
      servers[i].command(ns, cmd, options, function(err, r) {
        count = count - 1;
        // Finished executing command
        if(count == 0) {
          // Was it a logout command clear any credentials
          if(cmd.logout) clearCredentials(self.s, ns);
          // Return the error
          callback(err, r);
        }
      });
    }

    return;
  }


  try {
    // Get a primary
    server = self.s.mongosState.pickServer(options.writeConcern ? ReadPreference.primary : options.readPreference);
  } catch(err) {
    return callback(err);
  }

  // No server returned we had an error
  if(server == null) return callback(new MongoError("no mongos found"));
  server.command(ns, cmd, options, function(err, r) {
    // Was it a logout command clear any credentials
    if(cmd.logout) clearCredentials(self.s, ns);
    callback(err, r);
  });
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
Mongos.prototype.cursor = function(ns, cmd, cursorOptions) {
  cursorOptions = cursorOptions || {};
  var FinalCursor = cursorOptions.cursorFactory || this.s.Cursor;
  return new FinalCursor(this.s.bson, ns, cmd, cursorOptions, this, this.s.options);
}

/**
 * Authenticate using a specified mechanism
 * @method
 * @param {string} mechanism The Auth mechanism we are invoking
 * @param {string} db The db we are invoking the mechanism against
 * @param {...object} param Parameters for the specific mechanism
 * @param {authResultCallback} callback A callback function
 */
Mongos.prototype.auth = function(mechanism, db) {
  var allArgs = Array.prototype.slice.call(arguments, 0).slice(0);
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  var callback = args.pop();

  // If we don't have the mechanism fail
  if(this.s.authProviders[mechanism] == null && mechanism != 'default')
    throw new MongoError(f("auth provider %s does not exist", mechanism));

  // Authenticate against all the servers
  var servers = this.s.mongosState.connectedServers().slice(0);
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

//
// Plugin methods
//

/**
 * Add custom read preference strategy
 * @method
 * @param {string} name Name of the read preference strategy
 * @param {object} strategy Strategy object instance
 */
Mongos.prototype.addReadPreferenceStrategy = function(name, strategy) {
  if(this.s.readPreferenceStrategies == null) this.s.readPreferenceStrategies = {};
  this.s.readPreferenceStrategies[name] = strategy;
}

/**
 * Add custom authentication mechanism
 * @method
 * @param {string} name Name of the authentication mechanism
 * @param {object} provider Authentication object instance
 */
Mongos.prototype.addAuthProvider = function(name, provider) {
  this.s.authProviders[name] = provider;
}

/**
 * Get connection
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {Connection}
 */
Mongos.prototype.getConnection = function(options) {
  // Ensure we have no options
  options = options || {};
  // Pick the right server based on readPreference
  var server = this.s.mongosState.pickServer(options.readPreference);
  if(server == null) return null;
  // Return connection
  return server.getConnection();
}

/**
 * Get server
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {Server}
 */
Mongos.prototype.getServer = function(options) {
  // Ensure we have no options
  options = options || {};
  // Pick the right server based on readPreference
  return this.s.mongosState.pickServer(options.readPreference);
}

/**
 * All raw connections
 * @method
 * @return {Connection[]}
 */
Mongos.prototype.connections = function() {
  return this.s.mongosState.getAllConnections();
}

//
// Inquires about state changes
//
var mongosInquirer = function(self, state) {
  return function() {
    if(state.state == DESTROYED) return
    if(state.state == CONNECTED) state.retriesLeft = state.reconnectTries;

    // If we have a disconnected site
    if(state.state == DISCONNECTED && state.retriesLeft == 0) {
      self.destroy();
      return self.emit('error', new MongoError(f('failed to reconnect after %s', state.reconnectTries)));
    } else if(state.state == DISCONNECTED) {
      state.retriesLeft = state.retriesLeft - 1;
    }

    // If we have a primary and a disconnect handler, execute
    // buffered operations
    if(state.mongosState.isConnected() && state.disconnectHandler) {
      state.disconnectHandler.execute();
    }

    // Log the information
    if(state.logger.isDebug()) state.logger.debug(f('mongos ha proceess running'));

    // Let's query any disconnected proxies
    var disconnectedServers = state.mongosState.disconnectedServers();
    if(disconnectedServers.length == 0) return setTimeout(mongosInquirer(self, state), state.haInterval);

    // Count of connections waiting to be connected
    var connectionCount = disconnectedServers.length;
    if(state.logger.isDebug()) state.logger.debug(f('mongos ha proceess found %d disconnected proxies', connectionCount));

    // Let's attempt to reconnect
    while(disconnectedServers.length > 0) {
      // Connect to proxy
      var connectToProxy = function(_server) {
        setTimeout(function() {
          // Remove any non used handlers
          ['error', 'close', 'timeout', 'connect', 'message', 'parseError',
            'serverOpening', 'serverDescriptionChanged', 'serverHeartbeatStarted',
            'serverHeartbeatSucceeded', 'serverHearbeatFailed', 'serverClosed'].forEach(function(e) {
            _server.removeAllListeners(e);
          });

          // Set up the event handlers
          _server.once('error', errorHandlerTemp(self, state, server));
          _server.once('close', errorHandlerTemp(self, state, server));
          _server.once('timeout', errorHandlerTemp(self, state, server));
          _server.once('connect', connectHandler(self, state, 'ha'));

          // SDAM Monitoring events
          _server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
          _server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
          _server.on('serverHeartbeatStarted', function(e) { self.emit('serverHeartbeatStarted', e); });
          _server.on('serverHeartbeatSucceeded', function(e) { self.emit('serverHeartbeatSucceeded', e); });
          _server.on('serverHearbeatFailed', function(e) { self.emit('serverHearbeatFailed', e); });
          _server.on('serverClosed', function(e) { self.emit('serverClosed', e); });

          // Start connect
          _server.connect();
        }, 1);
      }

      var server = disconnectedServers.shift();
      if(state.logger.isDebug()) state.logger.debug(f('attempting to connect to server %s', server.name));
      connectToProxy(server);
    }

    // Let's keep monitoring but wait for possible timeout to happen
    return setTimeout(mongosInquirer(self, state), state.options.connectionTimeout + state.haInterval);
  }
}

//
// Error handler for initial connect
var errorHandlerTemp = function(self, state, server) {
  return function(err, server) {
    // Log the information
    if(state.logger.isInfo()) state.logger.info(f('server %s disconnected with error %s',  server.name, JSON.stringify(err)));

    // Signal disconnect of server
    state.mongosState.disconnected(server);

    // Remove any non used handlers
    var events = ['error', 'close', 'timeout', 'connect'];
    events.forEach(function(e) {
      server.removeAllListeners(e);
    })
  }
}

//
// Handlers
var errorHandler = function(self, state) {
  return function(err, server) {
    if(state.logger.isInfo()) state.logger.info(f('server %s errored out with %s', server.name, JSON.stringify(err)));
    state.mongosState.disconnected(server);
    // No more servers left emit close
    if(state.mongosState.connectedServers().length == 0) {
      state.state = DISCONNECTED;
    }

    // Emit topology changed event
    emitTopologyDescriptionChanged(self, state.mongosState);

    // Signal server left
    self.emit('left', 'mongos', server);
    if(state.emitError) self.emit('error', err, server);
  }
}

var timeoutHandler = function(self, state) {
  return function(err, server) {
    if(state.logger.isInfo()) state.logger.info(f('server %s timed out', server.name));
    state.mongosState.disconnected(server);

    // No more servers emit close event if no entries left
    if(state.mongosState.connectedServers().length == 0) {
      state.state = DISCONNECTED;
    }

    // Emit topology changed event
    emitTopologyDescriptionChanged(self, state.mongosState);

    // Signal server left
    self.emit('left', 'mongos', server);
  }
}

var closeHandler = function(self, state) {
  return function(err, server) {
    if(state.logger.isInfo()) state.logger.info(f('server %s closed', server.name));
    state.mongosState.disconnected(server);

    // No more servers left emit close
    if(state.mongosState.connectedServers().length == 0) {
      state.state = DISCONNECTED;
    }

    // Emit topology changed event
    emitTopologyDescriptionChanged(self, state.mongosState);

    // Signal server left
    self.emit('left', 'mongos', server);
  }
}

// Connect handler
var connectHandler = function(self, state, e) {
  return function(server) {
    if(state.logger.isInfo()) state.logger.info(f('connected to %s', server.name));

    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect', 'message', 'parseError'].forEach(function(e) {
      server.removeAllListeners(e);
    });

    // finish processing the server
    var processNewServer = function(_server) {
      // Add the server handling code
      if(_server.isConnected()) {
        _server.once('error', errorHandler(self, state));
        _server.once('close', closeHandler(self, state));
        _server.once('timeout', timeoutHandler(self, state));
        _server.once('parseError', timeoutHandler(self, state));
      }

      // Emit joined event
      self.emit('joined', 'mongos', _server);

      // Add to list connected servers
      state.mongosState.connected(_server);

      // Do we have a reconnect event
      if('ha' == e && state.mongosState.connectedServers().length == 1) {
        self.emit('reconnect', _server);
      }

      // Full setup
      if(state.mongosState.disconnectedServers().length == 0 &&
        state.mongosState.connectedServers().length > 0 &&
        !state.fullsetup) {
        state.fullsetup = true;
        self.emit('fullsetup', self);
      }

      // all connected
      if(state.mongosState.disconnectedServers().length == 0 &&
        state.mongosState.connectedServers().length == state.seedlist.length &&
        !state.all) {
        state.all = true;
        self.emit('all', self);
      }

      // Emit topology changed event
      emitTopologyDescriptionChanged(self, state.mongosState);

      // Set connected
      if(state.state == DISCONNECTED) {
        state.state = CONNECTED;
        self.emit('reconnect', self);
      } else if(state.state == CONNECTING) {
        state.state = CONNECTED;
        self.emit('connect', self);
      }
    }

    // Is there an authentication process ongoing
    if(state.authInProgress) {
      state.authInProgressServers.push(server);
    }

    // No credentials just process server
    if(state.credentials.length == 0) return processNewServer(server);

    // Do we have credentials, let's apply them all
    var count = state.credentials.length;
    // Apply the credentials
    for(var i = 0; i < state.credentials.length; i++) {
      server.auth.apply(server, state.credentials[i].concat([function(err, r) {
        count = count - 1;
        if(count == 0) processNewServer(server);
      }]));
    }
  }
}

//
// Add server to the list if it does not exist
var addToListIfNotExist = function(list, server) {
  var found = false;

  // Remove any non used handlers
  ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
    server.removeAllListeners(e);
  })

  // Check if the server already exists
  for(var i = 0; i < list.length; i++) {
    if(list[i].equals(server)) found = true;
  }

  if(!found) {
    list.push(server);
  }
}

// Add the new credential for a db, removing the old
// credential from the cache
var addCredentials = function(state, db, argsWithoutCallback) {
  // Remove any credentials for the db
  clearCredentials(state, db + ".dummy");
  // Add new credentials to list
  state.credentials.push(argsWithoutCallback);
}

// Clear out credentials for a namespace
var clearCredentials = function(state, ns) {
  var db = ns.split('.')[0];
  var filteredCredentials = [];

  // Filter out all credentials for the db the user is logging out off
  for(var i = 0; i < state.credentials.length; i++) {
    if(state.credentials[i][1] != db) filteredCredentials.push(state.credentials[i]);
  }

  // Set new list of credentials
  state.credentials = filteredCredentials;
}

var processReadPreference = function(cmd, options) {
  options = options || {}
  // No read preference specified
  if(options.readPreference == null) return cmd;
}

//
// Execute write operation
var executeWriteOperation = function(state, op, ns, ops, options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  var server = null;
  // Ensure we have no options
  options = options || {};
  try {
    // Get a primary
    server = state.mongosState.pickServer();
  } catch(err) {
    return callback(err);
  }

  // No server returned we had an error
  if(server == null) return callback(new MongoError("no mongos found"));
  // Execute the command
  server[op](ns, ops, options, callback);
}

/**
 * A mongos connect event, used to verify that the connection is up and running
 *
 * @event Mongos#connect
 * @type {Mongos}
 */

/**
 * A server member left the mongos list
 *
 * @event Mongos#left
 * @type {Mongos}
 * @param {string} type The type of member that left (mongos)
 * @param {Server} server The server object that left
 */

/**
 * A server member joined the mongos list
 *
 * @event Mongos#joined
 * @type {Mongos}
 * @param {string} type The type of member that left (mongos)
 * @param {Server} server The server object that joined
 */

module.exports = Mongos;
