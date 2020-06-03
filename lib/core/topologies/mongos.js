'use strict';

const inherits = require('util').inherits;
const f = require('util').format;
const EventEmitter = require('events').EventEmitter;
const CoreCursor = require('../cursor').CoreCursor;
const Logger = require('../connection/logger');
const retrieveBSON = require('../connection/utils').retrieveBSON;
const MongoError = require('../error').MongoError;
const Server = require('./server');
const diff = require('./shared').diff;
const cloneOptions = require('./shared').cloneOptions;
const SessionMixins = require('./shared').SessionMixins;
const isRetryableWritesSupported = require('./shared').isRetryableWritesSupported;
const relayEvents = require('../utils').relayEvents;
const BSON = retrieveBSON();
const getMMAPError = require('./shared').getMMAPError;
const makeClientMetadata = require('../utils').makeClientMetadata;
const legacyIsRetryableWriteError = require('./shared').legacyIsRetryableWriteError;

/**
 * @fileOverview The **Mongos** class is a class that represents a Mongos Proxy topology and is
 * used to construct connections.
 */

//
// States
var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var UNREFERENCED = 'unreferenced';
var DESTROYING = 'destroying';
var DESTROYED = 'destroyed';

function stateTransition(self, newState) {
  var legalTransitions = {
    disconnected: [CONNECTING, DESTROYING, DESTROYED, DISCONNECTED],
    connecting: [CONNECTING, DESTROYING, DESTROYED, CONNECTED, DISCONNECTED],
    connected: [CONNECTED, DISCONNECTED, DESTROYING, DESTROYED, UNREFERENCED],
    unreferenced: [UNREFERENCED, DESTROYING, DESTROYED],
    destroyed: [DESTROYED]
  };

  // Get current state
  var legalStates = legalTransitions[self.state];
  if (legalStates && legalStates.indexOf(newState) !== -1) {
    self.state = newState;
  } else {
    self.s.logger.error(
      f(
        'Mongos with id [%s] failed attempted illegal state transition from [%s] to [%s] only following state allowed [%s]',
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
 * Creates a new Mongos instance
 * @class
 * @param {array} seedlist A list of seeds for the replicaset
 * @param {number} [options.haInterval=5000] The High availability period for replicaset inquiry
 * @param {Cursor} [options.cursorFactory=Cursor] The cursor factory class used for all query cursors
 * @param {number} [options.size=5] Server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=120000] Initial delay before TCP keep alive enabled
 * @param {number} [options.localThresholdMS=15] Cutoff latency point in MS for MongoS proxy selection
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=1000] TCP Connection timeout setting
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
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @param {boolean} [options.monitorCommands=false] Enable command monitoring for this topology
 * @return {Mongos} A cursor instance
 * @fires Mongos#connect
 * @fires Mongos#reconnect
 * @fires Mongos#joined
 * @fires Mongos#left
 * @fires Mongos#failed
 * @fires Mongos#fullsetup
 * @fires Mongos#all
 * @fires Mongos#serverHeartbeatStarted
 * @fires Mongos#serverHeartbeatSucceeded
 * @fires Mongos#serverHeartbeatFailed
 * @fires Mongos#topologyOpening
 * @fires Mongos#topologyClosed
 * @fires Mongos#topologyDescriptionChanged
 * @property {string} type the topology type.
 * @property {string} parserType the parser type used (c++ or js).
 */
var Mongos = function(seedlist, options) {
  options = options || {};

  // Get replSet Id
  this.id = id++;

  // deduplicate seedlist
  if (Array.isArray(seedlist)) {
    seedlist = seedlist.reduce((seeds, seed) => {
      if (seeds.find(s => s.host === seed.host && s.port === seed.port)) {
        return seeds;
      }

      seeds.push(seed);
      return seeds;
    }, []);
  }

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
    logger: Logger('Mongos', options),
    // Seedlist
    seedlist: seedlist,
    // Ha interval
    haInterval: options.haInterval ? options.haInterval : 10000,
    // Disconnect handler
    disconnectHandler: options.disconnectHandler,
    // Server selection index
    index: 0,
    // Connect function options passed in
    connectOptions: {},
    // Are we running in debug mode
    debug: typeof options.debug === 'boolean' ? options.debug : false,
    // localThresholdMS
    localThresholdMS: options.localThresholdMS || 15
  };

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

  // Disconnected state
  this.state = DISCONNECTED;

  // Current proxies we are connecting to
  this.connectingProxies = [];
  // Currently connected proxies
  this.connectedProxies = [];
  // Disconnected proxies
  this.disconnectedProxies = [];
  // Index of proxy to run operations against
  this.index = 0;
  // High availability timeout id
  this.haTimeoutId = null;
  // Last ismaster
  this.ismaster = null;

  // Description of the Replicaset
  this.topologyDescription = {
    topologyType: 'Unknown',
    servers: []
  };

  // Highest clusterTime seen in responses from the current deployment
  this.clusterTime = null;

  // Add event listener
  EventEmitter.call(this);
};

inherits(Mongos, EventEmitter);
Object.assign(Mongos.prototype, SessionMixins);

Object.defineProperty(Mongos.prototype, 'type', {
  enumerable: true,
  get: function() {
    return 'mongos';
  }
});

Object.defineProperty(Mongos.prototype, 'parserType', {
  enumerable: true,
  get: function() {
    return BSON.native ? 'c++' : 'js';
  }
});

Object.defineProperty(Mongos.prototype, 'logicalSessionTimeoutMinutes', {
  enumerable: true,
  get: function() {
    if (!this.ismaster) return null;
    return this.ismaster.logicalSessionTimeoutMinutes || null;
  }
});

/**
 * Emit event if it exists
 * @method
 */
function emitSDAMEvent(self, event, description) {
  if (self.listeners(event).length > 0) {
    self.emit(event, description);
  }
}

const SERVER_EVENTS = ['serverDescriptionChanged', 'error', 'close', 'timeout', 'parseError'];
function destroyServer(server, options, callback) {
  options = options || {};
  SERVER_EVENTS.forEach(event => server.removeAllListeners(event));
  server.destroy(options, callback);
}

/**
 * Initiate server connect
 */
Mongos.prototype.connect = function(options) {
  var self = this;
  // Add any connect level options to the internal state
  this.s.connectOptions = options || {};

  // Set connecting state
  stateTransition(this, CONNECTING);

  // Create server instances
  var servers = this.s.seedlist.map(function(x) {
    const server = new Server(
      Object.assign({}, self.s.options, x, options, {
        reconnect: false,
        monitoring: false,
        parent: self
      })
    );

    relayEvents(server, self, ['serverDescriptionChanged']);
    return server;
  });

  // Emit the topology opening event
  emitSDAMEvent(this, 'topologyOpening', { topologyId: this.id });

  // Start all server connections
  connectProxies(self, servers);
};

/**
 * Authenticate the topology.
 * @method
 * @param {MongoCredentials} credentials The credentials for authentication we are using
 * @param {authResultCallback} callback A callback function
 */
Mongos.prototype.auth = function(credentials, callback) {
  if (typeof callback === 'function') callback(null, null);
};

function handleEvent(self) {
  return function() {
    if (self.state === DESTROYED || self.state === DESTROYING) {
      return;
    }

    // Move to list of disconnectedProxies
    moveServerFrom(self.connectedProxies, self.disconnectedProxies, this);
    // Emit the initial topology
    emitTopologyDescriptionChanged(self);
    // Emit the left signal
    self.emit('left', 'mongos', this);
    // Emit the sdam event
    self.emit('serverClosed', {
      topologyId: self.id,
      address: this.name
    });
  };
}

function handleInitialConnectEvent(self, event) {
  return function() {
    var _this = this;

    // Destroy the instance
    if (self.state === DESTROYED) {
      // Emit the initial topology
      emitTopologyDescriptionChanged(self);
      // Move from connectingProxies
      moveServerFrom(self.connectingProxies, self.disconnectedProxies, this);
      return this.destroy();
    }

    // Check the type of server
    if (event === 'connect') {
      // Get last known ismaster
      self.ismaster = _this.lastIsMaster();

      // Is this not a proxy, remove t
      if (self.ismaster.msg === 'isdbgrid') {
        // Add to the connectd list
        for (let i = 0; i < self.connectedProxies.length; i++) {
          if (self.connectedProxies[i].name === _this.name) {
            // Move from connectingProxies
            moveServerFrom(self.connectingProxies, self.disconnectedProxies, _this);
            // Emit the initial topology
            emitTopologyDescriptionChanged(self);
            _this.destroy();
            return self.emit('failed', _this);
          }
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

        // Move from connecting proxies connected
        moveServerFrom(self.connectingProxies, self.connectedProxies, _this);
        // Emit the joined event
        self.emit('joined', 'mongos', _this);
      } else {
        // Print warning if we did not find a mongos proxy
        if (self.s.logger.isWarn()) {
          var message = 'expected mongos proxy, but found replicaset member mongod for server %s';
          // We have a standalone server
          if (!self.ismaster.hosts) {
            message = 'expected mongos proxy, but found standalone mongod for server %s';
          }

          self.s.logger.warn(f(message, _this.name));
        }

        // This is not a mongos proxy, destroy and remove it completely
        _this.destroy(true);
        removeProxyFrom(self.connectingProxies, _this);
        // Emit the left event
        self.emit('left', 'server', _this);
        // Emit failed event
        self.emit('failed', _this);
      }
    } else {
      moveServerFrom(self.connectingProxies, self.disconnectedProxies, this);
      // Emit the left event
      self.emit('left', 'mongos', this);
      // Emit failed event
      self.emit('failed', this);
    }

    // Emit the initial topology
    emitTopologyDescriptionChanged(self);

    // Trigger topologyMonitor
    if (self.connectingProxies.length === 0) {
      // Emit connected if we are connected
      if (self.connectedProxies.length > 0 && self.state === CONNECTING) {
        // Set the state to connected
        stateTransition(self, CONNECTED);
        // Emit the connect event
        self.emit('connect', self);
        self.emit('fullsetup', self);
        self.emit('all', self);
      } else if (self.disconnectedProxies.length === 0) {
        // Print warning if we did not find a mongos proxy
        if (self.s.logger.isWarn()) {
          self.s.logger.warn(
            f('no mongos proxies found in seed list, did you mean to connect to a replicaset')
          );
        }

        // Emit the error that no proxies were found
        return self.emit('error', new MongoError('no mongos proxies found in seed list'));
      }

      // Topology monitor
      topologyMonitor(self, { firstConnect: true });
    }
  };
}

function connectProxies(self, servers) {
  // Update connectingProxies
  self.connectingProxies = self.connectingProxies.concat(servers);

  // Index used to interleaf the server connects, avoiding
  // runtime issues on io constrained vm's
  var timeoutInterval = 0;

  function connect(server, timeoutInterval) {
    setTimeout(function() {
      // Emit opening server event
      self.emit('serverOpening', {
        topologyId: self.id,
        address: server.name
      });

      // Emit the initial topology
      emitTopologyDescriptionChanged(self);

      // Add event handlers
      server.once('close', handleInitialConnectEvent(self, 'close'));
      server.once('timeout', handleInitialConnectEvent(self, 'timeout'));
      server.once('parseError', handleInitialConnectEvent(self, 'parseError'));
      server.once('error', handleInitialConnectEvent(self, 'error'));
      server.once('connect', handleInitialConnectEvent(self, 'connect'));

      // Command Monitoring events
      relayEvents(server, self, ['commandStarted', 'commandSucceeded', 'commandFailed']);

      // Start connection
      server.connect(self.s.connectOptions);
    }, timeoutInterval);
  }

  // Start all the servers
  servers.forEach(server => connect(server, timeoutInterval++));
}

function pickProxy(self, session) {
  // TODO: Destructure :)
  const transaction = session && session.transaction;

  if (transaction && transaction.server) {
    if (transaction.server.isConnected()) {
      return transaction.server;
    } else {
      transaction.unpinServer();
    }
  }

  // Get the currently connected Proxies
  var connectedProxies = self.connectedProxies.slice(0);

  // Set lower bound
  var lowerBoundLatency = Number.MAX_VALUE;

  // Determine the lower bound for the Proxies
  for (var i = 0; i < connectedProxies.length; i++) {
    if (connectedProxies[i].lastIsMasterMS < lowerBoundLatency) {
      lowerBoundLatency = connectedProxies[i].lastIsMasterMS;
    }
  }

  // Filter out the possible servers
  connectedProxies = connectedProxies.filter(function(server) {
    if (
      server.lastIsMasterMS <= lowerBoundLatency + self.s.localThresholdMS &&
      server.isConnected()
    ) {
      return true;
    }
  });

  let proxy;

  // We have no connectedProxies pick first of the connected ones
  if (connectedProxies.length === 0) {
    proxy = self.connectedProxies[0];
  } else {
    // Get proxy
    proxy = connectedProxies[self.index % connectedProxies.length];
    // Update the index
    self.index = (self.index + 1) % connectedProxies.length;
  }

  if (transaction && transaction.isActive && proxy && proxy.isConnected()) {
    transaction.pinServer(proxy);
  }

  // Return the proxy
  return proxy;
}

function moveServerFrom(from, to, proxy) {
  for (var i = 0; i < from.length; i++) {
    if (from[i].name === proxy.name) {
      from.splice(i, 1);
    }
  }

  for (i = 0; i < to.length; i++) {
    if (to[i].name === proxy.name) {
      to.splice(i, 1);
    }
  }

  to.push(proxy);
}

function removeProxyFrom(from, proxy) {
  for (var i = 0; i < from.length; i++) {
    if (from[i].name === proxy.name) {
      from.splice(i, 1);
    }
  }
}

function reconnectProxies(self, proxies, callback) {
  // Count lefts
  var count = proxies.length;

  // Handle events
  var _handleEvent = function(self, event) {
    return function() {
      var _self = this;
      count = count - 1;

      // Destroyed
      if (self.state === DESTROYED || self.state === DESTROYING || self.state === UNREFERENCED) {
        moveServerFrom(self.connectingProxies, self.disconnectedProxies, _self);
        return this.destroy();
      }

      if (event === 'connect') {
        // Destroyed
        if (self.state === DESTROYED || self.state === DESTROYING || self.state === UNREFERENCED) {
          moveServerFrom(self.connectingProxies, self.disconnectedProxies, _self);
          return _self.destroy();
        }

        // Remove the handlers
        for (var i = 0; i < handlers.length; i++) {
          _self.removeAllListeners(handlers[i]);
        }

        // Add stable state handlers
        _self.on('error', handleEvent(self, 'error'));
        _self.on('close', handleEvent(self, 'close'));
        _self.on('timeout', handleEvent(self, 'timeout'));
        _self.on('parseError', handleEvent(self, 'parseError'));

        // Move to the connected servers
        moveServerFrom(self.connectingProxies, self.connectedProxies, _self);
        // Emit topology Change
        emitTopologyDescriptionChanged(self);
        // Emit joined event
        self.emit('joined', 'mongos', _self);
      } else {
        // Move from connectingProxies
        moveServerFrom(self.connectingProxies, self.disconnectedProxies, _self);
        this.destroy();
      }

      // Are we done finish up callback
      if (count === 0) {
        callback();
      }
    };
  };

  // No new servers
  if (count === 0) {
    return callback();
  }

  // Execute method
  function execute(_server, i) {
    setTimeout(function() {
      // Destroyed
      if (self.state === DESTROYED || self.state === DESTROYING || self.state === UNREFERENCED) {
        return;
      }

      // Create a new server instance
      var server = new Server(
        Object.assign({}, self.s.options, {
          host: _server.name.split(':')[0],
          port: parseInt(_server.name.split(':')[1], 10),
          reconnect: false,
          monitoring: false,
          parent: self
        })
      );

      destroyServer(_server, { force: true });
      removeProxyFrom(self.disconnectedProxies, _server);

      // Relay the server description change
      relayEvents(server, self, ['serverDescriptionChanged']);

      // Emit opening server event
      self.emit('serverOpening', {
        topologyId: server.s.topologyId !== -1 ? server.s.topologyId : self.id,
        address: server.name
      });

      // Add temp handlers
      server.once('connect', _handleEvent(self, 'connect'));
      server.once('close', _handleEvent(self, 'close'));
      server.once('timeout', _handleEvent(self, 'timeout'));
      server.once('error', _handleEvent(self, 'error'));
      server.once('parseError', _handleEvent(self, 'parseError'));

      // Command Monitoring events
      relayEvents(server, self, ['commandStarted', 'commandSucceeded', 'commandFailed']);

      // Connect to proxy
      self.connectingProxies.push(server);
      server.connect(self.s.connectOptions);
    }, i);
  }

  // Create new instances
  for (var i = 0; i < proxies.length; i++) {
    execute(proxies[i], i);
  }
}

function topologyMonitor(self, options) {
  options = options || {};

  // no need to set up the monitor if we're already closed
  if (self.state === DESTROYED || self.state === DESTROYING || self.state === UNREFERENCED) {
    return;
  }

  // Set momitoring timeout
  self.haTimeoutId = setTimeout(function() {
    if (self.state === DESTROYED || self.state === DESTROYING || self.state === UNREFERENCED) {
      return;
    }

    // If we have a primary and a disconnect handler, execute
    // buffered operations
    if (self.isConnected() && self.s.disconnectHandler) {
      self.s.disconnectHandler.execute();
    }

    // Get the connectingServers
    var proxies = self.connectedProxies.slice(0);
    // Get the count
    var count = proxies.length;

    // If the count is zero schedule a new fast
    function pingServer(_self, _server, cb) {
      // Measure running time
      var start = new Date().getTime();

      // Emit the server heartbeat start
      emitSDAMEvent(self, 'serverHeartbeatStarted', { connectionId: _server.name });

      // Execute ismaster
      _server.command(
        'admin.$cmd',
        {
          ismaster: true
        },
        {
          monitoring: true,
          socketTimeout: self.s.options.connectionTimeout || 2000
        },
        function(err, r) {
          if (
            self.state === DESTROYED ||
            self.state === DESTROYING ||
            self.state === UNREFERENCED
          ) {
            // Move from connectingProxies
            moveServerFrom(self.connectedProxies, self.disconnectedProxies, _server);
            _server.destroy();
            return cb(err, r);
          }

          // Calculate latency
          var latencyMS = new Date().getTime() - start;

          // We had an error, remove it from the state
          if (err) {
            // Emit the server heartbeat failure
            emitSDAMEvent(self, 'serverHeartbeatFailed', {
              durationMS: latencyMS,
              failure: err,
              connectionId: _server.name
            });
            // Move from connected proxies to disconnected proxies
            moveServerFrom(self.connectedProxies, self.disconnectedProxies, _server);
          } else {
            // Update the server ismaster
            _server.ismaster = r.result;
            _server.lastIsMasterMS = latencyMS;

            // Server heart beat event
            emitSDAMEvent(self, 'serverHeartbeatSucceeded', {
              durationMS: latencyMS,
              reply: r.result,
              connectionId: _server.name
            });
          }

          cb(err, r);
        }
      );
    }

    // No proxies initiate monitor again
    if (proxies.length === 0) {
      // Emit close event if any listeners registered
      if (self.listeners('close').length > 0 && self.state === CONNECTING) {
        self.emit('error', new MongoError('no mongos proxy available'));
      } else {
        self.emit('close', self);
      }

      // Attempt to connect to any unknown servers
      return reconnectProxies(self, self.disconnectedProxies, function() {
        if (self.state === DESTROYED || self.state === DESTROYING || self.state === UNREFERENCED) {
          return;
        }

        // Are we connected ? emit connect event
        if (self.state === CONNECTING && options.firstConnect) {
          self.emit('connect', self);
          self.emit('fullsetup', self);
          self.emit('all', self);
        } else if (self.isConnected()) {
          self.emit('reconnect', self);
        } else if (!self.isConnected() && self.listeners('close').length > 0) {
          self.emit('close', self);
        }

        // Perform topology monitor
        topologyMonitor(self);
      });
    }

    // Ping all servers
    for (var i = 0; i < proxies.length; i++) {
      pingServer(self, proxies[i], function() {
        count = count - 1;

        if (count === 0) {
          if (
            self.state === DESTROYED ||
            self.state === DESTROYING ||
            self.state === UNREFERENCED
          ) {
            return;
          }

          // Attempt to connect to any unknown servers
          reconnectProxies(self, self.disconnectedProxies, function() {
            if (
              self.state === DESTROYED ||
              self.state === DESTROYING ||
              self.state === UNREFERENCED
            ) {
              return;
            }

            // Perform topology monitor
            topologyMonitor(self);
          });
        }
      });
    }
  }, self.s.haInterval);
}

/**
 * Returns the last known ismaster document for this server
 * @method
 * @return {object}
 */
Mongos.prototype.lastIsMaster = function() {
  return this.ismaster;
};

/**
 * Unref all connections belong to this server
 * @method
 */
Mongos.prototype.unref = function() {
  // Transition state
  stateTransition(this, UNREFERENCED);
  // Get all proxies
  var proxies = this.connectedProxies.concat(this.connectingProxies);
  proxies.forEach(function(x) {
    x.unref();
  });

  clearTimeout(this.haTimeoutId);
};

/**
 * Destroy the server connection
 * @param {boolean} [options.force=false] Force destroy the pool
 * @method
 */
Mongos.prototype.destroy = function(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};

  stateTransition(this, DESTROYING);
  if (this.haTimeoutId) {
    clearTimeout(this.haTimeoutId);
  }

  const proxies = this.connectedProxies.concat(this.connectingProxies);
  let serverCount = proxies.length;
  const serverDestroyed = () => {
    serverCount--;
    if (serverCount > 0) {
      return;
    }

    emitTopologyDescriptionChanged(this);
    emitSDAMEvent(this, 'topologyClosed', { topologyId: this.id });
    stateTransition(this, DESTROYED);
    if (typeof callback === 'function') {
      callback(null, null);
    }
  };

  if (serverCount === 0) {
    serverDestroyed();
    return;
  }

  // Destroy all connecting servers
  proxies.forEach(server => {
    // Emit the sdam event
    this.emit('serverClosed', {
      topologyId: this.id,
      address: server.name
    });

    destroyServer(server, options, serverDestroyed);
    moveServerFrom(this.connectedProxies, this.disconnectedProxies, server);
  });
};

/**
 * Figure out if the server is connected
 * @method
 * @return {boolean}
 */
Mongos.prototype.isConnected = function() {
  return this.connectedProxies.length > 0;
};

/**
 * Figure out if the server instance was destroyed by calling destroy
 * @method
 * @return {boolean}
 */
Mongos.prototype.isDestroyed = function() {
  return this.state === DESTROYED;
};

//
// Operations
//

function executeWriteOperation(args, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // TODO: once we drop Node 4, use destructuring either here or in arguments.
  const self = args.self;
  const op = args.op;
  const ns = args.ns;
  const ops = args.ops;

  // Pick a server
  let server = pickProxy(self, options.session);
  // No server found error out
  if (!server) return callback(new MongoError('no mongos proxy available'));

  const willRetryWrite =
    !args.retrying &&
    !!options.retryWrites &&
    options.session &&
    isRetryableWritesSupported(self) &&
    !options.session.inTransaction();

  const handler = (err, result) => {
    if (!err) return callback(null, result);
    if (!legacyIsRetryableWriteError(err, self) || !willRetryWrite) {
      err = getMMAPError(err);
      return callback(err);
    }

    // Pick another server
    server = pickProxy(self, options.session);

    // No server found error out with original error
    if (!server) {
      return callback(err);
    }

    const newArgs = Object.assign({}, args, { retrying: true });
    return executeWriteOperation(newArgs, options, callback);
  };

  if (callback.operationId) {
    handler.operationId = callback.operationId;
  }

  // increment and assign txnNumber
  if (willRetryWrite) {
    options.session.incrementTransactionNumber();
    options.willRetryWrite = willRetryWrite;
  }

  // rerun the operation
  server[op](ns, ops, options, handler);
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
Mongos.prototype.insert = function(ns, ops, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {}), (options = options || {});
  }

  if (this.state === DESTROYED) {
    return callback(new MongoError(f('topology was destroyed')));
  }

  // Not connected but we have a disconnecthandler
  if (!this.isConnected() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('insert', ns, ops, options, callback);
  }

  // No mongos proxy available
  if (!this.isConnected()) {
    return callback(new MongoError('no mongos proxy available'));
  }

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
Mongos.prototype.update = function(ns, ops, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {}), (options = options || {});
  }

  if (this.state === DESTROYED) {
    return callback(new MongoError(f('topology was destroyed')));
  }

  // Not connected but we have a disconnecthandler
  if (!this.isConnected() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('update', ns, ops, options, callback);
  }

  // No mongos proxy available
  if (!this.isConnected()) {
    return callback(new MongoError('no mongos proxy available'));
  }

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
Mongos.prototype.remove = function(ns, ops, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {}), (options = options || {});
  }

  if (this.state === DESTROYED) {
    return callback(new MongoError(f('topology was destroyed')));
  }

  // Not connected but we have a disconnecthandler
  if (!this.isConnected() && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('remove', ns, ops, options, callback);
  }

  // No mongos proxy available
  if (!this.isConnected()) {
    return callback(new MongoError('no mongos proxy available'));
  }

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
Mongos.prototype.command = function(ns, cmd, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {}), (options = options || {});
  }

  if (this.state === DESTROYED) {
    return callback(new MongoError(f('topology was destroyed')));
  }

  var self = this;

  // Pick a proxy
  var server = pickProxy(self, options.session);

  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if ((server == null || !server.isConnected()) && this.s.disconnectHandler != null) {
    return this.s.disconnectHandler.add('command', ns, cmd, options, callback);
  }

  // No server returned we had an error
  if (server == null) {
    return callback(new MongoError('no mongos proxy available'));
  }

  // Cloned options
  var clonedOptions = cloneOptions(options);
  clonedOptions.topology = self;

  const willRetryWrite =
    !options.retrying &&
    options.retryWrites &&
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
      const newOptions = Object.assign({}, clonedOptions, { retrying: true });
      return this.command(ns, cmd, newOptions, callback);
    }

    return callback(err);
  };

  // increment and assign txnNumber
  if (willRetryWrite) {
    clonedOptions.session.incrementTransactionNumber();
    clonedOptions.willRetryWrite = willRetryWrite;
  }

  // Execute the command
  server.command(ns, cmd, clonedOptions, cb);
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
Mongos.prototype.cursor = function(ns, cmd, options) {
  options = options || {};
  const topology = options.topology || this;

  // Set up final cursor type
  var FinalCursor = options.cursorFactory || this.s.Cursor;

  // Return the cursor
  return new FinalCursor(topology, ns, cmd, options);
};

