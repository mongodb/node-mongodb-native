var inherits = require('util').inherits
  , f = require('util').format
  , b = require('bson')
  , bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain
  , EventEmitter = require('events').EventEmitter
  , BasicCursor = require('../cursor')
  , BSON = require('bson').native().BSON
  , BasicCursor = require('../cursor')
  , Server = require('./server')
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

var State = function(readPreferenceStrategies) {
  var connectedServers = [];
  var disconnectedServers = [];

  //
  // A Mongos connected
  this.connected = function(server) {
    // Locate in disconnected servers and remove
    disconnectedServers = disconnectedServers.filter(function(s) {
      return !s.equals(server);
    });

    var found = false;
    // Check if the server exists
    connectedServers.forEach(function(s) {
      if(s.equals(server)) found = true;
    });

    // Add to disconnected list if it does not already exist
    if(!found) connectedServers.push(server);
  }

  //
  // A Mongos disconnected
  this.disconnected = function(server) {
    // Locate in disconnected servers and remove
    connectedServers = connectedServers.filter(function(s) {
      return !s.equals(server);
    });

    var found = false;
    // Check if the server exists
    disconnectedServers.forEach(function(s) {
      if(s.equals(server)) found = true;
    });

    // Add to disconnected list if it does not already exist
    if(!found) disconnectedServers.push(server);
  }

  //
  // Return the list of disconnected servers
  this.disconnectedServers = function() {
    return disconnectedServers.slice(0);
  }

  //
  // Get connectedServers
  this.connectedServers = function() {
    return connectedServers.slice(0)
  }

  //
  // Get all servers
  this.getAll = function() {
    return connectedServers.slice(0).concat(disconnectedServers);
  }

  //
  // Get all connections
  this.getAllConnections = function() {
    var connections = [];
    connectedServers.forEach(function(e) {
      connections = connections.concat(e.connections());
    });
    return connections;
  }

  //
  // Destroy the state
  this.destroy = function() {
    // Destroy any connected servers
    while(connectedServers.length > 0) {
      var server = connectedServers.shift();

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Server destroy
      server.destroy();
      // Add to list of disconnected servers
      disconnectedServers.push(server);
    }        
  }

  //
  // Are we connected
  this.isConnected = function() {
    return connectedServers.length > 0;
  }

  //
  // Pick a server
  this.pickServer = function(readPreference) {
    readPreference = readPreference || ReadPreference.primary;

    // Do we have a custom readPreference strategy, use it
    if(readPreferenceStrategies != null && readPreferenceStrategies[readPreference] != null) {
      return readPreferenceStrategies[readPreference].pickServer(connectedServers, readPreference);
    }

    // No valid connections
    if(connectedServers.length == 0) throw new MongoError("no mongos proxy available");
    // Pick first one
    return connectedServers[0];
  }
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
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=1000] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=false] Reject unauthorized server certificates
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

  // Logger
  var logger = Logger('Mongos', options);

  // Options
  var reconnectTries = options.reconnectTries || 30;
  var haInterval = options.haInterval || 5000;
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 1000;

  // Have omitted fullsetup
  var fullsetup = false;


  //
  // Factory overrides
  //
  var Cursor = options.cursorFactory || BasicCursor;

  // BSON Parser, ensure we have a single instance
  if(bsonInstance == null) {
    bsonInstance = new BSON(bsonTypes);
  }

  //
  // Current credentials used for auth
  var credentials = [];  

  // Pick the right bson parser
  var bson = options.bson ? options.bson : bsonInstance;
  // Add bson parser to options
  options.bson = bson;

  // Default state
  var state = DISCONNECTED;
  // Swallow or emit errors
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : false;

  // Contains any alternate strategies for picking
  var readPreferenceStrategies = {};
  // Auth providers
  var authProviders = {};

  // Unique instance id
  var id = mongosId++;

  // Current retries left
  var retriesLeft = reconnectTries;

  // Do we have a not connected handler
  var disconnectHandler = options.disconnectHandler;

  // Create a new state for the mongos
  var mongosState = new State(readPreferenceStrategies);

  // Validate seedlist
  if(!Array.isArray(seedlist)) throw new MongoError("seedlist must be an array");
  // Validate list
  if(seedlist.length == 0) throw new MongoError("seedlist must contain at least one entry");
  // Validate entries
  seedlist.forEach(function(e) {
    if(typeof e.host != 'string' || typeof e.port != 'number') 
      throw new MongoError("seedlist entry must contain a host and port");
  });

  // BSON property (find a server and pass it along)
  Object.defineProperty(this, 'bson', {
    enumerable: true, get: function() { 
      var servers = mongosState.getAll();
      return servers.length > 0 ? servers[0].bson : null; 
    }
  });

  Object.defineProperty(this, 'id', {
    enumerable:true, get: function() { return id; }
  });

  Object.defineProperty(this, 'type', {
    enumerable:true, get: function() { return 'mongos'; }
  });

  Object.defineProperty(this, 'haInterval', {
    enumerable:true, get: function() { return haInterval; }
  });

  Object.defineProperty(this, 'state', {
    enumerable:true, get: function() { return mongosState; }
  });  

  //
  // Inquires about state changes
  //
  var mongosInquirer = function() {    
    if(state == DESTROYED) return
    if(state == CONNECTED) retriesLeft = reconnectTries;

    // If we have a disconnected site
    if(state == DISCONNECTED && retriesLeft == 0) {
      self.destroy();
      return self.emit('error', new MongoError(f('failed to reconnect after %s', reconnectTries)));
    } else if(state == DISCONNECTED) {
      retriesLeft = retriesLeft - 1;
    }

    // If we have a primary and a disconnect handler, execute
    // buffered operations
    if(mongosState.isConnected() && disconnectHandler) {
      disconnectHandler.execute();
    }

    // Log the information
    if(logger.isDebug()) logger.debug(f('mongos ha proceess running'));
    
    // Let's query any disconnected proxies
    var disconnectedServers = mongosState.disconnectedServers();
    if(disconnectedServers.length == 0) return setTimeout(mongosInquirer, haInterval);
    
    // Count of connections waiting to be connected
    var connectionCount = disconnectedServers.length;
    if(logger.isDebug()) logger.debug(f('mongos ha proceess found %d disconnected proxies', connectionCount));
    
    // Let's attempt to reconnect
    while(disconnectedServers.length > 0) {
      var server = disconnectedServers.shift();
      if(logger.isDebug()) logger.debug(f('attempting to connect to server %s', server.name));

      // Remove any listeners
      ['error', 'close', 'timeout', 'connect', 'message', 'parseError'].forEach(function(e) {
        server.removeAllListeners(e);
      });
  
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler('ha'));
      // Start connect
      server.connect();
    }

    // Let's keep monitoring but wait for possible timeout to happen
    return setTimeout(mongosInquirer, options.connectionTimeout + haInterval);
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

  //
  // Error handler for initial connect
  var errorHandlerTemp = function(server) {
    return function(err, server) {
      // Log the information
      if(logger.isInfo()) logger.info(f('server %s disconnected with error %s',  server.name, JSON.stringify(err)));

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Signal disconnect of server
      mongosState.disconnected(server);
    }
  }

  //
  // Handlers
  var messageHandler = function(response, connection) {
    if(logger.isDebug()) logger.debug(f('message [%s] received from %s', response.raw.toString('hex'), f("%s:%s", options.host, options.port)));
    // Execute callback
    callbacks.emit(response.responseTo, null, response);      
  }

  var errorHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s errored out with %s', server.name, JSON.stringify(err)));
    mongosState.disconnected(server);
    if(mongosState.connectedServers().length == 0) state = DISCONNECTED;
    self.emit('left', 'mongos', server);    
    if(emitError) self.emit('error', err, server);
  }

  var timeoutHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s timed out', server.name));
    mongosState.disconnected(server);
    if(mongosState.connectedServers().length == 0) state = DISCONNECTED;
    self.emit('left', 'mongos', server);
  }

  var closeHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s closed', server.name));
    mongosState.disconnected(server);
    if(mongosState.connectedServers().length == 0) state = DISCONNECTED;
    self.emit('left', 'mongos', server);
  }

  // Connect handler
  var connectHandler = function(e) {
    return function(server) {
      if(logger.isInfo()) logger.info(f('connected to %s', server.name));

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect', 'message', 'parseError'].forEach(function(e) {
        server.removeAllListeners(e);
      });

      // finish processing the server
      var processNewServer = function(_server) {
        // Add the server handling code
        if(_server.isConnected()) {
          _server.once('error', errorHandler);
          _server.once('close', closeHandler);
          _server.once('timeout', timeoutHandler);
          _server.once('parseError', timeoutHandler);
          _server.on('message', messageHandler);        
        }

        // Emit joined event
        self.emit('joined', 'mongos', _server);

        // Add to list connected servers
        mongosState.connected(_server);

        // Do we have a reconnect event
        if('ha' == e && mongosState.connectedServers().length == 1) {
          self.emit('reconnect', _server);
        }

        if(mongosState.disconnectedServers().length == 0 && 
          mongosState.connectedServers().length > 0 &&
          !fullsetup) {
          fullsetup = true;
          self.emit('fullsetup');
        }

        // Set connected
        if(state == DISCONNECTED) {
          state = CONNECTED;
          self.emit('connect', self);
        }
      }

      // No credentials just process server
      if(credentials.length == 0) return processNewServer(server);

      // Do we have credentials, let's apply them all
      var count = credentials.length;
      // Apply the credentials
      for(var i = 0; i < credentials.length; i++) {
        server.auth.apply(server, credentials[i].concat([function(err, r) {        
          count = count - 1;
          if(count == 0) processNewServer(server);
        }]));
      }
    }
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
    var connectedServers = mongosState.connectedServers();
    if(connectedServers.length > 0) return connectedServers[0].lastIsMaster();
    return null; 
  }

  /**
   * Initiate server connect
   * @method
   */
  this.connect = function(_options) {
    // Start replicaset inquiry process
    setTimeout(mongosInquirer, haInterval);
    // Additional options
    if(_options) for(var name in _options) options[name] = _options[name];
    // For all entries in the seedlist build a server instance
    seedlist.forEach(function(e) {
      // Clone options
      var opts = cloneOptions(options);
      // Add host and port
      opts.host = e.host;
      opts.port = e.port;
      opts.reconnect = false;
      opts.readPreferenceStrategies = readPreferenceStrategies;
      // Share the auth store
      opts.authProviders = authProviders;
      // Don't emit errors
      opts.emitError = true;
      // Create a new Server
      mongosState.disconnected(new Server(opts));
    });

    // Get the disconnected servers
    var servers = mongosState.disconnectedServers();

    // Attempt to connect to all the servers
    while(servers.length > 0) {
      // Get the server
      var server = servers.shift();      

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect', 'message', 'parseError'].forEach(function(e) {
        server.removeAllListeners(e);
      });

      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('parseError', errorHandlerTemp);
      server.once('connect', connectHandler('connect'));

      if(logger.isInfo()) logger.info(f('connecting to server %s', server.name));
      // Attempt to connect
      server.connect();
    }
  }

  /**
   * Destroy the server connection
   * @method
   */
  this.destroy = function() {
    state = DESTROYED;
    // Destroy the state
    mongosState.destroy();
  }

  /**
   * Figure out if the server is connected
   * @method
   * @return {boolean}
   */
  this.isConnected = function() {
    return mongosState.isConnected();
  }

  //
  // Operations
  //

  //
  // Execute write operation
  var executeWriteOperation = function(op, ns, ops, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    var server = null;
    // Ensure we have no options
    options = options || {};
    try {
      // Get a primary      
      server = mongosState.pickServer();
    } catch(err) {
      return callback(err);
    }

    // No server returned we had an error
    if(server == null) return callback(new MongoError("no mongos found"));
    // Execute the command
    server[op](ns, ops, options, callback);          
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

    executeWriteOperation('insert', ns, ops, options, callback);
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

    executeWriteOperation('update', ns, ops, options, callback);
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

    executeWriteOperation('remove', ns, ops, options, callback);
  }    

  var processReadPreference = function(cmd, options) {
    options = options || {}
    // No read preference specified
    if(options.readPreference == null) return cmd;
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
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.isConnected() && disconnectHandler != null) {
      callback = bindToCurrentDomain(callback);
      return disconnectHandler.add('command', ns, cmd, options, callback);
    }

    var server = null;
    // Ensure we have no options
    options = options || {};

    // We need to execute the command on all servers
    if(options.onAll) {
      var servers = mongosState.getAll();
      var count = servers.length;
      var cmdErr = null;

      for(var i = 0; i < servers.length; i++) {
        servers[i].command(ns, cmd, options, function(err, r) {
          count = count - 1;
          // Finished executing command
          if(count == 0) {
            // Was it a logout command clear any credentials      
            if(cmd.logout) clearCredentials(ns);
            // Return the error
            callback(err, r);
          }
        });
      }

      return;
    }


    try {
      // Get a primary      
      server = mongosState.pickServer(options.writeConcern ? ReadPreference.primary : options.readPreference);
    } catch(err) {
      return callback(err);
    }

    // No server returned we had an error
    if(server == null) return callback(new MongoError("no mongos found"));
    server.command(ns, cmd, options, function(err, r) {
      // Was it a logout command clear any credentials      
      if(cmd.logout) clearCredentials(ns);
      callback(err, r);      
    });
  }

  // Add the new credential for a db, removing the old
  // credential from the cache
  var addCredentials = function(db, argsWithoutCallback) {
    // Remove any credentials for the db
    clearCredentials(db + ".dummy");
    // Add new credentials to list
    credentials.push(argsWithoutCallback);
  }

  // Clear out credentials for a namespace
  var clearCredentials = function(ns) {
    var db = ns.split('.')[0];
    var filteredCredentials = [];

    // Filter out all credentials for the db the user is logging out off
    for(var i = 0; i < credentials.length; i++) {
      if(credentials[i][1] != db) filteredCredentials.push(credentials[i]);
    }

    // Set new list of credentials
    credentials = filteredCredentials;
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
  this.cursor = function(ns, cmd, cursorOptions) {
    cursorOptions = cursorOptions || {};
    var FinalCursor = cursorOptions.cursorFactory || Cursor;
    return new FinalCursor(bson, ns, cmd, cursorOptions, self, options);
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

    // Authenticate against all the servers
    var servers = mongosState.connectedServers();
    var count = servers.length;
    // Correct authentication
    var authenticated = true;
    var authErr = null;

    // Authenticate against all servers
    while(servers.length > 0) {
      var server = servers.shift();
      
      // Create arguments
      var finalArguments = [mechanism, db].concat(args.slice(0)).concat([function(err, r) {
        count = count - 1;
        if(err) authErr = err;
        if(!r) authenticated = false;

        // We are done
        if(count == 0) {
          if(authErr) return callback(authErr, false);
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
   * Get connection
   * @method
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @return {Connection}
   */
  this.getConnection = function(options) {
    // Ensure we have no options
    options = options || {};
    // Pick the right server based on readPreference
    var server = mongosState.pickServer(options.readPreference);
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
  this.getServer = function(options) {
    // Ensure we have no options
    options = options || {};
    // Pick the right server based on readPreference
    return mongosState.pickServer(options.readPreference);
  }

  /**
   * All raw connections
   * @method
   * @return {Connection[]}
   */
  this.connections = function() {
    return mongosState.getAllConnections();
  }
}

inherits(Mongos, EventEmitter);

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