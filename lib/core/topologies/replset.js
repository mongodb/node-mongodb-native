'use strict';

const inherits = require('util').inherits;
const f = require('util').format;
const EventEmitter = require('events').EventEmitter;
const ReadPreference = require('./read_preference');
const CoreCursor = require('../cursor').CoreCursor;
const retrieveBSON = require('../connection/utils').retrieveBSON;
const Logger = require('../connection/logger');
const MongoError = require('../error').MongoError;
const Server = require('./server');
const ReplSetState = require('./replset_state');
const Timeout = require('./shared').Timeout;
const Interval = require('./shared').Interval;
const SessionMixins = require('./shared').SessionMixins;
const isRetryableWritesSupported = require('./shared').isRetryableWritesSupported;
const relayEvents = require('../utils').relayEvents;
const BSON = retrieveBSON();
const getMMAPError = require('./shared').getMMAPError;
const makeClientMetadata = require('../utils').makeClientMetadata;
const legacyIsRetryableWriteError = require('./shared').legacyIsRetryableWriteError;
const now = require('../../utils').now;
const calculateDurationInMs = require('../../utils').calculateDurationInMs;

//
// States
var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var UNREFERENCED = 'unreferenced';
var DESTROYED = 'destroyed';

function stateTransition(self, newState) {
  var legalTransitions = {
    disconnected: [CONNECTING, DESTROYED, DISCONNECTED],
    connecting: [CONNECTING, DESTROYED, CONNECTED, DISCONNECTED],
    connected: [CONNECTED, DISCONNECTED, DESTROYED, UNREFERENCED],
    unreferenced: [UNREFERENCED, DESTROYED],
    destroyed: [DESTROYED]
  };

  // Get current state
  var legalStates = legalTransitions[self.state];
  if (legalStates && legalStates.indexOf(newState) !== -1) {
    self.state = newState;
  } else {
    self.s.logger.error(
      f(
        'Pool with id [%s] failed attempted illegal state transition from [%s] to [%s] only following state allowed [%s]',
        self.id,
        self.state,
        newState,
        legalStates
      )
    );
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
 * @param {number} [options.keepAliveInitialDelay=120000] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=10000] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.crl] SSL Certificate revocation store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passphrase] SSL Certificate pass phrase
 * @param {string} [options.servername=null] String containing the server name requested via TLS SNI.
 * @param {boolean} [options.rejectUnauthorized=true] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {boolean} [options.bsonRegExp=false] By default, regex returned from MDB will be native to the language. Setting to true will ensure that a BSON.BSONRegExp object is returned.
 * @param {number} [options.pingInterval=5000] Ping interval to check the response time to the different servers
 * @param {number} [options.localThresholdMS=15] Cutoff latency point in MS for Replicaset member selection
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @param {boolean} [options.monitorCommands=false] Enable command monitoring for this topology
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
 * @property {string} type the topology type.
 * @property {string} parserType the parser type used (c++ or js).
 */
