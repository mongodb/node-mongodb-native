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
  ReplSetState = require('./replset_state'),
  assign = require('./shared').assign,
  clone = require('./shared').clone,
  createClientInfo = require('./shared').createClientInfo;

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
var id = 1;
var handlers = ['connect', 'close', 'error', 'timeout', 'parseError'];

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
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {string} [options.servername=null] String containing the server name requested via TLS SNI.
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {number} [options.pingInterval=5000] Ping interval to check the response time to the different servers
 * @param {number} [options.localThresholdMS=15] Cutoff latency point in MS for MongoS proxy selection
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @return {ReplSet} A cursor instance
 * @fires ReplSet#connect
 * @fires ReplSet#ha
 * @fires ReplSet#joined
 * @fires ReplSet#left
 * @fires ReplSet#failed
 * @fires ReplSet#fullsetup
 * @fires ReplSet#all
 * @fires ReplSet#error
 * @fires ReplSet#serverHeartbeatStarted
 * @fires ReplSet#serverHeartbeatSucceeded
 * @fires ReplSet#serverHeartbeatFailed
 * @fires ReplSet#topologyOpening
 * @fires ReplSet#topologyClosed
 * @fires ReplSet#topologyDescriptionChanged
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

  // Get replSet Id
  this.id = id++;

  // Get the localThresholdMS
  var localThresholdMS = options.localThresholdMS || 15;
  // Backward compatibility
  if(options.acceptableLatency) localThresholdMS = options.acceptableLatency;

  // Create a logger
  var logger = Logger('ReplSet', options);

  // Internal state
  this.s = {
    options: assign({}, options),
    // BSON instance
    bson: options.bson || new BSON(),
    // Factory overrides
    Cursor: options.cursorFactory || BasicCursor,
    // Logger instance
    logger: logger,
    // Seedlist
    seedlist: seedlist,
    // Replicaset state
    replicaSetState: new ReplSetState({
      id: this.id, setName: options.setName,
      acceptableLatency: localThresholdMS,
      heartbeatFrequencyMS: options.haInterval ? options.haInterval : 10000,
      logger: logger
    }),
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
    // Connect function options passed in
    connectOptions: {},
    // Are we running in debug mode
    debug: typeof options.debug == 'boolean' ? options.debug : false,
    // Client info
    clientInfo: createClientInfo(options)
  }

  // Add handler for topology change
  this.s.replicaSetState.on('topologyDescriptionChanged', function(r) { self.emit('topologyDescriptionChanged', r); });

  // Log info warning if the socketTimeout < haInterval as it will cause
  // a lot of recycled connections to happen.
  if(this.s.logger.isWarn()
    && this.s.options.socketTimeout != 0
    && this.s.options.socketTimeout < this.s.haInterval) {
      this.s.logger.warn(f('warning socketTimeout %s is less than haInterval %s. This might cause unnecessary server reconnections due to socket timeouts'
        , this.s.options.socketTimeout, this.s.haInterval));
  }

  // All the authProviders
  this.authProviders = options.authProviders || {
      'mongocr': new MongoCR(this.s.bson), 'x509': new X509(this.s.bson)
    , 'plain': new Plain(this.s.bson), 'gssapi': new GSSAPI(this.s.bson)
    , 'sspi': new SSPI(this.s.bson), 'scram-sha-1': new ScramSHA1(this.s.bson)
  }

  // Add forwarding of events from state handler
  var types = ['joined', 'left'];
  types.forEach(function(x) {
    self.s.replicaSetState.on(x, function(t, s) {
      self.emit(x, t, s);
    });
  });

  // Connect stat
  this.initialConnectState = {
    connect: false, fullsetup: false, all: false
  }

  // Disconnected state
  this.state = DISCONNECTED;
  this.haTimeoutId = null;
  // Are we authenticating
  this.authenticating = false;
  // Last ismaster
  this.ismaster = null;
}

inherits(ReplSet, EventEmitter);

Object.defineProperty(ReplSet.prototype, 'type', {
  enumerable:true, get: function() { return 'replset'; }
});

