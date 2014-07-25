var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter
  , Server = require('./server')
  , ReadPreference = require('./read_preference')
  , MongoError = require('../error')
  , Ping = require('./strategies/ping')
  , Session = require('./session')
  , Logger = require('../connection/logger');

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

/**
 * Creates a new Replicaset State object
 * @class
 * @property {object} primary Primary property
 * @property {array} secondaries List of secondaries
 * @property {array} arbiters List of arbiters
 * @return {State} A cursor instance
 */
var State = function() {
  var secondaries = [];
  var arbiters = [];
  var primary = null;

  Object.defineProperty(this, 'primary', {
      enumerable:true
    , get: function() { return primary; }
  });

  Object.defineProperty(this, 'secondaries', {
      enumerable:true
    , get: function() { return secondaries; }
  });

  Object.defineProperty(this, 'arbiters', {
      enumerable:true
    , get: function() { return arbiters; }
  });

  /**
   * Is there a secondary connected
   * @method
   * @return {boolean}
   */
  this.isSecondaryConnected = function() {    
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].isConnected()) return true;
    }

    return false;
  }

  /**
   * Is there a primary connection
   * @method
   * @return {boolean}
   */
  this.isPrimaryConnected = function() {
    return primary != null && primary.isConnected();
  }

  /**
   * Is the given address the primary
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.isPrimary = function(address) {
    if(primary == null) return false;
    return primary && primary.equals(address);
  }

  /**
   * Is the given address a primary
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.isSecondary = function(address) {
    // Check if the server is a secondary at the moment
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].equals(address)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Does the replicaset contain this server
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.contains = function(address) {
    if(primary && primary.equals(address)) return true;
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].equals(address)) return true;
    }

    return false;
  }

  /**
   * Clean out all dead connections
   * @method
   */
  this.clean = function() {
    if(primary != null && !primary.isConnected()) {
      primary = null;
    }

    // Filter out disconnected servers
    secondaries = secondaries.filter(function(s) {
      return s.isConnected();
    });

    // Filter out disconnected servers
    arbiters = arbiters.filter(function(s) {
      return s.isConnected();
    });
  }

  /**
   * Destroy state
   * @method
   */
  this.destroy = function() {
    state = DESTROYED;
    if(primary) primary.destroy();
    secondaries.forEach(function(s) {
      s.destroy();
    });
  }

  /**
   * Remove server from state
   * @method
   * @param {Server} Server to remove
   * @return {string} Returns type of server removed (primary|secondary)
   */
  this.remove = function(server) {
    if(primary && primary.equals(server)) {
      primary = null;
      return 'primary';
    }

    // Filter out the server from the secondaries
    secondaries = secondaries.filter(function(s) {
      return !s.equals(server);
    });

    // Return that it's a secondary
    return 'secondary';
  }

  /**
   * Get the server by name
   * @method
   * @param {string} address Server address
   * @return {Server}
   */
  this.get = function(server) {
    var found = false;
    // All servers to search
    var servers = primary ? [primary] : [];
    servers = servers.concat(secondaries);
    // Locate the server
    for(var i = 0; i < servers.length; i++) {
      if(servers[i].equals(server)) {
        return servers[i];
      }
    }
  }

  /**
   * Get all the servers in the set
   * @method
   * @return {array}
   */
  this.getAll = function() {
    var servers = [];
    if(primary) servers.push(primary);
    return servers.concat(secondaries);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.getAllConnections = function() {
    var connections = [];
    if(primary) connections = connections.concat(primary.connections());
    secondaries.forEach(function(s) {
      connections = connections.concat(s.connections());
    })

    return connections;
  }

  /**
   * Return JSON object
   * @method
   * @return {object}
   */
  this.toJSON = function() {
    return {
        primary: primary ? primary.lastIsMaster().me : null
      , secondaries: secondaries.map(function(s) {
        return s.lastIsMaster().me
      })
    }
  }

  /**
   * Returns the last known ismaster document for this server
   * @method
   * @return {object}
   */
  this.lastIsMaster = function() {
    if(primary) return primary.lastIsMaster();
    if(secondaries.length > 0) return secondaries[0].lastIsMaster();
    return {};
  }

  /**
   * Promote server to primary
   * @method
   * @param {Server} server Server we wish to promote
   */
  this.promotePrimary = function(server) {
    var currentServer = this.get(server);
    // Server does not exist in the state, add it as new primary
    if(currentServer == null) {
      primary = server;
      return;
    }

    // We found a server, make it primary and remove it from the secondaries
    // Remove the server first
    this.remove(currentServer);
    // Set as primary
    primary = currentServer;
  }

  var add = function(list, server) {
    // Check if the server is a secondary at the moment
    for(var i = 0; i < list.length; i++) {
      if(list[i].equals(server)) return;
    }

    list.push(server);    
  }

  /**
   * Add server to list of secondaries
   * @method
   * @param {Server} server Server we wish to promote
   */
  this.addSecondary = function(server) {
    add(secondaries, server);
  }

  /**
   * Add server to list of arbiters
   * @method
   * @param {Server} server Server we wish to promote
   */
  this.addArbiter = function(server) {
    add(arbiters, server);
  }
}