var ReplSet = function(seedlist, options) {
  var self = this;
  options = options || {};

  // Validate seedlist
  if (!Array.isArray(seedlist)) throw new MongoError('seedlist must be an array');
  // Validate list
  if (seedlist.length === 0) throw new MongoError('seedlist must contain at least one entry');
  // Validate entries
  seedlist.forEach(function(e) {
    if (typeof e.host !== 'string' || typeof e.port !== 'number')
      throw new MongoError('seedlist entry must contain a host and port');
  });

  // Add event listener
  EventEmitter.call(this);

  // Get replSet Id
  this.id = id++;

  // Get the localThresholdMS
  var localThresholdMS = options.localThresholdMS || 15;
  // Backward compatibility
  if (options.acceptableLatency) localThresholdMS = options.acceptableLatency;

  // Create a logger
  var logger = Logger('ReplSet', options);

  // Internal state
  this.s = {
    options: Object.assign({ metadata: makeClientMetadata(options) }, options),
    // BSON instance
    bson:
      options.bson ||
      new BSON([
        BSON.Binary,
        BSON.Code,
        BSON.DBRef,
        BSON.Decimal128,
        BSON.Double,
        BSON.Int32,
        BSON.Long,
        BSON.Map,
        BSON.MaxKey,
        BSON.MinKey,
        BSON.ObjectId,
        BSON.BSONRegExp,
        BSON.Symbol,
        BSON.Timestamp
      ]),
    // Factory overrides
    Cursor: options.cursorFactory || CoreCursor,
    // Logger instance
    logger: logger,
    // Seedlist
    seedlist: seedlist,
    // Replicaset state
    replicaSetState: new ReplSetState({
      id: this.id,
      setName: options.setName,
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
    debug: typeof options.debug === 'boolean' ? options.debug : false
  };

  // Add handler for topology change
  this.s.replicaSetState.on('topologyDescriptionChanged', function(r) {
    self.emit('topologyDescriptionChanged', r);
  });

  // Log info warning if the socketTimeout < haInterval as it will cause
  // a lot of recycled connections to happen.
  if (
    this.s.logger.isWarn() &&
    this.s.options.socketTimeout !== 0 &&
    this.s.options.socketTimeout < this.s.haInterval
  ) {
    this.s.logger.warn(
      f(
        'warning socketTimeout %s is less than haInterval %s. This might cause unnecessary server reconnections due to socket timeouts',
        this.s.options.socketTimeout,
        this.s.haInterval
      )
    );
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
    connect: false,
    fullsetup: false,
    all: false
  };

  // Disconnected state
  this.state = DISCONNECTED;
  this.haTimeoutId = null;
  // Last ismaster
  this.ismaster = null;
  // Contains the intervalId
  this.intervalIds = [];

  // Highest clusterTime seen in responses from the current deployment
  this.clusterTime = null;
};

inherits(ReplSet, EventEmitter);
Object.assign(ReplSet.prototype, SessionMixins);

Object.defineProperty(ReplSet.prototype, 'type', {
  enumerable: true,
  get: function() {
    return 'replset';
  }
});

Object.defineProperty(ReplSet.prototype, 'parserType', {
  enumerable: true,
  get: function() {
    return BSON.native ? 'c++' : 'js';
  }
});

Object.defineProperty(ReplSet.prototype, 'logicalSessionTimeoutMinutes', {
  enumerable: true,
  get: function() {
    return this.s.replicaSetState.logicalSessionTimeoutMinutes || null;
  }
});

function rexecuteOperations(self) {
  // If we have a primary and a disconnect handler, execute
  // buffered operations
  if (self.s.replicaSetState.hasPrimaryAndSecondary() && self.s.disconnectHandler) {
    self.s.disconnectHandler.execute();
  } else if (self.s.replicaSetState.hasPrimary() && self.s.disconnectHandler) {
    self.s.disconnectHandler.execute({ executePrimary: true });
  } else if (self.s.replicaSetState.hasSecondary() && self.s.disconnectHandler) {
    self.s.disconnectHandler.execute({ executeSecondary: true });
  }
}

function connectNewServers(self, servers, callback) {
  // No new servers
  if (servers.length === 0) {
    return callback();
  }

  // Count lefts
  var count = servers.length;
  var error = null;

  function done() {
    count = count - 1;
    if (count === 0) {
      callback(error);
    }
  }

  // Handle events
  var _handleEvent = function(self, event) {
    return function(err) {
      var _self = this;

      // Destroyed
      if (self.state === DESTROYED || self.state === UNREFERENCED) {
        this.destroy({ force: true });
        return done();
      }

      if (event === 'connect') {
        // Update the state
        var result = self.s.replicaSetState.update(_self);
        // Update the state with the new server
        if (result) {
          // Primary lastIsMaster store it
          if (_self.lastIsMaster() && _self.lastIsMaster().ismaster) {
            self.ismaster = _self.lastIsMaster();
          }

          // Remove the handlers
          for (let i = 0; i < handlers.length; i++) {
            _self.removeAllListeners(handlers[i]);
          }

          // Add stable state handlers
          _self.on('error', handleEvent(self, 'error'));
          _self.on('close', handleEvent(self, 'close'));
          _self.on('timeout', handleEvent(self, 'timeout'));
          _self.on('parseError', handleEvent(self, 'parseError'));

          // Enalbe the monitoring of the new server
          monitorServer(_self.lastIsMaster().me, self, {});

          // Rexecute any stalled operation
          rexecuteOperations(self);
        } else {
          _self.destroy({ force: true });
        }
      } else if (event === 'error') {
        error = err;
      }

      // Rexecute any stalled operation
      rexecuteOperations(self);
      done();
    };
  };

  // Execute method
  function execute(_server, i) {
    setTimeout(function() {
      // Destroyed
      if (self.state === DESTROYED || self.state === UNREFERENCED) {
        return;
      }

      // remove existing connecting server if it's failed to connect, otherwise
      // wait for that server to connect
      const existingServerIdx = self.s.connectingServers.findIndex(s => s.name === _server);
      if (existingServerIdx >= 0) {
        const connectingServer = self.s.connectingServers[existingServerIdx];
        connectingServer.destroy({ force: true });

        self.s.connectingServers.splice(existingServerIdx, 1);
        return done();
      }

      // Create a new server instance
      var server = new Server(
        Object.assign({}, self.s.options, {
          host: _server.split(':')[0],
          port: parseInt(_server.split(':')[1], 10),
          reconnect: false,
          monitoring: false,
          parent: self
        })
      );

      // Add temp handlers
      server.once('connect', _handleEvent(self, 'connect'));
      server.once('close', _handleEvent(self, 'close'));
      server.once('timeout', _handleEvent(self, 'timeout'));
      server.once('error', _handleEvent(self, 'error'));
      server.once('parseError', _handleEvent(self, 'parseError'));

      // SDAM Monitoring events
      server.on('serverOpening', e => self.emit('serverOpening', e));
      server.on('serverDescriptionChanged', e => self.emit('serverDescriptionChanged', e));
      server.on('serverClosed', e => self.emit('serverClosed', e));

      // Command Monitoring events
      relayEvents(server, self, ['commandStarted', 'commandSucceeded', 'commandFailed']);

      self.s.connectingServers.push(server);
      server.connect(self.s.connectOptions);
    }, i);
  }

  // Create new instances
  for (var i = 0; i < servers.length; i++) {
    execute(servers[i], i);
  }
}

// Ping the server
var pingServer = function(self, server, cb) {
  // Measure running time
  var start = new Date().getTime();

  // Emit the server heartbeat start
  emitSDAMEvent(self, 'serverHeartbeatStarted', { connectionId: server.name });

  // Execute ismaster
  // Set the socketTimeout for a monitoring message to a low number
  // Ensuring ismaster calls are timed out quickly
  server.command(
    'admin.$cmd',
    {
      ismaster: true
    },
    {
      monitoring: true,
      socketTimeout: self.s.options.connectionTimeout || 2000
    },
    function(err, r) {
      if (self.state === DESTROYED || self.state === UNREFERENCED) {
        server.destroy({ force: true });
        return cb(err, r);
      }

      // Calculate latency
      var latencyMS = new Date().getTime() - start;

      // Set the last updatedTime
      server.lastUpdateTime = now();

      // We had an error, remove it from the state
      if (err) {
        // Emit the server heartbeat failure
        emitSDAMEvent(self, 'serverHeartbeatFailed', {
          durationMS: latencyMS,
          failure: err,
          connectionId: server.name
        });

        // Remove server from the state
        self.s.replicaSetState.remove(server);
      } else {
        // Update the server ismaster
        server.ismaster = r.result;

        // Check if we have a lastWriteDate convert it to MS
        // and store on the server instance for later use
        if (server.ismaster.lastWrite && server.ismaster.lastWrite.lastWriteDate) {
          server.lastWriteDate = server.ismaster.lastWrite.lastWriteDate.getTime();
        }

        // Do we have a brand new server
        if (server.lastIsMasterMS === -1) {
          server.lastIsMasterMS = latencyMS;
        } else if (server.lastIsMasterMS) {
          // After the first measurement, average RTT MUST be computed using an
          // exponentially-weighted moving average formula, with a weighting factor (alpha) of 0.2.
          // If the prior average is denoted old_rtt, then the new average (new_rtt) is
          // computed from a new RTT measurement (x) using the following formula:
          // alpha = 0.2
          // new_rtt = alpha * x + (1 - alpha) * old_rtt
          server.lastIsMasterMS = 0.2 * latencyMS + (1 - 0.2) * server.lastIsMasterMS;
        }

        if (self.s.replicaSetState.update(server)) {
          // Primary lastIsMaster store it
          if (server.lastIsMaster() && server.lastIsMaster().ismaster) {
            self.ismaster = server.lastIsMaster();
          }
        }

        // Server heart beat event
        emitSDAMEvent(self, 'serverHeartbeatSucceeded', {
          durationMS: latencyMS,
          reply: r.result,
          connectionId: server.name
        });
      }

      // Calculate the staleness for this server
      self.s.replicaSetState.updateServerMaxStaleness(server, self.s.haInterval);

      // Callback
      cb(err, r);
    }
  );
};

// Each server is monitored in parallel in their own timeout loop
var monitorServer = function(host, self, options) {
  // If this is not the initial scan
  // Is this server already being monitoried, then skip monitoring
  if (!options.haInterval) {
    for (var i = 0; i < self.intervalIds.length; i++) {
      if (self.intervalIds[i].__host === host) {
        return;
      }
    }
  }

  // Get the haInterval
  var _process = options.haInterval ? Timeout : Interval;
  var _haInterval = options.haInterval ? options.haInterval : self.s.haInterval;

  // Create the interval
  var intervalId = new _process(function() {
    if (self.state === DESTROYED || self.state === UNREFERENCED) {
      // clearInterval(intervalId);
      intervalId.stop();
      return;
    }

    // Do we already have server connection available for this host
    var _server = self.s.replicaSetState.get(host);

    // Check if we have a known server connection and reuse
    if (_server) {
      // Ping the server
      return pingServer(self, _server, function(err) {
        if (err) {
          // NOTE: should something happen here?
          return;
        }

        if (self.state === DESTROYED || self.state === UNREFERENCED) {
          intervalId.stop();
          return;
        }

        // Filter out all called intervaliIds
        self.intervalIds = self.intervalIds.filter(function(intervalId) {
          return intervalId.isRunning();
        });

        // Initial sweep
        if (_process === Timeout) {
          if (
            self.state === CONNECTING &&
            ((self.s.replicaSetState.hasSecondary() &&
              self.s.options.secondaryOnlyConnectionAllowed) ||
              self.s.replicaSetState.hasPrimary())
          ) {
            stateTransition(self, CONNECTED);

            // Emit connected sign
            process.nextTick(function() {
              self.emit('connect', self);
            });

            // Start topology interval check
            topologyMonitor(self, {});
          }
        } else {
          if (
            self.state === DISCONNECTED &&
            ((self.s.replicaSetState.hasSecondary() &&
              self.s.options.secondaryOnlyConnectionAllowed) ||
              self.s.replicaSetState.hasPrimary())
          ) {
            stateTransition(self, CONNECTING);

            // Rexecute any stalled operation
            rexecuteOperations(self);

            // Emit connected sign
            process.nextTick(function() {
              self.emit('reconnect', self);
            });
          }
        }

        if (
          self.initialConnectState.connect &&
          !self.initialConnectState.fullsetup &&
          self.s.replicaSetState.hasPrimaryAndSecondary()
        ) {
          // Set initial connect state
          self.initialConnectState.fullsetup = true;
          self.initialConnectState.all = true;

          process.nextTick(function() {
            self.emit('fullsetup', self);
            self.emit('all', self);
          });
        }
      });
    }
  }, _haInterval);

  // Start the interval
  intervalId.start();
  // Add the intervalId host name
  intervalId.__host = host;
  // Add the intervalId to our list of intervalIds
  self.intervalIds.push(intervalId);
};

function topologyMonitor(self, options) {
  if (self.state === DESTROYED || self.state === UNREFERENCED) return;
  options = options || {};

  // Get the servers
  var servers = Object.keys(self.s.replicaSetState.set);

  // Get the haInterval
  var _process = options.haInterval ? Timeout : Interval;
  var _haInterval = options.haInterval ? options.haInterval : self.s.haInterval;

  if (_process === Timeout) {
    return connectNewServers(self, self.s.replicaSetState.unknownServers, function(err) {
      // Don't emit errors if the connection was already
      if (self.state === DESTROYED || self.state === UNREFERENCED) {
        return;
      }

      if (!self.s.replicaSetState.hasPrimary() && !self.s.options.secondaryOnlyConnectionAllowed) {
        if (err) {
          return self.emit('error', err);
        }

        self.emit(
          'error',
          new MongoError('no primary found in replicaset or invalid replica set name')
        );
        return self.destroy({ force: true });
      } else if (
        !self.s.replicaSetState.hasSecondary() &&
        self.s.options.secondaryOnlyConnectionAllowed
      ) {
        if (err) {
          return self.emit('error', err);
        }

        self.emit(
          'error',
          new MongoError('no secondary found in replicaset or invalid replica set name')
        );
        return self.destroy({ force: true });
      }

      for (var i = 0; i < servers.length; i++) {
        monitorServer(servers[i], self, options);
      }
    });
  } else {
    for (var i = 0; i < servers.length; i++) {
      monitorServer(servers[i], self, options);
    }
  }

  // Run the reconnect process
  function executeReconnect(self) {
    return function() {
      if (self.state === DESTROYED || self.state === UNREFERENCED) {
        return;
      }

      connectNewServers(self, self.s.replicaSetState.unknownServers, function() {
        var monitoringFrequencey = self.s.replicaSetState.hasPrimary()
          ? _haInterval
          : self.s.minHeartbeatFrequencyMS;

        // Create a timeout
        self.intervalIds.push(new Timeout(executeReconnect(self), monitoringFrequencey).start());
      });
    };
  }

  // Decide what kind of interval to use
  var intervalTime = !self.s.replicaSetState.hasPrimary()
    ? self.s.minHeartbeatFrequencyMS
    : _haInterval;

  self.intervalIds.push(new Timeout(executeReconnect(self), intervalTime).start());
}

function addServerToList(list, server) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].name.toLowerCase() === server.name.toLowerCase()) return true;
  }

  list.push(server);
}

