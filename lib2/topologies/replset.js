"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  BSON = require('bson').native().BSON,
  ReadPreference = require('./read_preference'),
  Logger = require('../connection/logger'),
  debugOptions = require('../connection/utils').debugOptions,
  MongoError = require('../error'),
  Server = require('./server'),
  ReplSetState = require('./replset_state');

//
// States
var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

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
    // Uniquely identify the replicaset instance
    id: replSetId++,
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
    minHeartbeatFrequencyMS: 500
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
    // Get all known hosts
    var keys = Object.keys(self.s.replicaSetState.set);
    var servers = keys.map(function(x) {
      return new Server(Object.assign({
        host: x.split(':')[0], port: parseInt(x.split(':')[1], 10)
      }, self.s.options));
    });

    // Create the list of servers
    var connectingServers = servers.slice(0);

    // Handle all events coming from servers
    function _handleEvent(self, event) {
      return function(err) {
        if(event == 'connect') {
          // Update the replicaset state
          self.s.replicaSetState.update(this);
          // Remove the server from our list
          for(var i = 0; i < connectingServers.length; i++) {
            if(connectingServers[i].equals(this)) {
              connectingServers.splice(i, 1);
            }
          }

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

        // Destroy the instance
        if(self.state == DESTROYED) {
          this.destroy();
        }

        // Done with the reconnection attempt
        if(connectingServers.length == 0) {
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
      // console.log("=============== connectNewServers :: _handleEvent :: " + event)
      count = count - 1;

      if(event == 'connect') {
        // console.log("=============== connectNewServers :: _handleEvent 1")
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
    }, self.s.options));
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

function topologyMonitor(self) {
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
      _server.command('admin.$cmd', {ismaster:true}, function(err, r) {
        if(self.state == DESTROYED) {
          _server.destroy();
          cb(err, r);
        }

        if(r) {
          // Update the server ismaster
          _server.ismaster = r.result;
          // console.dir(r.result)
          _self.s.replicaSetState.update(_server);
        }

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
            // console.log("!!!!!!!!!!!!!!!!!! topologyMonitor")
            topologyMonitor(self);
          });
        }
      });
    }
  }, self.s.haInterval)
}

function handleEvent(self, event) {
  return function(err) {
    self.s.replicaSetState.remove(this);
  }
}

function handleInitialConnectEvent(self, event) {
  return function(err) {
    // console.log("========= handleInitialConnectEvent :: " + event)
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
      self.s.replicaSetState.remove(this);
    }

    // Remove from the list from connectingServers
    for(var i = 0; i < self.s.connectingServers.length; i++) {
      if(self.s.connectingServers[i].equals(this)) {
        self.s.connectingServers.splice(i, 1);
      }
    }

    // Do we have a primary and secondary
    if(self.state == CONNECTING
      && self.s.replicaSetState.hasPrimaryAndSecondary()) {
        // console.log("========================== 0")
        // Transition to connected
        stateTransition(self, CONNECTED);
        // Start the topology monitor
        topologyMonitor(self);
        // Emit connected sign
        self.emit('connect', self);
    } else if(self.state == CONNECTING
      && self.s.replicaSetState.hasSecondary()
      && self.s.options.secondaryOnlyConnectionAllowed) {
        // console.log("========================== 1")
        // Transition to connected
        stateTransition(self, CONNECTED);
        // Start the topology monitor
        topologyMonitor(self);
        // Emit connected sign
        self.emit('connect', self);
    } else if(self.state == CONNECTING
      && self.s.connectingServers.length == 0) {
        // console.log("========================== 2")
        self.emit('error', new MongoError('no primary found in replicaset'));
    }
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
  var self = this;
  // Set connecting state
  stateTransition(this, CONNECTING);
  // Create server instances
  var servers = this.s.seedlist.map(function(x) {
    return new Server(Object.assign(x, self.s.options));
  });

  // Start all server connections
  connectServers(self, servers);
}

ReplSet.prototype.destroy = function() {
  if(this.haTimeoutId) clearTimeout(this.haTimeoutId);
  // Destroy the replicaset
  this.s.replicaSetState.destroy();
  // Transition state
  stateTransition(this, DESTROYED);
}

module.exports = ReplSet;
