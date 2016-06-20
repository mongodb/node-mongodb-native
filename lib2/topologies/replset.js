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
    connectingServers: []
  }

  // Add forwarding of events from state handler
  this.s.replicaSetState.on('joined', function(t, s) {
    self.emit('joined', t, s);
  });

  // Add forwarding of events from state handler
  this.s.replicaSetState.on('left', function(t, s) {
    self.emit('left', t, s);
  });

  // Disconnected state
  this.state = DISCONNECTED;
}

inherits(ReplSet, EventEmitter);

function handleInitialConnectEvent(self, event) {
  return function(err) {
    // Check the type of server
    if(event == 'connect') {
      self.s.replicaSetState.update(this);
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

    // console.log("============================================= " + event)
    // console.log("self.state = " + self.state)
    // console.log("self.s.replicaSetState.hasPrimaryAndSecondary() = " + self.s.replicaSetState.hasPrimaryAndSecondary())
    // console.log("self.s.replicaSetState.hasSecondary() = " + self.s.replicaSetState.hasSecondary())
    // console.log("self.s.options.secondaryOnlyConnectionAllowed = " + self.s.options.secondaryOnlyConnectionAllowed)
    // // console.dir(err)
    // // console.dir(self.s.options)
    //
    // console.log("========================== 0")

    // try {
    //   self.s.replicaSetState.hasPrimaryAndSecondary()
    //   self.s.replicaSetState.hasSecondary()
    // } catch(e) {
    //   console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%")
    //   console.log(e.stack)
    // }

    // Do we have a primary and secondary
    if(self.state == CONNECTING
      && self.s.replicaSetState.hasPrimaryAndSecondary()) {
        console.log("========================== 0")
        // Transition to connected
        stateTransition(self, CONNECTED);
        // Emit connected sign
        self.emit('connect', self);
    } else if(self.state == CONNECTING
      && self.s.replicaSetState.hasSecondary()
      && self.s.options.secondaryOnlyConnectionAllowed) {
        console.log("========================== 1")
        // Transition to connected
        stateTransition(self, CONNECTED);
        // Emit connected sign
        self.emit('connect', self);
    } else if(self.state == CONNECTING
      && self.s.connectingServers.length == 0) {
        console.log("========================== 2")
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
  // Destroy the replicaset
  this.s.replicaSetState.destroy();
  // Transition state
  stateTransition(this, DESTROYED);
}

module.exports = ReplSet;
