'use strict';

const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const MongoWriteConcernError = require('../error').MongoWriteConcernError;
const Logger = require('./logger');
const f = require('util').format;
const Msg = require('./msg').Msg;
const CommandResult = require('./command_result');
const MESSAGE_HEADER_SIZE = require('../wireprotocol/shared').MESSAGE_HEADER_SIZE;
const COMPRESSION_DETAILS_SIZE = require('../wireprotocol/shared').COMPRESSION_DETAILS_SIZE;
const opcodes = require('../wireprotocol/shared').opcodes;
const compress = require('../wireprotocol/compression').compress;
const compressorIDs = require('../wireprotocol/compression').compressorIDs;
const uncompressibleCommands = require('../wireprotocol/compression').uncompressibleCommands;
const apm = require('./apm');
const Buffer = require('safe-buffer').Buffer;
const connect = require('./connect');
const updateSessionFromResponse = require('../sessions').updateSessionFromResponse;

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYING = 'destroying';
var DESTROYED = 'destroyed';

var _id = 0;

/**
 * Creates a new Pool instance
 * @class
 * @param {string} options.host The server host
 * @param {number} options.port The server port
 * @param {number} [options.size=5] Max server connection pool size
 * @param {number} [options.minSize=0] Minimum server connection pool size
 * @param {boolean} [options.reconnect=true] Server will attempt to reconnect on loss of connection
 * @param {number} [options.reconnectTries=30] Server attempt to reconnect #times
 * @param {number} [options.reconnectInterval=1000] Server will wait # milliseconds between retries
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=300000] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=30000] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=360000] TCP Socket timeout setting
 * @param {number} [options.monitoringSocketTimeout=30000] TCP Socket timeout setting for replicaset monitoring socket
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.crl] SSL Certificate revocation store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passPhrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=false] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {boolean} [options.domainsEnabled=false] Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit.
 * @fires Pool#connect
 * @fires Pool#close
 * @fires Pool#error
 * @fires Pool#timeout
 * @fires Pool#parseError
 * @return {Pool} A cursor instance
 */
var Pool = function(topology, options) {
  // Add event listener
  EventEmitter.call(this);

  // Store topology for later use
  this.topology = topology;

  // Add the options
  this.options = Object.assign(
    {
      // Host and port settings
      host: 'localhost',
      port: 27017,
      // Pool default max size
      size: 5,
      // Pool default min size
      minSize: 0,
      // socket settings
      connectionTimeout: 30000,
      socketTimeout: 360000,
      keepAlive: true,
      keepAliveInitialDelay: 300000,
      noDelay: true,
      // SSL Settings
      ssl: false,
      checkServerIdentity: true,
      ca: null,
      crl: null,
      cert: null,
      key: null,
      passPhrase: null,
      rejectUnauthorized: false,
      promoteLongs: true,
      promoteValues: true,
      promoteBuffers: false,
      // Reconnection options
      reconnect: true,
      reconnectInterval: 1000,
      reconnectTries: 30,
      // Enable domains
      domainsEnabled: false
    },
    options
  );

  // Identification information
  this.id = _id++;
  // Current reconnect retries
  this.retriesLeft = this.options.reconnectTries;
  this.reconnectId = null;
  // No bson parser passed in
  if (
    !options.bson ||
    (options.bson &&
      (typeof options.bson.serialize !== 'function' ||
        typeof options.bson.deserialize !== 'function'))
  ) {
    throw new Error('must pass in valid bson parser');
  }

  // Logger instance
  this.logger = Logger('Pool', options);
  // Pool state
  this.state = DISCONNECTED;
  // Connections
  this.availableConnections = [];
  this.inUseConnections = [];
  this.connectingConnections = 0;
  // Currently executing
  this.executing = false;
  // Operation work queue
  this.queue = [];

  // Contains the reconnect connection
  this.reconnectConnection = null;

  // Number of consecutive timeouts caught
  this.numberOfConsecutiveTimeouts = 0;
  // Current pool Index
  this.connectionIndex = 0;

  // event handlers
  const pool = this;
  this._messageHandler = messageHandler(this);
  this._connectionCloseHandler = function(err) {
    const connection = this;
    connectionFailureHandler(pool, 'close', err, connection);
  };

  this._connectionErrorHandler = function(err) {
    const connection = this;
    connectionFailureHandler(pool, 'error', err, connection);
  };

  this._connectionTimeoutHandler = function(err) {
    const connection = this;
    connectionFailureHandler(pool, 'timeout', err, connection);
  };

  this._connectionParseErrorHandler = function(err) {
    const connection = this;
    connectionFailureHandler(pool, 'parseError', err, connection);
  };
};