function handleEvent(self, event) {
  return function() {
    if (self.state === DESTROYED || self.state === UNREFERENCED) return;
    // Debug log
    if (self.s.logger.isDebug()) {
      self.s.logger.debug(
        f('handleEvent %s from server %s in replset with id %s', event, this.name, self.id)
      );
    }

    // Remove from the replicaset state
    self.s.replicaSetState.remove(this);

    // Are we in a destroyed state return
    if (self.state === DESTROYED || self.state === UNREFERENCED) return;

    // If no primary and secondary available
    if (
      !self.s.replicaSetState.hasPrimary() &&
      !self.s.replicaSetState.hasSecondary() &&
      self.s.options.secondaryOnlyConnectionAllowed
    ) {
      stateTransition(self, DISCONNECTED);
    } else if (!self.s.replicaSetState.hasPrimary()) {
      stateTransition(self, DISCONNECTED);
    }

    addServerToList(self.s.connectingServers, this);
  };
}

function shouldTriggerConnect(self) {
  const isConnecting = self.state === CONNECTING;
  const hasPrimary = self.s.replicaSetState.hasPrimary();
  const hasSecondary = self.s.replicaSetState.hasSecondary();
  const secondaryOnlyConnectionAllowed = self.s.options.secondaryOnlyConnectionAllowed;
  const readPreferenceSecondary =
    self.s.connectOptions.readPreference &&
    self.s.connectOptions.readPreference.equals(ReadPreference.secondary);

  return (
    (isConnecting &&
      ((readPreferenceSecondary && hasSecondary) || (!readPreferenceSecondary && hasPrimary))) ||
    (hasSecondary && secondaryOnlyConnectionAllowed)
  );
}