/**
 * Selects a server
 *
 * @method
 * @param {function} selector Unused
 * @param {ReadPreference} [options.readPreference] Unused
 * @param {ClientSession} [options.session] Specify a session if it is being used
 * @param {function} callback
 */
Mongos.prototype.selectServer = function(selector, options, callback) {
  if (typeof selector === 'function' && typeof callback === 'undefined')
    (callback = selector), (selector = undefined), (options = {});
  if (typeof options === 'function')
    (callback = options), (options = selector), (selector = undefined);
  options = options || {};

  const server = pickProxy(this, options.session);
  if (server == null) {
    callback(new MongoError('server selection failed'));
    return;
  }

  if (this.s.debug) this.emit('pickedServer', null, server);
  callback(null, server);
};

/**
 * All raw connections
 * @method
 * @return {Connection[]}
 */
Mongos.prototype.connections = function() {
  var connections = [];

  for (var i = 0; i < this.connectedProxies.length; i++) {
    connections = connections.concat(this.connectedProxies[i].connections());
  }

  return connections;
};

function emitTopologyDescriptionChanged(self) {
  if (self.listeners('topologyDescriptionChanged').length > 0) {
    var topology = 'Unknown';
    if (self.connectedProxies.length > 0) {
      topology = 'Sharded';
    }

    // Generate description
    var description = {
      topologyType: topology,
      servers: []
    };

    // All proxies
    var proxies = self.disconnectedProxies.concat(self.connectingProxies);

    // Add all the disconnected proxies
    description.servers = description.servers.concat(
      proxies.map(function(x) {
        var description = x.getDescription();
        description.type = 'Unknown';
        return description;
      })
    );

    // Add all the connected proxies
    description.servers = description.servers.concat(
      self.connectedProxies.map(function(x) {
        var description = x.getDescription();
        description.type = 'Mongos';
        return description;
      })
    );

    // Get the diff
    var diffResult = diff(self.topologyDescription, description);

    // Create the result
    var result = {
      topologyId: self.id,
      previousDescription: self.topologyDescription,
      newDescription: description,
      diff: diffResult
    };

    // Emit the topologyDescription change
    if (diffResult.servers.length > 0) {
      self.emit('topologyDescriptionChanged', result);
    }

    // Set the new description
    self.topologyDescription = description;
  }
}

