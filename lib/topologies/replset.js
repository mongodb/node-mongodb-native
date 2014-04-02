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
      return;
    }

    // Filter out the server from the secondaries
    this.secondaries = this.secondaries.filter(function(s) {
      return !s.equal(server);
    });
  }

  this.toJSON = function() {
    return {
        primary: this.primary ? this.primary.lastIsMaster().me : null
      , secondaries: this.secondaries.map(function(s) {
        return s.lastIsMaster().me
      })
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
  
  // Replicaset state
  var replState = new State();
  // Contains any alternate strategies for picking
  var readPreferenceStrategies = {};

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
  // 
  var addToListIfNotExist = function(list, server) {
    var found = false;

    for(var i = 0; i < list.length; i++) {
      if(list[i].equal(server)) found = true;
    }

    if(!found) list.push(server);
  }

  //
  // Handlers
  var messageHandler = function(response, server) {
    callbacks.emit(response.responseTo, null, response);
  }

  var errorHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s errored out', server.lastIsMaster() ? server.lastIsMaster().me : 'N/A'));
    addToListIfNotExist(disconnectedServers, server);
    replState.remove(server);
  }

  var timeoutHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s timed out', server.lastIsMaster() ? server.lastIsMaster().me : 'N/A'));
    addToListIfNotExist(disconnectedServers, server);
    replState.remove(server);
  }

  var closeHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('server %s closed', server.lastIsMaster() ? server.lastIsMaster().me : 'N/A'));
    addToListIfNotExist(disconnectedServers, server);
    replState.remove(server);
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
      if(logger.isInfo()) logger.info(f('monitoring attempting to connect to %s', server.lastIsMaster() ? server.lastIsMaster().me : 'N/A'));
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);
      // Attempt to connect
      server.connect();
    }

    // Check if can find a new server
    var server = pickServer({readPreference: ReadPreference.secondaryPreferred});
    if(server) {
      server.command('system.$cmd', {ismaster:true}, function(err, r) {
        // Add any new servers
        if(err == null && Array.isArray(r.result.hosts)) {
          processHosts(r.result.hosts);
        }

        // Let's keep monitoring
        return setTimeout(replicasetInquirer, reconnectInterval);
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
    if(logger.isInfo()) logger.info(f('server %s disconnected', server.lastIsMaster() ? server.lastIsMaster().me : 'N/A'));

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
          if(logger.isInfo()) logger.info(f('schedule server %s for connection', hosts[i]));
          // Make sure we know what is trying to connect            
          connectingServers[hosts[i]] = hosts[i];            
          // Connect the server
          connectToServer(hosts[i].split(':')[0], parseInt(hosts[i].split(':')[1], 10));
        }
      }
    }
  }

  // Connect handler
  var connectHandler = function(server) {
    if(logger.isInfo()) logger.info(f('connected to %s', server.lastIsMaster() ? server.lastIsMaster().me : 'N/A'));
    // Execute an ismaster
    server.command('system.$cmd', {ismaster:true}, function(err, r) {
      if(err) return addToListIfNotExist(disconnectedServers, server);
      // Discover any additional servers
      var ismaster = r.result;
      var addedToList = false;

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      if(logger.isInfo()) logger.info(f('connectHandler %s', JSON.stringify(replState)));    

      // It's a master set it
      if(ismaster.ismaster) {
        replState.primary = server;
        
        // We are connected
        if(state == DISCONNECTED) {
          state = CONNECTED;
          self.emit('connect', self);
        }
      } else if(!ismaster.ismaster && ismaster.secondary) {
        addedToList = addToList(ismaster, replState.secondaries, server);
        
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
    });
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

  // Add additional picking strategy
  this.addReadPreferenceStrategy = function(name, func) {
    readPreferenceStrategies[name] = func;
  }

  //
  // Pick a server based on readPreference
  var pickServer = function(options) {
    var readPreference = options.readPreference || ReadPreference.primary;

    // Do we have a custom readPreference strategy, use it
    if(readPreferenceStrategies != null && readPreferenceStrategies[readPreference] != null) {
      return readPreferenceStrategies[readPreference].pickServer(options);
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