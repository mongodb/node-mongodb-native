var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter
  , Server = require('./server')
  , ReadPreference = require('./read_preference')
  , MongoError = require('../error')
  , Logger = require('../connection/logger');

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

//
// Contains the state
var State = function() {
  this.secondaries = [];
  this.arbiters = [];
  this.primary = null;

  this.isSecondaryConnected = function() {    
    return this.secondaries.length > 0 && this.secondaries[0].isConnected();
  }

  this.isPrimaryConnected = function() {
    return this.primary != null && this.primary.isConnected();
  }

  this.destroy = function() {
    if(this.primary) this.primary.destroy();
    this.secondaries.forEach(function(s) {
      s.destroy();
    });
  }

  this.remove = function(server) {
    if(this.primary && this.primary.equal(server)) {
      this.primary = null;
      return 'primary';
    }

    // Filter out the server from the secondaries
    this.secondaries = this.secondaries.filter(function(s) {
      return !s.equal(server);
    });

    // Return that it's a secondary
    return 'secondary';
  }

  this.getAll = function() {
    var servers = [];
    if(this.primary) servers.push(this.primary);
    return servers.concat(this.secondaries);
  }

  this.toJSON = function() {
    return {
        primary: this.primary ? this.primary.lastIsMaster().me : null
      , secondaries: this.secondaries.map(function(s) {
        return s.lastIsMaster().me
      })
    }
  }

  this.changePrimary = function(server) {
    this.primary = server;
  }

  this.addSecondary = function(server) {
    var found = false;
    // Check if the server is a secondary at the moment
    for(var i = 0; i < this.secondaries.length; i++) {
      if(this.secondaries[i].equal(server)) {
        found = true;
      }
    }

    if(!found) this.secondaries.push(server);
  }

  this.promotePrimary = function(address) {
    var server = null;
    // Check if the server is a secondary at the moment
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].equals(address)) {
        server = secondaries[i];        
      }
    }

    // We found a server, make it primary and remove it from the secondaries
    if(server) {
      this.primary = servver;
      this.secondaries = this.secondaries.filter(function(s) {
        return !s.equal(server);
      });
    }
  }
}