inherits(Pool, EventEmitter);

Object.defineProperty(Pool.prototype, 'size', {
  enumerable: true,
  get: function() {
    return this.options.size;
  }
});

Object.defineProperty(Pool.prototype, 'minSize', {
  enumerable: true,
  get: function() {
    return this.options.minSize;
  }
});

Object.defineProperty(Pool.prototype, 'connectionTimeout', {
  enumerable: true,
  get: function() {
    return this.options.connectionTimeout;
  }
});

Object.defineProperty(Pool.prototype, 'socketTimeout', {
  enumerable: true,
  get: function() {
    return this.options.socketTimeout;
  }
});

function stateTransition(self, newState) {
  var legalTransitions = {
    disconnected: [CONNECTING, DESTROYING, DISCONNECTED],
    connecting: [CONNECTING, DESTROYING, CONNECTED, DISCONNECTED],
    connected: [CONNECTED, DISCONNECTED, DESTROYING],
    destroying: [DESTROYING, DESTROYED],
    destroyed: [DESTROYED]
  };

  // Get current state
  var legalStates = legalTransitions[self.state];
  if (legalStates && legalStates.indexOf(newState) !== -1) {
    self.emit('stateChanged', self.state, newState);
    self.state = newState;
  } else {
    self.logger.error(
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

function connectionFailureHandler(pool, event, err, conn) {
  if (conn) {
    if (conn._connectionFailHandled) return;
    conn._connectionFailHandled = true;
    conn.destroy();

    // Remove the connection
    removeConnection(pool, conn);

    // Flush all work Items on this connection
    while (conn.workItems.length > 0) {
      const workItem = conn.workItems.shift();
      if (workItem.cb) workItem.cb(err);
    }
  }

  // Did we catch a timeout, increment the numberOfConsecutiveTimeouts
  if (event === 'timeout') {
    pool.numberOfConsecutiveTimeouts = pool.numberOfConsecutiveTimeouts + 1;

    // Have we timed out more than reconnectTries in a row ?
    // Force close the pool as we are trying to connect to tcp sink hole
    if (pool.numberOfConsecutiveTimeouts > pool.options.reconnectTries) {
      pool.numberOfConsecutiveTimeouts = 0;
      // Destroy all connections and pool
      pool.destroy(true);
      // Emit close event
      return pool.emit('close', pool);
    }
  }

  // No more socket available propegate the event
  if (pool.socketCount() === 0) {
    if (pool.state !== DESTROYED && pool.state !== DESTROYING) {
      stateTransition(pool, DISCONNECTED);
    }

    // Do not emit error events, they are always close events
    // do not trigger the low level error handler in node
    event = event === 'error' ? 'close' : event;
    pool.emit(event, err);
  }

  // Start reconnection attempts
  if (!pool.reconnectId && pool.options.reconnect) {
    pool.reconnectId = setTimeout(attemptReconnect(pool), pool.options.reconnectInterval);
  }

  // Do we need to do anything to maintain the minimum pool size
  const totalConnections = totalConnectionCount(pool);
  if (totalConnections < pool.minSize) {
    _createConnection(pool);
  }
}

function attemptReconnect(self) {
  return function() {
    self.emit('attemptReconnect', self);
    if (self.state === DESTROYED || self.state === DESTROYING) return;

    // We are connected do not try again
    if (self.isConnected()) {
      self.reconnectId = null;
      return;
    }

    self.connectingConnections++;
    connect(self.options, (err, connection) => {
      self.connectingConnections--;

      if (err) {
        if (self.logger.isDebug()) {
          self.logger.debug(`connection attempt failed with error [${JSON.stringify(err)}]`);
        }

        self.retriesLeft = self.retriesLeft - 1;
        if (self.retriesLeft <= 0) {
          self.destroy();
          self.emit(
            'reconnectFailed',
            new MongoNetworkError(
              f(
                'failed to reconnect after %s attempts with interval %s ms',
                self.options.reconnectTries,
                self.options.reconnectInterval
              )
            )
          );
        } else {
          self.reconnectId = setTimeout(attemptReconnect(self), self.options.reconnectInterval);
        }

        return;
      }

      if (self.state === DESTROYED || self.state === DESTROYING) {
        return connection.destroy();
      }

      self.reconnectId = null;
      handlers.forEach(event => connection.removeAllListeners(event));
      connection.on('error', self._connectionErrorHandler);
      connection.on('close', self._connectionCloseHandler);
      connection.on('timeout', self._connectionTimeoutHandler);
      connection.on('parseError', self._connectionParseErrorHandler);
      connection.on('message', self._messageHandler);

      self.retriesLeft = self.options.reconnectTries;
      self.availableConnections.push(connection);
      self.reconnectConnection = null;
      self.emit('reconnect', self);
      _execute(self)();
    });
  };
}

function moveConnectionBetween(connection, from, to) {
  var index = from.indexOf(connection);
  // Move the connection from connecting to available
  if (index !== -1) {
    from.splice(index, 1);
    to.push(connection);
  }
}

function messageHandler(self) {
  return function(message, connection) {
    // workItem to execute
    var workItem = null;

    // Locate the workItem
    for (var i = 0; i < connection.workItems.length; i++) {
      if (connection.workItems[i].requestId === message.responseTo) {
        // Get the callback
        workItem = connection.workItems[i];
        // Remove from list of workItems
        connection.workItems.splice(i, 1);
      }
    }

    if (workItem && workItem.monitoring) {
      moveConnectionBetween(connection, self.inUseConnections, self.availableConnections);
    }

    // Reset timeout counter
    self.numberOfConsecutiveTimeouts = 0;

    // Reset the connection timeout if we modified it for
    // this operation
    if (workItem && workItem.socketTimeout) {
      connection.resetSocketTimeout();
    }

    // Log if debug enabled
    if (self.logger.isDebug()) {
      self.logger.debug(
        f(
          'message [%s] received from %s:%s',
          message.raw.toString('hex'),
          self.options.host,
          self.options.port
        )
      );
    }

    function handleOperationCallback(self, cb, err, result) {
      // No domain enabled
      if (!self.options.domainsEnabled) {
        return process.nextTick(function() {
          return cb(err, result);
        });
      }

      // Domain enabled just call the callback
      cb(err, result);
    }

    // Keep executing, ensure current message handler does not stop execution
    if (!self.executing) {
      process.nextTick(function() {
        _execute(self)();
      });
    }

    // Time to dispatch the message if we have a callback
    if (workItem && !workItem.immediateRelease) {
      try {
        // Parse the message according to the provided options
        message.parse(workItem);
      } catch (err) {
        return handleOperationCallback(self, workItem.cb, new MongoError(err));
      }

      if (message.documents[0]) {
        const document = message.documents[0];
        const session = workItem.session;
        if (session) {
          updateSessionFromResponse(session, document);
        }

        if (document.$clusterTime) {
          self.topology.clusterTime = document.$clusterTime;
        }
      }

      // Establish if we have an error
      if (workItem.command && message.documents[0]) {
        const responseDoc = message.documents[0];

        if (responseDoc.writeConcernError) {
          const err = new MongoWriteConcernError(responseDoc.writeConcernError, responseDoc);
          return handleOperationCallback(self, workItem.cb, err);
        }

        if (responseDoc.ok === 0 || responseDoc.$err || responseDoc.errmsg || responseDoc.code) {
          return handleOperationCallback(self, workItem.cb, new MongoError(responseDoc));
        }
      }

      // Add the connection details
      message.hashedName = connection.hashedName;

      // Return the documents
      handleOperationCallback(
        self,
        workItem.cb,
        null,
        new CommandResult(workItem.fullResult ? message : message.documents[0], connection, message)
      );
    }
  };
}

/**
 * Return the total socket count in the pool.
 * @method
 * @return {Number} The number of socket available.
 */
Pool.prototype.socketCount = function() {
  return this.availableConnections.length + this.inUseConnections.length;
  // + this.connectingConnections.length;
};

function totalConnectionCount(pool) {
  return (
    pool.availableConnections.length + pool.inUseConnections.length + pool.connectingConnections
  );
}

/**
 * Return all pool connections
 * @method
 * @return {Connection[]} The pool connections
 */
Pool.prototype.allConnections = function() {
  return this.availableConnections.concat(this.inUseConnections);
};

/**
 * Get a pool connection (round-robin)
 * @method
 * @return {Connection}
 */
Pool.prototype.get = function() {
  return this.allConnections()[0];
};

/**
 * Is the pool connected
 * @method
 * @return {boolean}
 */
Pool.prototype.isConnected = function() {
  // We are in a destroyed state
  if (this.state === DESTROYED || this.state === DESTROYING) {
    return false;
  }

  // Get connections
  var connections = this.availableConnections.concat(this.inUseConnections);

  // Check if we have any connected connections
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].isConnected()) return true;
  }

  // Not connected
  return false;
};