function attemptReconnect(self) {
  if(self.runningAttempReconnect) return;
  // Set as running
  self.runningAttempReconnect = true;
  // Wait before execute
  self.haTimeoutId = setTimeout(function() {
    if(self.state == DESTROYED) return;

    // Debug log
    if(self.s.logger.isDebug()) {
      self.s.logger.debug(f('attemptReconnect for replset with id %s', self.id));
    }

    // Get all known hosts
    var keys = Object.keys(self.s.replicaSetState.set);
    var servers = keys.map(function(x) {
      return new Server(assign({}, self.s.options, {
        host: x.split(':')[0], port: parseInt(x.split(':')[1], 10)
      }, {
        authProviders: self.authProviders, reconnect:false, monitoring: false, inTopology: true
      }, {
        clientInfo: clone(self.s.clientInfo)
      }));
    });

    // Create the list of servers
    self.s.connectingServers = servers.slice(0);

    // Handle all events coming from servers
    function _handleEvent(self, event) {
      return function(err) {
        // console.log(`_handleEvent() [${event}]-[${this.name}]`)
        // Destroy the instance
        if(self.state == DESTROYED) {
          return this.destroy();
        }

        // Debug log
        if(self.s.logger.isDebug()) {
          self.s.logger.debug(f('attemptReconnect for replset with id %s using server %s ended with event %s', self.id, this.name, event));
        }

        // Check if we are done
        function done() {
          // Done with the reconnection attempt
          if(self.s.connectingServers.length == 0) {
            if(self.state == DESTROYED) return;

            // If we have a primary and a disconnect handler, execute
            // buffered operations
            if(self.s.replicaSetState.hasPrimaryAndSecondary() && self.s.disconnectHandler) {
              self.s.disconnectHandler.execute();
            } else if(self.s.replicaSetState.hasPrimary() && self.s.disconnectHandler) {
              self.s.disconnectHandler.execute({ executePrimary:true });
            } else if(self.s.replicaSetState.hasSecondary() && self.s.disconnectHandler) {
              self.s.disconnectHandler.execute({ executeSecondary:true });
            }

            // Do we have a primary
            if(self.s.replicaSetState.hasPrimary()) {
              // Connect any missing servers
              connectNewServers(self, self.s.replicaSetState.unknownServers, function(err, cb) {
                // Debug log
                if(self.s.logger.isDebug()) {
                  self.s.logger.debug(f('attemptReconnect for replset with id successful resuming topologyMonitor', self.id));
                }

                // Reset the running
                self.runningAttempReconnect = false;
                // Go back to normal topology monitoring
                topologyMonitor(self);
              });
            } else {
              if(self.listeners("close").length > 0) {
                self.emit('close', self);
              }

              // Reset the running
              self.runningAttempReconnect = false;
              // Attempt a new reconnect
              attemptReconnect(self);
            }
          }
        }

        // Remove the server from our list
        for(var i = 0; i < self.s.connectingServers.length; i++) {
          if(self.s.connectingServers[i].equals(this)) {
            self.s.connectingServers.splice(i, 1);
          }
        }

        // Keep reference to server
        var _self = this;

        // Debug log
        if(self.s.logger.isDebug()) {
          self.s.logger.debug(f('attemptReconnect in replset with id %s for', self.id));
        }

        // Connect and not authenticating
        if(event == 'connect' && !self.authenticating) {
          if(self.state == DESTROYED) {
            return _self.destroy();
          }

          // Update the replicaset state
          if(self.s.replicaSetState.update(_self)) {
            // Primary lastIsMaster store it
            if(_self.lastIsMaster() && _self.lastIsMaster().ismaster) {
              self.ismaster = _self.lastIsMaster();
            }

            // Remove the handlers
            for(var i = 0; i < handlers.length; i++) {
              _self.removeAllListeners(handlers[i]);
            }

            // Add stable state handlers
            _self.on('error', handleEvent(self, 'error'));
            _self.on('close', handleEvent(self, 'close'));
            _self.on('timeout', handleEvent(self, 'timeout'));
            _self.on('parseError', handleEvent(self, 'parseError'));
          } else {
            _self.destroy();
          }
        } else if(event == 'connect' && self.authenticating) {
          this.destroy();
        }

        done();
      }
    }

    // Index used to interleaf the server connects, avoiding
    // runtime issues on io constrained vm's
    var timeoutInterval = 0;

    function connect(server, timeoutInterval) {
      setTimeout(function() {
        server.once('connect', _handleEvent(self, 'connect'));
        server.once('close', _handleEvent(self, 'close'));
        server.once('timeout', _handleEvent(self, 'timeout'));
        server.once('error', _handleEvent(self, 'error'));
        server.once('parseError', _handleEvent(self, 'parseError'));

        // SDAM Monitoring events
        server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
        server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
        server.on('serverClosed', function(e) { self.emit('serverClosed', e); });

        server.connect(self.s.connectOptions);
      }, timeoutInterval);
    }

    // Connect all servers
    while(servers.length > 0) {
      connect(servers.shift(), timeoutInterval++);
    }
  }, self.s.minHeartbeatFrequencyMS);
}