function handleInitialConnectEvent(self, event) {
  return function() {
    var _this = this;
    // Debug log
    if (self.s.logger.isDebug()) {
      self.s.logger.debug(
        f(
          'handleInitialConnectEvent %s from server %s in replset with id %s',
          event,
          this.name,
          self.id
        )
      );
    }

    // Destroy the instance
    if (self.state === DESTROYED || self.state === UNREFERENCED) {
      return this.destroy({ force: true });
    }

    // Check the type of server
    if (event === 'connect') {
      // Update the state
      var result = self.s.replicaSetState.update(_this);
      if (result === true) {
        // Primary lastIsMaster store it
        if (_this.lastIsMaster() && _this.lastIsMaster().ismaster) {
          self.ismaster = _this.lastIsMaster();
        }

        // Debug log
        if (self.s.logger.isDebug()) {
          self.s.logger.debug(
            f(
              'handleInitialConnectEvent %s from server %s in replset with id %s has state [%s]',
              event,
              _this.name,
              self.id,
              JSON.stringify(self.s.replicaSetState.set)
            )
          );
        }

        // Remove the handlers
        for (let i = 0; i < handlers.length; i++) {
          _this.removeAllListeners(handlers[i]);
        }

        // Add stable state handlers
        _this.on('error', handleEvent(self, 'error'));
        _this.on('close', handleEvent(self, 'close'));
        _this.on('timeout', handleEvent(self, 'timeout'));
        _this.on('parseError', handleEvent(self, 'parseError'));

        // Do we have a primary or primaryAndSecondary
        if (shouldTriggerConnect(self)) {
          // We are connected
          stateTransition(self, CONNECTED);

          // Set initial connect state
          self.initialConnectState.connect = true;
          // Emit connect event
          process.nextTick(function() {
            self.emit('connect', self);
          });

          topologyMonitor(self, {});
        }
      } else if (result instanceof MongoError) {
        _this.destroy({ force: true });
        self.destroy({ force: true });
        return self.emit('error', result);
      } else {
        _this.destroy({ force: true });
      }
    } else {
      // Emit failure to connect
      self.emit('failed', this);

      addServerToList(self.s.connectingServers, this);
      // Remove from the state
      self.s.replicaSetState.remove(this);
    }

    if (
      self.initialConnectState.connect &&
      !self.initialConnectState.fullsetup &&
      self.s.replicaSetState.hasPrimaryAndSecondary()
    ) {
      // Set initial connect state
      self.initialConnectState.fullsetup = true;
      self.initialConnectState.all = true;

      process.nextTick(function() {
        self.emit('fullsetup', self);
        self.emit('all', self);
      });
    }

    // Remove from the list from connectingServers
    for (var i = 0; i < self.s.connectingServers.length; i++) {
      if (self.s.connectingServers[i].equals(this)) {
        self.s.connectingServers.splice(i, 1);
      }
    }

    // Trigger topologyMonitor
    if (self.s.connectingServers.length === 0 && self.state === CONNECTING) {
      topologyMonitor(self, { haInterval: 1 });
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
      if (self.s.replicaSetState.update(server)) {
        // Primary lastIsMaster store it
        if (server.lastIsMaster() && server.lastIsMaster().ismaster) {
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
      server.on('serverOpening', e => self.emit('serverOpening', e));
      server.on('serverDescriptionChanged', e => self.emit('serverDescriptionChanged', e));
      server.on('serverClosed', e => self.emit('serverClosed', e));

      // Command Monitoring events
      relayEvents(server, self, ['commandStarted', 'commandSucceeded', 'commandFailed']);

      // Start connection
      server.connect(self.s.connectOptions);
    }, timeoutInterval);
  }

  // Start all the servers
  while (servers.length > 0) {
    connect(servers.shift(), timeoutInterval++);
  }
}

/**
 * Emit event if it exists
 * @method
 */
function emitSDAMEvent(self, event, description) {
  if (self.listeners(event).length > 0) {
    self.emit(event, description);
  }
}

/**
 * Initiate server connect
 */
ReplSet.prototype.connect = function(options) {
  var self = this;
  // Add any connect level options to the internal state
  this.s.connectOptions = options || {};

  // Set connecting state
  stateTransition(this, CONNECTING);

  // Create server instances
  var servers = this.s.seedlist.map(function(x) {
    return new Server(
      Object.assign({}, self.s.options, x, options, {
        reconnect: false,
        monitoring: false,
        parent: self
      })
    );
  });

  // Error out as high availability interval must be < than socketTimeout
  if (
    this.s.options.socketTimeout > 0 &&
    this.s.options.socketTimeout <= this.s.options.haInterval
  ) {
    return self.emit(
      'error',
      new MongoError(
        f(
          'haInterval [%s] MS must be set to less than socketTimeout [%s] MS',
          this.s.options.haInterval,
          this.s.options.socketTimeout
        )
      )
    );
  }

  // Emit the topology opening event
  emitSDAMEvent(this, 'topologyOpening', { topologyId: this.id });
  // Start all server connections
  connectServers(self, servers);
};

/**
 * Authenticate the topology.
 * @method
 * @param {MongoCredentials} credentials The credentials for authentication we are using
 * @param {authResultCallback} callback A callback function
 */
ReplSet.prototype.auth = function(credentials, callback) {
  if (typeof callback === 'function') callback(null, null);
};

/**
 * Destroy the server connection
 * @param {boolean} [options.force=false] Force destroy the pool
 * @method
 */
ReplSet.prototype.destroy = function(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};

  let destroyCount = this.s.connectingServers.length + 1; // +1 for the callback from `replicaSetState.destroy`
  const serverDestroyed = () => {
    destroyCount--;
    if (destroyCount > 0) {
      return;
    }

    // Emit toplogy closing event
    emitSDAMEvent(this, 'topologyClosed', { topologyId: this.id });

    if (typeof callback === 'function') {
      callback(null, null);
    }
  };

  if (this.state === DESTROYED) {
    if (typeof callback === 'function') callback(null, null);
    return;
  }

  // Transition state
  stateTransition(this, DESTROYED);

  // Clear out any monitoring process
  if (this.haTimeoutId) clearTimeout(this.haTimeoutId);

  // Clear out all monitoring
  for (var i = 0; i < this.intervalIds.length; i++) {
    this.intervalIds[i].stop();
  }

  // Reset list of intervalIds
  this.intervalIds = [];

  if (destroyCount === 0) {
    serverDestroyed();
    return;
  }

  // Destroy the replicaset
  this.s.replicaSetState.destroy(options, serverDestroyed);

  // Destroy all connecting servers
  this.s.connectingServers.forEach(function(x) {
    x.destroy(options, serverDestroyed);
  });
};