/**
 * Was the pool destroyed
 * @method
 * @return {boolean}
 */
Pool.prototype.isDestroyed = function() {
  return this.state === DESTROYED || this.state === DESTROYING;
};

/**
 * Is the pool in a disconnected state
 * @method
 * @return {boolean}
 */
Pool.prototype.isDisconnected = function() {
  return this.state === DISCONNECTED;
};

/**
 * Connect pool
 */
Pool.prototype.connect = function() {
  if (this.state !== DISCONNECTED) {
    throw new MongoError('connection in unlawful state ' + this.state);
  }

  const self = this;
  stateTransition(this, CONNECTING);

  self.connectingConnections++;
  connect(self.options, (err, connection) => {
    self.connectingConnections--;

    if (err) {
      if (self.logger.isDebug()) {
        self.logger.debug(`connection attempt failed with error [${JSON.stringify(err)}]`);
      }

      if (self.state === CONNECTING) {
        self.emit('error', err);
      }

      return;
    }

    if (self.state === DESTROYED || self.state === DESTROYING) {
      return self.destroy();
    }

    // attach event handlers
    connection.on('error', self._connectionErrorHandler);
    connection.on('close', self._connectionCloseHandler);
    connection.on('timeout', self._connectionTimeoutHandler);
    connection.on('parseError', self._connectionParseErrorHandler);
    connection.on('message', self._messageHandler);

    // If we are in a topology, delegate the auth to it
    // This is to avoid issues where we would auth against an
    // arbiter
    if (self.options.inTopology) {
      stateTransition(self, CONNECTED);
      self.availableConnections.push(connection);
      return self.emit('connect', self, connection);
    }

    if (self.state === DESTROYED || self.state === DESTROYING) {
      return self.destroy();
    }

    if (err) {
      self.destroy();
      return self.emit('error', err);
    }

    stateTransition(self, CONNECTED);
    self.availableConnections.push(connection);

    if (self.minSize) {
      for (let i = 0; i < self.minSize; i++) {
        _createConnection(self);
      }
    }

    self.emit('connect', self, connection);
  });
};