/**
 * A mongos connect event, used to verify that the connection is up and running
 *
 * @event Mongos#connect
 * @type {Mongos}
 */

/**
 * A mongos reconnect event, used to verify that the mongos topology has reconnected
 *
 * @event Mongos#reconnect
 * @type {Mongos}
 */

/**
 * A mongos fullsetup event, used to signal that all topology members have been contacted.
 *
 * @event Mongos#fullsetup
 * @type {Mongos}
 */

/**
 * A mongos all event, used to signal that all topology members have been contacted.
 *
 * @event Mongos#all
 * @type {Mongos}
 */

/**
 * A server member left the mongos list
 *
 * @event Mongos#left
 * @type {Mongos}
 * @param {string} type The type of member that left (mongos)
 * @param {Server} server The server object that left
 */

/**
 * A server member joined the mongos list
 *
 * @event Mongos#joined
 * @type {Mongos}
 * @param {string} type The type of member that left (mongos)
 * @param {Server} server The server object that joined
 */

/**
 * A server opening SDAM monitoring event
 *
 * @event Mongos#serverOpening
 * @type {object}
 */

/**
 * A server closed SDAM monitoring event
 *
 * @event Mongos#serverClosed
 * @type {object}
 */

/**
 * A server description SDAM change monitoring event
 *
 * @event Mongos#serverDescriptionChanged
 * @type {object}
 */

