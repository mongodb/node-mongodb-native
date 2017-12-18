'use strict';

var CServer = require('mongodb-core').Server,
  Cursor = require('../cursor'),
  AggregationCursor = require('../aggregation_cursor'),
  CommandCursor = require('../command_cursor'),
  ServerCapabilities = require('./topology_base').ServerCapabilities,
  TopologyBase = require('./topology_base').TopologyBase,
  Store = require('./topology_base').Store,
  Define = require('../metadata'),
  MongoError = require('mongodb-core').MongoError,
  MAX_JS_INT = require('../utils').MAX_JS_INT,
  translateOptions = require('../utils').translateOptions,
  filterOptions = require('../utils').filterOptions,
  mergeOptions = require('../utils').mergeOptions;

/**
 * @fileOverview The **Server** class is a class that represents a single server topology and is
 * used to construct connections.
 *
 * **Server Should not be used, use MongoClient.connect**
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
  'family',
  'loggerLevel',
  'logger',
  'reconnectTries',
  'reconnectInterval',
  'monitoring',
  'appname',
  'domainsEnabled',
  'servername',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'compression',
  'promiseLibrary'
];

/**
 * Creates a new Server instance
 * @class
 * @deprecated
 * @param {string} host The host for the server, can be either an IP4, IP6 or domain socket style host.
 * @param {number} [port] The server port if IP4.
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.poolSize=5] Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
 * @param {boolean} [options.ssl=false] Use ssl connection (needs to have a mongod server with ssl support)
 * @param {object} [options.sslValidate=true] Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {array} [options.sslCA=null] Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {array} [options.sslCRL=null] Array of revocation certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslCert=null] String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.ciphers=null] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {string} [options.ecdhCurve=null] Passed directly through to tls.createSecureContext. See https://nodejs.org/dist/latest-v9.x/docs/api/tls.html#tls_tls_createsecurecontext_options for more info.
 * @param {(Buffer|string)} [options.sslKey=null] String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslPass=null] String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {string} [options.servername=null] String containing the server name requested via TLS SNI.
 * @param {object} [options.socketOptions=null] Socket options
 * @param {boolean} [options.socketOptions.autoReconnect=true] Reconnect on error.
 * @param {boolean} [options.socketOptions.noDelay=true] TCP Socket NoDelay option.
 * @param {boolean} [options.socketOptions.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.socketOptions.keepAliveInitialDelay=30000] The number of milliseconds to wait before initiating keepAlive on the TCP socket
 * @param {number} [options.socketOptions.connectTimeoutMS=0] TCP Connection timeout setting
 * @param {number} [options.socketOptions.socketTimeoutMS=0] TCP Socket timeout setting
 * @param {number} [options.reconnectTries=30] Server attempt to reconnect #times
 * @param {number} [options.reconnectInterval=1000] Server will wait # milliseconds between retries
 * @param {number} [options.monitoring=true] Triggers the server instance to call ismaster
 * @param {number} [options.haInterval=10000] The interval of calling ismaster when monitoring is enabled.
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @fires Server#connect
 * @fires Server#close
 * @fires Server#error
 * @fires Server#timeout
 * @fires Server#parseError
 * @fires Server#reconnect
 * @property {string} parserType the parser type used (c++ or js).
 * @return {Server} a Server instance.
 */
