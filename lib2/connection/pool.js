// "use strict";

var inherits = require('util').inherits,
  EventEmitter = require('events').EventEmitter,
  Connection = require('./connection'),
  MongoError = require('../error'),
  Logger = require('./logger'),
  f = require('util').format,
  Query = require('./commands').Query,
  CommandResult = require('./command_result');

var MongoCR = require('../auth/mongocr')
  , X509 = require('../auth/x509')
  , Plain = require('../auth/plain')
  , GSSAPI = require('../auth/gssapi')
  , SSPI = require('../auth/sspi')
  , ScramSHA1 = require('../auth/scram');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYING = 'destroying';
var DESTROYED = 'destroyed';

var _id = 0;

var Pool = function(options) {
  var self = this;
  // Add event listener
  EventEmitter.call(this);
  // Add the options
  this.options = Object.assign({
    // Host and port settings
    host: 'localhost',
    port: 27017,
    // Pool default max size
    size: 5,
    // socket settings
    connectionTimeout: 30000,
    socketTimeout: 30000,
    keepAlive: true,
    keepAliveInitialDelay: 0,
    noDelay: true,
    // SSL Settings
    ssl: false, checkServerIdentity: false,
    ca: null, cert: null, key: null, passPhrase: null,
    rejectUnauthorized: false,
    promoteLongs: true,
    // Reconnection options
    reconnect: true,
    reconnectInterval: 1000,
    reconnectTries: 30
  }, options);

  // Identification information
  this.id = _id++;
  // console.log("=========== new Pool :: " + this.options.reconnect + " ::" + this.id)
  // Current reconnect retries
  this.retriesLeft = this.options.reconnectTries;
  this.reconnectId = null;
  // No bson parser passed in
  if(!options.bson || (options.bson
    && (typeof options.bson.serialize != 'function' || typeof options.bson.deserialize != 'function'))) throw new Error("must pass in valid bson parser");
  // Logger instance
  this.logger = Logger('Pool', options);
  // Pool state
  this.state = DISCONNECTED;
  // Connections
  this.availableConnections = [];
  this.inUseConnections = [];
  this.connectingConnections = [];
  // Currently executing
  this.executing = false;
  // Operation work queue
  this.queue = [];
  // console.log("=========== determine authProviders")
  // console.log(" == options.authProviders :: " + (options.authProviders != null))

  // All the authProviders
  this.authProviders = options.authProviders || {
      'mongocr': new MongoCR(options.bson), 'x509': new X509(options.bson)
    , 'plain': new Plain(options.bson), 'gssapi': new GSSAPI(options.bson)
    , 'sspi': new SSPI(options.bson), 'scram-sha-1': new ScramSHA1(options.bson)
  }
  // Are we currently authenticating
  this.authenticating = false;
  this.loggingout = false;
  this.nonAuthenticatedConnections = [];
  this.authenticatingTimestamp = null;
}

inherits(Pool, EventEmitter);

Object.defineProperty(Pool.prototype, 'size', {
  enumerable:true,
  get: function() { return this.options.size; }
});

Object.defineProperty(Pool.prototype, 'connectionTimeout', {
  enumerable:true,
  get: function() { return this.options.connectionTimeout; }
});

Object.defineProperty(Pool.prototype, 'socketTimeout', {
  enumerable:true,
  get: function() { return this.options.socketTimeout; }
});