/**
 * Authenticate using a specified mechanism
 * @param {authResultCallback} callback A callback function
 */
Pool.prototype.auth = function(credentials, callback) {
  if (typeof callback === 'function') callback(null, null);
};

/**
 * Logout all users against a database
 * @param {authResultCallback} callback A callback function
 */
Pool.prototype.logout = function(dbName, callback) {
  if (typeof callback === 'function') callback(null, null);
};

/**
 * Unref the pool
 * @method
 */
Pool.prototype.unref = function() {
  // Get all the known connections
  var connections = this.availableConnections.concat(this.inUseConnections);

  connections.forEach(function(c) {
    c.unref();
  });
};

// Events
var events = ['error', 'close', 'timeout', 'parseError', 'connect', 'message'];

// Destroy the connections
function destroy(self, connections, options, callback) {
  let connectionCount = connections.length;
  function connectionDestroyed() {
    connectionCount--;
    if (connectionCount > 0) {
      return;
    }

    // Zero out all connections
    self.inUseConnections = [];
    self.availableConnections = [];
    self.connectingConnections = 0;

    // Set state to destroyed
    stateTransition(self, DESTROYED);
    if (typeof callback === 'function') {
      callback(null, null);
    }
  }

  if (connectionCount === 0) {
    connectionDestroyed();
    return;
  }

  // Destroy all connections
  connections.forEach(conn => {
    for (var i = 0; i < events.length; i++) {
      conn.removeAllListeners(events[i]);
    }

    conn.destroy(options, connectionDestroyed);
  });
}

