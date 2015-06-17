"use strict";

var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , CServer = require('mongodb-core').Server
  , Cursor = require('./cursor')
  , f = require('util').format
  , ServerCapabilities = require('./topology_base').ServerCapabilities
  , Store = require('./topology_base').Store
  , MongoError = require('mongodb-core').MongoError
  , shallowClone = require('./utils').shallowClone;

/**
 * @fileOverview The **Server** class is a class that represents a single server topology and is
 * used to construct connections.
 *
 * **Server Should not be used, use MongoClient.connect**
 * @example
 * var Db = require('mongodb').Db,
 *   Server = require('mongodb').Server,
 *   test = require('assert');
 * // Connect using single Server
 * var db = new Db('test', new Server('localhost', 27017););
 * db.open(function(err, db) {
 *   // Get an additional db
 *   db.close();
 * });
 */

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
 * @param {array} [options.sslCA=null] Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslCert=null] String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslKey=null] String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {(Buffer|string)} [options.sslPass=null] String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 * @param {object} [options.socketOptions=null] Socket options
 * @param {boolean} [options.socketOptions.autoReconnect=false] Reconnect on error.
 * @param {boolean} [options.socketOptions.noDelay=true] TCP Socket NoDelay option.
 * @param {number} [options.socketOptions.keepAlive=0] TCP KeepAlive on the socket with a X ms delay before start.
 * @param {number} [options.socketOptions.connectTimeoutMS=0] TCP Connection timeout setting
 * @param {number} [options.socketOptions.socketTimeoutMS=0] TCP Socket timeout setting
 * @param {number} [options.reconnectTries=30] Server attempt to reconnect #times
 * @param {number} [options.reconnectInterval=1000] Server will wait # milliseconds between retries
 * @fires Server#connect
 * @fires Server#close
 * @fires Server#error
 * @fires Server#timeout
 * @fires Server#parseError
 * @fires Server#reconnect
 * @return {Server} a Server instance.
 */
var Server = function(host, port, options) {
  options = options || {};
  if(!(this instanceof Server)) return new Server(host, port, options);
  EventEmitter.call(this);
  var self = this;

  // Store option defaults
  var storeOptions = {
      force: false
    , bufferMaxEntries: -1
  }

  // Shared global store
  var store = options.store || new Store(self, storeOptions);

  // Detect if we have a socket connection
  if(host.indexOf('\/') != -1) {
    if(port != null && typeof port == 'object') {
      options = port;
      port = null;
    }
  } else if(port == null) {
    throw new MongoError('port must be specified');
  }

  // Clone options
  var clonedOptions = shallowClone(options);
  clonedOptions.host = host;
  clonedOptions.port = port;

  // Reconnect
  var reconnect = typeof options.auto_reconnect == 'boolean' ? options.auto_reconnect : true;
  reconnect = typeof options.autoReconnect == 'boolean' ? options.autoReconnect : reconnect;
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : true;
  var poolSize = typeof options.poolSize == 'number' ? options.poolSize : 5;

  // Socket options passed down
  if(options.socketOptions) {
    if(options.socketOptions.connectTimeoutMS) {
      this.connectTimeoutMS = options.socketOptions.connectTimeoutMS;
      clonedOptions.connectionTimeout = options.socketOptions.connectTimeoutMS;
    }

    if(options.socketOptions.socketTimeoutMS) {
      clonedOptions.socketTimeout = options.socketOptions.socketTimeoutMS;
    }

    if(typeof options.socketOptions.keepAlive == 'number') {
      clonedOptions.keepAliveInitialDelay = options.socketOptions.keepAlive;
      clonedOptions.keepAlive = true;
    }

    if(typeof options.socketOptions.noDelay == 'boolean') {
      clonedOptions.noDelay = options.socketOptions.noDelay;
    }
  }

  // Add the cursor factory function
  clonedOptions.cursorFactory = Cursor;
  clonedOptions.reconnect = reconnect;
  clonedOptions.emitError = emitError;
  clonedOptions.size = poolSize;

  // Translate the options
  if(clonedOptions.sslCA) clonedOptions.ca = clonedOptions.sslCA;
  if(typeof clonedOptions.sslValidate == 'boolean') clonedOptions.rejectUnauthorized = clonedOptions.sslValidate;
  if(clonedOptions.sslKey) clonedOptions.key = clonedOptions.sslKey;
  if(clonedOptions.sslCert) clonedOptions.cert = clonedOptions.sslCert;
  if(clonedOptions.sslPass) clonedOptions.passphrase = clonedOptions.sslPass;

  // Add the non connection store
  clonedOptions.disconnectHandler = store;

  // Create an instance of a server instance from mongodb-core
  var server = new CServer(clonedOptions);
  // Server capabilities
  var sCapabilities = null;

  // Define the internal properties
  this.s = {
    // Create an instance of a server instance from mongodb-core
      server: server
    // Server capabilities
    , sCapabilities: null
    // Cloned options
    , clonedOptions: clonedOptions
    // Reconnect
    , reconnect: reconnect
    // Emit error
    , emitError: emitError
    // Pool size
    , poolSize: poolSize
    // Store Options
    , storeOptions: storeOptions
    // Store
    , store: store
    // Host
    , host: host
    // Port
    , port: port
    // Options
    , options: options
  }

  // BSON property
  Object.defineProperty(this, 'bson', {
    enumerable: true, get: function() {
      return self.s.server.bson;
    }
  });

  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true, get: function() {
      return self.s.server.lastIsMaster();
    }
  });

  // Last ismaster
  Object.defineProperty(this, 'poolSize', {
    enumerable:true, get: function() { return self.s.server.connections().length; }
  });

  Object.defineProperty(this, 'autoReconnect', {
    enumerable:true, get: function() { return self.s.reconnect; }
  });

  Object.defineProperty(this, 'host', {
    enumerable:true, get: function() { return self.s.host; }
  });

  Object.defineProperty(this, 'port', {
    enumerable:true, get: function() { return self.s.port; }
  });
}

