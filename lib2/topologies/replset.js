"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  BSON = require('bson').native().BSON,
  ReadPreference = require('./read_preference'),
  BasicCursor = require('../cursor'),
  Logger = require('../connection/logger'),
  debugOptions = require('../connection/utils').debugOptions,
  MongoError = require('../error'),
  Server = require('./server'),
  ReplSetState = require('./replset_state');

var MongoCR = require('../auth/mongocr')
  , X509 = require('../auth/x509')
  , Plain = require('../auth/plain')
  , GSSAPI = require('../auth/gssapi')
  , SSPI = require('../auth/sspi')
  , ScramSHA1 = require('../auth/scram');

//
// States
var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

function stateTransition(self, newState) {
  var legalTransitions = {
    'disconnected': [CONNECTING, DESTROYED, DISCONNECTED],
    'connecting': [CONNECTING, DESTROYED, CONNECTED, DISCONNECTED],
    'connected': [CONNECTED, DISCONNECTED, DESTROYED],
    'destroyed': [DESTROYED]
  }

  // Get current state
  var legalStates = legalTransitions[self.state];
  if(legalStates && legalStates.indexOf(newState) != -1) {
    self.state = newState;
  } else {
    self.logger.error(f('Pool with id [%s] failed attempted illegal state transition from [%s] to [%s] only following state allowed [%s]'
      , self.id, self.state, newState, legalStates));
  }
}

//
// ReplSet instance id
var replSetId = 1;
var handlers = ['connect', 'close', 'error', 'timeout', 'parseError'];