function connectNewServers(self, servers, callback) {
  // Count lefts
  var count = servers.length;

  // Handle events
  var _handleEvent = function(self, event) {
    return function(err, r) {
      var _self = this;
      count = count - 1;

      // Destroyed
      if(self.state == DESTROYED) {
        return this.destroy();
      }

      if(event == 'connect' && !self.authenticating) {
        // Destroyed
        if(self.state == DESTROYED) {
          return _self.destroy();
        }

        var result = self.s.replicaSetState.update(_self);
        // Update the state with the new server
        if(result) {
          // Primary lastIsMaster store it
          if(_self.lastIsMaster() && _self.lastIsMaster().ismaster) {
            self.ismaster = _self.lastIsMaster();
          }

          // Remove the handlers
          for(var i = 0; i < handlers.length; i++) {
            _self.removeAllListeners(handlers[i]);
          }

          // Add stable state handlers
          _self.on('error', handleEvent(self, 'error'));
          _self.on('close', handleEvent(self, 'close'));
          _self.on('timeout', handleEvent(self, 'timeout'));
          _self.on('parseError', handleEvent(self, 'parseError'));
        } else {
          _self.destroy();
        }
      } else if(event == 'connect' && self.authenticating) {
        this.destroy();
      }

      // Are we done finish up callback
      if(count == 0) { callback(); }
    }
  }

  // No new servers
  if(count == 0) return callback();

  // Execute method
  function execute(_server, i) {
    setTimeout(function() {
      // Destroyed
      if(self.state == DESTROYED) {
        return;
      }

      // Create a new server instance
      var server = new Server(assign({}, self.s.options, {
        host: _server.split(':')[0],
        port: parseInt(_server.split(':')[1], 10)
      }, {
        authProviders: self.authProviders, reconnect:false, monitoring: false, inTopology: true
      }, {
        clientInfo: clone(self.s.clientInfo)
      }));

      // Add temp handlers
      server.once('connect', _handleEvent(self, 'connect'));
      server.once('close', _handleEvent(self, 'close'));
      server.once('timeout', _handleEvent(self, 'timeout'));
      server.once('error', _handleEvent(self, 'error'));
      server.once('parseError', _handleEvent(self, 'parseError'));

      // SDAM Monitoring events
      server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
      server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
      server.on('serverClosed', function(e) { self.emit('serverClosed', e); });
      server.connect(self.s.connectOptions);
    }, i);
  }

  // Create new instances
  for(var i = 0; i < servers.length; i++) {
    execute(servers[i], i);
  }
}

