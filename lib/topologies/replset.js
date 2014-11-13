var inherits = require('util').inherits
  , f = require('util').format
  , b = require('bson')
  , bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain
  , EventEmitter = require('events').EventEmitter
  , Server = require('./server')
  , ReadPreference = require('./read_preference')
  , MongoError = require('../error')
  , Ping = require('./strategies/ping')
  , Session = require('./session')
  , BasicCursor = require('../cursor')
  , BSON = require('bson').native().BSON
  , State = require('./replset_state')
  , Logger = require('../connection/logger');

/**
 * @fileOverview The **ReplSet** class is a class that represents a Replicaset topology and is
 * used to construct connections.
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
 * @param {number} [options.haInterval=5000] The High availability period for replicaset inquiry
 * @param {boolean} [options.emitError=false] Server will emit errors events
 * @param {Cursor} [options.cursorFactory=Cursor] The cursor factory class used for all query cursors
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
 * @return {ReplSet} A cursor instance
 * @fires ReplSet#connect
 * @fires ReplSet#ha
 * @fires ReplSet#joined
 * @fires ReplSet#left
 */
var ReplSet = function(seedlist, options) {
  var self = this;
  options = options || {};

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
    , haInterval: options.haInterval || 5000
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
    // Currently connecting servers
    , connectingServers: {}
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
  }

  // Add bson parser to options
  options.bson = this.s.bson;
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 10000;

  // The replicaset name
  if(this.s.setName == null) throw new MongoError("setName option must be provided");

  // Replicaset state
  var replState = new State(this, {
      id: this.s.id, setName: this.s.setName
    , connectingServers: this.s.connectingServers
    , secondaryOnlyConnectionAllowed: this.s.secondaryOnlyConnectionAllowed
  });

  // Add Replicaset state to our internal state
  this.s.replState = replState;

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
  return this.s.replState.getAllConnections();
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
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {{object}|{Long}} cmd Can be either a command returning a cursor or a cursorId
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
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
  
  // Execute the command
  server[op](ns, ops, options, function(err, r) {
    // We have a no master error, immediately refresh the view of the replicaset
    if(notMasterError(r) || notMasterError(err)) replicasetInquirer(self, self.s, true)();
    // Return the result
    callback(err, r);
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
ReplSet.prototype.command = function(ns, cmd, options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

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
          if(notMasterError(r) || notMasterError(err)) replicasetInquirer(self, self.s, true)();
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
    if(notMasterError(r) || notMasterError(err)) {
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
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.remove = function(ns, ops, options, callback) {
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
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.insert = function(ns, ops, options, callback) {
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
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.update = function(ns, ops, options, callback) {
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
  if(this.s.authProviders[mechanism] == null && mechanism != 'default') 
    throw new MongoError(f("auth provider %s does not exist", mechanism));

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
 * Initiate server connect
 * @method
 */
ReplSet.prototype.connect = function(_options) {
  var self = this;
  // Start replicaset inquiry process
  setTimeout(replicasetInquirer(this, this.s, false), this.s.haInterval);
  // Additional options
  if(_options) for(var name in _options) this.s.options[name] = _options[name];

  // Set the state as connecting
  this.s.replState.state = CONNECTING;

  // No fullsetup reached
  this.s.fullsetup = false;

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
    if(self.s.tag) opts.tag = self.s.tag;
    // Share the auth store
    opts.authProviders = self.s.authProviders;
    // Create a new Server
    var server = new Server(opts);
    // Add to list of disconnected servers
    self.s.disconnectedServers.push(server);
    // Add to list of inflight Connections
    self.s.initialConnectionServers.push(server);
  });

  // Attempt to connect to all the servers
  while(this.s.disconnectedServers.length > 0) {
    // Get the server
    var server = this.s.disconnectedServers.shift();

    // Set up the event handlers
    server.once('error', errorHandlerTemp(this, this.s, 'error'));
    server.once('close', errorHandlerTemp(this, this.s, 'close'));
    server.once('timeout', errorHandlerTemp(this, this.s, 'timeout'));
    server.once('connect', connectHandler(this, this.s));
    
    // Attempt to connect
    server.connect();
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
    && options.readPreference.equals(ReadPreference.secondary))
    return this.s.replState.isSecondaryConnected();

  if(options.readPreference 
    && options.readPreference.equals(ReadPreference.primary))
    return this.s.replState.isSecondaryConnected() || this.s.replState.isPrimaryConnected();

  if(this.s.secondaryOnlyConnectionAllowed) return this.s.replState.isSecondaryConnected();
  return this.s.replState.isPrimaryConnected();
}

/**
 * Destroy the server connection
 * @method
 */
ReplSet.prototype.destroy = function() {
  var self = this;
  if(this.s.logger.isInfo()) this.s.logger.info(f('[%s] destroyed', this.s.id));
  this.s.replState.state = DESTROYED;
  this.s.replState.destroy();

  // Clear out any listeners
  var events = ['timeout', 'error', 'close', 'joined', 'left'];
  events.forEach(function(e) {
    self.removeAllListeners(e);
  });
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
// Pick a server based on readPreference
var pickServer = function(self, s, readPreference) {
  if(!(readPreference instanceof ReadPreference) 
    && readPreference != null) throw new MongoError(f("readPreference %s must be an instance of ReadPreference", readPreference));
  // If no read Preference set to primary by default
  readPreference = readPreference || ReadPreference.primary;

  // Do we have a custom readPreference strategy, use it
  if(s.readPreferenceStrategies != null && s.readPreferenceStrategies[readPreference.preference] != null) {
    if(s.readPreferenceStrategies[readPreference.preference] == null) throw new MongoError(f("cannot locate read preference handler for %s", readPreference.preference));
    var server = s.readPreferenceStrategies[readPreference.preference].pickServer(s.replState, readPreference);
    if(s.debug) self.emit('pickedServer', readPreference, server);
    return server;
  }

  // Check if we can satisfy and of the basic read Preferences
  if(readPreference.equals(ReadPreference.secondary) 
    && s.replState.secondaries.length == 0)
      throw new MongoError("no secondary server available");
  
  if(readPreference.equals(ReadPreference.secondaryPreferred)
      && s.replState.secondaries.length == 0
      && s.replState.primary == null)
    throw new MongoError("no secondary or primary server available");

  if(readPreference.equals(ReadPreference.primary)
    && s.replState.primary == null)
      throw new MongoError("no primary server available");

  // Secondary
  if(readPreference.equals(ReadPreference.secondary)) {
    s.index = s.index + 1;
    return s.replState.secondaries[s.index % s.replState.secondaries.length];
  }

  // Secondary preferred
  if(readPreference.equals(ReadPreference.secondaryPreferred)) {
    if(s.replState.secondaries.length > 0) {
      s.index = s.index + 1;
      return s.replState.secondaries[s.index % s.replState.secondaries.length];
    }

    return s.replState.primary;
  }

  // Primary preferred
  if(readPreference.equals(ReadPreference.primaryPreferred)) {
    if(s.replState.primary) return s.replState.primary;

    if(s.replState.secondaries.length > 0) {
      s.index = s.index + 1;
      return s.replState.secondaries[s.index % s.replState.secondaries.length];
    }
  }

  // Return the primary
  return s.replState.primary;
}

var replicasetInquirer = function(self, state, norepeat) {
  return function() {
    if(state.replState.state == DESTROYED) return
    // Process already running don't rerun
    if(state.highAvailabilityProcessRunning) return;
    // Started processes
    state.highAvailabilityProcessRunning = true;
    if(state.logger.isInfo()) state.logger.info(f('[%s] monitoring process running %s', state.id, JSON.stringify(state.replState)));

    // Unique HA id to identify the current look running
    var localHaId = state.haId++;

    // Clean out any failed connection attempts
    state.connectingServers = {};

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
      server.once('connect', connectHandler(self, state));
      // Attempt to connect
      server.connect();
    }

    // Cleanup state (removed disconnected servers)
    state.replState.clean();

    // We need to query all servers
    var servers = state.replState.getAll();
    var serversLeft = servers.length;

    // If no servers and we are not destroyed keep pinging
    if(servers.length == 0 && state.replState.state == CONNECTED) {
      // Emit ha process end
      self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
      // Ended highAvailabilityProcessRunning
      state.highAvailabilityProcessRunning = false;
      // Restart ha process
      if(!norepeat) setTimeout(replicasetInquirer(self, state, false), state.haInterval);
      return;
    }

    //
    // ismaster for Master server
    var primaryIsMaster = null;

    //
    // Inspect a specific servers ismaster
    var inspectServer = function(server) {
      if(state.replState.state == DESTROYED) return;
      // Did we get a server
      if(server && server.isConnected()) {
        // Execute ismaster
        server.command('system.$cmd', {ismaster:true}, function(err, r) {
          if(state.replState.state == DESTROYED) return;
          // Count down the number of servers left
          serversLeft = serversLeft - 1;
          // If we have an error but still outstanding server request return
          if(err && serversLeft > 0) return;          
          // We had an error and have no more servers to inspect, schedule a new check
          if(err && serversLeft == 0) {
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunnfing
            state.highAvailabilityProcessRunning = false;
            // Return the replicasetInquirer
            if(!norepeat) setTimeout(replicasetInquirer(self, state, false), state.haInterval);
            return;
          }

          // Let all the read Preferences do things to the servers
          var rPreferencesCount = Object.keys(state.readPreferenceStrategies).length;

          // Handle the primary
          var ismaster = r.result;
          if(state.logger.isDebug()) state.logger.debug(f('[%s] monitoring process ismaster %s', state.id, JSON.stringify(ismaster)));

          // Update the replicaset state
          state.replState.update(ismaster, server);

          // Add any new servers
          if(err == null && ismaster.ismaster && Array.isArray(ismaster.hosts)) {
            // Hosts to process
            var hosts = ismaster.hosts;
            // Add arbiters to list of hosts if we have any
            if(Array.isArray(ismaster.arbiters)) hosts = hosts.concat(ismaster.arbiters);
            if(Array.isArray(ismaster.passives)) hosts = hosts.concat(ismaster.passives);
            // Process all the hsots
            processHosts(self, state, hosts);
          }

          // No read Preferences strategies
          if(rPreferencesCount == 0) {
            // Don't schedule a new inquiry
            if(serversLeft > 0) return;
            // Emit ha process end
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunning
            state.highAvailabilityProcessRunning = false;
            // Let's keep monitoring
            if(!norepeat) setTimeout(replicasetInquirer(self, state, false), state.haInterval);
            return;
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
                      processHosts(self, state, ismaster.hosts);
                  }

                  // Emit ha process end
                  self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: state.replState ? state.replState.toJSON() : {}});
                  // Ended highAvailabilityProcessRunning
                  state.highAvailabilityProcessRunning = false;
                  // Let's keep monitoring
                  if(!norepeat) setTimeout(replicasetInquirer(self, state, false), state.haInterval);
                  return;
                }
              });
            }
          }
        });
      }
    }

    // Call ismaster on all servers
    for(var i = 0; i < servers.length; i++) {
      inspectServer(servers[i]);
    }

    // If no more initial servers and new scheduled servers to connect
    if(state.replState.secondaries.length >= 1 && state.replState.primary != null && !state.fullsetup) {
      state.fullsetup = true;
      self.emit('fullsetup', self);
    }

    // If all servers are accounted for and we have not sent the all event
    if(state.replState.primary != null && self.lastIsMaster() 
      && Array.isArray(self.lastIsMaster().hosts) && !state.all) {
      var length = 1 + state.replState.secondaries.length;
      if(length == self.lastIsMaster().hosts.length) {
        state.all = true;
        self.emit('all', self);   
      }
    }
  }
}

