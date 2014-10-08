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

  // Add event listener
  EventEmitter.call(this);
  // Logger instance
  var logger = Logger('ReplSet', options);
  // Uniquely identify the replicaset instance
  var id = replSetId++;

  // Index
  var index = 0;
  // Ha Index
  var haId = 0;

  //
  // Current credentials used for auth
  var credentials = [];

  //
  // Factory overrides
  //
  var Cursor = options.cursorFactory || BasicCursor;

  // BSON Parser, ensure we have a single instance
  if(bsonInstance == null) {
    bsonInstance = new BSON(bsonTypes);
  }

  // Pick the right bson parser
  var bson = options.bson ? options.bson : bsonInstance;
  // Add bson parser to options
  options.bson = bson;

  // Special replicaset options
  var secondaryOnlyConnectionAllowed = typeof options.secondaryOnlyConnectionAllowed == 'boolean'
    ? options.secondaryOnlyConnectionAllowed : false;
  var haInterval = options.haInterval || 5000;
  
  // Set up the connection timeout for the options
  options.connectionTimeout = options.connectionTimeout || 10000;

  // Are we running in debug mode
  var debug = typeof options.debug == 'boolean' ? options.debug : false;

  // The replicaset name
  var setName = options.setName;
  if(setName == null) throw new MongoError("setName option must be provided");

  // Swallow or emit errors
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : false;

  // Grouping tag used for debugging purposes
  var tag = options.tag;

  // Do we have a not connected handler
  var disconnectHandler = options.disconnectHandler;
  
  // Currently connecting servers
  var connectingServers = {};
  // Replicaset state
  var replState = new State(this, {
      id: id, setName: setName
    , connectingServers: connectingServers
    , secondaryOnlyConnectionAllowed: secondaryOnlyConnectionAllowed
  });
  // Contains any alternate strategies for picking
  var readPreferenceStrategies = {};
  // Auth providers
  var authProviders = {};

  // All the servers
  var disconnectedServers = [];
  // Initial connection servers
  var initialConnectionServers = [];
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

  // Full setup
  var fullsetup = false;

  // BSON property (find a server and pass it along)
  Object.defineProperty(this, 'bson', {
    enumerable: true, get: function() { 
      var servers = replState.getAll();
      return servers.length > 0 ? servers[0].bson : null; 
    }
  });

  Object.defineProperty(this, 'id', {
    enumerable:true, get: function() { return id; }
  });

  Object.defineProperty(this, 'haInterval', {
    enumerable:true, get: function() { return haInterval; }
  });

  Object.defineProperty(this, 'state', {
    enumerable:true, get: function() { return replState; }
  });

  //
  // Debug options
  if(debug) {
    // Add access to the read Preference Strategies
    Object.defineProperty(this, 'readPreferenceStrategies', {
      enumerable: true, get: function() { return readPreferenceStrategies; }
    });
  }

  Object.defineProperty(this, 'type', {
    enumerable:true, get: function() { return 'server'; }
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

    return found;
  }

  //
  // Handlers
  var messageHandler = function(response, server) {
    callbacks.emit(response.responseTo, null, response);
  }

  var errorHandler = function(err, server) {
    if(replState.state == DESTROYED) return;
    if(logger.isInfo()) logger.info(f('[%s] server %s errored out with %s', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name, JSON.stringify(err)));
    var found = addToListIfNotExist(disconnectedServers, server);
    if(!found) self.emit('left', replState.remove(server), server);
    if(found && emitError && self.listeners('error').length > 0) self.emit('error', err, server);
  }

  var timeoutHandler = function(err, server) {
    if(replState.state == DESTROYED) return;
    if(logger.isInfo()) logger.info(f('[%s] server %s timed out', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    var found = addToListIfNotExist(disconnectedServers, server);
    if(!found) self.emit('left', replState.remove(server), server);
  }

  var closeHandler = function(err, server) {
    if(replState.state == DESTROYED) return;
    if(logger.isInfo()) logger.info(f('[%s] server %s closed', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
    var found = addToListIfNotExist(disconnectedServers, server);
    if(!found) self.emit('left', replState.remove(server), server);
  }

  //
  // Inquires about state changes
  //
  var replicasetInquirer = function(norepeat) {
    if(replState.state == DESTROYED) return
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

    // If we have a primary and a disconnect handler, execute
    // buffered operations
    if(replState.isPrimaryConnected() && replState.isSecondaryConnected() && disconnectHandler) {
      disconnectHandler.execute();
    }

    // Emit replicasetInquirer
    self.emit('ha', 'start', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});

    // Let's process all the disconnected servers
    while(disconnectedServers.length > 0) {
      // Get the first disconnected server
      var server = disconnectedServers.shift();
      if(logger.isInfo()) logger.info(f('[%s] monitoring attempting to connect to %s', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
      // Set up the event handlers
      server.once('error', errorHandlerTemp('error'));
      server.once('close', errorHandlerTemp('close'));
      server.once('timeout', errorHandlerTemp('timeout'));
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
    if(servers.length == 0 && replState.state == CONNECTED) {
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
      if(replState.state == DESTROYED) return;
      // Did we get a server
      if(server && server.isConnected()) {
        // Execute ismaster
        server.command('system.$cmd', {ismaster:true}, function(err, r) {
          if(replState.state == DESTROYED) return;
          // Count down the number of servers left
          serversLeft = serversLeft - 1;
          // If we have an error but still outstanding server request return
          if(err && serversLeft > 0) return;          
          // We had an error and have no more servers to inspect, schedule a new check
          if(err && serversLeft == 0) {
            self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});
            // Ended highAvailabilityProcessRunnfing
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

          // Update the replicaset state
          replState.update(ismaster, server);

          // Add any new servers
          if(err == null && ismaster.ismaster && Array.isArray(ismaster.hosts)) {
            // Hosts to process
            var hosts = ismaster.hosts;
            // Add arbiters to list of hosts if we have any
            if(Array.isArray(ismaster.arbiters)) hosts = hosts.concat(ismaster.arbiters);
            if(Array.isArray(ismaster.passives)) hosts = hosts.concat(ismaster.passives);
            // Process all the hsots
            processHosts(hosts);
          }

          // No read Preferences strategies
          if(rPreferencesCount == 0) {
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

          // No servers left to query, execute read preference strategies
          if(serversLeft == 0) {
            // Go over all the read preferences
            for(var name in readPreferenceStrategies) {
              readPreferenceStrategies[name].ha(self, replState, function() {
                rPreferencesCount = rPreferencesCount - 1;

                if(rPreferencesCount == 0) {
                  // Add any new servers in primary ismaster
                  if(err == null 
                    && ismaster.ismaster 
                    && Array.isArray(ismaster.hosts)) {
                      processHosts(ismaster.hosts);
                  }

                  // Emit ha process end
                  self.emit('ha', 'end', {norepeat: norepeat, id: localHaId, state: replState ? replState.toJSON() : {}});
                  // Ended highAvailabilityProcessRunning
                  highAvailabilityProcessRunning = false;
                  // Let's keep monitoring
                  if(!norepeat) setTimeout(replicasetInquirer, haInterval);
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
    if(replState.secondaries.length >= 1 && replState.primary != null && !fullsetup) {
      fullsetup = true;
      self.emit('fullsetup', self);
    }
  }

  //
  // Connection related functions
  //

  // Error handler for initial connect
  var errorHandlerTemp = function(event) {
    return function(err, server) {
      // Log the information
      if(logger.isInfo()) logger.info(f('[%s] server %s disconnected', id, server.lastIsMaster() ? server.lastIsMaster().me : server.name));
      // Filter out any connection servers
      initialConnectionServers = initialConnectionServers.filter(function(_server) {
        return server.name != _server.name;
      });

      // Connection is destroyed, ignore
      if(replState.state == DESTROYED) return;

      // Remove any non used handlers
      ['error', 'close', 'timeout', 'connect'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Push to list of disconnected servers
      addToListIfNotExist(disconnectedServers, server);

      // End connection operation if we have no legal replicaset state
      if(initialConnectionServers == 0 && replState.state == CONNECTING) {
         if((secondaryOnlyConnectionAllowed && !replState.isSecondaryConnected() && !replState.isPrimaryConnected()) 
          || (!secondaryOnlyConnectionAllowed && !replState.isPrimaryConnected())) {
            if(logger.isInfo()) logger.info(f('[%s] no valid seed servers in list', id));

            if(self.listeners('error').length > 0)
              return self.emit('error', new MongoError('no valid seed servers in list'));
         }
      }

      // If the number of disconnected servers is equal to 
      // the number of seed servers we cannot connect
      if(disconnectedServers.length == seedlist.length && replState.state == CONNECTING) {
        if(emitError && self.listeners('error').length > 0) {
          if(logger.isInfo()) logger.info(f('[%s] no valid seed servers in list', id));

          if(self.listeners('error').length > 0)
            self.emit('error', new MongoError('no valid seed servers in list'));
        } 
      }
    }
  }

  // Connect to a new server
  var connectToServer = function(host, port) {
    var opts = cloneOptions(options);
    opts.host = host;
    opts.port = port;
    opts.reconnect = false;
    opts.readPreferenceStrategies = readPreferenceStrategies;
    if(tag) opts.tag = tag;
    // Share the auth store
    opts.authProviders = authProviders;
    opts.emitError = true;
    // Create a new server instance
    var server = new Server(opts);
    // Set up the event handlers
    server.once('error', errorHandlerTemp('error'));
    server.once('close', errorHandlerTemp('close'));
    server.once('timeout', errorHandlerTemp('timeout'));
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

  var inInitialConnectingServers = function(address) {
    for(var i = 0; i < initialConnectionServers.length; i++) {
      if(initialConnectionServers[i].name == address) return true;
    }
    return false;
  }

  //
  // Detect if we need to add new servers
  var processHosts = function(hosts) {
    if(replState.state == DESTROYED) return;
    if(Array.isArray(hosts)) {
      // Check any hosts exposed by ismaster
      for(var i = 0; i < hosts.length; i++) {
        // If not found we need to create a new connection
        if(!replState.contains(hosts[i])) {
          if(connectingServers[hosts[i]] == null && !inInitialConnectingServers(hosts[i])) {
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
    if(replState.state == DESTROYED) return;

    // Filter out any connection servers
    initialConnectionServers = initialConnectionServers.filter(function(_server) {
      return server.name != _server.name;
    });

    // Process the new server
    var processNewServer = function() {
      // Discover any additional servers
      var ismaster = server.lastIsMaster();

      var events = ['error', 'close', 'timeout', 'connect'];
      // Remove any non used handlers
      events.forEach(function(e) {
        server.removeAllListeners(e);
      })

      // Clean up
      delete connectingServers[server.name];
      // Update the replicaset state, destroy if not added
      if(!replState.update(ismaster, server)) {
        // Destroy the entry
        return server.destroy();
      }      

      // Add the server handling code
      if(server.isConnected()) {
        server.on('error', errorHandler);
        server.on('close', closeHandler);
        server.on('timeout', timeoutHandler);
        server.on('message', messageHandler);        
      }

      // Hosts to process
      var hosts = ismaster.hosts;
      // Add arbiters to list of hosts if we have any
      if(Array.isArray(ismaster.arbiters)) hosts = hosts.concat(ismaster.arbiters);
      if(Array.isArray(ismaster.passives)) hosts = hosts.concat(ismaster.passives);

      // Add any new servers
      processHosts(hosts);

      // If have the server instance already destroy it
      if(initialConnectionServers.length == 0 && Object.keys(connectingServers).length == 0 
        && !replState.isPrimaryConnected() && !secondaryOnlyConnectionAllowed && replState.state == CONNECTING) {
        if(logger.isInfo()) logger.info(f('[%s] no primary found in replicaset', id));
        self.emit('error', new MongoError("no primary found in replicaset"));
        return self.destroy();        
      }

      // If no more initial servers and new scheduled servers to connect
      if(replState.secondaries.length >= 1 && replState.primary != null && !fullsetup) {
        fullsetup = true;
        self.emit('fullsetup', self);
      }
    }

    // No credentials just process server
    if(credentials.length == 0) return processNewServer();

    // Do we have credentials, let's apply them all
    var count = credentials.length;
    // Apply the credentials
    for(var i = 0; i < credentials.length; i++) {
      server.auth.apply(server, credentials[i].concat([function(err, r) {        
        count = count - 1;
        if(count == 0) processNewServer();
      }]));
    }
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

    // Set the state as connecting
    replState.state = CONNECTING;

    // No fullsetup reached
    fullsetup = false;

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
      if(tag) opts.tag = tag;
      // Share the auth store
      opts.authProviders = authProviders;
      // Create a new Server
      var server = new Server(opts);
      // Add to list of disconnected servers
      disconnectedServers.push(server);
      // Add to list of inflight Connections
      initialConnectionServers.push(server);
    });

    // Attempt to connect to all the servers
    while(disconnectedServers.length > 0) {
      // Get the server
      var server = disconnectedServers.shift();

      // Set up the event handlers
      server.once('error', errorHandlerTemp('error'));
      server.once('close', errorHandlerTemp('close'));
      server.once('timeout', errorHandlerTemp('timeout'));
      server.once('connect', connectHandler);
      
      // Attempt to connect
      server.connect();
    }
  }

  /**
   * Destroy the server connection
   * @method
   */
  this.destroy = function() {
    if(logger.isInfo()) logger.info(f('[%s] destroyed', id));
    replState.state = DESTROYED;
    replState.destroy();

    // Clear out any listeners
    var events = ['timeout', 'error', 'close', 'joined', 'left'];
    events.forEach(function(e) {
      self.removeAllListeners(e);
    });
  }

  /**
   * Figure out if the server is connected
   * @method
   * @return {boolean}
   */
  this.isConnected = function(options) {
    options = options || {};
    // If we specified a read preference check if we are connected to something
    // than can satisfy this
    if(options.readPreference 
      && options.readPreference.equals(ReadPreference.secondary))
      return replState.isSecondaryConnected();

    if(options.readPreference 
      && options.readPreference.equals(ReadPreference.primary))
      return replState.isSecondaryConnected() || replState.isPrimaryConnected();

    if(secondaryOnlyConnectionAllowed) return replState.isSecondaryConnected();
    return replState.isPrimaryConnected();
  }

  this.state = function() {
    return replState.state;
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
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Connection} [options.connection] Specify connection object to execute command against
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

    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.isConnected(options) && disconnectHandler != null) {
      callback = bindToCurrentDomain(callback);
      return disconnectHandler.add('command', ns, cmd, options, callback);
    }

    // We need to execute the command on all servers
    if(options.onAll) {
      var servers = replState.getAll();
      var count = servers.length;
      var cmdErr = null;

      for(var i = 0; i < servers.length; i++) {
        servers[i].command(ns, cmd, options, function(err, r) {
          count = count - 1;
          // Finished executing command
          if(count == 0) {
            // Was it a logout command clear any credentials      
            if(cmd.logout) clearCredentials(ns);
            // We have a no master error, immediately refresh the view of the replicaset
            if(r && notMasterError(r)) replicasetInquirer(true);
            // Return the error
            callback(err, r);
          }
        });
      }

      return;
    }

    // Pick the right server based on readPreference
    try {
      server = pickServer(options.writeConcern ? ReadPreference.primary : options.readPreference);
      if(debug) self.emit('pickedServer', options.writeConcern ? ReadPreference.primary : options.readPreference, server);      
    } catch(err) {
      return callback(err);
    }

    // No server returned we had an error
    if(server == null) return callback(new MongoError("no server found"));
    // Execute the command
    server.command(ns, cmd, options, function(err, r) {
      // Was it a logout command clear any credentials      
      if(cmd.logout) clearCredentials(ns);
      // We have a no master error, immediately refresh the view of the replicaset
      if(r && notMasterError(r)) replicasetInquirer(true);
      // Return the error
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
      if(debug) self.emit('pickedServer', ReadPreference.primary, server);
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
    var servers = replState.getAll();
    var count = servers.length;
    // Correct authentication
    var authenticated = true;
    var authErr = null;

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
          // Add successful credentials
          if(authErr == null) addCredentials(db, argsWithoutCallback);
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
    return replState.lastIsMaster();
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
    var server = pickServer(options.readPreference);
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
    return pickServer(options.readPreference);
  }

  /**
   * All raw connections
   * @method
   * @return {Connection[]}
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
      if(readPreferenceStrategies[readPreference.preference] == null) throw new MongoError(f("cannot locate read preference handler for %s", readPreference.preference));
      var server = readPreferenceStrategies[readPreference.preference].pickServer(replState, readPreference);
      if(debug) self.emit('pickedServer', readPreference, server);
      return server;
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

module.exports = ReplSet;