class Server extends TopologyBase {
  constructor(host, port, options) {
    super();
    var self = this;

    // Filter the options
    options = filterOptions(options, legalOptionNames);

    // Promise library
    const promiseLibrary = options.promiseLibrary;

    // Stored options
    var storeOptions = {
      force: false,
      bufferMaxEntries:
        typeof options.bufferMaxEntries === 'number' ? options.bufferMaxEntries : MAX_JS_INT
    };

    // Shared global store
    var store = options.store || new Store(self, storeOptions);

    // Detect if we have a socket connection
    if (host.indexOf('/') !== -1) {
      if (port != null && typeof port === 'object') {
        options = port;
        port = null;
      }
    } else if (port == null) {
      throw MongoError.create({ message: 'port must be specified', driver: true });
    }

    // Get the reconnect option
    var reconnect = typeof options.auto_reconnect === 'boolean' ? options.auto_reconnect : true;
    reconnect = typeof options.autoReconnect === 'boolean' ? options.autoReconnect : reconnect;

    // Clone options
    var clonedOptions = mergeOptions(
      {},
      {
        host: host,
        port: port,
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

    // Build default client information
    clonedOptions.clientInfo = this.clientInfo;
    // Do we have an application specific string
    if (options.appname) {
      clonedOptions.clientInfo.application = { name: options.appname };
    }

    // Define the internal properties
    this.s = {
      // Create an instance of a server instance from mongodb-core
      coreTopology: new CServer(clonedOptions),
      // Server capabilities
      sCapabilities: null,
      // Cloned options
      clonedOptions: clonedOptions,
      // Reconnect
      reconnect: clonedOptions.reconnect,
      // Emit error
      emitError: clonedOptions.emitError,
      // Pool size
      poolSize: clonedOptions.size,
      // Store Options
      storeOptions: storeOptions,
      // Store
      store: store,
      // Host
      host: host,
      // Port
      port: port,
      // Options
      options: options,
      // Server Session Pool
      sessionPool: null,
      // Promise library
      promiseLibrary: promiseLibrary || Promise
    };
  }

  // Connect
  connect(_options, callback) {
    var self = this;
    if ('function' === typeof _options) (callback = _options), (_options = {});
    if (_options == null) _options = this.s.clonedOptions;
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
          self.s.coreTopology.removeListener(e, connectHandlers[e]);
        });

        self.s.coreTopology.removeListener('connect', connectErrorHandler);

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
      self.emit('reconnect', self);
      self.s.store.execute();
    };

    // Reconnect failed
    var reconnectFailedHandler = function(err) {
      self.emit('reconnectFailed', err);
      self.s.store.flush(err);
    };

    // Destroy called on topology, perform cleanup
    var destroyHandler = function() {
      self.s.store.flush();
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
      ['timeout', 'error', 'close', 'destroy'].forEach(function(e) {
        self.s.coreTopology.removeAllListeners(e);
      });

      // Set up listeners
      self.s.coreTopology.on('timeout', errorHandler('timeout'));
      self.s.coreTopology.once('error', errorHandler('error'));
      self.s.coreTopology.on('close', errorHandler('close'));
      // Only called on destroy
      self.s.coreTopology.on('destroy', destroyHandler);

      // Emit open event
      self.emit('open', null, self);

      // Return correctly
      try {
        callback(null, self);
      } catch (err) {
        console.log(err.stack);
        process.nextTick(function() {
          throw err;
        });
      }
    };

    // Set up listeners
    var connectHandlers = {
      timeout: connectErrorHandler('timeout'),
      error: connectErrorHandler('error'),
      close: connectErrorHandler('close')
    };

    // Clear out all the current handlers left over
    [
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
    ].forEach(function(e) {
      self.s.coreTopology.removeAllListeners(e);
    });

    // Add the event handlers
    self.s.coreTopology.once('timeout', connectHandlers.timeout);
    self.s.coreTopology.once('error', connectHandlers.error);
    self.s.coreTopology.once('close', connectHandlers.close);
    self.s.coreTopology.once('connect', connectHandler);
    // Reconnect server
    self.s.coreTopology.on('reconnect', reconnectHandler);
    self.s.coreTopology.on('reconnectFailed', reconnectFailedHandler);

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
    self.s.coreTopology.on('attemptReconnect', relay('attemptReconnect'));
    self.s.coreTopology.on('monitoring', relay('monitoring'));

    // Start connection
    self.s.coreTopology.connect(_options);
  }
}

Object.defineProperty(Server.prototype, 'poolSize', {
  enumerable: true,
  get: function() {
    return this.s.coreTopology.connections().length;
  }
});

Object.defineProperty(Server.prototype, 'autoReconnect', {
  enumerable: true,
  get: function() {
    return this.s.reconnect;
  }
});

Object.defineProperty(Server.prototype, 'host', {
  enumerable: true,
  get: function() {
    return this.s.host;
  }
});

Object.defineProperty(Server.prototype, 'port', {
  enumerable: true,
  get: function() {
    return this.s.port;
  }
});

const define = (Server.define = new Define('Server', Server, false));
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
 * Server connect event
 *
 * @event Server#connect
 * @type {object}
 */

/**
 * Server close event
 *
 * @event Server#close
 * @type {object}
 */

/**
 * Server reconnect event
 *
 * @event Server#reconnect
 * @type {object}
 */

/**
 * Server error event
 *
 * @event Server#error
 * @type {MongoError}
 */

/**
 * Server timeout event
 *
 * @event Server#timeout
 * @type {object}
 */

/**
 * Server parseError event
 *
 * @event Server#parseError
 * @type {object}
 */

module.exports = Server;
