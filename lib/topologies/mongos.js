'use strict';

const TopologyBase = require('./topology_base').TopologyBase;
const MongoError = require('mongodb-core').MongoError;
const CMongos = require('mongodb-core').Mongos;
const Cursor = require('../cursor');
const Server = require('./server');
const Store = require('./topology_base').Store;
const MAX_JS_INT = require('../utils').MAX_JS_INT;
const translateOptions = require('../utils').translateOptions;
const filterOptions = require('../utils').filterOptions;
const mergeOptions = require('../utils').mergeOptions;

/**
 * @fileOverview The **Mongos** class is a class that represents a Mongos Proxy topology and is
 * used to construct connections.
 *
 * **Mongos Should not be used, use MongoClient.connect**
 */

// Allowed parameters
var legalOptionNames = [
  'ha',
  'haInterval',
  'acceptableLatencyMS',
  'poolSize',
  'ssl',
  'checkServerIdentity',
  'sslValidate',
  'sslCA',
  'sslCRL',
  'sslCert',
  'ciphers',
  'ecdhCurve',
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
  'loggerLevel',
  'logger',
  'reconnectTries',
  'appname',
  'domainsEnabled',
  'servername',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'promiseLibrary',
  'monitorCommands'
];

/**
 * Creates a new Mongos instance
 * @class
 * @deprecated
 * @param {Server[]} servers A seedlist of servers participating in the replicaset.
 * @param {object} [options] Optional settings.
 * @param {booelan} [options.ha=true] Turn on high availability monitoring.
 * @param {number} [options.haInterval=5000] Time between each replicaset status check.
 * @param {number} [options.poolSize=5] Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
 * @param {number} [options.acceptableLatencyMS=15] Cutoff latency point in MS for MongoS proxy selection
 * @param {boolean} [options.ssl=false] Use ssl connection (needs to have a mongod server with ssl support)
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {boolean} [options.sslValidate=true] Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCA] Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCRL] Array of revocation certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.ciphers] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {string} [options.ecdhCurve] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {(Buffer|string)} [options.sslCert] String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslKey] String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslPass] String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.servername] String containing the server name requested via TLS SNI.
 * @param {object} [options.socketOptions] Socket options
 * @param {boolean} [options.socketOptions.noDelay=true] TCP Socket NoDelay option.
 * @param {boolean} [options.socketOptions.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.socketOptions.keepAliveInitialDelay=30000] The number of milliseconds to wait before initiating keepAlive on the TCP socket
 * @param {number} [options.socketOptions.connectTimeoutMS=0] TCP Connection timeout setting
 * @param {number} [options.socketOptions.socketTimeoutMS=0] TCP Socket timeout setting
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @param {boolean} [options.monitorCommands=false] Enable command monitoring for this topology
 * @fires Mongos#connect
 * @fires Mongos#ha
 * @fires Mongos#joined
 * @fires Mongos#left
 * @fires Mongos#fullsetup
 * @fires Mongos#open
 * @fires Mongos#close
 * @fires Mongos#error
 * @fires Mongos#timeout
 * @fires Mongos#parseError
 * @fires Mongos#commandStarted
 * @fires Mongos#commandSucceeded
 * @fires Mongos#commandFailed
 * @property {string} parserType the parser type used (c++ or js).
 * @return {Mongos} a Mongos instance.
 */
class Mongos extends TopologyBase {
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

    // Get the reconnect option
    var reconnect = typeof options.auto_reconnect === 'boolean' ? options.auto_reconnect : true;
    reconnect = typeof options.autoReconnect === 'boolean' ? options.autoReconnect : reconnect;

