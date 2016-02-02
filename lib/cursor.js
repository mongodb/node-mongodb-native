"use strict";

var Long = require('bson').Long
  , Logger = require('./connection/logger')
  , MongoError = require('./error')
  , f = require('util').format;

/**
 * This is a cursor results callback
 *
 * @callback resultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {object} document
 */

/**
 * @fileOverview The **Cursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query.
 *
 * **CURSORS Cannot directly be instantiated**
 * @example
 * var Server = require('mongodb-core').Server
 *   , ReadPreference = require('mongodb-core').ReadPreference
 *   , assert = require('assert');
 *
 * var server = new Server({host: 'localhost', port: 27017});
 * // Wait for the connection event
 * server.on('connect', function(server) {
 *   assert.equal(null, err);
 *
 *   // Execute the write
 *   var cursor = _server.cursor('integration_tests.inserts_example4', {
 *       find: 'integration_tests.example4'
 *     , query: {a:1}
 *   }, {
 *     readPreference: new ReadPreference('secondary');
 *   });
 *
 *   // Get the first document
 *   cursor.next(function(err, doc) {
 *     assert.equal(null, err);
 *     server.destroy();
 *   });
 * });
 *
 * // Start connecting
 * server.connect();
 */

/**
 * Creates a new Cursor, not to be used directly
 * @class
 * @param {object} bson An instance of the BSON parser
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {{object}|Long} cmd The selector (can be a command or a cursorId)
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.batchSize=1000] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {object} [options.transforms=null] Transform methods for the cursor results
 * @param {function} [options.transforms.query] Transform the value returned from the initial query
 * @param {function} [options.transforms.doc] Transform each document returned from Cursor.prototype.next
 * @param {object} topology The server topology instance.
 * @param {object} topologyOptions The server topology options.
 * @return {Cursor} A cursor instance
 * @property {number} cursorBatchSize The current cursorBatchSize for the cursor
 * @property {number} cursorLimit The current cursorLimit for the cursor
 * @property {number} cursorSkip The current cursorSkip for the cursor
 */
var Cursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  options = options || {};
  // Cursor reference
  var self = this;
  // Initial query
  var query = null;

  // Cursor pool
  this.pool = null;
  // Cursor server
  this.server = null;

  // Do we have a not connected handler
  this.disconnectHandler = options.disconnectHandler;

  // Set local values
  this.bson = bson;
  this.ns = ns;
  this.cmd = cmd;
  this.options = options;
  this.topology = topology;

  // All internal state
  this.cursorState = {
      cursorId: null
    , cmd: cmd
    , documents: options.documents || []
    , cursorIndex: 0
    , dead: false
    , killed: false
    , init: false
    , notified: false
    , limit: options.limit || cmd.limit || 0
    , skip: options.skip || cmd.skip || 0
    , batchSize: options.batchSize || cmd.batchSize || 1000
    , currentLimit: 0
    // Result field name if not a cursor (contains the array of results)
    , transforms: options.transforms
  }

  // Callback controller
  this.callbacks = null;

  // Logger
  this.logger = Logger('Cursor', options);

  //
  // Did we pass in a cursor id
  if(typeof cmd == 'number') {
    this.cursorState.cursorId = Long.fromNumber(cmd);
    this.cursorState.lastCursorId = this.cursorState.cursorId;
  } else if(cmd instanceof Long) {
    this.cursorState.cursorId = cmd;
    this.cursorState.lastCursorId = cmd;
  }
}

Cursor.prototype.setCursorBatchSize = function(value) {
  this.cursorState.batchSize = value;
}

Cursor.prototype.cursorBatchSize = function() {
  return this.cursorState.batchSize;
}

Cursor.prototype.setCursorLimit = function(value) {
  this.cursorState.limit = value;
}

Cursor.prototype.cursorLimit = function() {
  return this.cursorState.limit;
}

Cursor.prototype.setCursorSkip = function(value) {
  this.cursorState.skip = value;
}

Cursor.prototype.cursorSkip = function() {
  return this.cursorState.skip;
}

//
// Handle callback (including any exceptions thrown)
var handleCallback = function(callback, err, result) {
  try {
    callback(err, result);
  } catch(err) {
    process.nextTick(function() {
      throw err;
    });
  }
}