/**
 * Unref all connections belong to this server
 * @method
 */
ReplSet.prototype.unref = function() {
  // Transition state
  stateTransition(this, UNREFERENCED);

  this.s.replicaSetState.allServers().forEach(function(x) {
    x.unref();
  });

  clearTimeout(this.haTimeoutId);
};

/**
 * Returns the last known ismaster document for this server
 * @method
 * @return {object}
 */
ReplSet.prototype.lastIsMaster = function() {
  // If secondaryOnlyConnectionAllowed and no primary but secondary
  // return the secondaries ismaster result.
  if (
    this.s.options.secondaryOnlyConnectionAllowed &&
    !this.s.replicaSetState.hasPrimary() &&
    this.s.replicaSetState.hasSecondary()
  ) {
    return this.s.replicaSetState.secondaries[0].lastIsMaster();
  }

  return this.s.replicaSetState.primary
    ? this.s.replicaSetState.primary.lastIsMaster()
    : this.ismaster;
};

/**
 * All raw connections
 * @method
 * @return {Connection[]}
 */
ReplSet.prototype.connections = function() {
  var servers = this.s.replicaSetState.allServers();
  var connections = [];
  for (var i = 0; i < servers.length; i++) {
    connections = connections.concat(servers[i].connections());
  }

  return connections;
};