// Error handler for initial connect
var errorHandlerTemp = function(self, state, event) {
  return function(err, server) {
    // Log the information
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s disconnected', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    // Filter out any connection servers
    state.initialConnectionServers = state.initialConnectionServers.filter(function(_server) {
      return server.name != _server.name;
    });

    // Connection is destroyed, ignore
    if(state.replState.state == DESTROYED) return;

    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
      server.removeAllListeners(e);
    })

    // Push to list of disconnected servers
    addToListIfNotExist(state.disconnectedServers, server);

    // End connection operation if we have no legal replicaset state
    if(state.initialConnectionServers == 0 && state.replState.state == CONNECTING) {
       if((state.secondaryOnlyConnectionAllowed && !state.replState.isSecondaryConnected() && !state.replState.isPrimaryConnected()) 
        || (!state.secondaryOnlyConnectionAllowed && !state.replState.isPrimaryConnected())) {
          if(state.logger.isInfo()) state.logger.info(f('[%s] no valid seed servers in list', state.id));

          if(self.listeners('error').length > 0)
            return self.emit('error', new MongoError('no valid seed servers in list'));
       }
    }

    // If the number of disconnected servers is equal to 
    // the number of seed servers we cannot connect
    if(state.disconnectedServers.length == state.seedlist.length && state.replState.state == CONNECTING) {
      if(state.emitError && self.listeners('error').length > 0) {
        if(state.logger.isInfo()) state.logger.info(f('[%s] no valid seed servers in list', state.id));

        if(self.listeners('error').length > 0)
          self.emit('error', new MongoError('no valid seed servers in list'));
      } 
    }
  }
}