// Internal methods
Cursor.prototype._find = function(callback) {
  var self = this;

  if(self.logger.isDebug()) {
    self.logger.debug(f("issue initial query [%s] with flags [%s]"
      , JSON.stringify(self.cmd)
      , JSON.stringify(self.query)));
  }

  var queryCallback = function(err, result) {
    if(err) return callback(err);

    if(result.queryFailure) {
      return callback(MongoError.create(result.documents[0]), null);
    }

    // Check if we have a command cursor
    if(Array.isArray(result.documents) && result.documents.length == 1
      && (!self.cmd.find || (self.cmd.find && self.cmd.virtual == false))
      && (result.documents[0].cursor != 'string'
        || result.documents[0]['$err']
        || result.documents[0]['errmsg']
        || Array.isArray(result.documents[0].result))
      ) {

      // We have a an error document return the error
      if(result.documents[0]['$err']
        || result.documents[0]['errmsg']) {
        return callback(MongoError.create(result.documents[0]), null);
      }

      // We have a cursor document
      if(result.documents[0].cursor != null
        && typeof result.documents[0].cursor != 'string') {
          var id = result.documents[0].cursor.id;
          // If we have a namespace change set the new namespace for getmores
          if(result.documents[0].cursor.ns) {
            self.ns = result.documents[0].cursor.ns;
          }
          // Promote id to long if needed
          self.cursorState.cursorId = typeof id == 'number' ? Long.fromNumber(id) : id;
          self.cursorState.lastCursorId = self.cursorState.cursorId;
          // If we have a firstBatch set it
          if(Array.isArray(result.documents[0].cursor.firstBatch)) {
            self.cursorState.documents = result.documents[0].cursor.firstBatch;//.reverse();
          }

          // Return after processing command cursor
          return callback(null, null);
      }

      if(Array.isArray(result.documents[0].result)) {
        self.cursorState.documents = result.documents[0].result;
        self.cursorState.cursorId = Long.ZERO;
        return callback(null, null);
      }
    }

    // Otherwise fall back to regular find path
    self.cursorState.cursorId = result.cursorId;
    self.cursorState.documents = result.documents;
    self.cursorState.lastCursorId = result.cursorId;

    // Transform the results with passed in transformation method if provided
    if(self.cursorState.transforms && typeof self.cursorState.transforms.query == 'function') {
      self.cursorState.documents = self.cursorState.transforms.query(result);
    }

    // Return callback
    callback(null, null);
  }

  // If we have a raw query decorate the function
  if(self.options.raw || self.cmd.raw) {
    queryCallback.raw = self.options.raw || self.cmd.raw;
  }

  // Do we have documentsReturnedIn set on the query
  if(typeof self.query.documentsReturnedIn == 'string') {
    queryCallback.documentsReturnedIn = self.query.documentsReturnedIn;
  }

  // Set up callback
  self.callbacks.register(self.query.requestId, queryCallback);

  // Write the initial command out
  self.pool.write(self.query.toBin(), queryCallback);
}

Cursor.prototype._getmore = function(callback) {
  if(this.logger.isDebug()) this.logger.debug(f("schedule getMore call for query [%s]", JSON.stringify(this.query)))
  // Determine if it's a raw query
  var raw = this.options.raw || this.cmd.raw;

  // Set the current batchSize
  var batchSize = this.cursorState.batchSize;
  if(this.cursorState.limit > 0
    && ((this.cursorState.currentLimit + batchSize) > this.cursorState.limit)) {
    batchSize = this.cursorState.limit - this.cursorState.currentLimit;
  }

  // We have a wire protocol handler
  this.server.wireProtocolHandler.getMore(this.bson, this.ns, this.cursorState, batchSize, raw, this.pool, this.callbacks, this.options, callback);
}

Cursor.prototype._killcursor = function(callback) {
  // Set cursor to dead
  this.cursorState.dead = true;
  this.cursorState.killed = true;
  // Remove documents
  this.cursorState.documents = [];

  // If no cursor id just return
  if(this.cursorState.cursorId == null || this.cursorState.cursorId.isZero() || this.cursorState.init == false) {
    if(callback) callback(null, null);
    return;
  }

  // Execute command
  this.server.wireProtocolHandler.killCursor(this.bson, this.ns, this.cursorState.cursorId, this.pool, this.callbacks, callback);
}