/**
 * Destroy pool
 * @method
 */
Pool.prototype.destroy = function(force, callback) {
  var self = this;
  // Do not try again if the pool is already dead
  if (this.state === DESTROYED || self.state === DESTROYING) {
    if (typeof callback === 'function') callback(null, null);
    return;
  }

  // Set state to destroyed
  stateTransition(this, DESTROYING);

  // Are we force closing
  if (force) {
    // Get all the known connections
    var connections = self.availableConnections.concat(self.inUseConnections);

    // Flush any remaining work items with
    // an error
    while (self.queue.length > 0) {
      var workItem = self.queue.shift();
      if (typeof workItem.cb === 'function') {
        workItem.cb(new MongoError('Pool was force destroyed'));
      }
    }

    // Destroy the topology
    return destroy(self, connections, { force: true }, callback);
  }

  // Clear out the reconnect if set
  if (this.reconnectId) {
    clearTimeout(this.reconnectId);
  }

  // If we have a reconnect connection running, close
  // immediately
  if (this.reconnectConnection) {
    this.reconnectConnection.destroy();
  }

  // Wait for the operations to drain before we close the pool
  function checkStatus() {
    flushMonitoringOperations(self.queue);

    if (self.queue.length === 0) {
      // Get all the known connections
      var connections = self.availableConnections.concat(self.inUseConnections);

      // Check if we have any in flight operations
      for (var i = 0; i < connections.length; i++) {
        // There is an operation still in flight, reschedule a
        // check waiting for it to drain
        if (connections[i].workItems.length > 0) {
          return setTimeout(checkStatus, 1);
        }
      }

      destroy(self, connections, { force: false }, callback);
      // } else if (self.queue.length > 0 && !this.reconnectId) {
    } else {
      // Ensure we empty the queue
      _execute(self)();
      // Set timeout
      setTimeout(checkStatus, 1);
    }
  }

  // Initiate drain of operations
  checkStatus();
};

/**
 * Reset all connections of this pool
 *
 * @param {function} [callback]
 */
Pool.prototype.reset = function(callback) {
  // this.destroy(true, err => {
  //   if (err && typeof callback === 'function') {
  //     callback(err, null);
  //     return;
  //   }

  //   stateTransition(this, DISCONNECTED);
  //   this.connect();

  //   if (typeof callback === 'function') callback(null, null);
  // });

  if (typeof callback === 'function') callback();
};

// Prepare the buffer that Pool.prototype.write() uses to send to the server
function serializeCommand(self, command, callback) {
  const originalCommandBuffer = command.toBin();

  // Check whether we and the server have agreed to use a compressor
  const shouldCompress = !!self.options.agreedCompressor;
  if (!shouldCompress || !canCompress(command)) {
    return callback(null, originalCommandBuffer);
  }

  // Transform originalCommandBuffer into OP_COMPRESSED
  const concatenatedOriginalCommandBuffer = Buffer.concat(originalCommandBuffer);
  const messageToBeCompressed = concatenatedOriginalCommandBuffer.slice(MESSAGE_HEADER_SIZE);

  // Extract information needed for OP_COMPRESSED from the uncompressed message
  const originalCommandOpCode = concatenatedOriginalCommandBuffer.readInt32LE(12);

  // Compress the message body
  compress(self, messageToBeCompressed, function(err, compressedMessage) {
    if (err) return callback(err, null);

    // Create the msgHeader of OP_COMPRESSED
    const msgHeader = Buffer.alloc(MESSAGE_HEADER_SIZE);
    msgHeader.writeInt32LE(
      MESSAGE_HEADER_SIZE + COMPRESSION_DETAILS_SIZE + compressedMessage.length,
      0
    ); // messageLength
    msgHeader.writeInt32LE(command.requestId, 4); // requestID
    msgHeader.writeInt32LE(0, 8); // responseTo (zero)
    msgHeader.writeInt32LE(opcodes.OP_COMPRESSED, 12); // opCode

    // Create the compression details of OP_COMPRESSED
    const compressionDetails = Buffer.alloc(COMPRESSION_DETAILS_SIZE);
    compressionDetails.writeInt32LE(originalCommandOpCode, 0); // originalOpcode
    compressionDetails.writeInt32LE(messageToBeCompressed.length, 4); // Size of the uncompressed compressedMessage, excluding the MsgHeader
    compressionDetails.writeUInt8(compressorIDs[self.options.agreedCompressor], 8); // compressorID

    return callback(null, [msgHeader, compressionDetails, compressedMessage]);
  });
}