// Connect handler
var connectHandler = function(self, state) {
  return function(server) {
    if(state.logger.isInfo()) logger.info(f('[%s] connected to %s', state.id, server.name));
    if(state.replState.state == DESTROYED) return;

    // Filter out any connection servers
    state.initialConnectionServers = state.initialConnectionServers.filter(function(_server) {
      return server.name != _server.name;
    });

    // Process the new server
    var processNewServer = function() {
      // Discover any additional servers
      var ismaster = server.lastIsMaster();

      var events = ['error', 'close', 'timeout', 'connect', 'message'];
      // Remove any non used handlers
      events.forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Clean up
      delete state.connectingServers[server.name];
      // Update the replicaset state, destroy if not added
      if(!state.replState.update(ismaster, server)) {
        return server.destroy();
      }      

      // Add the server handling code
      if(server.isConnected()) {
        server.on('error', errorHandler(self, state));
        server.on('close', closeHandler(self, state));
        server.on('timeout', timeoutHandler(self, state));
      }

      // Hosts to process
      var hosts = ismaster.hosts;
      // Add arbiters to list of hosts if we have any
      if(Array.isArray(ismaster.arbiters)) hosts = hosts.concat(ismaster.arbiters);
      if(Array.isArray(ismaster.passives)) hosts = hosts.concat(ismaster.passives);

      // Add any new servers
      processHosts(self, state, hosts);

      // If have the server instance already destroy it
      if(state.initialConnectionServers.length == 0 && Object.keys(state.connectingServers).length == 0 
        && !state.replState.isPrimaryConnected() && !state.secondaryOnlyConnectionAllowed && state.replState.state == CONNECTING) {
        if(state.logger.isInfo()) state.logger.info(f('[%s] no primary found in replicaset', state.id));
        self.emit('error', new MongoError("no primary found in replicaset"));
        return self.destroy();        
      }

      // If no more initial servers and new scheduled servers to connect
      if(state.replState.secondaries.length >= 1 && state.replState.primary != null && !state.fullsetup) {
        state.fullsetup = true;
        self.emit('fullsetup', self);
      }
    }

    // Save up new members to be authenticated against
    if(self.s.authInProgress) {
      self.s.authInProgressServers.push(server);
    }

    // No credentials just process server
    if(state.credentials.length == 0) return processNewServer();
    // Do we have credentials, let's apply them all
    var count = state.credentials.length;
    // Apply the credentials
    for(var i = 0; i < state.credentials.length; i++) {
      server.auth.apply(server, state.credentials[i].concat([function(err, r) {        
        count = count - 1;
        if(count == 0) processNewServer();
      }]));
    }
  }
}

