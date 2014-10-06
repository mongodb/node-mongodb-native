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
 * @param {object} connection The connection used for this cursor
 * @param {object} callbacks The callbacks storage object for the server instance
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @return {Cursor} A cursor instance
 * @property {number} cursorBatchSize The current cursorBatchSize for the cursor
 * @property {number} cursorLimit The current cursorLimit for the cursor
 * @property {number} cursorSkip The current cursorSkip for the cursor
 */
var Cursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  options = options || {};
  // Initial query
  var query = null;

  // Current limit processed, used to cut the number of returned docs correctly
  var currentLimit = 0;

  // Cursor connection
  var connection = null;
  // Cursor server
  var server = null;

  // Do we have a not connected handler
  var disconnectHandler = options.disconnectHandler;

  // Cursor reference
  var self = this;

  // All internal state
  var cursorState = {
      cursorId: null
    , documents: options.documents || []
    , dead: false
    , killed: false
    , init: false
    , limit: options.limit || cmd.limit || 0
    , skip: options.skip || cmd.skip || 0
    , batchSize: options.batchSize || cmd.batchSize || 0
  }

  // Callback controller
  var callbacks = null;

  // Logger
  var logger = Logger('Cursor', options);

  // 
  // Did we pass in a cursor id
  if(typeof cmd == 'number') {
    cursorState.cursorId = Long.fromNumber(cmd);
  } else if(cmd instanceof Long) {
    cursorState.cursorId = cmd;
  }

  // Allow the manipulation of the batch size of the cursor
  // after creation has happened
  Object.defineProperty(this, 'cursorBatchSize', {
      enumerable:true,
      set: function(value) { cursorState.batchSize = value; }
    , get: function() { return cursorState.batchSize; }
  });

  // Allow the manipulation of the cursor limit
  Object.defineProperty(this, 'cursorLimit', {
      enumerable:true,
      set: function(value) { cursorState.limit = value; }
    , get: function() { return cursorState.limit; }
  });

  // Allow the manipulation of the cursor skip
  Object.defineProperty(this, 'cursorSkip', {
      enumerable:true,
      set: function(value) { cursorState.skip = value; }
    , get: function() { return cursorState.skip; }
  });

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

  /**
   * Clone the cursor
   * @method
   * @return {Cursor}
   */  
  this.clone = function() {
    return topology.cursor(ns, cmd, options);
  }

  /**
   * Retrieve the next document from the cursor
   * @method
   * @param {resultCallback} callback A callback function
   */
  this.next = function(callback) {
    if(cursorState.killed) return handleCallback(callback, null, null);
    if(cursorState.dead) return handleCallback(callback, new MongoError("cursor is dead"));    
    // We have just started the cursor
    if(!cursorState.init) {
      // Topology is not connected, save the call in the provided store to be
      // Executed at some point when the handler deems it's reconnected
      if(!topology.isConnected(options) && disconnectHandler != null) {
        return disconnectHandler.addObjectAndMethod('cursor', self, 'next', [callback], callback);
      }

      try {
        // Get a server
        server = topology.getServer(options);
        // Get a connection
        connection = server.getConnection();
        // Get the callbacks
        callbacks = server.getCallbacks();
      } catch(err) {
        return callback(err);
      }

      // Set as init
      cursorState.init = true;

      // Get the right wire protocol command
      query = server.wireProtocolHandler.command(bson, ns, cmd, cursorState, topology, options);
    }

    // Process exhaust messages
    var processExhaustMessages = function(err, result) {
      if(err) {
        cursorState.dead = true;
        callbacks.unregister(query.requestId);
        return callback(err);
      }

      // Concatenate all the documents
      cursorState.documents = cursorState.documents.concat(result.documents);

      // If we have no documents left
      if(Long.ZERO.equals(result.cursorId)) {
        cursorState.cursorId = Long.ZERO;
        callbacks.unregister(query.requestId);
        return self.next(callback);
      }

      // Set up next listener
      callbacks.register(result.requestId, processExhaustMessages)

      // Initial result
      if(cursorState.cursorId == null) {
        cursorState.cursorId = result.cursorId;
        self.next(callback);
      }
    }    

    // If we have exhaust
    if(options.exhaust && cursorState.cursorId == null) {
      // Handle all the exhaust responses
      callbacks.register(query.requestId, processExhaustMessages);
      // Write the initial command out
      return connection.write(query);
    } else if(options.exhaust && cursorState.documents.length > 0) {
      return handleCallback(callback, null, cursorState.documents.shift());
    } else if(options.exhaust && Long.ZERO.equals(cursorState.cursorId)) {
      callbacks.unregister(query.requestId);
      return handleCallback(callback, null, null);
    } else if(options.exhaust) {
      return setTimeout(function() {
        if(Long.ZERO.equals(cursorState.cursorId)) return;
        self.next(callback);
      }, 1);
    }

    // If we don't have a cursorId execute the first query
    if(cursorState.cursorId == null) {
      execInitialQuery(query, function(err, r) {
        if(err) return handleCallback(callback, err, null);
        if(cursorState.documents.length == 0) return handleCallback(callback, null, null);
        self.next(callback);
      });
    } else if(cursorState.documents.length == 0 && !Long.ZERO.equals(cursorState.cursorId)) {
      execGetMore(function(err, doc) {
        if(err) return handleCallback(callback, err);
        if(cursorState.documents.length == 0 && Long.ZERO.equals(cursorState.cursorId)) cursorState.dead = true;
        // Tailable cursor getMore result, notify owner about it
        // No attempt is made here to retry, this is left to the user of the
        // core module to handle to keep core simple
        if(cursorState.documents.length == 0 && options.tailable) {
          return handleCallback(callback, MongoError.create({
              message: "No more documents in tailed cursor"
            , tailable: options.tailable
            , awaitData: options.awaitData
          }));
        }

        if(cursorState.limit > 0 && currentLimit >= cursorState.limit) {
          cursorState.dead = true;
          cursorState.documents = [];
          return handleCallback(callback, null, null);
        }

        self.next(callback);
      });
    } else if(cursorState.documents.length == 0 && options.tailable) { 
      return handleCallback(callback, MongoError.create({
          message: "No more documents in tailed cursor"
        , tailable: options.tailable
        , awaitData: options.awaitData
      }));
    } else if(cursorState.documents.length == 0 && Long.ZERO.equals(cursorState.cursorId)) {
      cursorState.dead = true;
      handleCallback(callback, null, null);
    } else {
      if(cursorState.limit > 0 && currentLimit >= cursorState.limit) {
        cursorState.dead = true;
        return handleCallback(callback, null, null);
      }

      currentLimit += 1;
      handleCallback(callback, null, cursorState.documents.shift());
    }
  }

  /**
   * Checks if the cursor is dead
   * @method
   * @return {boolean} A boolean signifying if the cursor is dead or not
   */
  this.isDead = function() {
    return cursorState.dead == true;
  }

  /**
   * Returns current buffered documents length
   * @method
   * @return {number} The number of items in the buffered documents
   */
  this.bufferedCount = function() {
    return cursorState.documents.length;
  }

  /**
   * Returns current buffered documents
   * @method
   * @return {Array} An array of buffered documents
   */
  this.readBufferedDocuments = function(number) {
    var length = number < cursorState.documents.length ? number : cursorState.documents.length;
    var elements = cursorState.documents.splice(0, length);
    currentLimit = currentLimit + length;
    return elements;
  }

  /**
   * Resets the cursor
   * @method
   * @return {null}
   */  
  this.rewind = function() {
    if(cursorState.init) {
      if(!cursorState.dead) {
        this.kill();
      }

      currentLimit = 0;
      cursorState.init = false;
      cursorState.dead = false;
      cursorState.killed = false;
      cursorState.documents = [];
      cursorState.cursorId = null;
    }  
  }

  /**
   * Kill the cursor
   * @method
   * @param {resultCallback} callback A callback function
   */
  this.kill = function(callback) {
    // Set cursor to dead
    cursorState.dead = true;
    cursorState.killed = true;
    // Remove documents
    cursorState.documents = [];

    // If no cursor id just return
    if(cursorState.cursorId == null || cursorState.cursorId.isZero() || cursorState.init == false) {
      if(callback) callback(null, null);
      return;
    }

    // Execute command
    server.wireProtocolHandler.killCursor(bson, cursorState.cursorId, connection, callback);
  }

  //
  // Execute getMore command
  var execGetMore = function(callback) {
    if(logger.isDebug()) logger.debug(f("schedule getMore call for query [%s]", JSON.stringify(query)))
    // Determine if it's a raw query
    var raw = options.raw || cmd.raw;
    // We have a wire protocol handler
    server.wireProtocolHandler.getMore(bson, ns, cursorState, cursorState.batchSize, raw, connection, callbacks, options, callback);
  }

  // 
  // Execute the first query
  var execInitialQuery = function(query, callback) {
    if(logger.isDebug()) {
      logger.debug(f("issue initial query [%s] with flags [%s]"
        , JSON.stringify(cmd)
        , JSON.stringify(query)));
    }

    var queryCallback = function(err, result) {
      if(err) return callback(err);

      // Check if we have a command cursor
      if(Array.isArray(result.documents) && result.documents.length == 1) {
        if(result.documents[0]['$err'] 
          || result.documents[0]['errmsg']) {
          return callback(new MongoError(result.documents[0]), null);          
        }

        if(result.documents[0].cursor != null 
          && typeof result.documents[0].cursor != 'string') {
            var id = result.documents[0].cursor.id;
            // Promote id to long if needed
            cursorState.cursorId = typeof id == 'number' ? Long.fromNumber(id) : id;
            // If we have a firstBatch set it
            if(Array.isArray(result.documents[0].cursor.firstBatch)) {
              cursorState.documents = result.documents[0].cursor.firstBatch;
            }

            // Return after processing command cursor
            return callback(null, null);
        }

        if(Array.isArray(result.documents[0].result)) {
          cursorState.documents = result.documents[0].result;
          cursorState.cursorId = Long.ZERO;
          return callback(null, null);
        }
      }

      // Otherwise fall back to regular find path
      cursorState.cursorId = result.cursorId;
      cursorState.documents = result.documents;
      callback(null, null);
    }

    // If we have a raw query decorate the function
    if(options.raw || cmd.raw) {
      queryCallback.raw = options.raw || cmd.raw;
    }

    // Set up callback
    callbacks.register(query.requestId, queryCallback);

    // Write the initial command out
    connection.write(query);
  }
}

module.exports = Cursor;