/**
 * Write a message to MongoDB
 * @method
 * @return {Connection}
 */
Pool.prototype.write = function(command, options, cb) {
  var self = this;
  // Ensure we have a callback
  if (typeof options === 'function') {
    cb = options;
  }

  // Always have options
  options = options || {};

  // We need to have a callback function unless the message returns no response
  if (!(typeof cb === 'function') && !options.noResponse) {
    throw new MongoError('write method must provide a callback');
  }

  // Pool was destroyed error out
  if (this.state === DESTROYED || this.state === DESTROYING) {
    // Callback with an error
    if (cb) {
      try {
        cb(new MongoError('pool destroyed'));
      } catch (err) {
        process.nextTick(function() {
          throw err;
        });
      }
    }

    return;
  }

  if (this.options.domainsEnabled && process.domain && typeof cb === 'function') {
    // if we have a domain bind to it
    var oldCb = cb;
    cb = process.domain.bind(function() {
      // v8 - argumentsToArray one-liner
      var args = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        args[i] = arguments[i];
      }
      // bounce off event loop so domain switch takes place
      process.nextTick(function() {
        oldCb.apply(null, args);
      });
    });
  }

  // Do we have an operation
  var operation = {
    cb: cb,
    raw: false,
    promoteLongs: true,
    promoteValues: true,
    promoteBuffers: false,
    fullResult: false
  };

  // Set the options for the parsing
  operation.promoteLongs = typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true;
  operation.promoteValues =
    typeof options.promoteValues === 'boolean' ? options.promoteValues : true;
  operation.promoteBuffers =
    typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false;
  operation.raw = typeof options.raw === 'boolean' ? options.raw : false;
  operation.immediateRelease =
    typeof options.immediateRelease === 'boolean' ? options.immediateRelease : false;
  operation.documentsReturnedIn = options.documentsReturnedIn;
  operation.command = typeof options.command === 'boolean' ? options.command : false;
  operation.fullResult = typeof options.fullResult === 'boolean' ? options.fullResult : false;
  operation.noResponse = typeof options.noResponse === 'boolean' ? options.noResponse : false;
  operation.session = options.session || null;

  // Optional per operation socketTimeout
  operation.socketTimeout = options.socketTimeout;
  operation.monitoring = options.monitoring;
  // Custom socket Timeout
  if (options.socketTimeout) {
    operation.socketTimeout = options.socketTimeout;
  }

  // Get the requestId
  operation.requestId = command.requestId;

  // If command monitoring is enabled we need to modify the callback here
  if (self.options.monitorCommands) {
    this.emit('commandStarted', new apm.CommandStartedEvent(this, command));

    operation.started = process.hrtime();
    operation.cb = (err, reply) => {
      if (err) {
        self.emit(
          'commandFailed',
          new apm.CommandFailedEvent(this, command, err, operation.started)
        );
      } else {
        if (reply && reply.result && (reply.result.ok === 0 || reply.result.$err)) {
          self.emit(
            'commandFailed',
            new apm.CommandFailedEvent(this, command, reply.result, operation.started)
          );
        } else {
          self.emit(
            'commandSucceeded',
            new apm.CommandSucceededEvent(this, command, reply, operation.started)
          );
        }
      }

      if (typeof cb === 'function') cb(err, reply);
    };
  }

  // Prepare the operation buffer
  serializeCommand(self, command, (err, serializedBuffers) => {
    if (err) throw err;

    // Set the operation's buffer to the serialization of the commands
    operation.buffer = serializedBuffers;

    // If we have a monitoring operation schedule as the very first operation
    // Otherwise add to back of queue
    if (options.monitoring) {
      self.queue.unshift(operation);
    } else {
      self.queue.push(operation);
    }

    // Attempt to execute the operation
    if (!self.executing) {
      process.nextTick(function() {
        _execute(self)();
      });
    }
  });
};