function topologyMonitor(self, options) {
  options = options || {};

  // Set momitoring timeout
  self.haTimeoutId = setTimeout(function() {
    if(self.state == DESTROYED) return;

    // Is this a on connect topology discovery
    // Schedule a proper topology monitoring to happen
    // To ensure any discovered servers do not timeout
    // while waiting for the initial discovery to happen.
    if(options.haInterval) {
      topologyMonitor(self);
    }

    // If we have a primary and a disconnect handler, execute
    // buffered operations
    if(self.s.replicaSetState.hasPrimaryAndSecondary() && self.s.disconnectHandler) {
      self.s.disconnectHandler.execute();
    } else if(self.s.replicaSetState.hasPrimary() && self.s.disconnectHandler) {
      self.s.disconnectHandler.execute({ executePrimary:true });
    } else if(self.s.replicaSetState.hasSecondary() && self.s.disconnectHandler) {
      self.s.disconnectHandler.execute({ executeSecondary:true });
    }

    // Get the connectingServers
    var connectingServers = self.s.replicaSetState.allServers();
    // Debug log
    if(self.s.logger.isDebug()) {
      self.s.logger.debug(f('topologyMonitor in replset with id %s connected servers [%s]'
        , self.id
        , connectingServers.map(function(x) {
          return x.name;
        })));
    }
    // Get the count
    var count = connectingServers.length;
    // If we have no servers connected
    if(count == 0 && !options.haInterval) {
      if(self.listeners("close").length > 0) {
        self.emit('close', self);
      }

      return attemptReconnect(self);
    }

    // If the count is zero schedule a new fast
    function pingServer(_self, _server, cb) {
      // Measure running time
      var start = new Date().getTime();

      // Emit the server heartbeat start
      emitSDAMEvent(self, 'serverHeartbeatStarted', { connectionId: _server.name });
      // Execute ismaster
      _server.command('admin.$cmd', {ismaster:true}, {monitoring: true}, function(err, r) {
        if(self.state == DESTROYED) {
          _server.destroy();
          return cb(err, r);
        }

        // Calculate latency
        var latencyMS = new Date().getTime() - start;

        // Set the last updatedTime
        var hrTime = process.hrtime();
        // Calculate the last update time
        _server.lastUpdateTime = hrTime[0] * 1000 + Math.round(hrTime[1]/1000);

        // We had an error, remove it from the state
        if(err) {
          // Emit the server heartbeat failure
          emitSDAMEvent(self, 'serverHearbeatFailed', { durationMS: latencyMS, failure: err, connectionId: _server.name });
        } else {
          // Update the server ismaster
          _server.ismaster = r.result;

          // Check if we have a lastWriteDate convert it to MS
          // and store on the server instance for later use
          if(_server.ismaster.lastWrite && _server.ismaster.lastWrite.lastWriteDate) {
            _server.lastWriteDate = _server.ismaster.lastWrite.lastWriteDate.getTime();
          }

          // Do we have a brand new server
          if(_server.lastIsMasterMS == -1) {
            _server.lastIsMasterMS = latencyMS;
          } else if(_server.lastIsMasterMS) {
            // After the first measurement, average RTT MUST be computed using an
            // exponentially-weighted moving average formula, with a weighting factor (alpha) of 0.2.
            // If the prior average is denoted old_rtt, then the new average (new_rtt) is
            // computed from a new RTT measurement (x) using the following formula:
            // alpha = 0.2
            // new_rtt = alpha * x + (1 - alpha) * old_rtt
            _server.lastIsMasterMS = 0.2 * latencyMS + (1 - 0.2) * _server.lastIsMasterMS;
          }

          if(_self.s.replicaSetState.update(_server)) {
            // Primary lastIsMaster store it
            if(_server.lastIsMaster() && _server.lastIsMaster().ismaster) {
              self.ismaster = _server.lastIsMaster();
            }
          };

          // Server heart beat event
          emitSDAMEvent(self, 'serverHeartbeatSucceeded', { durationMS: latencyMS, reply: r.result, connectionId: _server.name });
        }

        // Calculate the stalness for this server
        self.s.replicaSetState.updateServerMaxStaleness(_server, self.s.haInterval);

        // Callback
        cb(err, r);
      });
    }

    // Connect any missing servers
    function connectMissingServers() {
      if(self.state == DESTROYED) return;

      // console.log("=========== connectMissingServers()")
      // console.dir(self.s.replicaSetState.unknownServers)
      // Attempt to connect to any unknown servers
      connectNewServers(self, self.s.replicaSetState.unknownServers, function(err, cb) {
        if(self.state == DESTROYED) return;
        // Check if we have an options.haInterval (meaning it was triggered from connect)
        // console.log("================================ options.haInterval = " + options.haInterval)
        // console.dir(options)
        if(options.haInterval) {
          // Do we have a primary and secondary
          if(self.state == CONNECTING
            && self.s.replicaSetState.hasPrimaryAndSecondary()) {
            // Transition to connected
            stateTransition(self, CONNECTED);
            // Update initial state
            self.initialConnectState.connect = true;
            self.initialConnectState.fullsetup = true;
            self.initialConnectState.all = true;
            // Emit fullsetup and all events
            process.nextTick(function() {
              self.emit('connect', self);
              self.emit('fullsetup', self);
              self.emit('all', self);
            });
          } else if(self.state == CONNECTING
            && self.s.replicaSetState.hasPrimary()) {
              // Transition to connected
              stateTransition(self, CONNECTED);
              // Update initial state
              self.initialConnectState.connect = true;
              // Emit connected sign
              process.nextTick(function() {
                self.emit('connect', self);
              });
          } else if(self.state == CONNECTING
            && self.s.replicaSetState.hasSecondary()
            && self.s.options.secondaryOnlyConnectionAllowed) {
              // Transition to connected
              stateTransition(self, CONNECTED);
              // Update initial state
              self.initialConnectState.connect = true;
              // Emit connected sign
              process.nextTick(function() {
                self.emit('connect', self);
              });
          } else if(self.state == CONNECTING) {
            self.emit('error', new MongoError('no primary found in replicaset'));
            // Destroy the topology
            return self.destroy();
          } else if(self.state == CONNECTED
            && self.s.replicaSetState.hasPrimaryAndSecondary()
            && !self.initialConnectState.fullsetup) {
              self.initialConnectState.fullsetup = true;
            // Emit fullsetup and all events
            process.nextTick(function() {
              self.emit('fullsetup', self);
              self.emit('all', self);
            });
          }
        }

        if(!options.haInterval) topologyMonitor(self);
      });
    }

    // No connectingServers but unknown servers
    if(connectingServers.length == 0
      && self.s.replicaSetState.unknownServers.length > 0 && options.haInterval) {
        return connectMissingServers();
    } else if(connectingServers.length == 0 && options.haInterval) {
      // console.log("===================== current state")
      // console.log(`primary = ${self.s.replicaSetState.primary != null}`)
      // console.log(`secondaries = ${self.s.replicaSetState.secondaries.length}`)
      // console.log(`arbiters = ${self.s.replicaSetState.arbiters.length}`)
      self.destroy();
      return self.emit('error', new MongoError('no valid replicaset members found'));
    }

    // Ping all servers
    for(var i = 0; i < connectingServers.length; i++) {
      pingServer(self, connectingServers[i], function(err, r) {
        count = count - 1;

        if(count == 0) {
          connectMissingServers();
        }
      });
    }
  }, options.haInterval || self.s.haInterval)
}

