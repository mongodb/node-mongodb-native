var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , CServer = require('mongodb-core').Server
  , Cursor = require('./cursor')
  , f = require('util').format
  , ServerCapabilities = require('./topology_base').ServerCapabilities
  , Store = require('./topology_base').Store
  , MongoError = require('mongodb-core').MongoError
  , MongoCR = require('mongodb-core').MongoCR
  , shallowClone = require('./utils').shallowClone;

var Server = function(host, port, options) {
  options = options || {};
  if(!(this instanceof Server)) return new Server(host, port, options);
  EventEmitter.call(this);
  var self = this;

  // Shared global store
  var store = new Store();
  
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
  var emitError = typeof options.emitError == 'boolean' ? options.emitError : true;
  var poolSize = options.poolSize || 5;  

  // Socket options passed down
  if(options.socketOptions) {
    if(options.socketOptions.connectTimeoutMS)
      clonedOptions.connectionTimeout = options.socketOptions.connectTimeoutMS;
    if(options.socketOptions.socketTimeoutMS)
      clonedOptions.socketTimeout = options.socketOptions.socketTimeoutMS;
  } 

  // Add the cursor factory function
  clonedOptions.cursorFactory = Cursor;
  clonedOptions.reconnect = reconnect;
  clonedOptions.emitError = emitError;
  clonedOptions.size = poolSize;

  // Create an instance of a server instance from mongodb-core
  var server = new CServer(clonedOptions);
  // Default buffer max entries
  var bufferMaxEntries = -1;
  // Destroyed connection
  var force = false;
  // Server capabilities
  var sCapabilities = null;
  // Add auth providers
  server.addAuthProvider('mongocr', new MongoCR());
  
  // BSON property
  Object.defineProperty(this, 'bson', { 
    enumerable: true, get: function() { 
      return server.bson; 
    }
  });

  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true, get: function() { 
      return server.lastIsMaster(); 
    }
  });

  // Last ismaster
  Object.defineProperty(this, 'poolSize', {
    enumerable:true, get: function() { return server.connections().length; }
  });

  Object.defineProperty(this, 'autoReconnect', {
    enumerable:true, get: function() { return reconnect; }
  });

  Object.defineProperty(this, 'host', {
    enumerable:true, get: function() { return host; }
  });

  Object.defineProperty(this, 'port', {
    enumerable:true, get: function() { return port; }
  });

  this.parserType = function() {
    return server.parserType();
  }

  /**
   * @ignore
   */
  var bindToCurrentDomain = function(callback) {
    var domain = process.domain;
    if(domain == null || callback == null) return callback;
    return domain.bind(callback);
  }

  // Connect
  this.connect = function(db, _options, callback) {
    if('function' === typeof _options) callback = _options, _options = {};
    if(_options == null) _options = {};
    if(!('function' === typeof callback)) callback = null;
    options = _options;

    // Update bufferMaxEntries
    bufferMaxEntries = db.bufferMaxEntries;

    // Error handler
    var connectErrorHandler = function(event) {
      return function(err) {
        ['timeout', 'error', 'close'].forEach(function(e) {
          server.removeListener(e, connectErrorHandler);
        });

        server.removeListener('connect', connectErrorHandler);
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
      var ops = store.all();
      // Execute all stored ops
      while(ops.length > 0) {
        var op = ops.shift();
        self[op.t](op.n, op.o, op.op, op.c);
      }

      // Reconnect message
      self.emit('reconnect', self);
    }

    // Connect handler
    var connectHandler = function() {
      // Clear out all the current handlers left over
      ["timeout", "error", "close"].forEach(function(e) {
        server.removeAllListeners(e);
      });

      // Set up listeners
      server.once('timeout',  errorHandler('timeout'));
      server.once('error',  errorHandler('error'));
      server.once('close', errorHandler('close'));

      // Return correctly
      try {
        callback(null, self);
      } catch(err) { 
        process.nextTick(function() { throw err; })
      }      
    }

    // Set up listeners
    server.once('timeout',  connectErrorHandler('timeout'));
    server.once('error',  connectErrorHandler('error'));
    server.once('close', connectErrorHandler('close'));
    server.once('connect', connectHandler);
    // Reconnect server
    server.on('reconnect', reconnectHandler);

    // Start connection
    server.connect(_options);
  }

  // Server capabilities
  this.capabilities = function() {
    if(sCapabilities) return sCapabilities;
    sCapabilities = new ServerCapabilities(server.lastIsMaster());
    return sCapabilities;
  }

  // Command
  this.command = function(ns, cmd, options, callback) {
    server.command(ns, cmd, options, callback);
  }

  // Insert
  this.insert = function(ns, ops, options, callback) {
    if(!server.isConnected()) {
      // if(callback) callback = bindToCurrentDomain(callback);
      return store.add('insert', ns, ops, options, force, bufferMaxEntries, clonedOptions, callback);
    }
    server.insert(ns, ops, options, callback);
  }

  // Update
  this.update = function(ns, ops, options, callback) {
    if(!server.isConnected()) {
      // if(callback) callback = bindToCurrentDomain(callback);
      return store.add('update', ns, ops, options, force, bufferMaxEntries, clonedOptions, callback);
    }
    server.update(ns, ops, options, callback);
  }

  // Remove
  this.remove = function(ns, ops, options, callback) {
    if(!server.isConnected()) {
      // if(callback) callback = bindToCurrentDomain(callback);
      return store.add('remove', ns, ops, options, force, bufferMaxEntries, clonedOptions, callback);
    }
    server.remove(ns, ops, options, callback);
  }

  // IsConnected
  this.isConnected = function() {
    return server.isConnected();
  }

  // Insert
  this.cursor = function(ns, cmd, options) {
    return server.cursor(ns, cmd, options);
  }

  this.lastIsMaster = function() {
    return server.lastIsMaster();
  }

  this.close = function(forceClosed) {
    server.destroy();
    // We need to wash out all stored processes
    if(forceClosed == true) {
      force = forceClosed;
      store.flush();
    }
  }

  this.auth = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    server.auth.apply(server, args);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.connections = function() {
    return server.connections();
  }    
}

inherits(Server, EventEmitter);

module.exports = Server;