// Return whether a command contains an uncompressible command term
// Will return true if command contains no uncompressible command terms
function canCompress(command) {
  const commandDoc = command instanceof Msg ? command.command : command.query;
  const commandName = Object.keys(commandDoc)[0];
  return uncompressibleCommands.indexOf(commandName) === -1;
}

// Remove connection method
function remove(connection, connections) {
  for (var i = 0; i < connections.length; i++) {
    if (connections[i] === connection) {
      connections.splice(i, 1);
      return true;
    }
  }
}

function removeConnection(self, connection) {
  if (remove(connection, self.availableConnections)) return;
  if (remove(connection, self.inUseConnections)) return;
}

const handlers = ['close', 'message', 'error', 'timeout', 'parseError', 'connect'];
function _createConnection(self) {
  if (self.state === DESTROYED || self.state === DESTROYING) {
    return;
  }

  self.connectingConnections++;
  connect(self.options, (err, connection) => {
    self.connectingConnections--;

    if (err) {
      if (self.logger.isDebug()) {
        self.logger.debug(`connection attempt failed with error [${JSON.stringify(err)}]`);
      }

      if (!self.reconnectId && self.options.reconnect) {
        self.reconnectId = setTimeout(attemptReconnect(self), self.options.reconnectInterval);
      }

      return;
    }

    if (self.state === DESTROYED || self.state === DESTROYING) {
      removeConnection(self, connection);
      return connection.destroy();
    }

    connection.on('error', self._connectionErrorHandler);
    connection.on('close', self._connectionCloseHandler);
    connection.on('timeout', self._connectionTimeoutHandler);
    connection.on('parseError', self._connectionParseErrorHandler);
    connection.on('message', self._messageHandler);

    if (self.state === DESTROYED || self.state === DESTROYING) {
      return connection.destroy();
    }

    // Remove the connection from the connectingConnections list
    removeConnection(self, connection);

    // Handle error
    if (err) {
      return connection.destroy();
    }

    // Push to available
    self.availableConnections.push(connection);
    // Execute any work waiting
    _execute(self)();
  });
}

function flushMonitoringOperations(queue) {
  for (var i = 0; i < queue.length; i++) {
    if (queue[i].monitoring) {
      var workItem = queue[i];
      queue.splice(i, 1);
      workItem.cb(
        new MongoError({ message: 'no connection available for monitoring', driver: true })
      );
    }
  }
}