inherits(Server, EventEmitter);

Server.prototype.parserType = function() {
  return this.s.server.parserType();
}

// Connect
Server.prototype.connect = function(db, _options, callback) {
  var self = this;
  if('function' === typeof _options) callback = _options, _options = {};
  if(_options == null) _options = {};
  if(!('function' === typeof callback)) callback = null;
  self.s.options = _options;

  // Update bufferMaxEntries
  self.s.storeOptions.bufferMaxEntries = db.bufferMaxEntries;

  // Error handler
  var connectErrorHandler = function(event) {
    return function(err) {
      // Remove all event handlers
      var events = ['timeout', 'error', 'close'];
      events.forEach(function(e) {
        self.s.server.removeListener(e, connectHandlers[e]);
      });

      self.s.server.removeListener('connect', connectErrorHandler);

      // Try to callback
      try {
        callback(err);
      } catch(err) {
        process.nextTick(function() { throw err; })
      }
    }
  }

  // Actual handler
  var errorHandler = function(event) {
    return function(err) {
      if(event != 'error') {
        self.emit(event, err);
      }
    }
  }

  // Error handler
  var reconnectHandler = function(err) {
    self.emit('reconnect', self);
    self.s.store.execute();
  }

  // Destroy called on topology, perform cleanup
  var destroyHandler = function() {
    self.s.store.flush();
  }

  // Connect handler
  var connectHandler = function() {
    // Clear out all the current handlers left over
    ["timeout", "error", "close"].forEach(function(e) {
      self.s.server.removeAllListeners(e);
    });

    // Set up listeners
    self.s.server.once('timeout', errorHandler('timeout'));
    self.s.server.once('error', errorHandler('error'));
    self.s.server.on('close', errorHandler('close'));
    // Only called on destroy
    self.s.server.once('destroy', destroyHandler);

    // Emit open event
    self.emit('open', null, self);

    // Return correctly
    try {
      callback(null, self);
    } catch(err) {
      process.nextTick(function() { throw err; })
    }
  }

  // Set up listeners
  var connectHandlers = {
    timeout: connectErrorHandler('timeout'),
    error: connectErrorHandler('error'),
    close: connectErrorHandler('close')
  };

  // Add the event handlers
  self.s.server.once('timeout', connectHandlers.timeout);
  self.s.server.once('error', connectHandlers.error);
  self.s.server.once('close', connectHandlers.close);
  self.s.server.once('connect', connectHandler);
  // Reconnect server
  self.s.server.on('reconnect', reconnectHandler);

  // Start connection
  self.s.server.connect(_options);
}

// Server capabilities
Server.prototype.capabilities = function() {
  if(this.s.sCapabilities) return this.s.sCapabilities;
  if(this.s.server.lastIsMaster() == null) throw new MongoError('cannot establish topology capabilities as driver is still in process of connecting');
  this.s.sCapabilities = new ServerCapabilities(this.s.server.lastIsMaster());
  return this.s.sCapabilities;
}

// Command
Server.prototype.command = function(ns, cmd, options, callback) {
  this.s.server.command(ns, cmd, options, callback);
}

// Insert
Server.prototype.insert = function(ns, ops, options, callback) {
  this.s.server.insert(ns, ops, options, callback);
}

// Update
Server.prototype.update = function(ns, ops, options, callback) {
  this.s.server.update(ns, ops, options, callback);
}

// Remove
Server.prototype.remove = function(ns, ops, options, callback) {
  this.s.server.remove(ns, ops, options, callback);
}

// IsConnected
Server.prototype.isConnected = function() {
  return this.s.server.isConnected();
}

// Insert
Server.prototype.cursor = function(ns, cmd, options) {
  options.disconnectHandler = this.s.store;
  return this.s.server.cursor(ns, cmd, options);
}

Server.prototype.setBSONParserType = function(type) {
  return this.s.server.setBSONParserType(type);
}

Server.prototype.lastIsMaster = function() {
  return this.s.server.lastIsMaster();
}

Server.prototype.close = function(forceClosed) {
  this.s.server.destroy();
  // We need to wash out all stored processes
  if(forceClosed == true) {
    this.s.storeOptions.force = forceClosed;
    this.s.store.flush();
  }
}

Server.prototype.auth = function() {
  var args = Array.prototype.slice.call(arguments, 0);
  this.s.server.auth.apply(this.s.server, args);
}

/**
 * All raw connections
 * @method
 * @return {array}
 */
Server.prototype.connections = function() {
  return this.s.server.connections();
}

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