/**
 * Creates a new Replset instance
 * @class
 * @param {array} seedlist A list of seeds for the replicaset
 * @param {boolean} options.setName The Replicaset set name
 * @param {boolean} [options.secondaryOnlyConnectionAllowed=false] Allow connection to a secondary only replicaset
 * @param {number} [options.haInterval=10000] The High availability period for replicaset inquiry
 * @param {boolean} [options.emitError=false] Server will emit errors events
 * @param {Cursor} [options.cursorFactory=Cursor] The cursor factory class used for all query cursors
 * @param {string} options.host The server host
 * @param {number} options.port The server port
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
 * @param {string} [options.passPhrase] SSL Certificate pass phrase
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

  // Add event listener
  EventEmitter.call(this);
  // Logger instance
  var logger = Logger('ReplSet', options);
  // Uniquely identify the replicaset instance
  var id = replSetId++;

  // Default state
  var state = DISCONNECTED;
  // Index
  var index = 0;
  // Ha Index
  var haId = 0;

  // Special replicaset options
  var secondaryOnlyConnectionAllowed = typeof options.secondaryOnlyConnectionAllowed == 'boolean'
    ? options.secondaryOnlyConnectionAllowed : false;
  var haInterval = options.haInterval || 5000;
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 10000;

  // The replicaset name
  var setName = options.setName;
  if(setName == null) throw new MongoError("setName option must be provided");

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

  // High availability process running
  var highAvailabilityProcessRunning = false;

  // BSON property (find a server and pass it along)
  Object.defineProperty(this, 'bson', {
    enumerable: true, get: function() { 
      var servers = replState.getAll();
      return servers.length > 0 ? servers[0].bson : null; 
    }
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
      if(list[i].equals(server)) found = true;
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
    if(logger.isInfo()) logger.info(f('[%s] server %s errored out with %s', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name, JSON.stringify(err)));
    addToListIfNotExist(disconnectedServers, server);
    self.emit('left', replState.remove(server), server);
    if(emitError) self.emit('error', err, server);
  }

  var timeoutHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('[%s] server %s timed out', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    addToListIfNotExist(disconnectedServers, server);
    self.emit('left', replState.remove(server), server);
  }

  var closeHandler = function(err, server) {
    if(logger.isInfo()) logger.info(f('[%s] server %s closed', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    addToListIfNotExist(disconnectedServers, server);
    self.emit('left', replState.remove(server), server);
  }

  //
  // Inquires about state changes
  //
  var replicasetInquirer = function(norepeat) {    
    if(state == DESTROYED) return
    // Process already running don't rerun
    if(highAvailabilityProcessRunning) return;
    // Started processes
    highAvailabilityProcessRunning = true;
    if(logger.isInfo()) logger.info(f('[%s] monitoring process running %s', id, JSON.stringify(replState)));    

    // Unique HA id to identify the current look running
    var localHaId = haId++;

    // Clean out any failed connection attempts
    connectingServers = {};

    // Controls if we are doing a single inquiry or repeating
    norepeat = typeof norepeat == 'boolean' ? norepeat : false;

    // Emit replicasetInquirer
    self.emit('ha', 'start', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});

    // Let's process all the disconnected servers
    while(disconnectedServers.length > 0) {
      // Get the first disconnected server
      var server = disconnectedServers.shift();
      if(logger.isInfo()) logger.info(f('[%s] monitoring attempting to connect to %s', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);
      // Attempt to connect
      server.connect();
    }

    // Cleanup state (removed disconnected servers)
    replState.clean();

    // We need to query all servers
    var servers = replState.getAll();
    var serversLeft = servers.length;

    // If no servers and we are not destroyed keep pinging
    if(servers.length == 0 && state == CONNECTED) {
      // Emit ha process end
      self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});
      // Ended highAvailabilityProcessRunning
      highAvailabilityProcessRunning = false;
      // Restart ha process
      if(!norepeat) setTimeout(replicasetInquirer, haInterval);
      return;
    }

    //
    // ismaster for Master server
    var primaryIsMaster = null;

    //
    // Inspect a specific servers ismaster
    var inspectServer = function(server) {
      // Did we get a server
      if(server && server.isConnected()) {
        // Execute ismaster
        server.command('system.$cmd', {ismaster:true}, function(err, r) {
          // Count down the number of servers left
          serversLeft = serversLeft - 1;          
          // If we have an error but still outstanding server request return
          if(err && serversLeft > 0) return;
          // We had an error and have no more servers to inspect, schedule a new check
          if(err && serversLeft == 0) {
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunning
            highAvailabilityProcessRunning = false;
            // Return the replicasetInquirer
            if(!norepeat) setTimeout(replicasetInquirer, haInterval);
            return;
          }
          // Let all the read Preferences do things to the servers
          var rPreferencesCount = Object.keys(readPreferenceStrategies).length;

          // Handle the primary
          var ismaster = r.result;
          if(logger.isDebug()) logger.debug(f('[%s] monitoring process ismaster %s', id, JSON.stringify(ismaster)));

          // Let's check what kind of server this is
          if(ismaster.ismaster && setName == ismaster.setName
            && !replState.isPrimary(ismaster.me)) {
              if(logger.isInfo()) logger.info(f('[%s] promoting %s to primary', id, ismaster.me));
              replState.promotePrimary(server);
              self.emit('joined', 'primary', server);
          } else if(ismaster.secondary && setName == ismaster.setName
            && !replState.isSecondary(ismaster.me)) {
              if(logger.isInfo()) logger.info(f('[%s] promoting %s to secondary', id, ismaster.me));
              replState.addSecondary(server);
              self.emit('joined', 'secondary', server);
          } else if(ismaster.arbiterOnly && setName == ismaster.setName) {
            if(logger.isInfo()) logger.info(f('[%s] promoting %s to ariter', id, ismaster.me));
            replState.addArbiter(server);
            self.emit('joined', 'arbiter', server);
          }

          // No read Preferences strategies
          if(rPreferencesCount == 0) {
            // Add any new servers
            if(err == null && ismaster.ismaster && Array.isArray(ismaster.hosts)) {
              processHosts(ismaster.hosts);
            }

            // Don't schedule a new inquiry
            if(serversLeft > 0) return;
            // Emit ha process end
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunning
            highAvailabilityProcessRunning = false;
            // Let's keep monitoring
            if(!norepeat) setTimeout(replicasetInquirer, haInterval);
            return;
          }

          // Go over all the read preferences
          for(var name in readPreferenceStrategies) {
            readPreferenceStrategies[name].ha(replState, function() {
              rPreferencesCount = rPreferencesCount - 1;

              if(rPreferencesCount == 0) {
                // Add any new servers in primary ismaster
                if(err == null 
                  && ismaster.ismaster 
                  && Array.isArray(ismaster.hosts)) {
                    processHosts(ismaster.hosts);
                }

                // No servers left to query
                if(serversLeft == 0) {
                  // Emit ha process end
                  self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});
                  // Ended highAvailabilityProcessRunning
                  highAvailabilityProcessRunning = false;
                  // Let's keep monitoring
                  if(!norepeat) setTimeout(replicasetInquirer, haInterval);
                  return;
                }
              }
            });
          }
        });
      }
    }

    // Call ismaster on all servers
    for(var i = 0; i < servers.length; i++) {
      inspectServer(servers[i]);
    }
  }

  //
  // Connection related functions
  //

  // Error handler for initial connect
  var errorHandlerTemp = function(err, server) {
    // Log the information
    if(logger.isInfo()) logger.info(f('[%s] server %s disconnected', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    
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
    opts.emitError = true;
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
    // Clean up
    delete connectingServers[server.name];

    // Iterate over all the list items
    for(var i = 0; i < list.length; i++) {
      if(list[i].equals(server)) {
        server.destroy();
        return false;
      }
    }

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
        // If not found we need to create a new connection
        if(!replState.contains(hosts[i])) {
          if(connectingServers[hosts[i]] == null) {
            if(logger.isInfo()) logger.info(f('[%s] scheduled server %s for connection', id, hosts[i]));
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
    if(logger.isInfo()) logger.info(f('[%s] connected to %s', id, server.name));
    // console.log("################ CONNECTED :: " + server.name)

    // Process the new server
    var processNewServer = function() {
      // console.log("-------------- process")
      // Discover any additional servers
      var ismaster = server.lastIsMaster();
      var addedToList = false;

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Log information
      if(logger.isInfo()) logger.info(f('[%s] connectHandler %s', id, JSON.stringify(replState)));    

      // It's a master set it
      if(ismaster.ismaster && setName == ismaster.setName) {
      // console.log("-------------- process 1")
        // replState.primary = server;
        replState.promotePrimary(server);
        
        if(logger.isInfo()) logger.info(f('[%s] promoting %s to primary', id, ismaster.me));
        // Emit primary
        self.emit('joined', 'primary', replState.primary);

        // We are connected
        if(state == DISCONNECTED) {
          state = CONNECTED;
          self.emit('connect', self);
        }
      } else if(!ismaster.ismaster && setName == ismaster.setName
        && ismaster.arbiterOnly) {
      // console.log("-------------- process 2")
          addedToList = addToList(ismaster, replState.arbiters, server);

          // Emit primary
          if(addedToList) {
            if(logger.isInfo()) logger.info(f('[%s] promoting %s to arbiter', id, ismaster.me));
            self.emit('joined', 'arbiter', server);
          }
      } else if(!ismaster.ismaster && setName == ismaster.setName
        && ismaster.secondary) {
      // console.log("-------------- process 3")
          addedToList = addToList(ismaster, replState.secondaries, server);

          // Emit primary
          if(addedToList) {
      // console.log("-------------- process 3:1")
          // console.dir(replState.secondaries.length)
            if(logger.isInfo()) logger.info(f('[%s] promoting %s to secondary', id, ismaster.me));
            self.emit('joined', 'secondary', server);
          }
          
          // We can connect with only a secondary
          if(secondaryOnlyConnectionAllowed && state == DISCONNECTED) {
      // console.log("-------------- process 3:2")
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

  /**
   * Name of BSON parser currently used
   * @method
   * @return {string}
   */
  this.parserType = function() {
    if(this.bson.serialize.toString().indexOf('[native code]') != -1)
      return 'c++';
    return 'js';
  }

  /**
   * Initiate server connect
   * @method
   */
  this.connect = function(_options) {
    // Start replicaset inquiry process
    setTimeout(replicasetInquirer, haInterval);
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
      opts.emitError = true;
      // Share the auth store
      opts.authProviders = authProviders;
      // Create a new Server
      disconnectedServers.push(new Server(opts));
    });

    // Attempt to connect to all the servers
    while(disconnectedServers.length > 0) {
      // Get the server
      var server = disconnectedServers.shift();

      // Get the server information
      var host = server.name.split(":")[0];
      var port = parseInt(server.name.split(":")[1], 10);

      // Clone options
      var opts = cloneOptions(options);
      opts.host = host;
      opts.port = port;
      opts.reconnect = false;
      opts.readPreferenceStrategies = readPreferenceStrategies;
      opts.emitError = true;
      // Share the auth store
      opts.authProviders = authProviders;
      // Create a new server instance
      server = new Server(opts);

      // Set up the event handlers
      server.once('error', errorHandlerTemp);
      server.once('close', errorHandlerTemp);
      server.once('timeout', errorHandlerTemp);
      server.once('connect', connectHandler);
      // Attempt to connect
      process.nextTick(function() {

      server.connect();
      })
    }
  }

  /**
   * Destroy the server connection
   * @method
   */
  this.destroy = function() {
    // console.dir("================= destroy")
    if(logger.isInfo()) logger.info(f('[%s] destroyed', id));
    state = DESTROYED;
    replState.destroy();
  }

  /**
   * Figure out if the server is connected
   * @method
   * @return {boolean}
   */
  this.isConnected = function() {
    if(secondaryOnlyConnectionAllowed) return replState.isSecondaryConnected();
    return replState.isPrimaryConnected();
  }

  //
  // Validate if a non-master or recovering error
  var notMasterError = function(r) {
    // Get result of any
    var result = r ? r.result : null;

    // Explore if we have a not master error
    if(result && (result.err == 'not master'
      || result.errmsg == 'not master' || (result['$err'] && result['$err'].indexOf('not master or secondary') != -1)
      || (result['$err'] && result['$err'].indexOf("not master and slaveOk=false") != -1)
      || result.errmsg == 'node is recovering')) {
      return true;
    }

    return false;
  }

  /**
   * Execute a command
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {object} [options.readPreference] Specify read preference if command supports it
   * @param {object} [options.connection] Specify connection object to execute command against
   * @param {opResultCallback} callback A callback function
   */
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    var server = null;
    // Ensure we have no options
    options = options || {};

    // Pick the right server based on readPreference
    try {
      server = pickServer(options.writeConcern ? ReadPreference.primary : options.readPreference);
    } catch(err) {
      return callback(err);
    }

    // No server returned we had an error
    if(server == null) return callback(new MongoError("no server found"));
    // Execute the command
    server.command(ns, cmd, options, function(err, r) {
      // We have a no master error, immediately refresh the view of the replicaset
      if(r && notMasterError(r)) replicasetInquirer(true);
      // Return the error
      callback(err, r);
    });      
  }

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
    // Get a primary    
    try {
      server = pickServer(ReadPreference.primary);
    } catch(err) {
      return callback(err);
    }

    // No server returned we had an error
    if(server == null) return callback(new MongoError("no server found"));
    
    // Execute the command
    server[op](ns, ops, options, function(err, r) {
      // We have a no master error, immediately refresh the view of the replicaset
      if(r && notMasterError(r)) replicasetInquirer(true);
      // Return the result
      callback(err, r);
    });
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
    executeWriteOperation('remove', ns, ops, options, callback);
  }    

  /**
   * Perform one or more remove operations
   * @method
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {{object}|{Long}} cmd Can be either a command returning a cursor or a cursorId
   * @param {object} [options.batchSize=0] Batchsize for the operation
   * @param {array} [options.documents=[]] Initial documents list for cursor
   * @param {boolean} [options.tailable=false] Tailable flag set
   * @param {boolean} [options.oplogReply=false] oplogReply flag set
   * @param {boolean} [options.awaitdata=false] awaitdata flag set
   * @param {boolean} [options.exhaust=false] exhaust flag set
   * @param {boolean} [options.partial=false] partial flag set
   * @param {opResultCallback} callback A callback function
   */
  this.cursor = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    var server = null;
    // Ensure we have no options
    options = options || {};
    try {
      // Pick the right server based on readPreference
      server = pickServer(options.readPreference);
    } catch(err) {
      return callback(err);
    }

    // No server returned we had an error
    if(server == null) return callback(new MongoError("no server found"));
    // Execute the command
    return server.cursor(ns, cmd, options);
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
  this.addReadPreferenceStrategy = function(name, func) {
    readPreferenceStrategies[name] = func;
  }

  /**
   * Add custom authentication mechanism
   * @method
   * @param {string} name Name of the authentication mechanism
   * @param {object} provider Authentication object instance
   */
  this.addAuthProvider = function(name, provider) {
    if(authProviders == null) authProviders = {};
    authProviders[name] = provider;
  } 

  /**
   * Returns the last known ismaster document for this server
   * @method
   * @return {object}
   */
  this.lastIsMaster = function() {
    return replState.lastIsMaster();
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.connections = function() {
    return replState.getAllConnections();
  }   

  //
  // Pick a server based on readPreference
  var pickServer = function(readPreference) {
    options = options || {};
    if(!(readPreference instanceof ReadPreference) 
      && readPreference != null) throw new MongoError(f("readPreference %s must be an instance of ReadPreference", readPreference));
    // If no read Preference set to primary by default
    readPreference = readPreference || ReadPreference.primary;

    // Do we have a custom readPreference strategy, use it
    if(readPreferenceStrategies != null && readPreferenceStrategies[readPreference.preference] != null) {
      return readPreferenceStrategies[readPreference.preference].pickServer(replState, readPreference);
    }

    // Check if we can satisfy and of the basic read Preferences
    if(readPreference.equals(ReadPreference.secondary) 
      && replState.secondaries.length == 0)
        throw new MongoError("no secondary server available");
    
    if(readPreference.equals(ReadPreference.secondaryPreferred)
        && replState.secondaries.length == 0
        && replState.primary == null)
      throw new MongoError("no secondary or primary server available");

    if(readPreference.equals(ReadPreference.primary)
      && replState.primary == null)
        throw new MongoError("no primary server available");

    // Secondary
    if(readPreference.equals(ReadPreference.secondary)) {
      index = index + 1;
      return replState.secondaries[index % replState.secondaries.length];
    }

    // Secondary preferred
    if(readPreference.equals(ReadPreference.secondaryPreferred)) {
      if(replState.secondaries.length > 0) {
        index = index + 1;
        return replState.secondaries[index % replState.secondaries.length];
      }

      return replState.primary;
    }

    // Primary preferred
    if(readPreference.equals(ReadPreference.primaryPreferred)) {
      if(replState.primary) return replState.primary;

      if(replState.secondaries.length > 0) {
        index = index + 1;
        return replState.secondaries[index % replState.secondaries.length];
      }
    }

    // Return the primary
    return replState.primary;
  }

  // Add the ping strategy for nearest
  this.addReadPreferenceStrategy('nearest', new Ping(options));  
}

inherits(ReplSet, EventEmitter);

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
 * @type {ReplSet}
 * @param {string} type The stage in the high availability event (start|end)
 * @param {boolean} data.norepeat This is a repeating high availability process or a single execution only
 * @param {number} data.id The id for this high availability request
 * @param {object} data.state An object containing the information about the current replicaset
 */

/**
 * A server member left the replicaset
 *
 * @event ReplSet#left
 * @type {ReplSet}
 * @param {string} type The type of member that left (primary|secondary|arbiter)
 * @param {Server} server The server object that left
 */

/**
 * A server member joined the replicaset
 *
 * @event ReplSet#joined
 * @type {ReplSet}
 * @param {string} type The type of member that joined (primary|secondary|arbiter)
 * @param {Server} server The server object that joined
 */

module.exports = ReplSet;