function _execute(self) {
  return function() {
    if (self.state === DESTROYED) return;
    // Already executing, skip
    if (self.executing) return;
    // Set pool as executing
    self.executing = true;

    // New pool connections are in progress, wait them to finish
    // before executing any more operation to ensure distribution of
    // operations
    if (self.connectingConnections > 0) {
      self.executing = false;
      return;
    }

    // As long as we have available connections
    // eslint-disable-next-line
    while (true) {
      // Total availble connections
      const totalConnections = totalConnectionCount(self);

      // No available connections available, flush any monitoring ops
      if (self.availableConnections.length === 0) {
        // Flush any monitoring operations
        flushMonitoringOperations(self.queue);
        break;
      }

      // No queue break
      if (self.queue.length === 0) {
        break;
      }

      var connection = null;
      const connections = self.availableConnections.filter(conn => conn.workItems.length === 0);

      // No connection found that has no work on it, just pick one for pipelining
      if (connections.length === 0) {
        connection =
          self.availableConnections[self.connectionIndex++ % self.availableConnections.length];
      } else {
        connection = connections[self.connectionIndex++ % connections.length];
      }

      // Is the connection connected
      if (!connection.isConnected()) {
        // Remove the disconnected connection
        removeConnection(self, connection);
        // Flush any monitoring operations in the queue, failing fast
        flushMonitoringOperations(self.queue);
        break;
      }

      // Get the next work item
      var workItem = self.queue.shift();

      // If we are monitoring we need to use a connection that is not
      // running another operation to avoid socket timeout changes
      // affecting an existing operation
      if (workItem.monitoring) {
        var foundValidConnection = false;

        for (let i = 0; i < self.availableConnections.length; i++) {
          // If the connection is connected
          // And there are no pending workItems on it
          // Then we can safely use it for monitoring.
          if (
            self.availableConnections[i].isConnected() &&
            self.availableConnections[i].workItems.length === 0
          ) {
            foundValidConnection = true;
            connection = self.availableConnections[i];
            break;
          }
        }

        // No safe connection found, attempt to grow the connections
        // if possible and break from the loop
        if (!foundValidConnection) {
          // Put workItem back on the queue
          self.queue.unshift(workItem);

          // Attempt to grow the pool if it's not yet maxsize
          if (totalConnections < self.options.size && self.queue.length > 0) {
            // Create a new connection
            _createConnection(self);
          }

          // Re-execute the operation
          setTimeout(function() {
            _execute(self)();
          }, 10);

          break;
        }
      }

      // Don't execute operation until we have a full pool
      if (totalConnections < self.options.size) {
        // Connection has work items, then put it back on the queue
        // and create a new connection
        if (connection.workItems.length > 0) {
          // Lets put the workItem back on the list
          self.queue.unshift(workItem);
          // Create a new connection
          _createConnection(self);
          // Break from the loop
          break;
        }
      }

      // Get actual binary commands
      var buffer = workItem.buffer;

      // If we are monitoring take the connection of the availableConnections
      if (workItem.monitoring) {
        moveConnectionBetween(connection, self.availableConnections, self.inUseConnections);
      }

      // Track the executing commands on the mongo server
      // as long as there is an expected response
      if (!workItem.noResponse) {
        connection.workItems.push(workItem);
      }

      // We have a custom socketTimeout
      if (!workItem.immediateRelease && typeof workItem.socketTimeout === 'number') {
        connection.setSocketTimeout(workItem.socketTimeout);
      }

      // Capture if write was successful
      var writeSuccessful = true;

      // Put operation on the wire
      if (Array.isArray(buffer)) {
        for (let i = 0; i < buffer.length; i++) {
          writeSuccessful = connection.write(buffer[i]);
        }
      } else {
        writeSuccessful = connection.write(buffer);
      }

      // if the command is designated noResponse, call the callback immeditely
      if (workItem.noResponse && typeof workItem.cb === 'function') {
        workItem.cb(null, null);
      }

      if (writeSuccessful === false) {
        // If write not successful put back on queue
        self.queue.unshift(workItem);
        // Remove the disconnected connection
        removeConnection(self, connection);
        // Flush any monitoring operations in the queue, failing fast
        flushMonitoringOperations(self.queue);
        break;
      }
    }

    self.executing = false;
  };
}

// Make execution loop available for testing
Pool._execute = _execute;

/**
 * A server connect event, used to verify that the connection is up and running
 *
 * @event Pool#connect
 * @type {Pool}
 */

/**
 * A server reconnect event, used to verify that pool reconnected.
 *
 * @event Pool#reconnect
 * @type {Pool}
 */

/**
 * The server connection closed, all pool connections closed
 *
 * @event Pool#close
 * @type {Pool}
 */

/**
 * The server connection caused an error, all pool connections closed
 *
 * @event Pool#error
 * @type {Pool}
 */

/**
 * The server connection timed out, all pool connections closed
 *
 * @event Pool#timeout
 * @type {Pool}
 */

/**
 * The driver experienced an invalid message, all pool connections closed
 *
 * @event Pool#parseError
 * @type {Pool}
 */

/**
 * The driver attempted to reconnect
 *
 * @event Pool#attemptReconnect
 * @type {Pool}
 */

/**
 * The driver exhausted all reconnect attempts
 *
 * @event Pool#reconnectFailed
 * @type {Pool}
 */

module.exports = Pool;