//
// Detect if we need to add new servers
var processHosts = function(self, state, hosts) {
  if(state.replState.state == DESTROYED) return;
  if(Array.isArray(hosts)) {
    // Check any hosts exposed by ismaster
    for(var i = 0; i < hosts.length; i++) {
      // If not found we need to create a new connection
      if(!state.replState.contains(hosts[i])) {
        if(state.connectingServers[hosts[i]] == null && !inInitialConnectingServers(self, state, hosts[i])) {
          if(state.logger.isInfo()) state.logger.info(f('[%s] scheduled server %s for connection', state.id, hosts[i]));
          // Make sure we know what is trying to connect            
          state.connectingServers[hosts[i]] = hosts[i];            
          // Connect the server
          connectToServer(self, state, hosts[i].split(':')[0], parseInt(hosts[i].split(':')[1], 10));
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
var connectToServer = function(self, state, host, port) {
  var opts = cloneOptions(state.options);
  opts.host = host;
  opts.port = port;
  opts.reconnect = false;
  opts.readPreferenceStrategies = state.readPreferenceStrategies;
  if(state.tag) opts.tag = state.tag;
  // Share the auth store
  opts.authProviders = state.authProviders;
  opts.emitError = true;
  // Create a new server instance
  var server = new Server(opts);
  // Set up the event handlers
  server.once('error', errorHandlerTemp(self, state, 'error'));
  server.once('close', errorHandlerTemp(self, state, 'close'));
  server.once('timeout', errorHandlerTemp(self, state, 'timeout'));
  server.once('connect', connectHandler(self, state));
  // Attempt to connect
  server.connect();      
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

  return found;
}

var errorHandler = function(self, state) {
  return function(err, server) {
    if(state.replState.state == DESTROYED) return;
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s errored out with %s', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name, JSON.stringify(err)));
    var found = addToListIfNotExist(state.disconnectedServers, server);
    if(!found) self.emit('left', state.replState.remove(server), server);
    if(found && state.emitError && self.listeners('error').length > 0) self.emit('error', err, server);
  }
}

var timeoutHandler = function(self, state) {
  return function(err, server) {
    if(state.replState.state == DESTROYED) return;
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s timed out', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    var found = addToListIfNotExist(state.disconnectedServers, server);
    if(!found) self.emit('left', state.replState.remove(server), server);
  }
}

var closeHandler = function(self, state) {
  return function(err, server) {
    if(state.replState.state == DESTROYED) return;
    if(state.logger.isInfo()) state.logger.info(f('[%s] server %s closed', state.id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    var found = addToListIfNotExist(state.disconnectedServers, server);
    if(!found) self.emit('left', state.replState.remove(server), server);
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