/**
 * Figure out if the server is connected
 * @method
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @return {boolean}
 */
ReplSet.prototype.isConnected = function(options) {
  options = options || {};

  // If we specified a read preference check if we are connected to something
  // than can satisfy this
  if (options.readPreference && options.readPreference.equals(ReadPreference.secondary)) {
    return this.s.replicaSetState.hasSecondary();
  }

  if (options.readPreference && options.readPreference.equals(ReadPreference.primary)) {
    return this.s.replicaSetState.hasPrimary();
  }

  if (options.readPreference && options.readPreference.equals(ReadPreference.primaryPreferred)) {
    return this.s.replicaSetState.hasSecondary() || this.s.replicaSetState.hasPrimary();
  }

  if (options.readPreference && options.readPreference.equals(ReadPreference.secondaryPreferred)) {
    return this.s.replicaSetState.hasSecondary() || this.s.replicaSetState.hasPrimary();
  }

  if (this.s.options.secondaryOnlyConnectionAllowed && this.s.replicaSetState.hasSecondary()) {
    return true;
  }

  return this.s.replicaSetState.hasPrimary();
};

/**
 * Figure out if the replicaset instance was destroyed by calling destroy
 * @method
 * @return {boolean}
 */
ReplSet.prototype.isDestroyed = function() {
  return this.state === DESTROYED;
};

