'use strict';

const Server = require('./server');
const Cursor = require('../cursor');
const MongoError = require('mongodb-core').MongoError;
const TopologyBase = require('./topology_base').TopologyBase;
const Store = require('./topology_base').Store;
const CReplSet = require('mongodb-core').ReplSet;
const MAX_JS_INT = require('../utils').MAX_JS_INT;
const translateOptions = require('../utils').translateOptions;
const filterOptions = require('../utils').filterOptions;
const mergeOptions = require('../utils').mergeOptions;

/**
 * @fileOverview The **ReplSet** class is a class that represents a Replicaset topology and is
 * used to construct connections.
 *
 * **ReplSet Should not be used, use MongoClient.connect**
 */

// Allowed parameters
var legalOptionNames = [
  'ha',
  'haInterval',
  'replicaSet',
  'rs_name',
  'secondaryAcceptableLatencyMS',
  'connectWithNoPrimary',
  'poolSize',
  'ssl',
  'checkServerIdentity',
  'sslValidate',
  'sslCA',
  'sslCert',
  'ciphers',
  'ecdhCurve',
  'sslCRL',
  'sslKey',
  'sslPass',
  'socketOptions',
  'bufferMaxEntries',
  'store',
  'auto_reconnect',
  'autoReconnect',
  'emitError',
  'keepAlive',
  'keepAliveInitialDelay',
  'noDelay',
  'connectTimeoutMS',
  'socketTimeoutMS',
  'strategy',
  'debug',
  'family',
  'loggerLevel',
  'logger',
  'reconnectTries',
  'appname',
  'domainsEnabled',
  'servername',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'maxStalenessSeconds',
  'promiseLibrary',
  'minSize',
  'monitorCommands'
];

/**
 * Creates a new ReplSet instance
 * @class
 * @deprecated
 * @param {Server[]} servers A seedlist of servers participating in the replicaset.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.ha=true] Turn on high availability monitoring.
 * @param {number} [options.haInterval=10000] Time between each replicaset status check.
 * @param {string} [options.replicaSet] The name of the replicaset to connect to.
 * @param {number} [options.secondaryAcceptableLatencyMS=15] Sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms)
 * @param {boolean} [options.connectWithNoPrimary=false] Sets if the driver should connect even if no primary is available
 * @param {number} [options.poolSize=5] Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
 * @param {boolean} [options.ssl=false] Use ssl connection (needs to have a mongod server with ssl support)
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {boolean} [options.sslValidate=true] Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCA] Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCRL] Array of revocation certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslCert] String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher.
 * @param {string} [options.ciphers] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {string} [options.ecdhCurve] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {(Buffer|string)} [options.sslKey] String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslPass] String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.servername] String containing the server name requested via TLS SNI.
 * @param {object} [options.socketOptions] Socket options
 * @param {boolean} [options.socketOptions.noDelay=true] TCP Socket NoDelay option.
 * @param {boolean} [options.socketOptions.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.socketOptions.keepAliveInitialDelay=30000] The number of milliseconds to wait before initiating keepAlive on the TCP socket
 * @param {number} [options.socketOptions.connectTimeoutMS=10000] TCP Connection timeout setting
 * @param {number} [options.socketOptions.socketTimeoutMS=0] TCP Socket timeout setting
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @param {number} [options.maxStalenessSeconds=undefined] The max staleness to secondary reads (values under 10 seconds cannot be guaranteed);
 * @param {boolean} [options.monitorCommands=false] Enable command monitoring for this topology
 * @fires ReplSet#connect
 * @fires ReplSet#ha
 * @fires ReplSet#joined
 * @fires ReplSet#left
 * @fires ReplSet#fullsetup
 * @fires ReplSet#open
 * @fires ReplSet#close
 * @fires ReplSet#error
 * @fires ReplSet#timeout
 * @fires ReplSet#parseError
 * @fires ReplSet#commandStarted
 * @fires ReplSet#commandSucceeded
 * @fires ReplSet#commandFailed
 * @property {string} parserType the parser type used (c++ or js).
 * @return {ReplSet} a ReplSet instance.
 */
