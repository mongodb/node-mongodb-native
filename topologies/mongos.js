var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter
  , Server = require('./server')
  , Logger = require('../connection/logger')
  , ReadPreference = require('./read_preference')
  , MongoError = require('../error');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

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
      return !s.equal(server);
    });

    var found = false;
    // Check if the server exists
    connectedServers.forEach(function(s) {
      if(s.equal(server)) found = true;
    });

    // Add to disconnected list if it does not already exist
    if(!found) connectedServers.push(server);
  }

  //
  // A Mongos disconnected
  this.disconnected = function(server) {
    // Locate in disconnected servers and remove
    connectedServers = connectedServers.filter(function(s) {
      return !s.equal(server);
    });

    var found = false;
    // Check if the server exists
    disconnectedServers.forEach(function(s) {
      if(s.equal(server)) found = true;
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
    options = options || {};
    readPreference = readPreference || ReadPreference.primary;

    // Do we have a custom readPreference strategy, use it
    if(readPreferenceStrategies != null && readPreferenceStrategies[readPreference] != null) {
      return readPreferenceStrategies[readPreference].pickServer(connectedServers, readPreference);
    }

    // No valid connections
    if(connectedServers.length == 0) return new MongoError("no mongos proxy available");
    // Pick first one
    return connectedServers[0];
  }
}

var Mongos = function(seedlist, options) {  
  var self = this;
  options = options || {};
  
  // Add event listener
  EventEmitter.call(this);

  // Logger
  var logger = Logger('Mongos', options);

  // Options
  var reconnectTries = options.reconnectTries || 30;
  var reconnectInterval = options.reconnectInterval || 2000;
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 10000;

  // Default state
  var state = DISCONNECTED;
  // Swallow or emit errors
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : false;

  // Contains any alternate strategies for picking
  var readPreferenceStrategies = {};
  // Auth providers
  var authProviders = {};

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

  //
  // Inquires about state changes
  //
  var replicasetInquirer = function() {    
    if(state == DESTROYED) return
    // Log the information
    if(logger.isDebug()) logger.debug(f('mongos ha proceess running'));
    // Let's query any disconnected proxies
    var disconnectedServers = mongosState.disconnectedServers();
    if(disconnectedServers.length == 0) return setTimeout(replicasetInquirer, reconnectInterval);
    // Count of connections waiting to be connected
    var connectionCount = disconnectedServers.length;
    if(logger.isDebug()) logger.debug(f('mongos ha proceess found %d disconnected proxies', connectionCount));
    // Let's attempt to reconnect
    while(disconnectedServers.length > 0) {
      var server = disconnectedServers.shift();
      if(logger.isDebug()) logger.debug(f('attempting to connect to server %s', server.name));
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);
      // Start connect
      server.connect();
    }

    // Let's keep monitoring but wait for possible timeout to happen
    return setTimeout(replicasetInquirer, options.connectionTimeout + reconnectInterval);
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
      if(list[i].equal(server)) found = true;
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
      // Incompatible server version emit error
      if(err && server.lastIsMaster() && typeof server.lastIsMaster().minWireVersion != 'number') {
        if(logger.isError()) logger.error(f('server %s version is unsupported',  server.name));
        return self.emit('error', err, server);
      }
      
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
    self.emit('left', server);    
    if(emitError) self.emit('error', err, server);
  }

  var timeoutHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s timed out', server.name));
    mongosState.disconnected(server);
    self.emit('left', server);
  }

  var closeHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s closed', server.name));
    mongosState.disconnected(server);
    self.emit('left', server);
  }

  // Connect handler
  var connectHandler = function(server) {
    if(logger.isInfo()) logger.info(f('connected to %s', server.name));

    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
      server.removeAllListeners(e);
    })

    // Add the server handling code
    if(server.isConnected()) {
      server.on('error', errorHandler);
      server.on('close', closeHandler);
      server.on('timeout', timeoutHandler);
      server.on('message', messageHandler);        
    }

    // Add to list connected servers
    mongosState.connected(server);

    // Set connected
    if(state == DISCONNECTED) {
      state = CONNECTED;
      self.emit('connect', self);
    }
  }

  //
  // Connection method
  //
  this.connect = function() {
    // Start replicaset inquiry process
    setTimeout(replicasetInquirer, reconnectInterval);
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
      opts.emitError = false;
      // Create a new Server
      mongosState.disconnected(new Server(opts));
    });

    // Get the disconnected servers
    var servers = mongosState.disconnectedServers();

    // Attempt to connect to all the servers
    while(servers.length > 0) {
      // Get the server
      var server = servers.shift();      
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);

      if(logger.isInfo()) logger.info(f('connecting to server %s', server.name));
      // Attempt to connect
      server.connect();
    }
  }

  // destroy the server instance
  this.destroy = function() {
    state = DESTROYED;
    // Destroy the state
    mongosState.destroy();
  }

  // is the server connected
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

    // Ensure we have no options
    options = options || {};
    // Get a primary    
    var server = mongosState.pickServer();
    // We got an error
    if(server instanceof Error) return callback(server, null);
    // Execute the command
    server[op](ns, ops, options, callback);    
  }

  // Execute a write
  this.insert = function(ns, ops, options, callback) {
    executeWriteOperation('insert', ns, ops, options, callback);
  }

  // Execute a write
  this.update = function(ns, ops, options, callback) {
    executeWriteOperation('update', ns, ops, options, callback);
  }

  // Execute a write
  this.remove = function(ns, ops, options, callback) {
    executeWriteOperation('remove', ns, ops, options, callback);
  }    

  var processReadPreference = function(cmd, options) {
    options = options || {}
    // No read preference specified
    if(options.readPreference == null) return cmd;
  }

  // Execute a command
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Ensure we have no options
    options = options || {};

    // Ensure we have no options
    options = options || {};
    // Pick the right server based on readPreference
    var server = mongosState.pickServer(options.writeConcern ? ReadPreference.primary : options.readPreference);
    // We got an error
    if(server instanceof Error) return callback(server, null);
    // Execute the command
    server.command(ns, cmd, options, callback);
  }

  // Create a cursor for the command
  this.cursor = function(ns, cmd, options) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Ensure we have no options
    options = options || {};
    // Pick the right server based on readPreference
    var server = mongosState.pickServer(options.readPreference);
    // We got an error
    if(server instanceof Error) throw server;
    // Execute the command
    return server.cursor(ns, cmd, options);
  }

  //
  // Authentication
  //
  this.auth = function(mechanism, db) {
    var args = Array.prototype.slice.call(arguments, 2);
    var callback = args.pop();
    // If we don't have the mechanism fail
    if(authProviders[mechanism] == null) throw new MongoError(f("auth provider %s does not exist", mechanism));

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
          callback(null, authenticated);
        }
      }]);
      
      // Execute the auth
      server.auth.apply(server, finalArguments);
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
    return false;
  }
}

inherits(Mongos, EventEmitter);

module.exports = Mongos;