const SERVER_SELECTION_TIMEOUT_MS = 10000; // hardcoded `serverSelectionTimeoutMS` for legacy topology
const SERVER_SELECTION_INTERVAL_MS = 1000; // time to wait between selection attempts
/**
 * Selects a server
 *
 * @method
 * @param {function} selector Unused
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {ClientSession} [options.session] Unused
 * @param {function} callback
 */
ReplSet.prototype.selectServer = function(selector, options, callback) {
  if (typeof selector === 'function' && typeof callback === 'undefined')
    (callback = selector), (selector = undefined), (options = {});
  if (typeof options === 'function') (callback = options), (options = selector);
  options = options || {};

  let readPreference;
  if (selector instanceof ReadPreference) {
    readPreference = selector;
  } else {
    readPreference = options.readPreference || ReadPreference.primary;
  }

  let lastError;
  const start = now();
  const _selectServer = () => {
    if (calculateDurationInMs(start) >= SERVER_SELECTION_TIMEOUT_MS) {
      if (lastError != null) {
        callback(lastError, null);
      } else {
        callback(new MongoError('Server selection timed out'));
      }

      return;
    }

    const server = this.s.replicaSetState.pickServer(readPreference);
    if (server == null) {
      setTimeout(_selectServer, SERVER_SELECTION_INTERVAL_MS);
      return;
    }

    if (!(server instanceof Server)) {
      lastError = server;
      setTimeout(_selectServer, SERVER_SELECTION_INTERVAL_MS);
      return;
    }

    if (this.s.debug) this.emit('pickedServer', options.readPreference, server);
    callback(null, server);
  };

  _selectServer();
};

/**
 * Get all connected servers
 * @method
 * @return {Server[]}
 */
ReplSet.prototype.getServers = function() {
  return this.s.replicaSetState.allServers();
};