class ReplSet extends TopologyBase {
  constructor(servers, options) {
    super();

    options = options || {};
    var self = this;

    // Filter the options
    options = filterOptions(options, legalOptionNames);

    // Ensure all the instances are Server
    for (var i = 0; i < servers.length; i++) {
      if (!(servers[i] instanceof Server)) {
        throw MongoError.create({
          message: 'all seed list instances must be of the Server type',
          driver: true
        });
      }
    }

    // Stored options
    var storeOptions = {
      force: false,
      bufferMaxEntries:
        typeof options.bufferMaxEntries === 'number' ? options.bufferMaxEntries : MAX_JS_INT
    };

    // Shared global store
    var store = options.store || new Store(self, storeOptions);

    // Build seed list
    var seedlist = servers.map(function(x) {
      return { host: x.host, port: x.port };
    });

    // Clone options
    var clonedOptions = mergeOptions(
      {},
      {
        disconnectHandler: store,
        cursorFactory: Cursor,
        reconnect: false,
        emitError: typeof options.emitError === 'boolean' ? options.emitError : true,
        size: typeof options.poolSize === 'number' ? options.poolSize : 5,
        monitorCommands:
          typeof options.monitorCommands === 'boolean' ? options.monitorCommands : false
      }
    );

    // Translate any SSL options and other connectivity options
    clonedOptions = translateOptions(clonedOptions, options);

    // Socket options
    var socketOptions =
      options.socketOptions && Object.keys(options.socketOptions).length > 0
        ? options.socketOptions
        : options;

    // Translate all the options to the mongodb-core ones
    clonedOptions = translateOptions(clonedOptions, socketOptions);

    // Build default client information
    clonedOptions.clientInfo = this.clientInfo;
    // Do we have an application specific string
    if (options.appname) {
      clonedOptions.clientInfo.application = { name: options.appname };
    }

    // Create the ReplSet
    var coreTopology = new CReplSet(seedlist, clonedOptions);

    // Listen to reconnect event
    coreTopology.on('reconnect', function() {
      self.emit('reconnect');
      store.execute();
    });

    // Internal state
    this.s = {
      // Replicaset
      coreTopology: coreTopology,
      // Server capabilities
      sCapabilities: null,
      // Debug tag
      tag: options.tag,
      // Store options
      storeOptions: storeOptions,
      // Cloned options
      clonedOptions: clonedOptions,
      // Store
      store: store,
      // Options
      options: options,
      // Server Session Pool
      sessionPool: null,
      // Active client sessions
      sessions: [],
      // Promise library
      promiseLibrary: options.promiseLibrary || Promise
    };

    // Debug
    if (clonedOptions.debug) {
      // Last ismaster
      Object.defineProperty(this, 'replset', {
        enumerable: true,
        get: function() {
          return coreTopology;
        }
      });
    }
  }