function stateTransition(self, newState) {
  var legalTransitions = {
    'disconnected': [CONNECTING, DESTROYING, DISCONNECTED],
    'connecting': [CONNECTING, DESTROYING, CONNECTED, DISCONNECTED],
    'connected': [CONNECTED, DISCONNECTED, DESTROYING],
    'destroying': [DESTROYING, DESTROYED],
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

function authenticate(pool, auth, connection, cb) {
  if(auth[0] === undefined) return cb(null);
  // We need to authenticate the server
  var mechanism = auth[0];
  var db = auth[1];
  // Validate if the mechanism exists
  if(!pool.authProviders[mechanism]) {
    throw new MongoError(f('authMechanism %s not supported', mechanism));
  }

  // Get the provider
  var provider = pool.authProviders[mechanism];

  // Authenticate using the provided mechanism
  provider.auth.apply(provider, [write(pool), [connection], db].concat(auth.slice(2)).concat([cb]));
}

// The write function used by the authentication mechanism (bypasses external)
function write(self) {
  return function(connection, buffer, callback) {
    // Ensure we stop auth if pool was destroyed
    if(self.state == DESTROYED || self.state == DESTROYING) {
      return callback(new MongoError('pool destroyed'));
    }
    // Set the connection workItem callback
    connection.workItem = {cb: callback, command: true};
    // Write the buffer out to the connection
    connection.write(buffer);
  };
}


function reauthenticate(pool, connection, cb) {
  // Authenticate
  function authenticateAgainstProvider(pool, connection, providers, cb) {
    // Finished re-authenticating against providers
    if(providers.length == 0) return cb();
    // Get the provider name
    var provider = pool.authProviders[providers.pop()];

    // Auth provider
    provider.reauthenticate(write(pool), [connection], function(err, r) {
      // We got an error return immediately
      if(err) return cb(err);
      // Continue authenticating the connection
      authenticateAgainstProvider(pool, connection, providers, cb);
    });
  }

  // Start re-authenticating process
  authenticateAgainstProvider(pool, connection, Object.keys(pool.authProviders), cb);
}

function connectionFailureHandler(self, event) {
  return function(err) {
    // console.log("=== connectionFailureHandler :: " + event + " :: 0 " + " ::" + this.id + " :: " + (this.workItem != null))
    // console.log(this.workItem)
    // console.dir(err)
    removeConnection(self, this);
    // console.log("=== connectionFailureHandler :: " + event + " :: 1")
    // console.dir(this.workItem)

    // Flush out the callback if there is one
    if(this.workItem && this.workItem.cb) {
      var workItem = this.workItem;
      this.workItem = null;
      // console.log("==== connectionFailureHandler :: " + this.id)
      // console.log("=== connectionFailureHandler :: " + event + " :: 2")
      // console.log(this.workItem.cb.toString())
      workItem.cb(err);
    }
    // console.log("=== connectionFailureHandler :: " + event + " :: 3")

    // No more socket available propegate the event
    if(self.socketCount() == 0) {
      if(self.state != DESTROYED) {
        stateTransition(self, DISCONNECTED);
      }

      // Do not emit error events, they are always close events
      // do not trigger the low level error handler in node
      event = event == 'error' ? 'close' : event;
      self.emit(event, err);
    }

    // Start reconnection attempts
    if(!self.reconnectId && self.options.reconnect) {
      self.reconnectId = setTimeout(attemptReconnect(self), self.options.reconnectInterval);
    }
  };
}

function attemptReconnect(self) {
  return function() {
    // console.log("==== attemptReconnect start :: " + self.state + " :: " + self.id)
    self.emit('attemptReconnect', self);
    // console.log(self.availableConnections.concat(self.inUseConnections.concat(self.connectingConnections)).map(function(x) {
    //   return x.id
    // }))
    if(self.state == DESTROYED) return;

    // We are connected do not try again
    if(self.isConnected()) {
      self.reconnectId = null;
      return;
    }

    // If we have failure schedule a retry
    function _connectionFailureHandler(self, event) {
      return function() {
        self.retriesLeft = self.retriesLeft - 1;
        // How many retries are left
        if(self.retriesLeft == 0) {
          // Destroy the instance
          self.destroy();
          // Emit close event
          self.emit('reconnectFailed'
            , new MongoError(f('failed to reconnect after %s attempts with interval %s ms', self.options.reconnectTries, self.options.reconnectInterval)));
        } else {
          // console.log("==== attemptReconnect :: retry")
          self.reconnectId = setTimeout(attemptReconnect(self), self.options.reconnectInterval);
        }
      }
    }

    // Got a connect handler
    function _connectHandler(self) {
      return function() {
        // console.log("==== asttemptReconnect :: connect :: " + this.id)
        // Assign
        var connection = this;

        // Pool destroyed stop the connection
        if(self.state == DESTROYED) {
          return connection.destroy();
        }

        // Clear out all handlers
        handlers.forEach(function(event) {
          connection.removeAllListeners(event);
        });

        // Reset reconnect id
        self.reconnectId = null;

        // Apply pool connection handlers
        connection.on('error', connectionFailureHandler(self, 'error'));
        connection.on('close', connectionFailureHandler(self, 'close'));
        connection.on('timeout', connectionFailureHandler(self, 'timeout'));
        connection.on('parseError', connectionFailureHandler(self, 'parseError'));

        // Apply any auth to the connection
        reauthenticate(self, this, function(err) {
          // Reset retries
          self.retriesLeft = self.options.reconnectTries;
          // Push to available connections
          self.availableConnections.push(connection);
          // Emit reconnect event
          self.emit('reconnect', self);
          // console.log(self.availableConnections.concat(self.inUseConnections.concat(self.connectingConnections)).map(function(x) {
          //   return x.id
          // }))
          // console.log("==== asttemptReconnect :: connect :: 2 :: " + connection.id)
          // console.log("  queue.length = " + self.queue.length)
          // Trigger execute to start everything up again
          _execute(self)();
        });
      }
    }

    // Create a connection
    // console.log("attemptReconnect :: " + new Date())
    // console.log("--- pool create new connection 2 :: " + self.id)
    var connection = new Connection(messageHandler(self), self.options);
    // Add handlers
    connection.on('close', _connectionFailureHandler(self, 'close'));
    connection.on('error', _connectionFailureHandler(self, 'error'));
    connection.on('timeout', _connectionFailureHandler(self, 'timeout'));
    connection.on('parseError', _connectionFailureHandler(self, 'parseError'));
    // On connection
    connection.on('connect', _connectHandler(self));
    // Attempt connection
    connection.connect();
  }
}

function moveConnectionBetween(connection, from, to) {
  var index = from.indexOf(connection);
  // Move the connection from connecting to available
  if(index != -1) {
    from.splice(index, 1);
    to.push(connection);
  }
}

function messageHandler(self) {
  return function(message, connection) {
    // console.log("==== messageHandler :: " + connection.id)
    // Get the callback
    var workItem = connection.workItem;

    // Reset the connection timeout if we modified it for
    // this operation
    if(workItem.socketTimeout) {
      connection.resetSocketTimeout();
    }

    function authenticateStragglers(self, connection, callback) {
      // console.log("!!! authenticateStragglers 0")
      // Get any non authenticated connections
      var connections = self.nonAuthenticatedConnections.slice(0);
      var nonAuthenticatedConnections = self.nonAuthenticatedConnections;
      self.nonAuthenticatedConnections = [];

      // Establish if the connection need to be authenticated
      // Add to authentication list if
      // 1. we were in an authentication process when the operation was executed
      // 2. our current authentication timestamp is from the workItem one, meaning an auth has happened
      if(connection.workItem.authenticating == true
        || (typeof connection.workItem.authenticatingTimestamp == 'number' && connection.workItem.authenticatingTimestamp != self.authenticatingTimestamp)) {
          // console.log("!!! authenticateStragglers 0:1")
          // console.log(connection.workItem.authenticating)
          // console.log(connection.workItem.authenticatingTimestamp)
          // console.log(self.authenticatingTimestamp)

        // Add connection to the list
        connections.push(connection);
      }

      // Clear out workItem
      connection.workItem = null;

      // No connections need to be re-authenticated
      if(connections.length == 0) {
        // Release the connection back to the pool
        moveConnectionBetween(connection, self.inUseConnections, self.availableConnections);
        // console.log("=============== authenticateStragglers")
        // console.log("  self.inUseConnections = " + self.inUseConnections.length)
        // console.log("  self.availableConnections = " + self.availableConnections.length)
        // Finish
        return callback();
      }

      // Apply re-authentication to all connections before releasing back to pool
      var connectionCount = connections.length;
      // Authenticate all connections
      for(var i = 0; i < connectionCount; i++) {
        // console.log("  !!! authenticateStragglers 0")
        reauthenticate(self, connections[i], function(err) {
          // console.log("  !!! authenticateStragglers 1")
          connectionCount = connectionCount - 1;

          if(connectionCount == 0) {
            // console.log("  !!! authenticateStragglers 2")
            // Put non authenticated connections in available connections
            self.availableConnections = self.availableConnections.concat(nonAuthenticatedConnections);
            // Release the connection back to the pool
            moveConnectionBetween(connection, self.inUseConnections, self.availableConnections);
            // Return
            callback();
          }
        });
      }
    }

    authenticateStragglers(self, connection, function(err) {
      // Keep executing, ensure current message handler does not stop execution
      process.nextTick(function() {
        _execute(self)();
      });

      // Time to dispatch the message if we have a callback
      if(!workItem.immediateRelease) {
        try {
          // Parse the message according to the provided options
          message.parse(workItem);
          // console.log("=================================== messageHandler")
          // console.dir(workItem)
        } catch(err) {
          return workItem.cb(MongoError.create(err));
        }

        // if(global.debug){
          // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! messageHandler :: " + connection.id)
        //   // console.dir(connection.workItem == null)
        //   // console.dir(workItem.command)
        //   // console.dir(err)
          // console.dir(message.documents)
        // }

        // Establish if we have an error
        if(workItem.command && message.documents[0] && (message.documents[0].ok == 0 || message.documents[0]['$err']
        || message.documents[0]['errmsg'] || message.documents[0]['code'])) {
          // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! messageHandler :: " + connection.id + " :: 0")
          return workItem.cb(MongoError.create(message.documents[0]));
        }

        // console.log("-------- 0")
        // console.dir(message.documents)

        // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! messageHandler :: " + connection.id + " :: 1")
        // console.log(workItem.cb.toString())
        // Return the documents
        workItem.cb(null, new CommandResult(message.documents[0], connection, message));
      }
    });
  }
}

Pool.prototype.socketCount = function() {
  return this.availableConnections.length
    + this.inUseConnections.length
    + this.connectingConnections.length;
}

Pool.prototype.allConnections = function() {
  return this.availableConnections
    .concat(this.inUseConnections)
    .concat(this.connectingConnections);
}

Pool.prototype.get = function() {
  return this.allConnections()[0];
}

Pool.prototype.isConnected = function() {
  // We are in a destroyed state
  if(this.state == DESTROYED || this.state == 'DESTROYING') {
    return false;
  }

  // Get connections
  var connections = this.availableConnections
    .concat(this.inUseConnections)
    .concat(this.connectingConnections);
  for(var i = 0; i < connections.length; i++) {
    if(connections[i].isConnected()) return true;
  }

  // Might be authenticating, but we are still connected
  if(connections.length == 0 && this.authenticating) {
    return true
  }

  // Not connected
  return false;
}

Pool.prototype.isDestroyed = function() {
  return this.state == DESTROYED;
}

Pool.prototype.isDisconnected = function() {
  return this.state == DISCONNECTED;
}

Pool.prototype.connect = function(auth) {
  if(this.state != DISCONNECTED) throw new MongoError('connection in unlawful state ' + this.state);
  // console.log("++ Pool.connect :: " + this.id)
  var self = this;
  // Transition to connecting state
  stateTransition(this, CONNECTING);
  // Create an array of the arguments
  var args = Array.prototype.slice.call(arguments, 0);
  // Create a connection
  // console.log('connect')
  // console.log("--- pool create new connection 0 :: " + this.id)
  var connection = new Connection(messageHandler(self), this.options);
  // Add to list of connections
  this.connectingConnections.push(connection);
  // Add listeners to the connection
  connection.once('connect', function(connection) {
    if(self.state == DESTROYED) return self.destroy();
    // Authenticate
    authenticate(self, args, connection, function(err) {
      if(self.state == DESTROYED) return self.destroy();

      // We have an error emit it
      if(err) {
        // Destroy the pool
        self.destroy();
        // Emit the error
        return self.emit('error', err);
      }
      // Set connected mode
      stateTransition(self, CONNECTED);

      // Move the active connection
      moveConnectionBetween(connection, self.connectingConnections, self.availableConnections);

      // Emit the connect event
      self.emit('connect', self);
    });
  });

  // Add error handlers
  connection.once('error', connectionFailureHandler(this, 'error'));
  connection.once('close', connectionFailureHandler(this, 'close'));
  connection.once('timeout', connectionFailureHandler(this, 'timeout'));
  connection.once('parseError', connectionFailureHandler(this, 'parseError'));
  // Initite connection
  connection.connect();
}

// /**
//  * Reauthenticates the pool using the current provider credentials
//  * @method
//  * @param {authResultCallback} callback A callback function
//  */
// Pool.prototype.reauthenticate = function(cb) {
//   // Finished re-authenticating against providers
//   if(providers.length == 0) return cb();
//   // Get the provider name
//   var provider = pool.authProviders[providers.pop()];
//
//   // Auth provider
//   provider.reauthenticate(write(pool), [connection], function(err, r) {
//     // We got an error return immediately
//     if(err) return cb(err);
//     // Continue authenticating the connection
//     authenticateAgainstProvider(pool, connection, providers, cb);
//   });
// }

/**
 * Authenticate using a specified mechanism
 * @method
 * @param {string} mechanism The Auth mechanism we are invoking
 * @param {string} db The db we are invoking the mechanism against
 * @param {...object} param Parameters for the specific mechanism
 * @param {authResultCallback} callback A callback function
 */
Pool.prototype.auth = function(mechanism, db) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  var callback = args.pop();
  // If we are not connected don't allow additonal authentications to happen
  if(this.state != CONNECTED) throw new MongoError('connection in unlawful state ' + this.state);

  // If we don't have the mechanism fail
  if(self.authProviders[mechanism] == null && mechanism != 'default') {
    throw new MongoError(f("auth provider %s does not exist", mechanism));
  }

  // Signal that we are authenticating a new set of credentials
  this.authenticating = true;
  this.authenticatingTimestamp = new Date().getTime();

  // Authenticate all live connections
  function authenticateLiveConnections(self, args, cb) {
    // console.log("===================== authenticateLiveConnections 0")
    // Get the current viable connections
    var connections = self.availableConnections;
    // Allow nothing else to use the connections while we authenticate them
    self.availableConnections = [];

    var connectionsCount = connections.length;
    var error = null;
    // No connections available, return
    if(connectionsCount == 0) return callback(null);
    // console.log("===================== authenticateLiveConnections 1 :: " + connectionsCount)
    // Authenticate the connections
    for(var i = 0; i < connections.length; i++) {
      // console.log("===================== authenticateLiveConnections 2");
      authenticate(self, args, connections[i], function(err) {
        // console.log("===================== authenticateLiveConnections 3");
        connectionsCount = connectionsCount - 1;

        // Store the error
        if(err) error = err;

        // Processed all connections
        if(connectionsCount == 0) {
          // Auth finished
          self.authenticating = false;
          // Add the connections back to available connections
          self.availableConnections = self.availableConnections.concat(connections);
          // We had an error, return it
          if(error) return cb(error);
          cb(null);
        }
      });
    }
  }

  // Wait for a logout in process to happen
  function waitForLogout(self, cb) {
    if(!self.loggingout) return cb();
    setTimeout(function() {
      waitForLogout(self, cb);
    }, 1)
  }

  // console.log("$$$$$$$$$$$ Pool auth 0")
  // Wait for loggout to finish
  waitForLogout(self, function() {
    // console.log("$$$$$$$$$$$ Pool auth 1")
    // Authenticate all live connections
    authenticateLiveConnections(self, args, function(err) {
      // console.log("$$$$$$$$$$$ Pool auth 2")
      // console.dir(err)
      // Credentials correctly stored in auth provider if successful
      // Any new connections will now reauthenticate correctly
      self.authenticating = false;
      // Return after authentication connections
      callback(err);
      // // Authenticate all straggler connections
      // authenticateStragglerConnections(self, args, function(_err) {
      //   callback(_err || err);
      // });
    });
  });
}

Pool.prototype.logout = function(dbName, callback) {
  var self = this;
  if(typeof dbName != 'string') throw new MongoError('logout method requires a db name as first argument');
  if(typeof callback != 'function') throw new MongoError('logout method requires a callback');

  // Indicate logout in process
  this.loggingout = true;

  // Get all relevant connections
  var connections = self.availableConnections.concat(self.inUseConnections);
  var count = connections.length;
  // Store any error
  var error = null;
  // console.log("=========== logout how many connections :: " + count)
  // console.log(" self.availableConnections = " + self.availableConnections.length)
  // console.log(" self.inUseConnections = " + self.inUseConnections.length)
  // console.log(" self.nonAuthenticatedConnections = " + self.nonAuthenticatedConnections.length)
  // console.log(" self.connectingConnections = " + self.connectingConnections.length)

  // Send logout command over all the connections
  for(var i = 0; i < connections.length; i++) {
    var query = new Query(this.options.bson
      , f('%s.$cmd', dbName)
      , {logout:1}, {numberToSkip: 0, numberToReturn: 1});
      // console.log("### 0")
    write(self)(connections[i], query.toBin(), function(err, r) {
      // console.log("### 1")
      count = count - 1;
      if(err) error = err;

      if(count == 0) {
        self.loggingout = false;
        callback(error);
      };
    });
  }
}

/**
 * Unref the pool
 * @method
 */
Pool.prototype.unref = function() {
  // console.log("========== pool unref 0")
  // Get all the known connections
  var connections = this.availableConnections
    .concat(this.inUseConnections)
    .concat(this.connectingConnections);
    // console.log("========== pool unref 1")
  connections.forEach(function(c) {
    c.unref();
  });
  // console.log("========== pool unref 2")
}

// Events
var events = ['error', 'close', 'timeout', 'parseError', 'connect'];

Pool.prototype.destroy = function() {
  // console.log("destroy =========================== 0")
  var self = this;
  // Do not try again if the pool is already dead
  if(this.state == DESTROYED) return;
  // Set state to destroyed
  stateTransition(this, DESTROYING);

  // console.log("destroy =========================== 1")
  // Wait for the operations to drain before we close the pool
  function checkStatus() {
    // console.log("========= destroy :: checkStatus 0")
    if(self.queue.length == 0) {
      // console.log("========= destroy :: checkStatus 1:0")
      // Get all the known connections
      var connections = self.availableConnections
        .concat(self.inUseConnections)
        .concat(self.connectingConnections);

      // Check if we have any in flight operations
      for(var i = 0; i < connections.length; i++) {
        // There is an operation still in flight, reschedule a
        // check waiting for it to drain
        if(connections[i].workItem) {
          return setTimeout(checkStatus, 1);
        }
      }

      // console.log("========= destroy :: checkStatus 1:1")

      // Destroy all connections
      connections.forEach(function(c) {
        // Remove all listeners
        for(var i = 0; i < events.length; i++) {
          c.removeAllListeners(events[i]);
        }
        // Destroy connection
        c.destroy();
      });

      // console.log("========= destroy :: checkStatus 1:2")

      // Zero out all connections
      self.inUseConnections = [];
      self.availableConnections = [];
      self.nonAuthenticatedConnections = [];
      self.connectingConnections = [];

      // console.log("========= destroy :: checkStatus 1:3")

      // Set state to destroyed
      stateTransition(self, DESTROYED);
    } else {
      // console.log("========= destroy :: checkStatus 2")
      setTimeout(checkStatus, 1);
    }
  }

  // Initiate drain of operations
  checkStatus();
}

/**
 * Write a message to MongoDB
 * @method
 * @return {Connection}
 */
Pool.prototype.write = function(buffer, options, cb) {
  // Ensure we have a callback
  if(typeof options == 'function') {
    cb = options;
  }

  // Always have options
  options = options || {};

  // console.log("======== Pool:write :: " + this.state)
  // console.dir(options)
  // console.dir(cb)

  // Pool was destroyed error out
  if(this.state == DESTROYED || this.state == DESTROYING) {
    // Callback with an error
    if(cb) cb(new MongoError('pool destroyed'));
    return;
  }

  // Do we have an operation
  var operation = {
    buffer:buffer, cb: cb, raw: false, promoteLongs: true
  };

  // Set the options for the parsing
  operation.promoteLongs = typeof options.promoteLongs == 'boolean' ? options.promoteLongs : true;
  operation.raw = typeof options.raw == 'boolean' ? options.raw : false;
  operation.immediateRelease = typeof options.immediateRelease == 'boolean' ? options.immediateRelease : false;
  operation.documentsReturnedIn = options.documentsReturnedIn;
  operation.command = typeof options.command == 'boolean' ? options.command : false;
  // Optional per operation socketTimeout
  operation.socketTimeout = options.socketTimeout;
  operation.monitoring = options.monitoring;

  // We need to have a callback function unless the message returns no response
  if(!(typeof cb == 'function') && !options.noResponse) {
    throw new MongoError('write method must provide a callback');
  }

  // console.log("======== Pool:write")
  // console.dir(operation)
  // console.dir(cb)

  // If we have a monitoring operation schedule as the very first operation
  // Otherwise add to back of queue
  if(options.monitoring) {
    this.queue.unshift(operation);
  } else {
    this.queue.push(operation);
  }
  // console.log("========= write")
  // Attempt to write all buffers out

  // Attempt to execute the operation
  _execute(this)();
}

// Remove connection method
function remove(connection, connections) {
  for(var i = 0; i < connections.length; i++) {
    if(connections[i] === connection) {
      connections.splice(i, 1);
      return true;
    }
  }
}

function removeConnection(self, connection) {
  if(remove(connection, self.availableConnections)) return;
  if(remove(connection, self.inUseConnections)) return;
  if(remove(connection, self.connectingConnections)) return;
  if(remove(connection, self.nonAuthenticatedConnections)) return;
}

// All event handlers
var handlers = ["close", "message", "error", "timeout", "parseError", "connect"];

function _createConnection(self) {
  // console.log("_createConnection")
  // console.log("--- pool create new connection 1 :: " + self.id)
  var connection = new Connection(messageHandler(self), self.options);

  // Push the connection
  self.connectingConnections.push(connection);

  // Handle any errors
  var tempErrorHandler = function(_connection) {
    return function(err) {
      // console.log("== _createConnection :: error :: " + _connection.id)
      // Destroy the connection
      _connection.destroy();
      // Remove the connection from the connectingConnections list
      removeConnection(self, _connection);
      // Start reconnection attempts
      if(!self.reconnectId && self.options.reconnect) {
        self.reconnectId = setTimeout(attemptReconnect(self), self.options.reconnectInterval);
      }
    }
  }

  // Handle successful connection
  var tempConnectHandler = function(_connection) {
    return function() {
      // console.log("== _createConnection :: connect :: " + _connection.id)
      // Destroyed state return
      if(self.state == DESTROYED) {
        // Remove the connection from the list
        removeConnection(self, _connection);
        return _connection.destroy();
      }

      // Destroy all event emitters
      handlers.forEach(function(e) {
        _connection.removeAllListeners(e);
      });

      // Add the final handlers
      _connection.once('close', connectionFailureHandler(self, 'close'));
      _connection.once('error', connectionFailureHandler(self, 'error'));
      _connection.once('timeout', connectionFailureHandler(self, 'timeout'));
      _connection.once('parseError', connectionFailureHandler(self, 'parseError'));

      // Signal
      reauthenticate(self, _connection, function(err) {
        if(self.state == DESTROYED) {
          return _connection.destroy();
        }
        // Remove the connection from the connectingConnections list
        removeConnection(self, _connection);

        // console.dir(err)
        // Handle error
        if(err) {
          return _connection.destroy();
        }

        // If we are authenticating at the moment
        // Do not automatially put in available connections
        // As we need to apply the credentials first
        if(self.authenticating) {
          self.nonAuthenticatedConnections.push(_connection);
        } else {
          // Push to available
          self.availableConnections.push(_connection);
          // Execute any work waiting
          _execute(self)();
        }
      });
    }
  }

  // Add all handlers
  connection.once('close', tempErrorHandler(connection));
  connection.once('error', tempErrorHandler(connection));
  connection.once('timeout', tempErrorHandler(connection));
  connection.once('parseError', tempErrorHandler(connection));
  connection.once('connect', tempConnectHandler(connection));

  // Start connection
  connection.connect();
}

function flushMonitoringOperations(queue) {
  // console.log("=== flushMonitoringOperations")
  for(var i = 0; i < queue.length; i++) {
    if(queue[i].monitoring) {
      var workItem = queue[i];
      queue.splice(i, 1);
      workItem.cb(new MongoError('no connection available for monitoring'));
    }
  }
}

function _execute(self) {
  return function() {
    // console.log("=== _execute 0")
    if(self.state == DESTROYED) return;
    // Already executing, skip
    if(self.executing) return;
    // Set pool as executing
    self.executing = true;

    // Wait for auth to clear before continuing
    function waitForAuth(cb) {
      if(!self.authenticating) return cb();
      // Wait for a milisecond and try again
      setTimeout(function() {
        waitForAuth(cb);
      }, 1);
    }

    // Block on any auth in process
    waitForAuth(function() {
      // As long as we have available connections
      while(true) {
        // console.log("=== _execute 1")
        // Total availble connections
        var totalConnections = self.availableConnections.length
          + self.connectingConnections.length
          + self.inUseConnections.length;

        // Have we not reached the max connection size yet
        if(self.availableConnections.length == 0
          && self.connectingConnections.length == 0
          && totalConnections < self.options.size
          && self.queue.length > 0) {
          // // Flush any monitoring operations
          // flushMonitoringOperations(self.queue);
          // Create a new connection
          _createConnection(self);
          // Attempt to execute again
          self.executing = false;
          return;
        }

        // No available connections available, flush any monitoring ops
        if(self.availableConnections.length == 0) {
          // Flush any monitoring operations
          flushMonitoringOperations(self.queue);
          break;
        }

        // No queue break
        if(self.queue.length == 0) break;

        // console.log("=== _execute 1")
        // Get a connection
        var connection = self.availableConnections.pop();
        if(connection.isConnected()) {
          // console.log("--- available connection")
          // Get the next work item
          var workItem = self.queue.shift();

          // Get actual binary commands
          var buffer = workItem.buffer;

          // Add connection to workers in flight
          self.inUseConnections.push(connection);

          // Set current status of authentication process
          workItem.authenticating = self.authenticating;
          workItem.authenticatingTimestamp = self.authenticatingTimestamp;

          // Add current associated callback to the connection
          connection.workItem = workItem

          // We have a custom socketTimeout
          if(!workItem.immediateRelease && typeof workItem.socketTimeout == 'number') {
            connection.setSocketTimeout(workItem.socketTimeout);
          }

          // console.log("--- write connection :: " + connection.id + " :: " + (connection.workItem != null))

          // Put operation on the wire
          if(Array.isArray(buffer)) {
            for(var i = 0; i < buffer.length; i++) {
              connection.write(buffer[i])
            }
          } else {
            connection.write(buffer);
          }

          // Fire and forgot message, release the socket
          if(workItem.immediateRelease && !self.authenticating) {
            self.inUseConnections.pop();
            self.availableConnections.push(connection);
          } else if(workItem.immediateRelease && self.authenticating) {
            self.inUseConnections.pop();
            self.nonAuthenticatedConnections.push(connection);
          }
        } else {
          flushMonitoringOperations(self.queue);
        }
      }
    });

    self.executing = false;
  }
}

module.exports = Pool;
