'use strict';

var ServerCapabilities = require('./topology_base').ServerCapabilities,
  TopologyBase = require('./topology_base').TopologyBase,
  MongoError = require('mongodb-core').MongoError,
  CMongos = require('mongodb-core').Mongos,
  Cursor = require('../cursor'),
  AggregationCursor = require('../aggregation_cursor'),
  CommandCursor = require('../command_cursor'),
  Define = require('../metadata'),
  Server = require('./server'),
  Store = require('./topology_base').Store,
  MAX_JS_INT = require('../utils').MAX_JS_INT,
  translateOptions = require('../utils').translateOptions,
  filterOptions = require('../utils').filterOptions,
  mergeOptions = require('../utils').mergeOptions,
  assign = require('../utils').assign;

/**
 * @fileOverview The **Mongos** class is a class that represents a Mongos Proxy topology and is
 * used to construct connections.
 *
 * **Mongos Should not be used, use MongoClient.connect**
 * @example
 * var Db = require('mongodb').Db,
 *   Mongos = require('mongodb').Mongos,
 *   Server = require('mongodb').Server,
 *   test = require('assert');
 * // Connect using Mongos
 * var server = new Server('localhost', 27017);
 * var db = new Db('test', new Mongos([server]));
 * db.open(function(err, db) {
 *   // Get an additional db
 *   db.close();
 * });
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
  'promiseLibrary'
];

/**
 * Creates a new Mongos instance
 * @class
 * @deprecated
 * @param {Server[]} servers A seedlist of servers participating in the replicaset.
 * @param {object} [options=null] Optional settings.
 * @param {booelan} [options.ha=true] Turn on high availability monitoring.
 * @param {number} [options.haInterval=5000] Time between each replicaset status check.
 * @param {number} [options.poolSize=5] Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
 * @param {number} [options.acceptableLatencyMS=15] Cutoff latency point in MS for MongoS proxy selection
 * @param {boolean} [options.ssl=false] Use ssl connection (needs to have a mongod server with ssl support)
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {object} [options.sslValidate=true] Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCA=null] Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCRL=null] Array of revocation certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.ciphers=null] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {string} [options.ecdhCurve=null] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {(Buffer|string)} [options.sslCert=null] String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslKey=null] String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslPass=null] String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.servername=null] String containing the server name requested via TLS SNI.
 * @param {object} [options.socketOptions=null] Socket options
 * @param {boolean} [options.socketOptions.noDelay=true] TCP Socket NoDelay option.
 * @param {number} [options.socketOptions.keepAlive=0] TCP KeepAlive on the socket with a X ms delay before start.
 * @param {number} [options.socketOptions.connectTimeoutMS=0] TCP Connection timeout setting
 * @param {number} [options.socketOptions.socketTimeoutMS=0] TCP Socket timeout setting
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
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
        size: typeof options.poolSize === 'number' ? options.poolSize : 5
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
    if (typeof clonedOptions.keepAlive === 'number') {
      clonedOptions.keepAliveInitialDelay = clonedOptions.keepAlive;
      clonedOptions.keepAlive = clonedOptions.keepAlive > 0;
    }

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
      // Promise library
      promiseLibrary: options.promiseLibrary || Promise
    };
  }

  // Connect
  connect(db, _options, callback) {
    var self = this;
    if ('function' === typeof _options) (callback = _options), (_options = {});
    if (_options == null) _options = {};
    if (!('function' === typeof callback)) callback = null;
    _options = assign({}, this.s.clonedOptions, _options);
    self.s.options = _options;

    // Update bufferMaxEntries
    self.s.storeOptions.bufferMaxEntries = db.bufferMaxEntries;

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
      self.s.coreTopology.once('timeout', errorHandler('timeout'));
      self.s.coreTopology.once('error', errorHandler('error'));
      self.s.coreTopology.once('close', errorHandler('close'));

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
      'topologyDescriptionChanged'
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

const define = (Mongos.define = new Define('Mongos', Mongos, false));
define.classMethod('capabilities', {
  callback: false,
  promise: false,
  returns: [ServerCapabilities]
});

define.classMethod('command', { callback: true, promise: false });
define.classMethod('insert', { callback: true, promise: false });
define.classMethod('update', { callback: true, promise: false });
define.classMethod('remove', { callback: true, promise: false });
define.classMethod('isConnected', { callback: false, promise: false, returns: [Boolean] });
define.classMethod('isDestroyed', { callback: false, promise: false, returns: [Boolean] });
define.classMethod('cursor', {
  callback: false,
  promise: false,
  returns: [Cursor, AggregationCursor, CommandCursor]
});

define.classMethod('close', { callback: false, promise: false });
define.classMethod('auth', { callback: true, promise: false });
define.classMethod('logout', { callback: true, promise: false });
define.classMethod('connections', { callback: false, promise: false, returns: [Array] });

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

module.exports = Mongos;