function stateTransition(self, newState) {
  var legalTransitions = {
    'disconnected': [CONNECTING, DESTROYED, DISCONNECTED],
    'connecting': [CONNECTING, DESTROYED, CONNECTED, DISCONNECTED],
    'connected': [CONNECTED, DISCONNECTED, DESTROYED],
    'destroyed': [DESTROYED]
  }

  // Get current state
  var legalStates = legalTransitions[self.state];
  if(legalStates && legalStates.indexOf(newState) != -1) {
    self.state = newState;
  } else {
    self.logger.error(f('Replicaset with id [%s] failed attempted illegal state transition from [%s] to [%s] only following state allowed [%s]'
      , self.id, self.state, newState, legalStates));
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

  // Internal state
  this.s = {
    options: Object.assign({}, options),
    // BSON instance
    bson: options.bson || new BSON(),
    // Uniquely identify the replicaset instance
    id: replSetId++,
    // Factory overrides
    Cursor: options.cursorFactory || BasicCursor,
    // Logger instance
    logger: Logger('ReplSet', options),
    // Seedlist
    seedlist: seedlist,
    // Replicaset state
    replicaSetState: new ReplSetState({setName: options.setName}),
    // Current servers we are connecting to
    connectingServers: [],
    // Ha interval
    haInterval: options.haInterval ? options.haInterval : 10000,
    // Minimum heartbeat frequency used if we detect a server close
    minHeartbeatFrequencyMS: 500,
    // Disconnect handler
    disconnectHandler: options.disconnectHandler,
    // Server selection index
    index: 0,
    // Acceptable latency window for nearest reads
    acceptableLatency: options.acceptableLatency || 15
  }

  // console.log("== create ReplSet :: " + this.s.id)

  // All the authProviders
  this.authProviders = options.authProviders || {
      'mongocr': new MongoCR(options.bson), 'x509': new X509(options.bson)
    , 'plain': new Plain(options.bson), 'gssapi': new GSSAPI(options.bson)
    , 'sspi': new SSPI(options.bson), 'scram-sha-1': new ScramSHA1(options.bson)
  }

  // Add forwarding of events from state handler
  var types = ['joined', 'left'];
  types.forEach(function(x) {
    self.s.replicaSetState.on(x, function(t, s) {
      self.emit(x, t, s);
    });
  });

  // Disconnected state
  this.state = DISCONNECTED;
  this.haTimeoutId = null;
}

inherits(ReplSet, EventEmitter);

function attemptReconnect(self) {
  self.haTimeoutId = setTimeout(function() {
    // console.log("---- attemptReconnect")
    if(self.state == DESTROYED) return;
    // console.log("---- attemptReconnect 1")
    // Get all known hosts
    var keys = Object.keys(self.s.replicaSetState.set);
    var servers = keys.map(function(x) {
      return new Server(Object.assign({
        host: x.split(':')[0], port: parseInt(x.split(':')[1], 10)
      }, self.s.options, { authProviders: self.authProviders}));
    });
    // console.log("---- attemptReconnect 2 :: " + servers.length)

    // Create the list of servers
    self.s.connectingServers = servers.slice(0);

    // Handle all events coming from servers
    function _handleEvent(self, event) {
      return function(err) {
        // Destroy the instance
        if(self.state == DESTROYED) {
          return this.destroy();
        }

        // console.log("---- attemptReconnect :: _handleEvent :: " + event)
        // console.dir(err)
        if(event == 'connect') {
          // Update the replicaset state
          self.s.replicaSetState.update(this);

          // Remove the handlers
          for(var i = 0; i < handlers.length; i++) {
            this.removeAllListeners(handlers[i]);
          }

          // Add stable state handlers
          this.on('error', handleEvent(self, 'error'));
          this.on('close', handleEvent(self, 'close'));
          this.on('timeout', handleEvent(self, 'timeout'));
          this.on('parseError', handleEvent(self, 'parseError'));
        }

        // Remove the server from our list
        for(var i = 0; i < self.s.connectingServers.length; i++) {
          if(self.s.connectingServers[i].equals(this)) {
            self.s.connectingServers.splice(i, 1);
          }
        }

        // Done with the reconnection attempt
        if(self.s.connectingServers.length == 0) {
          // console.log("---- attemptReconnect done")
          if(self.state == DESTROYED) return;

          // Do we have a primary
          if(self.s.replicaSetState.hasPrimary()) {
            connectNewServers(self, self.s.replicaSetState.unknownServers, function(err, cb) {
              topologyMonitor(self);
            });
          } else {
            attemptReconnect(self);
          }
        }
      }
    }

    // Connect all servers
    while(servers.length > 0) {
      var server = servers.shift();
      server.once('connect', _handleEvent(self, 'connect'));
      server.once('close', _handleEvent(self, 'close'));
      server.once('timeout', _handleEvent(self, 'timeout'));
      server.once('error', _handleEvent(self, 'error'));
      server.once('parseError', _handleEvent(self, 'parseError'));
      server.connect();
    }
  }, self.s.minHeartbeatFrequencyMS);
}

function connectNewServers(self, servers, callback) {
  // Count lefts
  var count = servers.length;
  // console.log("=============== connectNewServers :: " + count)

  // Handle events
  var _handleEvent = function(self, event) {
    return function(err, r) {
      // console.log("=============== connectNewServers :: _handleEvent :: " + this.name)
      count = count - 1;

      // Destroyed
      if(self.state == DESTROYED) {
        return this.destroy();
      }

      if(event == 'connect') {
        // console.dir(this.ismaster)
        // console.log(self.s.replicaSetState.update(this));

        // Update the state with the new server
        var result = self.s.replicaSetState.update(this);
        // console.log("=============== connectNewServers :: _handleEvent 1 :: " + result)
        // console.log("primary :: " + (self.s.replicaSetState.primary != null))
        // console.log("secondaries :: " + self.s.replicaSetState.secondaries.length)
        // console.log("arbiters :: " + self.s.replicaSetState.arbiters.length)

        // Remove the handlers
        for(var i = 0; i < handlers.length; i++) {
          this.removeAllListeners(handlers[i]);
        }

        // Add stable state handlers
        this.on('error', handleEvent(self, 'error'));
        this.on('close', handleEvent(self, 'close'));
        this.on('timeout', handleEvent(self, 'timeout'));
        this.on('parseError', handleEvent(self, 'parseError'));
      }

      if(count == 0) {
        callback();
      }
    }
  }

  // No new servers
  if(count == 0) return callback();
  // Create new instances
  for(var i = 0; i < servers.length; i++) {
    // console.log("=============== connectNewServers - 0")
    // Create a new server instance
    var server = new Server(Object.assign({
      host: servers[i].split(':')[0],
      port: parseInt(servers[i].split(':')[1], 10)
    }, self.s.options, { authProviders: self.authProviders}));
    // console.log("=============== connectNewServers - 2")
    // Add temp handlers
    server.once('connect', _handleEvent(self, 'connect'));
    server.once('close', _handleEvent(self, 'close'));
    server.once('timeout', _handleEvent(self, 'timeout'));
    server.once('error', _handleEvent(self, 'error'));
    server.once('parseError', _handleEvent(self, 'parseError'));
    server.connect();
  }
}

function topologyMonitor(self, options) {
  options = options || {};

  // Set momitoring timeout
  self.haTimeoutId = setTimeout(function() {
    // console.log("===================== topologyMonitor")
    // console.log("+ topologyMonitor 0")
    if(self.state == DESTROYED) return;
    // Get the connectingServers
    var connectingServers = self.s.replicaSetState.allServers();
    // console.log(connectingServers.map(function(x) {
    //   return x.name;
    // }));
    // console.log(self.s.replicaSetState.unknownServers.map(function(x) {
    //   return x;
    // }));
    // Get the count
    var count = connectingServers.length;
    // If we have no servers connected
    if(count == 0) return attemptReconnect(self);

    // If the count is zero schedule a new fast
    // console.log("+ topologyMonitor 1 :: count :: " + count)
    function pingServer(_self, _server, cb) {
      // console.log("================ pingServer 0 :: " + _server.name)
      // Measure running time
      var start = new Date().getTime();
      // Execute ismaster
      _server.command('admin.$cmd', {ismaster:true}, {monitoring: true}, function(err, r) {
        // console.log("================ pingServer 1 :: " + _server.name)
        if(self.state == DESTROYED) {
          _server.destroy();
          return cb(err, r);
        }

        if(r) {
          // Update the server ismaster
          _server.ismaster = r.result;
          _server.lastIsMasterMS = new Date().getTime() - start;
          // console.log("============= got ismaster from " + _server.name)
          // console.dir(_server.ismaster)
          // console.dir(r.result)
          _self.s.replicaSetState.update(_server);
        }
        // console.log("================ pingServer 2 :: " + _server.name)
        // console.dir(err)

        cb(err, r);
      });
    }

    // Ping all servers
    for(var i = 0; i < connectingServers.length; i++) {
      pingServer(self, connectingServers[i], function(err, r) {
        count = count - 1;

        if(count == 0) {
          // console.log("++++++++++++++++++++++++++++++ 1")
          // console.log(self.s.replicaSetState.unknownServers.map(function(x) {
          //   return x;
          // }));

          if(self.state == DESTROYED) return;
          // Attempt to connect to any unknown servers
          connectNewServers(self, self.s.replicaSetState.unknownServers, function(err, cb) {
            if(self.state == DESTROYED) return;
            // console.log("111 connectNewServers")
            // Check if we have an options.haInterval (meaning it was triggered from connect)
            if(options.haInterval) {
              // Do we have a primary and secondary
              if(self.state == CONNECTING
                && self.s.replicaSetState.hasPrimaryAndSecondary()) {
                  // console.log("========================== 0 :: " + self.s.id)
                  // Transition to connected
                  stateTransition(self, CONNECTED);
                  // // Start the topology monitor
                  // topologyMonitor(self);
                  // console.log("===================== connect 0")
                  // Emit connected sign
                  self.emit('connect', self);
              } else if(self.state == CONNECTING
                && self.s.replicaSetState.hasSecondary()
                && self.s.options.secondaryOnlyConnectionAllowed) {
                  // console.log("========================== 1 :: " + self.s.id)
                  // Transition to connected
                  stateTransition(self, CONNECTED);
                  // // Start the topology monitor
                  // topologyMonitor(self);
                  // console.log("===================== connect 1")
                  // Emit connected sign
                  self.emit('connect', self);
              } else if(self.state == CONNECTING) {
                  // console.log("========================== 2 :: " + self.s.id)
                  self.emit('error', new MongoError('no primary found in replicaset'));
                // Destroy the topology
                return self.destroy();
              }
            }

            // console.log("========================== 3 :: " + self.s.id)
            // console.log("!!!!!!!!!!!!!!!!!! topologyMonitor")
            topologyMonitor(self);
          });
        }
      });
    }
  }, options.haInterval || self.s.haInterval)
}

function handleEvent(self, event) {
  return function(err) {
    // console.log("$$$$ handleEvent :: " + event + " :: " + self.s.id)
    if(self.state == DESTROYED) return;
    self.s.replicaSetState.remove(this);
  }
}

function handleInitialConnectEvent(self, event) {
  return function(err) {
    // console.log("========= handleInitialConnectEvent :: " + event + " :: " + this.name)
    // Destroy the instance
    if(self.state == DESTROYED) {
      return this.destroy();
    }

    // Check the type of server
    if(event == 'connect') {
      // Update the state
      self.s.replicaSetState.update(this);
      // Remove the handlers
      for(var i = 0; i < handlers.length; i++) {
        this.removeAllListeners(handlers[i]);
      }

      // Add stable state handlers
      this.on('error', handleEvent(self, 'error'));
      this.on('close', handleEvent(self, 'close'));
      this.on('timeout', handleEvent(self, 'timeout'));
      this.on('parseError', handleEvent(self, 'parseError'));
    } else {
      // Emit failure to connect
      self.emit('failed', this);
      // Remove from the state
      // console.log("== handleInitialConnectEvent :: " + event + " :: " + self.s.id)
      self.s.replicaSetState.remove(this);
    }

    // Remove from the list from connectingServers
    for(var i = 0; i < self.s.connectingServers.length; i++) {
      if(self.s.connectingServers[i].equals(this)) {
        self.s.connectingServers.splice(i, 1);
      }
    }

    // Trigger topologyMonitor
    if(self.s.connectingServers.length == 0) {
      topologyMonitor(self, {haInterval: 1});
    }

    // // Do we have a primary and secondary
    // if(self.state == CONNECTING
    //   && self.s.replicaSetState.hasPrimaryAndSecondary()) {
    //     // console.log("========================== 0")
    //     // Transition to connected
    //     stateTransition(self, CONNECTED);
    //     // Start the topology monitor
    //     topologyMonitor(self);
    //     // console.log("===================== connect 0")
    //     // Emit connected sign
    //     self.emit('connect', self);
    // } else if(self.state == CONNECTING
    //   && self.s.replicaSetState.hasSecondary()
    //   && self.s.options.secondaryOnlyConnectionAllowed) {
    //     // console.log("========================== 1")
    //     // Transition to connected
    //     stateTransition(self, CONNECTED);
    //     // Start the topology monitor
    //     topologyMonitor(self);
    //     // console.log("===================== connect 1")
    //     // Emit connected sign
    //     self.emit('connect', self);
    // } else if(self.state == CONNECTING
    //   && self.s.connectingServers.length == 0) {
    //     // console.log("========================== 2")
    //     self.emit('error', new MongoError('no primary found in replicaset'));
    // }
  };
}

function connectServers(self, servers) {
  // Update connectingServers
  self.s.connectingServers = self.s.connectingServers.concat(servers);
  // Start all the servers
  while(servers.length > 0) {
    // Get the first server
    var server = servers.shift();
    // Add the server to the state
    self.s.replicaSetState.update(server);
    // Add event handlers
    server.once('close', handleInitialConnectEvent(self, 'close'));
    server.once('timeout', handleInitialConnectEvent(self, 'timeout'));
    server.once('parseError', handleInitialConnectEvent(self, 'parseError'));
    server.once('error', handleInitialConnectEvent(self, 'error'));
    server.once('connect', handleInitialConnectEvent(self, 'connect'));
    // Start connection
    server.connect();
  }
}

ReplSet.prototype.connect = function() {
  // console.log("=== connect")
  var self = this;
  // Set connecting state
  stateTransition(this, CONNECTING);
  // Create server instances
  var servers = this.s.seedlist.map(function(x) {
    return new Server(Object.assign(x, self.s.options), { authProviders: self.authProviders});
  });

  // Start all server connections
  connectServers(self, servers);
}

ReplSet.prototype.destroy = function() {
  // console.log("=== ReplSet :: destroy :: " + this.s.id)
  // Transition state
  stateTransition(this, DESTROYED);
  // Clear out any monitoring process
  if(this.haTimeoutId) clearTimeout(this.haTimeoutId);
  // Destroy the replicaset
  this.s.replicaSetState.destroy();
  // Destroy all connecting servers
  this.s.connectingServers.forEach(function(x) {
    x.destroy();
  });
}

ReplSet.prototype.unref = function() {
  // console.log("------------------ 0")
  this.s.replicaSetState.allServers().forEach(function(x) {
    x.unref();
  });

  // console.log("------------------ 1")
  clearTimeout(this.haTimeoutId);
  // console.log("------------------ 2")
}

ReplSet.prototype.lastIsMaster = function() {
  // console.log("=== lastIsMaster")
  return this.s.replicaSetState.primary
    ? this.s.replicaSetState.primary.lastIsMaster() : null;
}

ReplSet.prototype.isConnected = function(options) {
  // console.log("=== isConnected")
  options = options || {};
  // If we specified a read preference check if we are connected to something
  // than can satisfy this
  if(options.readPreference
    && options.readPreference.equals(ReadPreference.secondary)) {
    return this.s.replicaSetState.hasSecondary();
  }

  if(options.readPreference
    && options.readPreference.equals(ReadPreference.primary)) {
    return this.s.replicaSetState.hasPrimary();
  }

  if(options.readPreference
    && options.readPreference.equals(ReadPreference.primaryPreferred)) {
    return this.s.replicaSetState.hasSecondary() || this.s.replicaSetState.hasPrimary();
  }

  if(options.readPreference
    && options.readPreference.equals(ReadPreference.secondaryPreferred)) {
    return this.s.replicaSetState.hasSecondary() || this.s.replicaSetState.hasPrimary();
  }

  if(this.s.secondaryOnlyConnectionAllowed
    && this.s.replicaSetState.hasSecondary()) {
      return true;
  }

  return this.s.replicaSetState.hasPrimary();
}

ReplSet.prototype.isDestroyed = function() {
  // console.log("=== isDestroyed :: " + this.state == DESTROYED)
  return this.state == DESTROYED;
}

ReplSet.prototype.equals = function(server) {
  // console.log("=== equals")
}

ReplSet.prototype.getServer = function(options) {
  // console.log("=== getServer")
  // Ensure we have no options
  options = options || {};
  // Pick the right server based on readPreference
  return pickServer(this, this.s, options.readPreference);
}

ReplSet.prototype.getServerFrom = function(connection) {
  // console.log("=== getServerFrom")
  return this;
}

ReplSet.prototype.getConnection = function(options) {
  // console.log("=== getConnection")
  return this.s.pool.get();
}

function basicReadPreferenceValidation(self, options) {
  if(options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    throw new Error("readPreference must be an instance of ReadPreference");
  }
}

//
// Execute write operation
var executeWriteOperation = function(self, op, ns, ops, options, callback) {
  // console.log("== executeWriteOperation 0")
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  // Ensure we have no options
  options = options || {};
  // No server returned we had an error
  if(self.s.replicaSetState.primary == null) {
    return callback(new MongoError("no primary server found"));
  }

  // Handler
  var handler = function(err, r) {
    // // We have a no master error, immediately refresh the view of the replicaset
    // if((notMasterError(r) || notMasterError(err)) && !self.s.highAvailabilityProcessRunning) {
    //   // Set he current interval to minHeartbeatFrequencyMS
    //   self.s.currentHaInterval = self.s.minHeartbeatFrequencyMS;
    //   // Attempt to locate the current master immediately
    //   replicasetInquirer(self, self.s, true)();
    // }
    // Return the result
    callback(err, r);
  }

  // // Add operationId if existing
  // if(callback.operationId) handler.operationId = callback.operationId;
  // Execute the command
  self.s.replicaSetState.primary[op](ns, ops, options, handler);
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
  // console.log("--------- insert")
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));

  // Not connected but we have a disconnecthandler
  if(!this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  // Execute write operation
  executeWriteOperation(this, 'insert', ns, ops, options, callback);
}