/**
 * Clone the cursor
 * @method
 * @return {Cursor}
 */
Cursor.prototype.clone = function() {
  return this.topology.cursor(this.ns, this.cmd, this.options);
}

/**
 * Checks if the cursor is dead
 * @method
 * @return {boolean} A boolean signifying if the cursor is dead or not
 */
Cursor.prototype.isDead = function() {
  return this.cursorState.dead == true;
}

/**
 * Checks if the cursor was killed by the application
 * @method
 * @return {boolean} A boolean signifying if the cursor was killed by the application
 */
Cursor.prototype.isKilled = function() {
  return this.cursorState.killed == true;
}

/**
 * Checks if the cursor notified it's caller about it's death
 * @method
 * @return {boolean} A boolean signifying if the cursor notified the callback
 */
Cursor.prototype.isNotified = function() {
  return this.cursorState.notified == true;
}

/**
 * Returns current buffered documents length
 * @method
 * @return {number} The number of items in the buffered documents
 */
Cursor.prototype.bufferedCount = function() {
  return this.cursorState.documents.length - this.cursorState.cursorIndex;
}

/**
 * Returns current buffered documents
 * @method
 * @return {Array} An array of buffered documents
 */
Cursor.prototype.readBufferedDocuments = function(number) {
  var unreadDocumentsLength = this.cursorState.documents.length - this.cursorState.cursorIndex;
  var length = number < unreadDocumentsLength ? number : unreadDocumentsLength;
  var elements = this.cursorState.documents.slice(this.cursorState.cursorIndex, this.cursorState.cursorIndex + length);

  // Transform the doc with passed in transformation method if provided
  if(this.cursorState.transforms && typeof this.cursorState.transforms.doc == 'function') {
    // Transform all the elements
    for(var i = 0; i < elements.length; i++) {
      elements[i] = this.cursorState.transforms.doc(elements[i]);
    }
  }

  // Ensure we do not return any more documents than the limit imposed
  // Just return the number of elements up to the limit
  if(this.cursorState.limit > 0 && (this.cursorState.currentLimit + elements.length) > this.cursorState.limit) {
    elements = elements.slice(0, (this.cursorState.limit - this.cursorState.currentLimit));
    this.kill();
  }

  // Adjust current limit
  this.cursorState.currentLimit = this.cursorState.currentLimit + elements.length;
  this.cursorState.cursorIndex = this.cursorState.cursorIndex + elements.length;

  // Return elements
  return elements;
}

/**
 * Kill the cursor
 * @method
 * @param {resultCallback} callback A callback function
 */
Cursor.prototype.kill = function(callback) {
  this._killcursor(callback);
}

/**
 * Resets the cursor
 * @method
 * @return {null}
 */
Cursor.prototype.rewind = function() {
  if(this.cursorState.init) {
    if(!this.cursorState.dead) {
      this.kill();
    }

    this.cursorState.currentLimit = 0;
    this.cursorState.init = false;
    this.cursorState.dead = false;
    this.cursorState.killed = false;
    this.cursorState.notified = false;
    this.cursorState.documents = [];
    this.cursorState.cursorId = null;
    this.cursorState.cursorIndex = 0;
  }
}

/**
 * Validate if the pool is dead and return error
 */
var isConnectionDead = function(self, callback) {
  if(self.pool
    && !self.pool.isConnected()) {
    self.cursorState.notified = true;
    self.cursorState.killed = true;
    self.cursorState.documents = [];
    self.cursorState.cursorIndex = 0;
    callback(MongoError.create(f('connection to host %s:%s was destroyed', self.pool.host, self.pool.port)))
    return true;
  }

  return false;
}

/**
 * Validate if the cursor is dead but was not explicitly killed by user
 */
var isCursorDeadButNotkilled = function(self, callback) {
  // Cursor is dead but not marked killed, return null
  if(self.cursorState.dead && !self.cursorState.killed) {
    self.cursorState.notified = true;
    self.cursorState.killed = true;
    self.cursorState.documents = [];
    self.cursorState.cursorIndex = 0;
    handleCallback(callback, null, null);
    return true;
  }

  return false;
}

/**
 * Validate if the cursor is dead and was killed by user
 */