    // Clone options
    var clonedOptions = mergeOptions(
      {},
      {
        disconnectHandler: store,
        cursorFactory: Cursor,
        reconnect: reconnect,
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

    // Internal state
    this.s = {
      // Create the Mongos
      coreTopology: new CMongos(seedlist, clonedOptions),
      // Server capabilities
      sCapabilities: null,
      // Debug turned on
      debug: clonedOptions.debug,
      // Store option defaults
      storeOptions: storeOptions,
      // Cloned options
      clonedOptions: clonedOptions,
      // Actual store of callbacks
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
  }

  // Connect
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

    // Error handler
    var connectErrorHandler = function() {
      return function(err) {
        // Remove all event handlers
        var events = ['timeout', 'error', 'close'];
        events.forEach(function(e) {
          self.removeListener(e, connectErrorHandler);
        });

        self.s.coreTopology.removeListener('connect', connectErrorHandler);
        // Force close the topology
        self.close(true);

        // Try to callback
        try {
          callback(err);
        } catch (err) {
          process.nextTick(function() {
            throw err;
          });
        }
      };
    };

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
        if (event !== 'error') {
          self.emit(event, err);
        }
      };
    };

    // Error handler
    var reconnectHandler = function() {
      self.emit('reconnect');
      self.s.store.execute();
    };

    // relay the event
    var relay = function(event) {
      return function(t, server) {
        self.emit(event, t, server);
      };
    };

    // Connect handler
    var connectHandler = function() {
      // Clear out all the current handlers left over
      var events = ['timeout', 'error', 'close', 'fullsetup'];
      events.forEach(function(e) {
        self.s.coreTopology.removeAllListeners(e);
      });

      // Set up listeners
      self.s.coreTopology.on('timeout', errorHandler('timeout'));
      self.s.coreTopology.on('error', errorHandler('error'));
      self.s.coreTopology.on('close', errorHandler('close'));

      // Set up serverConfig listeners
      self.s.coreTopology.on('fullsetup', function() {
        self.emit('fullsetup', self);
      });

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
      'commandFailed'
    ];
    events.forEach(function(e) {
      self.s.coreTopology.removeAllListeners(e);
    });

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

    // Set up listeners
    self.s.coreTopology.once('timeout', connectErrorHandler('timeout'));
    self.s.coreTopology.once('error', connectErrorHandler('error'));
    self.s.coreTopology.once('close', connectErrorHandler('close'));
    self.s.coreTopology.once('connect', connectHandler);
    // Join and leave events
    self.s.coreTopology.on('joined', relay('joined'));
    self.s.coreTopology.on('left', relay('left'));

    // Reconnect server
    self.s.coreTopology.on('reconnect', reconnectHandler);

    // Start connection
    self.s.coreTopology.connect(_options);
  }
}

Object.defineProperty(Mongos.prototype, 'haInterval', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.s.haInterval;
  }
});

/**
 * A mongos connect event, used to verify that the connection is up and running
 *
 * @event Mongos#connect
 * @type {Mongos}
 */

/**
 * The mongos high availability event
 *
 * @event Mongos#ha
 * @type {function}
 * @param {string} type The stage in the high availability event (start|end)
 * @param {boolean} data.norepeat This is a repeating high availability process or a single execution only
 * @param {number} data.id The id for this high availability request
 * @param {object} data.state An object containing the information about the current replicaset
 */

/**
 * A server member left the mongos set
 *
 * @event Mongos#left
 * @type {function}
 * @param {string} type The type of member that left (primary|secondary|arbiter)
 * @param {Server} server The server object that left
 */

/**
 * A server member joined the mongos set
 *
 * @event Mongos#joined
 * @type {function}
 * @param {string} type The type of member that joined (primary|secondary|arbiter)
 * @param {Server} server The server object that joined
 */

/**
 * Mongos fullsetup event, emitted when all proxies in the topology have been connected to.
 *
 * @event Mongos#fullsetup
 * @type {Mongos}
 */

/**
 * Mongos open event, emitted when mongos can start processing commands.
 *
 * @event Mongos#open
 * @type {Mongos}
 */

/**
 * Mongos close event
 *
 * @event Mongos#close
 * @type {object}
 */

/**
 * Mongos error event, emitted if there is an error listener.
 *
 * @event Mongos#error
 * @type {MongoError}
 */

/**
 * Mongos timeout event
 *
 * @event Mongos#timeout
 * @type {object}
 */

/**
 * Mongos parseError event
 *
 * @event Mongos#parseError
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