  // Connect method
  connect(_options, callback) {
    var self = this;
    if ('function' === typeof _options) (callback = _options), (_options = {});
    if (_options == null) _options = {};
    if (!('function' === typeof callback)) callback = null;
    _options = Object.assign({}, this.s.clonedOptions, _options);
    self.s.options = _options;

    // Update bufferMaxEntries
    self.s.storeOptions.bufferMaxEntries =
      typeof _options.bufferMaxEntries === 'number' ? _options.bufferMaxEntries : -1;

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
        if (event !== 'error') {
          self.emit(event, err);
        }
      };
    };

    // Clear out all the current handlers left over
    var events = [
      'timeout',
      'error',
      'close',
      'serverOpening',
      'serverDescriptionChanged',
      'serverHeartbeatStarted',
      'serverHeartbeatSucceeded',
      'serverHeartbeatFailed',
      'serverClosed',
      'topologyOpening',
      'topologyClosed',
      'topologyDescriptionChanged',
      'commandStarted',
      'commandSucceeded',
      'commandFailed',
      'joined',
      'left',
      'ping',
      'ha'
    ];
    events.forEach(function(e) {
      self.s.coreTopology.removeAllListeners(e);
    });

    // relay the event
    var relay = function(event) {
      return function(t, server) {
        self.emit(event, t, server);
      };
    };

    // Replset events relay
    var replsetRelay = function(event) {
      return function(t, server) {
        self.emit(event, t, server.lastIsMaster(), server);
      };
    };

    // Relay ha
    var relayHa = function(t, state) {
      self.emit('ha', t, state);

      if (t === 'start') {
        self.emit('ha_connect', t, state);
      } else if (t === 'end') {
        self.emit('ha_ismaster', t, state);
      }
    };

    // Set up serverConfig listeners
    self.s.coreTopology.on('joined', replsetRelay('joined'));
    self.s.coreTopology.on('left', relay('left'));
    self.s.coreTopology.on('ping', relay('ping'));
    self.s.coreTopology.on('ha', relayHa);

    // Set up SDAM listeners
    self.s.coreTopology.on('serverDescriptionChanged', relay('serverDescriptionChanged'));
    self.s.coreTopology.on('serverHeartbeatStarted', relay('serverHeartbeatStarted'));
    self.s.coreTopology.on('serverHeartbeatSucceeded', relay('serverHeartbeatSucceeded'));
    self.s.coreTopology.on('serverHeartbeatFailed', relay('serverHeartbeatFailed'));
    self.s.coreTopology.on('serverOpening', relay('serverOpening'));
    self.s.coreTopology.on('serverClosed', relay('serverClosed'));
    self.s.coreTopology.on('topologyOpening', relay('topologyOpening'));
    self.s.coreTopology.on('topologyClosed', relay('topologyClosed'));
    self.s.coreTopology.on('topologyDescriptionChanged', relay('topologyDescriptionChanged'));
    self.s.coreTopology.on('commandStarted', relay('commandStarted'));
    self.s.coreTopology.on('commandSucceeded', relay('commandSucceeded'));
    self.s.coreTopology.on('commandFailed', relay('commandFailed'));

    self.s.coreTopology.on('fullsetup', function() {
      self.emit('fullsetup', self, self);
    });

    self.s.coreTopology.on('all', function() {
      self.emit('all', null, self);
    });

    // Connect handler
    var connectHandler = function() {
      // Set up listeners
      self.s.coreTopology.once('timeout', errorHandler('timeout'));
      self.s.coreTopology.once('error', errorHandler('error'));
      self.s.coreTopology.once('close', errorHandler('close'));

      // Emit open event
      self.emit('open', null, self);

      // Return correctly
      try {
        callback(null, self);
      } catch (err) {
        process.nextTick(function() {
          throw err;
        });
      }
    };

    // Error handler
    var connectErrorHandler = function() {
      return function(err) {
        ['timeout', 'error', 'close'].forEach(function(e) {
          self.s.coreTopology.removeListener(e, connectErrorHandler);
        });

        self.s.coreTopology.removeListener('connect', connectErrorHandler);
        // Destroy the replset
        self.s.coreTopology.destroy();

        // Try to callback
        try {
          callback(err);
        } catch (err) {
          if (!self.s.coreTopology.isConnected())
            process.nextTick(function() {
              throw err;
            });
        }
      };
    };

    // Set up listeners
    self.s.coreTopology.once('timeout', connectErrorHandler('timeout'));
    self.s.coreTopology.once('error', connectErrorHandler('error'));
    self.s.coreTopology.once('close', connectErrorHandler('close'));
    self.s.coreTopology.once('connect', connectHandler);

    // Start connection
    self.s.coreTopology.connect(_options);
  }

  close(forceClosed) {
    super.close(forceClosed);

    ['timeout', 'error', 'close', 'joined', 'left'].forEach(e => this.removeAllListeners(e));
  }
}

Object.defineProperty(ReplSet.prototype, 'haInterval', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.s.haInterval;
  }
});

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

/**
 * ReplSet open event, emitted when replicaset can start processing commands.
 *
 * @event ReplSet#open
 * @type {Replset}
 */

/**
 * ReplSet fullsetup event, emitted when all servers in the topology have been connected to.
 *
 * @event ReplSet#fullsetup
 * @type {Replset}
 */

/**
 * ReplSet close event
 *
 * @event ReplSet#close
 * @type {object}
 */

/**
 * ReplSet error event, emitted if there is an error listener.
 *
 * @event ReplSet#error
 * @type {MongoError}
 */

/**
 * ReplSet timeout event
 *
 * @event ReplSet#timeout
 * @type {object}
 */

/**
 * ReplSet parseError event
 *
 * @event ReplSet#parseError
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