/**
 * A topology open SDAM event
 *
 * @event Mongos#topologyOpening
 * @type {object}
 */

/**
 * A topology closed SDAM event
 *
 * @event Mongos#topologyClosed
 * @type {object}
 */

/**
 * A topology structure SDAM change event
 *
 * @event Mongos#topologyDescriptionChanged
 * @type {object}
 */

/**
 * A topology serverHeartbeatStarted SDAM event
 *
 * @event Mongos#serverHeartbeatStarted
 * @type {object}
 */

/**
 * A topology serverHeartbeatFailed SDAM event
 *
 * @event Mongos#serverHeartbeatFailed
 * @type {object}
 */

/**
 * A topology serverHeartbeatSucceeded SDAM change event
 *
 * @event Mongos#serverHeartbeatSucceeded
 * @type {object}
 */

/**
 * An event emitted indicating a command was started, if command monitoring is enabled
 *
 * @event Mongos#commandStarted
 * @type {object}
 */

/**
 * An event emitted indicating a command succeeded, if command monitoring is enabled
 *
 * @event Mongos#commandSucceeded
 * @type {object}
 */

/**
 * An event emitted indicating a command failed, if command monitoring is enabled
 *
 * @event Mongos#commandFailed
 * @type {object}
 */

module.exports = Mongos;