//
// Execute write operation
function executeWriteOperation(args, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // TODO: once we drop Node 4, use destructuring either here or in arguments.
  const self = args.self;
  const op = args.op;
  const ns = args.ns;
  const ops = args.ops;

  if (self.state === DESTROYED) {
    return callback(new MongoError(f('topology was destroyed')));
  }

  const willRetryWrite =
    !args.retrying &&
    !!options.retryWrites &&
    options.session &&
    isRetryableWritesSupported(self) &&
    !options.session.inTransaction() &&
    options.explain === undefined;

  if (!self.s.replicaSetState.hasPrimary()) {
    if (self.s.disconnectHandler) {
      // Not connected but we have a disconnecthandler
      return self.s.disconnectHandler.add(op, ns, ops, options, callback);
    } else if (!willRetryWrite) {
      // No server returned we had an error
      return callback(new MongoError('no primary server found'));
    }
  }

  const handler = (err, result) => {
    if (!err) return callback(null, result);
    if (!legacyIsRetryableWriteError(err, self)) {
      err = getMMAPError(err);
      return callback(err);
    }

    if (willRetryWrite) {
      const newArgs = Object.assign({}, args, { retrying: true });
      return executeWriteOperation(newArgs, options, callback);
    }

    // Per SDAM, remove primary from replicaset
    if (self.s.replicaSetState.primary) {
      self.s.replicaSetState.primary.destroy();
      self.s.replicaSetState.remove(self.s.replicaSetState.primary, { force: true });
    }

    return callback(err);
  };

  if (callback.operationId) {
    handler.operationId = callback.operationId;
  }

  // increment and assign txnNumber
  if (willRetryWrite) {
    options.session.incrementTransactionNumber();
    options.willRetryWrite = willRetryWrite;
  }

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
 * @param {ClientSession} [options.session=null] Session to use for the operation
 * @param {boolean} [options.retryWrites] Enable retryable writes for this operation
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.insert = function(ns, ops, options, callback) {
  // Execute write operation
  executeWriteOperation({ self: this, op: 'insert', ns, ops }, options, callback);
};

/**
 * Perform one or more update operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of updates
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {ClientSession} [options.session=null] Session to use for the operation
 * @param {boolean} [options.retryWrites] Enable retryable writes for this operation
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.update = function(ns, ops, options, callback) {
  // Execute write operation
  executeWriteOperation({ self: this, op: 'update', ns, ops }, options, callback);
};

/**
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of removes
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {ClientSession} [options.session=null] Session to use for the operation
 * @param {boolean} [options.retryWrites] Enable retryable writes for this operation
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.remove = function(ns, ops, options, callback) {
  // Execute write operation
  executeWriteOperation({ self: this, op: 'remove', ns, ops }, options, callback);
};

const RETRYABLE_WRITE_OPERATIONS = ['findAndModify', 'insert', 'update', 'delete'];

function isWriteCommand(command) {
  return RETRYABLE_WRITE_OPERATIONS.some(op => command[op]);
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
 * @param {ClientSession} [options.session=null] Session to use for the operation
 * @param {opResultCallback} callback A callback function
 */
ReplSet.prototype.command = function(ns, cmd, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {}), (options = options || {});
  }

  if (this.state === DESTROYED) return callback(new MongoError(f('topology was destroyed')));
  var self = this;

  // Establish readPreference
  var readPreference = options.readPreference ? options.readPreference : ReadPreference.primary;

  // If the readPreference is primary and we have no primary, store it
  if (
    readPreference.preference === 'primary' &&
    !this.s.replicaSetState.hasPrimary() &&
    this.s.disconnectHandler != null
  ) {
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  } else if (
    readPreference.preference === 'secondary' &&
    !this.s.replicaSetState.hasSecondary() &&
    this.s.disconnectHandler != null
  ) {
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  } else if (
    readPreference.preference !== 'primary' &&
    !this.s.replicaSetState.hasSecondary() &&
    !this.s.replicaSetState.hasPrimary() &&
    this.s.disconnectHandler != null
  ) {
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  // Pick a server
  var server = this.s.replicaSetState.pickServer(readPreference);
  // We received an error, return it
  if (!(server instanceof Server)) return callback(server);
  // Emit debug event
  if (self.s.debug) self.emit('pickedServer', ReadPreference.primary, server);

  // No server returned we had an error
  if (server == null) {
    return callback(
      new MongoError(
        f('no server found that matches the provided readPreference %s', readPreference)
      )
    );
  }

  const willRetryWrite =
    !options.retrying &&
    !!options.retryWrites &&
    options.session &&
    isRetryableWritesSupported(self) &&
    !options.session.inTransaction() &&
    isWriteCommand(cmd);

  const cb = (err, result) => {
    if (!err) return callback(null, result);
    if (!legacyIsRetryableWriteError(err, self)) {
      return callback(err);
    }

    if (willRetryWrite) {
      const newOptions = Object.assign({}, options, { retrying: true });
      return this.command(ns, cmd, newOptions, callback);
    }

    // Per SDAM, remove primary from replicaset
    if (this.s.replicaSetState.primary) {
      this.s.replicaSetState.primary.destroy();
      this.s.replicaSetState.remove(this.s.replicaSetState.primary, { force: true });
    }

    return callback(err);
  };

  // increment and assign txnNumber
  if (willRetryWrite) {
    options.session.incrementTransactionNumber();
    options.willRetryWrite = willRetryWrite;
  }

  // Execute the command
  server.command(ns, cmd, options, cb);
};

/**
 * Get a new cursor
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {object|Long} cmd Can be either a command returning a cursor or a cursorId
 * @param {object} [options] Options for the cursor
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {ClientSession} [options.session=null] Session to use for the operation
 * @param {object} [options.topology] The internal topology of the created cursor
 * @returns {Cursor}
 */
ReplSet.prototype.cursor = function(ns, cmd, options) {
  options = options || {};
  const topology = options.topology || this;

  // Set up final cursor type
  var FinalCursor = options.cursorFactory || this.s.Cursor;

  // Return the cursor
  return new FinalCursor(topology, ns, cmd, options);
};

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
 * A topology serverHeartbeatFailed SDAM event
 *
 * @event ReplSet#serverHeartbeatFailed
 * @type {object}
 */

/**
 * A topology serverHeartbeatSucceeded SDAM change event
 *
 * @event ReplSet#serverHeartbeatSucceeded
 * @type {object}
 */

/**
 * An event emitted indicating a command was started, if command monitoring is enabled
 *
 * @event ReplSet#commandStarted
 * @type {object}
 */

/**
 * An event emitted indicating a command succeeded, if command monitoring is enabled
 *
 * @event ReplSet#commandSucceeded
 * @type {object}
 */

/**
 * An event emitted indicating a command failed, if command monitoring is enabled
 *
 * @event ReplSet#commandFailed
 * @type {object}
 */

module.exports = ReplSet;