function clearCredentials(state, ns) {

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
  // console.log("--------- update")
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));

  // Not connected but we have a disconnecthandler
  if(!this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  // Execute write operation
  executeWriteOperation(this, 'update', ns, ops, options, callback);
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
  // console.log("--------- remove")
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));

  // Not connected but we have a disconnecthandler
  if(!this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  // Execute write operation
  executeWriteOperation(this, 'remove', ns, ops, options, callback);
}

//
// Filter serves by tags
var filterByTags = function(readPreference, servers) {
  if(readPreference.tags == null) return servers;
  var filteredServers = [];
  var tagsArray = Array.isArray(readPreference.tags) ? readPreference.tags : [readPreference.tags];

  // Iterate over the tags
  for(var j = 0; j < tagsArray.length; j++) {
    var tags = tagsArray[j];

    // Iterate over all the servers
    for(var i = 0; i < servers.length; i++) {
      var serverTag = servers[i].lastIsMaster().tags || {};
      // console.log("==== filter server :: " + servers[i].name)
      // console.dir(serverTag)
      // Did we find the a matching server
      var found = true;
      // Check if the server is valid
      for(var name in tags) {
        // console.log("== compare :: " + name)
        // console.log("serverTag[name] == " + serverTag[name])
        // console.log("tags[name] == " + tags[name])
        if(serverTag[name] != tags[name]) found = false;
      }
      // console.dir(found)

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

function pickNearest(self, set, readPreference) {
  // Only get primary and secondaries as seeds
  var seeds = {};
  var servers = [];
  if(set.primary) {
    servers.push(set.primary);
  }
  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 0")

  for(var i = 0; i < set.secondaries.length; i++) {
    servers.push(set.secondaries[i]);
  }

  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 1")
  // console.dir(readPreference)

  // Filter by tags
  servers = filterByTags(readPreference, servers);

  // // Transform the list
  // var serverList = [];
  // // for(var name in seeds) {
  // for(var i = 0; i < servers.length; i++) {
  //   // serverList.push({name: servers[i].name, time: self.s.pings[servers[i].name] || 0});
  // }
  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 2")

  // Sort by time
  servers.sort(function(a, b) {
    // return a.time > b.time;
    return a.lastIsMasterMS > b.lastIsMasterMS
  });

  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 3")

  // Locate lowest time (picked servers are lowest time + acceptable Latency margin)
  var lowest = servers.length > 0 ? servers[0].lastIsMasterMS : 0;

  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 4 :: " + servers.length + " :: " + lowest)

  // Filter by latency
  servers = servers.filter(function(s) {
    // console.dir(self.s)
    // console.log("==== filter")
    // console.log("  s.lastIsMasterMS = " + s.lastIsMasterMS)
    // console.log("  lowest + self.s.acceptableLatency = " + (lowest + self.s.acceptableLatency))
    return s.lastIsMasterMS <= lowest + self.s.acceptableLatency;
  });
  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 5 :: " + servers.length)

  // No servers, default to primary
  if(servers.length == 0 && set.primary) {
    // if(self.s.logger.isInfo()) self.s.logger.info(f('picked primary server [%s]', set.primary.name));
    return set.primary;
  } else if(servers.length == 0) {
    return null
  }
  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 6")

  // // We picked first server
  // if(self.s.logger.isInfo()) self.s.logger.info(f('picked server [%s] with ping latency [%s]', serverList[0].name, serverList[0].time));

  // Add to the index
  self.s.index = self.s.index + 1;
  // Select the index
  self.s.index = self.s.index % servers.length;
  // console.log("!!!!!!!!!!!!!!!!!!! pickNearest 7")
  // console.log(servers.map(function(x) { return x.name}))

  // Return the first server of the sorted and filtered list
  return servers[self.s.index];
}

//
// Pick a server based on readPreference
function pickServer(self, s, readPreference) {
  // console.log("============== pickServer")
  // console.dir(readPreference)
  // console.log("self.s.replicaSetState.primary = " + self.s.replicaSetState.primary != null);
  // console.log("self.s.replicaSetState.secondaries = " + self.s.replicaSetState.secondaries.length);
  // console.log("self.s.replicaSetState.arbiters = " + self.s.replicaSetState.arbiters.length);
  // If no read Preference set to primary by default
  readPreference = readPreference || ReadPreference.primary;

  // Do we have a custom readPreference strategy, use it
  // if(s.readPreferenceStrategies != null && s.readPreferenceStrategies[readPreference.preference] != null) {
    // if(s.readPreferenceStrategies[readPreference.preference] == null) throw new MongoError(f("cannot locate read preference handler for %s", readPreference.preference));
    // var server = s.readPreferenceStrategies[readPreference.preference].pickServer(s.replicaSetState, readPreference);
    // if(s.debug) self.emit('pickedServer', readPreference, server);
  //   return server;
  // }

  // Do we have the nearest readPreference
  if(readPreference.preference == 'nearest') {
    // console.log("============ nearest")
    return pickNearest(self, s.replicaSetState, readPreference);
  }

  // Get all the secondaries
  var secondaries = s.replicaSetState.secondaries;

  // Check if we can satisfy and of the basic read Preferences
  if(readPreference.equals(ReadPreference.secondary)
    && secondaries.length == 0) {
      return new MongoError("no secondary server available");
    }

  if(readPreference.equals(ReadPreference.secondaryPreferred)
    && secondaries.length == 0
    && s.replicaSetState.primary == null) {
      return new MongoError("no secondary or primary server available");
    }

  if(readPreference.equals(ReadPreference.primary)
    && s.replicaSetState.primary == null) {
      return new MongoError("no primary server available");
    }

  // Secondary preferred or just secondaries
  if(readPreference.equals(ReadPreference.secondaryPreferred)
    || readPreference.equals(ReadPreference.secondary)) {
    if(secondaries.length > 0) {
      // console.log("==================== secondaries :: " + secondaries.length)
      // Apply tags if present
      var servers = filterByTags(readPreference, secondaries);
      // console.log("==================== servers :: " + servers.length)
      // If have a matching server pick one otherwise fall through to primary
      if(servers.length > 0) {
        s.index = (s.index + 1) % servers.length;
        // console.log("==================== servers :: " + s.index)
        return servers[s.index];
      }
    }

    return readPreference.equals(ReadPreference.secondaryPreferred) ? s.replicaSetState.primary : null;
  }

  // Primary preferred
  if(readPreference.equals(ReadPreference.primaryPreferred)) {
    if(s.replicaSetState.primary) return s.replicaSetState.primary;

    if(secondaries.length > 0) {
      // Apply tags if present
      var servers = filterByTags(readPreference, secondaries);
      // If have a matching server pick one otherwise fall through to primary
      if(servers.length > 0) {
        s.index = (s.index + 1) % servers.length;
        return servers[s.index];
      }

      // Throw error a we have not valid secondary or primary servers
      return new MongoError("no secondary or primary server available");
    }
  }

  // Return the primary
  return s.replicaSetState.primary;
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
  // console.log("--------- command")
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  var self = this;

  // Establish readPreference
  var readPreference = options.readPreference ? options.readPreference : ReadPreference.primary;

  // Pick a server
  var server = pickServer(self, self.s, readPreference);
  if(!(server instanceof Server)) return callback(server);

  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!server && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  // No server returned we had an error
  if(server == null) {
    return callback(new MongoError(f("no server found that matches the provided readPreference %s", readPreference)));
  }

  // Execute the command
  server.command(ns, cmd, options, function(err, r) {
    // Was it a logout command clear any credentials
    if(cmd.logout) clearCredentials(self.s, ns);
    // // We have a no master error, immediately refresh the view of the replicaset
    // if((notMasterError(r) || notMasterError(err)) && !self.s.highAvailabilityProcessRunning) {
    //   replicasetInquirer(self, self.s, true)();
    // }
    // Return the error
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
ReplSet.prototype.cursor = function(ns, cmd, cursorOptions) {
  cursorOptions = cursorOptions || {};
  var FinalCursor = cursorOptions.cursorFactory || this.s.Cursor;
  return new FinalCursor(this.s.bson, ns, cmd, cursorOptions, this, this.s.options);
}

module.exports = ReplSet;