var ReplSet = function(seedlist, options) {
  var self = this;
  options = options || {};

  // Add event listener
  EventEmitter.call(this);
  // Logger instance
  var logger = Logger('ReplSet', options);

  // Default state
  var state = DISCONNECTED;
  // Index
  var index = 0;
  // Special replicaset options
  var secondaryOnlyConnectionAllowed = typeof options.secondaryOnlyConnectionAllowed == 'boolean'
    ? options.secondaryOnlyConnectionAllowed : false;
  var reconnectTries = options.reconnectTries || 30;
  var reconnectInterval = options.reconnectInterval || 2000;
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 10000;

  // Swallow or emit errors
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : false;
  
  // Replicaset state
  var replState = new State();
  // Contains any alternate strategies for picking
  var readPreferenceStrategies = {};
  // Auth providers
  var authProviders = {};

  // All the servers
  var disconnectedServers = [];
  // Currently connecting servers
  var connectingServers = {};
 
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
  // Handlers
  var messageHandler = function(response, server) {
    callbacks.emit(response.responseTo, null, response);
  }

  var errorHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s errored out with %s', server.lastIsMaster() ? server.lastIsMaster().me : server.name, JSON.stringify(err)));
    addToListIfNotExist(disconnectedServers, server);
    self.emit('left', replState.remove(server), server);
    if(emitError) self.emit('error', err, server);
  }

  var timeoutHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s timed out', server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    addToListIfNotExist(disconnectedServers, server);
    self.emit('left', replState.remove(server), server);
  }

  var closeHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s closed', server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    addToListIfNotExist(disconnectedServers, server);
    self.emit('left', replState.remove(server), server);
  }

  //
  // Inquires about state changes
  //
  var replicasetInquirer = function() {    
    if(state == DESTROYED) return
    if(logger.isInfo()) logger.info(f('monitoring process running %s', JSON.stringify(replState)));    

    // Let's process all the disconnected servers
    while(disconnectedServers.length > 0) {
      // Get the first disconnected server
      var server = disconnectedServers.shift();
      if(logger.isInfo()) logger.info(f('monitoring attempting to connect to %s', server.lastIsMaster() ? server.lastIsMaster().me : server.name));
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);
      // Attempt to connect
      server.connect();
    }

    // Server
    var server = null;

    // Check if can find a new server
    try {
      server = pickServer({readPreference: ReadPreference.secondaryPreferred});      
    } catch(err) {}
    
    // Did we get a server
    if(server) {
      server.command('system.$cmd', {ismaster:true}, function(err, r) {
        // Let all the read Preferences do things to the servers
        var rPreferencesCount = Object.keys(readPreferenceStrategies).length;

        // Handle the primary
        var ismaster = r.result;
        // Let's check what kind of server this is
        if(ismaster.ismaster) {
          if(logger.isInfo()) logger.info(f('promoting %s to primary', server.name));
          replState.changePrimary(server);
        } else if(ismaster.secondary) {
          if(logger.isInfo()) logger.info(f('promoting %s to secondary', server.name));
          replState.addSecondary(server);
        } else if(replState.primary == null && ismaster.primary) {
          replState.promotePrimary(ismaster.primary);
        }

        // No read Preferences strategies
        if(rPreferencesCount == 0) {
          // Add any new servers
          if(err == null && Array.isArray(r.result.hosts)) {
            processHosts(r.result.hosts);
          }

          // Let's keep monitoring
          return setTimeout(replicasetInquirer, reconnectInterval);
        }

        // Go over all the read preferences
        for(var name in readPreferenceStrategies) {
          readPreferenceStrategies[name].execute(replState, function() {
            rPreferencesCount = rPreferencesCount - 1;

            if(rPreferencesCount == 0) {
              // Add any new servers
              if(err == null && Array.isArray(r.result.hosts)) {
                processHosts(r.result.hosts);
              }

              // Let's keep monitoring
              return setTimeout(replicasetInquirer, reconnectInterval);
            }
          });
        }
      });
    } else {
      return setTimeout(replicasetInquirer, reconnectInterval);
    }
  }

  //
  // Connection related functions
  //

  // Error handler for initial connect
  var errorHandlerTemp = function(err, server) {
    // Log the information
    if(logger.isInfo()) logger.info(f('server %s disconnected', server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    // Incompatible server version emit error
    if(err && server.lastIsMaster() && typeof server.lastIsMaster().minWireVersion != 'number') {
      if(logger.isError()) logger.error(f('server %s version is unsupported', server.lastIsMaster() ? server.lastIsMaster().me : server.name));
      return self.emit('error', err, server);
    }
    
    // Remove any non used handlers
    ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
      server.removeAllListeners(e);
    })

    // Push to list of disconnected servers
    addToListIfNotExist(disconnectedServers, server);
  }

  // Connect to a new server
  var connectToServer = function(host, port) {
    var opts = cloneOptions(options);
    opts.host = host;
    opts.port = port;
    opts.reconnect = false;
    opts.readPreferenceStrategies = readPreferenceStrategies;
    // Share the auth store
    opts.authProviders = authProviders;
    // Create a new server instance
    var server = new Server(opts);
    // Set up the event handlers
    server.once('error', errorHandlerTemp);
    server.once('close', errorHandlerTemp);
    server.once('timeout', errorHandlerTemp);
    server.once('connect', connectHandler);
    // Attempt to connect
    server.connect();      
  }

  // Add to server list if not there
  var addToList = function(ismaster, list, server) {
    // Iterate over all the list items
    for(var i = 0; i < list.length; i++) {
      if(list[i].equal(server)) {
        server.destroy();
        return false;
      }
    }

    // Clean up
    delete connectingServers[ismaster.me];
    // Add to list
    list.push(server);
    return true;
  }

  //
  // Detect if we need to add new servers
  var processHosts = function(hosts) {
    if(Array.isArray(hosts)) {
      // Check any hosts exposed by ismaster
      for(var i = 0; i < hosts.length; i++) {
        // Did we find it
        var found = false;

        // Do we already have this
        if(replState.primary && replState.primary.equal(hosts[i])) {
          found = true;
        }

        // Check if we have a secondary
        for(var j = 0; j < replState.secondaries.length; j++) {
          if(replState.secondaries[j].equal(hosts[i])) {
            found = true;
          }
        }

        // If not found we need to create a new connection
        if(!found) {
          if(connectingServers[hosts[i]] == null) {
            if(logger.isInfo()) logger.info(f('scheduled server %s for connection', hosts[i]));
            // Make sure we know what is trying to connect            
            connectingServers[hosts[i]] = hosts[i];            
            // Connect the server
            connectToServer(hosts[i].split(':')[0], parseInt(hosts[i].split(':')[1], 10));
          }
        }
      }      
    }
  }

  // Connect handler
  var connectHandler = function(server) {
    if(logger.isInfo()) logger.info(f('connected to %s', server.lastIsMaster() ? server.lastIsMaster().me : server.name));

    // Process the new server
    var processNewServer = function() {
      // Discover any additional servers
      var ismaster = server.lastIsMaster();
      var addedToList = false;

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      if(logger.isInfo()) logger.info(f('connectHandler %s', JSON.stringify(replState)));    

      // It's a master set it
      if(ismaster.ismaster) {
        replState.primary = server;
        
        if(logger.isInfo()) logger.info(f('promoting %s to primary', server.name));
        // Emit primary
        self.emit('joined', 'primary', replState.primary);

        // We are connected
        if(state == DISCONNECTED) {
          state = CONNECTED;
          self.emit('connect', self);
        }
      } else if(!ismaster.ismaster && ismaster.secondary) {
        addedToList = addToList(ismaster, replState.secondaries, server);

        // Emit primary
        if(addedToList) {
          if(logger.isInfo()) logger.info(f('promoting %s to secondary', server.name));
          self.emit('joined', 'secondary', server);
        }
        
        // We can connect with only a secondary
        if(secondaryOnlyConnectionAllowed && state == DISCONNECTED) {
          state = CONNECTED;
          self.emit('connect', self);            
        }
      }

      // Add the server handling code
      if(server.isConnected()) {
        server.on('error', errorHandler);
        server.on('close', closeHandler);
        server.on('timeout', timeoutHandler);
        server.on('message', messageHandler);        
      }

      // Add any new servers
      processHosts(ismaster.hosts);
    }

    // Apply auths (if any)
    processNewServer();
  }

  //
  // Actually exposed methods
  //

  // connect
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
      // Create a new Server
      disconnectedServers.push(new Server(opts));
    });

    // Attempt to connect to all the servers
    while(disconnectedServers.length > 0) {
      // Get the server
      var server = disconnectedServers.shift();
      
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);
      // Attempt to connect
      server.connect();
    }
  }

  // destroy the server instance
  this.destroy = function() {
    state = DESTROYED;
    replState.destroy();
  }

  // is the server connected
  this.isConnected = function() {
    if(secondaryOnlyConnectionAllowed) return replState.isSecondaryConnected();
    return replState.isPrimaryConnected();
  }

  // Execute a command
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Ensure we have no options
    options = options || {};
    // Write command, direct to primary always
    if(options.writeConcern) options.readPreference = ReadPreference.primary;
    // Pick the right server based on readPreference
    var server = pickServer(options);
    // No server returned we had an error
    if(server == null) return;

    // Execute the command
    server.command(ns, cmd, options, callback);
  }

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
    var server = pickServer({readPreference: ReadPreference.primary});
    // No server returned we had an error
    if(server == null) return;
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

  // Create a cursor for the command
  this.cursor = function(ns, cmd, options) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Ensure we have no options
    options = options || {};
    // Pick the right server based on readPreference
    var server = pickServer(options);
    // No server returned we had an error
    if(server == null) return;
    // Execute the command
    return server.cursor(ns, cmd, options);
  }

  // Authentication method
  this.auth = function(mechanism, db) {
    var args = Array.prototype.slice.call(arguments, 2);
    var callback = args.pop();
    // If we don't have the mechanism fail
    if(authProviders[mechanism] == null) throw new MongoError(f("auth provider %s does not exist", mechanism));

    // Authenticate against all the servers
    var servers = replState.getAll();
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
  this.addReadPreferenceStrategy = function(name, func) {
    readPreferenceStrategies[name] = func;
  }

  this.addAuthProvider = function(name, provider) {
    if(authProviders == null) authProviders = {};
    authProviders[name] = provider;
  }  

  //
  // Pick a server based on readPreference
  var pickServer = function(options) {
    options = options || {};
    var readPreference = options.readPreference || ReadPreference.primary;

    // Do we have a custom readPreference strategy, use it
    if(readPreferenceStrategies != null && readPreferenceStrategies[readPreference] != null) {
      return readPreferenceStrategies[readPreference].pickServer(replState, options);
    }

    // Check if we can satisfy and of the basic read Preferences
    if(readPreference == ReadPreference.secondary 
      && replState.secondaries.length == 0)
        throw new MongoError("no secondary server available");
    
    if(readPreference == ReadPreference.secondaryPreferred 
        && replState.secondaries.length == 0
        && replState.primary == null)
      throw new MongoError("no secondary or primary server available");

    if(readPreference == ReadPreference.primary 
      && replState.primary == null)
        throw new MongoError("no primary server available");

    // Secondary
    if(readPreference == ReadPreference.secondary) {
      index = index + 1;
      return replState.secondaries[index % replState.secondaries.length];
    }

    // Secondary preferred
    if(readPreference == ReadPreference.secondaryPreferred) {
      if(replState.secondaries.length > 0) {
        index = index + 1;
        return replState.secondaries[index % replState.secondaries.length];        
      }

      return replState.primary;
    }

    // Primary preferred
    if(readPreference == ReadPreference.primaryPreferred) {
      if(replState.primary) return replState.primary;

      if(replState.secondaries.length > 0) {
        index = index + 1;
        return replState.secondaries[index % replState.secondaries.length];        
      }
    }

    // Return the primary
    return replState.primary;
  }
}

inherits(ReplSet, EventEmitter);

module.exports = ReplSet;