var isCursorDeadAndKilled = function(self, callback) {
  if(self.cursorState.dead && self.cursorState.killed) {
    handleCallback(callback, MongoError.create("cursor is dead"));
    return true;
  }

  return false;
}

/**
 * Validate if the cursor was killed by the user
 */
var isCursorKilled = function(self, callback) {
  if(self.cursorState.killed) {
    self.cursorState.notified = true;
    self.cursorState.documents = [];
    self.cursorState.cursorIndex = 0;
    handleCallback(callback, null, null);
    return true;
  }

  return false;
}

/**
 * Mark cursor as being dead and notified
 */
var setCursorDeadAndNotified = function(self, callback) {
  self.cursorState.dead = true;
  self.cursorState.notified = true;
  self.cursorState.documents = [];
  self.cursorState.cursorIndex = 0;
  handleCallback(callback, null, null);
}

/**
 * Mark cursor as being notified
 */
var setCursorNotified = function(self, callback) {
  self.cursorState.notified = true;
  self.cursorState.documents = [];
  self.cursorState.cursorIndex = 0;
  handleCallback(callback, null, null);
}

var push = Array.prototype.push;

var nextFunction = function(self, callback) {
  // Exhaust message and cursor already finished and notified
  if(self.cmd.exhaust && self.cursorState.notified) return;
  // We have notified about it
  if(self.cursorState.notified) {
    return callback(new Error('cursor is exhausted'));
  }

  // Cursor is killed return null
  if(isCursorKilled(self, callback)) return;

  // Cursor is dead but not marked killed, return null
  if(isCursorDeadButNotkilled(self, callback)) return;

  // We have a dead and killed cursor, attempting to call next should error
  if(isCursorDeadAndKilled(self, callback)) return;

  // We have just started the cursor
  if(!self.cursorState.init) {
    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if(!self.topology.isConnected(self.options) && self.disconnectHandler != null) {
      return self.disconnectHandler.addObjectAndMethod('cursor', self, 'next', [callback], callback);
    }

    try {
      // Get a server
      self.server = self.topology.getServer(self.options);
      // Get a connection
      self.pool = self.server.s.pool;
      // Get the callbacks
      self.callbacks = self.server.getCallbacks();
    } catch(err) {
      return callback(err);
    }

    // Set as init
    self.cursorState.init = true;

    try {
      // Get the right wire protocol command
      self.query = self.server.wireProtocolHandler.command(self.bson, self.ns, self.cmd, self.cursorState, self.topology, self.options);
    } catch(err) {
      return callback(err);
    }
  }

  // Process exhaust messages
  var processExhaustMessages = function(err, result) {
    if(err) {
      self.cursorState.dead = true;
      self.callbacks.unregister(self.query.requestId);
      return callback(err);
    }

    // Concatenate all the documents
    push.apply(self.cursorState.documents, result.documents);

    // If we have no documents left
    if(Long.ZERO.equals(result.cursorId)) {
      self.cursorState.cursorId = Long.ZERO;
      self.callbacks.unregister(self.query.requestId);
      return nextFunction(self, callback);
    }

    // Set up next listener
    self.callbacks.register(result.requestId, processExhaustMessages)

    // Initial result
    if(self.cursorState.cursorId == null) {
      self.cursorState.cursorId = result.cursorId;
      self.cursorState.lastCursorId = result.cursorId;
      nextFunction(self, callback);
    }
  }

  // If we have exhaust
  if(self.cmd.exhaust && self.cursorState.cursorId == null) {
    // Handle all the exhaust responses
    self.callbacks.register(self.query.requestId, processExhaustMessages);
    // Write the initial command out
    return self.pool.write(self.query.toBin(), processExhaustMessages);
  } else if(self.cmd.exhaust && self.cursorState.cursorIndex < self.cursorState.documents.length) {
    return handleCallback(callback, null, self.cursorState.documents[self.cursorState.cursorIndex++]);
  } else if(self.cmd.exhaust && Long.ZERO.equals(self.cursorState.cursorId)) {
    self.callbacks.unregister(self.query.requestId);
    return setCursorNotified(self, callback);
  } else if(self.cmd.exhaust) {
    return setTimeout(function() {
      if(Long.ZERO.equals(self.cursorState.cursorId)) return;
      nextFunction(self, callback);
    }, 1);
  }

  // If we don't have a cursorId execute the first query
  if(self.cursorState.cursorId == null) {
    // Check if pool is dead and return if not possible to
    // execute the query against the db
    if(isConnectionDead(self, callback)) return;

    // Check if topology is destroyed
    if(self.topology.isDestroyed()) return callback(new MongoError(f('connection destroyed, not possible to instantiate cursor')));

    // query, cmd, options, cursorState, callback
    self._find(function(err, r) {
      if(err) return handleCallback(callback, err, null);
      if(self.cursorState.documents.length == 0 && !self.cmd.tailable && !self.cmd.awaitData) {
        return setCursorNotified(self, callback);
      }

      nextFunction(self, callback);
    });
  } else if(self.cursorState.limit > 0 && self.cursorState.currentLimit >= self.cursorState.limit) {
    // Ensure we kill the cursor on the server
    self.kill();
    // Set cursor in dead and notified state
    return setCursorDeadAndNotified(self, callback);
  } else if(self.cursorState.cursorIndex == self.cursorState.documents.length
      && !Long.ZERO.equals(self.cursorState.cursorId)) {
      // Ensure an empty cursor state
      self.cursorState.documents = [];
      self.cursorState.cursorIndex = 0;

      // Check if topology is destroyed
      if(self.topology.isDestroyed()) return callback(new MongoError(f('connection destroyed, not possible to instantiate cursor')));

      // Check if connection is dead and return if not possible to
      // execute a getmore on this connection
      if(isConnectionDead(self, callback)) return;

      // Execute the next get more
      self._getmore(function(err, doc) {
        if(err) return handleCallback(callback, err);
        if(self.cursorState.documents.length == 0
          && Long.ZERO.equals(self.cursorState.cursorId) && !self.cmd.tailable) {
            self.cursorState.dead = true;
            // Finished iterating over the cursor
            return setCursorDeadAndNotified(self, callback);
          }

        // Tailable cursor getMore result, notify owner about it
        // No attempt is made here to retry, this is left to the user of the
        // core module to handle to keep core simple
        if(self.cursorState.documents.length == 0 && self.cmd.tailable) {
          return handleCallback(callback, MongoError.create({
              message: "No more documents in tailed cursor"
            , tailable: self.cmd.tailable
            , awaitData: self.cmd.awaitData
          }));
        }

        if(self.cursorState.limit > 0 && self.cursorState.currentLimit >= self.cursorState.limit) {
          return setCursorDeadAndNotified(self, callback);
        }

        nextFunction(self, callback);
      });
  } else if(self.cursorState.documents.length == self.cursorState.cursorIndex
    && self.cmd.tailable) {
      return handleCallback(callback, MongoError.create({
          message: "No more documents in tailed cursor"
        , tailable: self.cmd.tailable
        , awaitData: self.cmd.awaitData
      }));
  } else if(self.cursorState.documents.length == self.cursorState.cursorIndex
      && Long.ZERO.equals(self.cursorState.cursorId)) {
      setCursorDeadAndNotified(self, callback);
  } else {
    if(self.cursorState.limit > 0 && self.cursorState.currentLimit >= self.cursorState.limit) {
      // Ensure we kill the cursor on the server
      self.kill();
      // Set cursor in dead and notified state
      return setCursorDeadAndNotified(self, callback);
    }

    // Increment the current cursor limit
    self.cursorState.currentLimit += 1;

    // Get the document
    var doc = self.cursorState.documents[self.cursorState.cursorIndex++];

    // Doc overflow
    if(doc.$err) {
      // Ensure we kill the cursor on the server
      self.kill();
      // Set cursor in dead and notified state
      return setCursorDeadAndNotified(self, function() {
        handleCallback(callback, new MongoError(doc.$err));
      });
    }

    // Transform the doc with passed in transformation method if provided
    if(self.cursorState.transforms && typeof self.cursorState.transforms.doc == 'function') {
      doc = self.cursorState.transforms.doc(doc);
    }

    // Return the document
    handleCallback(callback, null, doc);
  }
}

/**
 * Retrieve the next document from the cursor
 * @method
 * @param {resultCallback} callback A callback function
 */
Cursor.prototype.next = function(callback) {
  nextFunction(this, callback);
}

module.exports = Cursor;