function handleEvent(self, event) {
  return function(err) {
    // console.log(`handleEvent() [${event}]-[${this.name}]`)
    if(self.state == DESTROYED) return;
    // Debug log
    if(self.s.logger.isDebug()) {
      self.s.logger.debug(f('handleEvent %s from server %s in replset with id %s', event, this.name, self.id));
    }

    self.s.replicaSetState.remove(this);
  }
}

function handleInitialConnectEvent(self, event) {
  return function(err) {
    // console.log(`handleInitialConnectEvent [${event}]-[${this.name}]`)
    // if(err) console.dir(err)
    // Debug log
    if(self.s.logger.isDebug()) {
      self.s.logger.debug(f('handleInitialConnectEvent %s from server %s in replset with id %s', event, this.name, self.id));
    }

    // Destroy the instance
    if(self.state == DESTROYED) {
      return this.destroy();
    }

    // Check the type of server
    if(event == 'connect') {
      // Update the state
      var result = self.s.replicaSetState.update(this);
      if(result == true) {
        // Primary lastIsMaster store it
        if(this.lastIsMaster() && this.lastIsMaster().ismaster) {
          self.ismaster = this.lastIsMaster();
        }

        // Debug log
        if(self.s.logger.isDebug()) {
          self.s.logger.debug(f('handleInitialConnectEvent %s from server %s in replset with id %s has state [%s]', event, this.name, self.id, JSON.stringify(self.s.replicaSetState.set)));
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
      } else if(result instanceof MongoError) {
        this.destroy();
        self.destroy();
        return self.emit('error', result);
      } else {
        this.destroy();
      }
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

    // Trigger topologyMonitor
    if(self.s.connectingServers.length == 0) {
      topologyMonitor(self, {haInterval: 1});
    }
  };
}

function connectServers(self, servers) {
  // Update connectingServers
  self.s.connectingServers = self.s.connectingServers.concat(servers);

  // Index used to interleaf the server connects, avoiding
  // runtime issues on io constrained vm's
  var timeoutInterval = 0;

  function connect(server, timeoutInterval) {
    setTimeout(function() {
      // Add the server to the state
      if(self.s.replicaSetState.update(server)) {
        // Primary lastIsMaster store it
        if(server.lastIsMaster() && server.lastIsMaster().ismaster) {
          self.ismaster = server.lastIsMaster();
        }
      }

      // Add event handlers
      server.once('close', handleInitialConnectEvent(self, 'close'));
      server.once('timeout', handleInitialConnectEvent(self, 'timeout'));
      server.once('parseError', handleInitialConnectEvent(self, 'parseError'));
      server.once('error', handleInitialConnectEvent(self, 'error'));
      server.once('connect', handleInitialConnectEvent(self, 'connect'));
      // SDAM Monitoring events
      server.on('serverOpening', function(e) { self.emit('serverOpening', e); });
      server.on('serverDescriptionChanged', function(e) { self.emit('serverDescriptionChanged', e); });
      server.on('serverClosed', function(e) { self.emit('serverClosed', e); });
      // Start connection
      server.connect(self.s.connectOptions);
    }, timeoutInterval);
  }

  // Start all the servers
  while(servers.length > 0) {
    connect(servers.shift(), timeoutInterval++);
  }
}

/**
 * Emit event if it exists
 * @method
 */
function emitSDAMEvent(self, event, description) {
  if(self.listeners(event).length > 0) {
    self.emit(event, description);
  }
}

/**
 * Initiate server connect
 * @method
 * @param {array} [options.auth=null] Array of auth options to apply on connect
 */
ReplSet.prototype.connect = function(options) {
  var self = this;
  // Add any connect level options to the internal state
  this.s.connectOptions = options || {};
  // Set connecting state
  stateTransition(this, CONNECTING);
  // Create server instances
  var servers = this.s.seedlist.map(function(x) {
    return new Server(assign({}, self.s.options, x, {
      authProviders: self.authProviders, reconnect:false, monitoring:false, inTopology: true
    }, {
      clientInfo: clone(self.s.clientInfo)
    }));
  });

  // Emit the topology opening event
  emitSDAMEvent(this, 'topologyOpening', { topologyId: this.id });

  // Start all server connections
  connectServers(self, servers);
}

/**
 * Destroy the server connection
 * @method
 */
ReplSet.prototype.destroy = function() {
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

  // Emit toplogy closing event
  emitSDAMEvent(this, 'topologyClosed', { topologyId: this.id });
}

/**
 * Unref all connections belong to this server
 * @method
 */
ReplSet.prototype.unref = function() {
  // Transition state
  stateTransition(this, DISCONNECTED);

  this.s.replicaSetState.allServers().forEach(function(x) {
    x.unref();
  });

  clearTimeout(this.haTimeoutId);
}

/**
 * Returns the last known ismaster document for this server
 * @method
 * @return {object}
 */
ReplSet.prototype.lastIsMaster = function() {
  return this.s.replicaSetState.primary
    ? this.s.replicaSetState.primary.lastIsMaster() : this.ismaster;
}

/**
 * All raw connections
 * @method
 * @return {Connection[]}
 */
ReplSet.prototype.connections = function() {
  var servers = this.s.replicaSetState.allServers();
  var connections = [];
  for(var i = 0; i < servers.length; i++) {
    connections = connections.concat(servers[i].connections());
  }

  return connections;
}

/**
 * Figure out if the server is connected
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {boolean}
 */
ReplSet.prototype.isConnected = function(options) {
  options = options || {};

  // If we are authenticating signal not connected
  // To avoid interleaving of operations
  if(this.authenticating) return false;

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

/**
 * Figure out if the replicaset instance was destroyed by calling destroy
 * @method
 * @return {boolean}
 */
ReplSet.prototype.isDestroyed = function() {
  return this.state == DESTROYED;
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

  // Pick the right server baspickServerd on readPreference
  var server = this.s.replicaSetState.pickServer(options.readPreference);
  if(this.s.debug) this.emit('pickedServer', options.readPreference, server);
  return server;
}

/**
 * Get all connected servers
 * @method
 * @return {Server[]}
 */
ReplSet.prototype.getServers = function() {
  return this.s.replicaSetState.allServers();
}

function basicReadPreferenceValidation(self, options) {
  if(options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    throw new Error("readPreference must be an instance of ReadPreference");
  }
}

//
// Execute write operation
var executeWriteOperation = function(self, op, ns, ops, options, callback) {
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  // Ensure we have no options
  options = options || {};

  // No server returned we had an error
  if(self.s.replicaSetState.primary == null) {
    return callback(new MongoError("no primary server found"));
  }

  // Execute the command
  self.s.replicaSetState.primary[op](ns, ops, options, callback);
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
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));

  // Not connected but we have a disconnecthandler
  if(!this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  // Execute write operation
  executeWriteOperation(this, 'insert', ns, ops, options, callback);
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
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));

  // Not connected but we have a disconnecthandler
  if(!this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('update', ns, ops, options, callback);
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
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));

  // Not connected but we have a disconnecthandler
  if(!this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('remove', ns, ops, options, callback);
  }

  // Execute write operation
  executeWriteOperation(this, 'remove', ns, ops, options, callback);
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
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  if(this.state == DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  var self = this;

  // Establish readPreference
  var readPreference = options.readPreference ? options.readPreference : ReadPreference.primary;

  // If the readPreference is primary and we have no primary, store it
  if(readPreference.preference == 'primary' && !this.s.replicaSetState.hasPrimary() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  } else if(readPreference.preference != 'primary' && !this.s.replicaSetState.hasSecondary() && this.s.disconnectHandler != null) {
    // Otherwise secondary is allowed
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  // Pick a server
  var server = this.s.replicaSetState.pickServer(readPreference);
  // We received an error, return it
  if(!(server instanceof Server)) return callback(server);
  // Emit debug event
  if(self.s.debug) self.emit('pickedServer', ReadPreference.primary, server);

  // No server returned we had an error
  if(server == null) {
    return callback(new MongoError(f("no server found that matches the provided readPreference %s", readPreference)));
  }

  // Execute the command
  server.command(ns, cmd, options, callback);
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
  if(this.authProviders[mechanism] == null && mechanism != 'default') {
    return callback(new MongoError(f("auth provider %s does not exist", mechanism)));
  }

  // Are we already authenticating, throw
  if(this.authenticating) {
    return callback(new MongoError('authentication or logout allready in process'));
  }

  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.s.replicaSetState.hasPrimary() && self.s.disconnectHandler != null) {
    return self.s.disconnectHandler.add('auth', db, allArgs, {}, callback);
  }

  // Set to authenticating
  this.authenticating = true;
  // All errors
  var errors = [];

  // Get all the servers
  var servers = this.s.replicaSetState.allServers();
  // No servers return
  if(servers.length == 0) {
    this.authenticating = false;
    callback(null, true);
  }

  // Authenticate
  function auth(server) {
    // Arguments without a callback
    var argsWithoutCallback = [mechanism, db].concat(args.slice(0));
    // Create arguments
    var finalArguments = argsWithoutCallback.concat([function(err, r) {
      count = count - 1;
      // Save all the errors
      if(err) errors.push({name: server.name, err: err});
      // We are done
      if(count == 0) {
        // Auth is done
        self.authenticating = false;

        // Return the auth error
        if(errors.length) return callback(MongoError.create({
          message: 'authentication fail', errors: errors
        }), false);

        // Successfully authenticated session
        callback(null, self);
      }
    }]);

    if(!server.lastIsMaster().arbiterOnly) {
      // Execute the auth only against non arbiter servers
      server.auth.apply(server, finalArguments);
    } else {
      // If we are authenticating against an arbiter just ignore it
      finalArguments.pop()(null);
    }
  }

  // Get total count
  var count = servers.length;
  // Authenticate against all servers
  while(servers.length > 0) {
    auth(servers.shift());
  }
}

