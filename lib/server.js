var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , CServer = require('mongodb-core').Server
  , Cursor = require('./cursor')
  , f = require('util').format
  , MongoError = require('mongodb-core').MongoError
  , MongoCR = require('mongodb-core').MongoCR
  , shallowClone = require('./utils').shallowClone;

var Server = function(host, port, options) {
  options = options || {};
  if(!(this instanceof Server)) return new Server(host, port, options);
  EventEmitter.call(this);

  // console.log("================================== LEGACY SERVER CREATE")
  // console.log("================================== LEGACY SERVER CREATE")
  // console.log("================================== LEGACY SERVER CREATE")
  // console.dir(host)
  // console.dir(port)
  // console.dir(options)

  var self = this;
  
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
  
  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true, get: function() { return server.lastIsMaster(); }
  });

  // Last ismaster
  Object.defineProperty(this, 'poolSize', {
    enumerable:true, get: function() { return server.connections().length; }
  });

  Object.defineProperty(this, 'autoReconnect', {
    enumerable:true, get: function() { return reconnect; }
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

    // // Bind the callback to the current domain
    // callback = bindToCurrentDomain(callback);

    // Error handler
    var connectErrorHandler = function(event) {
      return function(err) {
        ['timeout', 'error', 'close'].forEach(function(e) {
          server.removeListener(e, connectErrorHandler);
        });
      // console.log("============================== CONNECT ERR")

        server.removeListener('connect', connectErrorHandler);
         // Try to callback
        try {
          callback(err);
        } catch(err) { 
          // console.log("######################################")
          process.nextTick(function() { throw err; })
        }
      }
    }

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
      // console.log("============================== ERR")
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
      // console.log("============================== CONNECT")

      // Set up new ones
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

    // console.log("+############################################")
    // console.dir(_options)

    // Start connection
    server.connect(_options);
  }

  // /**
  //  * @ignore
  //  */
  // var bindToCurrentDomain = function(callback) {
  //   var domain = process.domain;
  //   if(domain == null || callback == null) {
  //     return callback;
  //   } else {
  //     return domain.bind(callback);
  //   }
  // }  

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

// The store of ops
var Store = function() {
  var storedOps = [];

  this.add = function(opType, ns, ops, options, force, max, sOptions, callback) {    
    if(force) return callback(new MongoError("db closed by application"));
    if(max == 0) return callback(new MongoError(f("no connection open to %s:%s", sOptions.host, sOptions.port)));
    if(max > 0 && storedOps.length > max) {
      while(storedOps.length > 0) {
        var op = storedOps.shift();
        op.c(new MongoError(f("no connection open to %s:%s", sOptions.host, sOptions.port)));
      }

      return;
    }

    // if(bufferMaxEntries == 0 && ) return callback(new MongoError(f("no connection open to %s:%s", sOptions.host, sOptions.port)))
    storedOps.push({t: opType, n: ns, o: ops, op: options, c: callback})
  }

  this.flush = function() {
    while(storedOps.length > 0) {
      var op = storedOps.shift();
      op.c(new MongoError(f("no connection open to %s:%s", sOptions.host, sOptions.port)));
    }
  }

  this.all = function() {
    return storedOps;
  }
}

// Server capabilities
var ServerCapabilities = function(ismaster) {
  var setup_get_property = function(object, name, value) {
    Object.defineProperty(object, name, {
        enumerable: true
      , get: function () { return value; }
    });  
  }

  // Capabilities
  var aggregationCursor = false;
  var writeCommands = false;
  var textSearch = false;
  var authCommands = false;
  var maxNumberOfDocsInBatch = ismaster.maxWriteBatchSize || 1000;

  if(ismaster.minWireVersion >= 0) {
    textSearch = true;
  }

  if(ismaster.maxWireVersion >= 1) {
    aggregationCursor = true;
    authCommands = true;
  }

  if(ismaster.maxWireVersion >= 2) {
    writeCommands = true;
  }

  // If no min or max wire version set to 0
  if(ismaster.minWireVersion == null) {
    ismaster.minWireVersion = 0;
  }

  if(ismaster.maxWireVersion == null) {
    ismaster.maxWireVersion = 0;
  }

  // Map up read only parameters
  setup_get_property(this, "hasAggregationCursor", aggregationCursor);
  setup_get_property(this, "hasWriteCommands", writeCommands);
  setup_get_property(this, "hasTextSearch", textSearch);
  setup_get_property(this, "hasAuthCommands", authCommands);
  setup_get_property(this, "minWireVersion", ismaster.minWireVersion);
  setup_get_property(this, "maxWireVersion", ismaster.maxWireVersion);
  setup_get_property(this, "maxNumberOfDocsInBatch", maxNumberOfDocsInBatch);
}

// Shared global store
var store = new Store();

module.exports = Server;