/**
 * Logout from a database
 * @method
 * @param {string} db The db we are logging out from
 * @param {authResultCallback} callback A callback function
 */
ReplSet.prototype.logout = function(dbName, callback) {
  var self = this;
  // Are we authenticating or logging out, throw
  if(this.authenticating) {
    throw new MongoError('authentication or logout allready in process');
  }

  // Ensure no new members are processed while logging out
  this.authenticating = true;

  // Remove from all auth providers (avoid any reaplication of the auth details)
  var providers = Object.keys(this.authProviders);
  for(var i = 0; i < providers.length; i++) {
    this.authProviders[providers[i]].logout(dbName);
  }

  // Now logout all the servers
  var servers = this.s.replicaSetState.allServers();
  var count = servers.length;
  if(count == 0) return callback();
  var errors = [];

  // Execute logout on all server instances
  for(var i = 0; i < servers.length; i++) {
    servers[i].logout(dbName, function(err) {
      count = count - 1;
      if(err) errors.push({name: server.name, err: err});

      if(count == 0) {
        // Do not block new operations
        self.authenticating = false;
        // If we have one or more errors
        if(errors.length) return callback(MongoError.create({
          message: f('logout failed against db %s', dbName), errors: errors
        }), false);

        // No errors
        callback();
      }
    });
  }
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

/**
 * A replset connect event, used to verify that the connection is up and running
 *
 * @event ReplSet#connect
 * @type {ReplSet}
 */

/**
 * A replset reconnect event, used to verify that the topology reconnected
 *
 * @event ReplSet#reconnect
 * @type {ReplSet}
 */

/**
 * A replset fullsetup event, used to signal that all topology members have been contacted.
 *
 * @event ReplSet#fullsetup
 * @type {ReplSet}
 */

/**
 * A replset all event, used to signal that all topology members have been contacted.
 *
 * @event ReplSet#all
 * @type {ReplSet}
 */

/**
 * A replset failed event, used to signal that initial replset connection failed.
 *
 * @event ReplSet#failed
 * @type {ReplSet}
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

/**
 * A server opening SDAM monitoring event
 *
 * @event ReplSet#serverOpening
 * @type {object}
 */

/**
 * A server closed SDAM monitoring event
 *
 * @event ReplSet#serverClosed
 * @type {object}
 */

/**
 * A server description SDAM change monitoring event
 *
 * @event ReplSet#serverDescriptionChanged
 * @type {object}
 */

/**
 * A topology open SDAM event
 *
 * @event ReplSet#topologyOpening
 * @type {object}
 */

/**
 * A topology closed SDAM event
 *
 * @event ReplSet#topologyClosed
 * @type {object}
 */

/**
 * A topology structure SDAM change event
 *
 * @event ReplSet#topologyDescriptionChanged
 * @type {object}
 */

/**
 * A topology serverHeartbeatStarted SDAM event
 *
 * @event ReplSet#serverHeartbeatStarted
 * @type {object}
 */

/**
 * A topology serverHearbeatFailed SDAM event
 *
 * @event ReplSet#serverHearbeatFailed
 * @type {object}
 */

/**
 * A topology serverHeartbeatSucceeded SDAM change event
 *
 * @event ReplSet#serverHeartbeatSucceeded
 * @type {object}
 */

module.exports = ReplSet;
