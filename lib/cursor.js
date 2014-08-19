var Response = require('./connection/commands').Response
  , GetMore = require('./connection/commands').GetMore
  , Query = require('./connection/commands').Query
  , KillCursor = require('./connection/commands').KillCursor
  , Long = require('bson').Long
  , Logger = require('./connection/logger')
  , ReadPreference = require('./topologies/read_preference')
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
 * Creates a new Cursor, not to be used directly
 * @class
 * @param {object} bson An instance of the BSON parser
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {{object}|Long} cmd The selector (can be a command or a cursorId)
 * @param {object} connection The connection used for this cursor
 * @param {object} callbacks The callbacks storage object for the server instance
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {boolean} [options.tailable=false] Tailable flag set
 * @param {boolean} [options.oplogReply=false] oplogReply flag set
 * @param {boolean} [options.awaitdata=false] awaitdata flag set
 * @param {boolean} [options.exhaust=false] exhaust flag set
 * @param {boolean} [options.partial=false] partial flag set
 * @return {Cursor} A cursor instance
 * @property {number} cursorBatchSize The current cursorBatchSize for the cursor
 */
var Cursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  options = options || {};
  // Initial query
  var query = null;

  // Unpack options
  var batchSize = options.batchSize || cmd.batchSize || 0;
  var limit = options.limit || cmd.limit || 0;
  var skip = options.skip || cmd.skip || 0;
  var currentLimit = 0;

  // Cursor connection
  var connection = null;

  // Do we have a not connected handler
  var disconnectHandler = options.disconnectHandler;

  // All internal state
  var self = this;
  var cursorId = null;
  var documents = options.documents || [];
  var dead = false;
  var killed = false;
  var init = false;

  // console.log("----------------------------------- cursor query")
  // console.dir(cmd)

  // Callback controller
  var callbacks = null;

  // Logger
  var logger = Logger('Cursor', options);

  // 
  // Did we pass in a cursor id
  if(typeof cmd == 'number') {
    cursorId = Long.fromNumber(cmd);
  } else if(cmd instanceof Long) {
    cursorId = cmd;
  }

  // Allow the manipulation of the batch size of the cursor
  // after creation has happened
  Object.defineProperty(this, 'cursorBatchSize', {
      enumerable:true,
      set: function(value) { batchSize = value; }
    , get: function() { return batchSize; }
  });

  // Allow the manipulation of the cursor limit
  Object.defineProperty(this, 'cursorLimit', {
      enumerable:true,
      set: function(value) { limit = value; }
    , get: function() { return limit; }
  });

  // Allow the manipulation of the cursor skip
  Object.defineProperty(this, 'cursorSkip', {
      enumerable:true,
      set: function(value) { skip = value; }
    , get: function() { return skip; }
  });

  //
  // Handle callback (including any exceptions thrown)
  var handleCallback = function(callback, err, result) {
    try {
      callback(err, result);
    } catch(err) {
      // console.log("=================================== HANDLE")
      // console.dir(err)
      process.nextTick(function() {
        throw err;
      });
    }
  }

  // console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%")
  // console.dir(cmd)
  // console.dir(options)

  /**
   * Retrieve the next document from the cursor
   * @method
   * @param {resultCallback} callback A callback function
   */
  this.next = function(callback) {
    // console.log("==================== NEXT :: " + documents.length)
    if(killed) return handleCallback(callback, null, null);
    if(dead) return handleCallback(callback, new MongoError("cursor is dead"));    
    // We have just started the cursor
    if(!init) {
      // console.log("================================================== NEXT STARTED")
      // console.dir(topology.isConnected(options))
      // console.dir(disconnectHandler)
      // Topology is not connected, save the call in the provided store to be
      // Executed at some point when the handler deems it's reconnected
      if(!topology.isConnected(options) && disconnectHandler != null) {
        return disconnectHandler.addObjectAndMethod('cursor', self, 'next', [callback], callback);
      }

      // console.log("============================================= GET SERVER")
      // console.dir(topology)

      // Get a server
      var server = topology.getServer(options);
      // Get a connection
      connection = server.getConnection();
      // Get the callbacks
      callbacks = server.getCallbacks();

        // console.log("+++++++++++++++++++++++++++++ CURSOR INIT :: " + callbacks.id)
        // console.log("topology.isConnected() :: " + topology.isConnected())        
        // console.log("disconnectHandler != null :: " + (disconnectHandler != null))
        // console.log("server != null :: " + (server != null))
        // console.log("connection != null :: " + (connection != null))
        // console.log("callbacks != null :: " + (callbacks != null))

      // Set as init
      init = true;
      // Establish type of command
      if(cmd.find) {
        query = setupClassicFind(ns, cmd, topology, options)
      } else if(cursorId != null) {
      } else if(cmd) {
        query = setupCommand(ns, cmd, topology, options);
      } else {
        throw new MongoError(f("command %s does not return a cursor", JSON.stringify(cmd)));
      }      
    }

    // Process exhaust messages
    var processExhaustMessages = function(err, result) {
      // console.log("================================ EXHAUST 1:1")
      // console.log(err)
      // if(result) {
      //   console.log(result.documents.length)
      //   console.log(result.cursorId)
      // }
        if(err) {
          // console.log("+++++++++++++++++++++++++++++++++3")
          dead = true;
          callbacks.unregister(query.requestId);
          return callback(err);
        }

      // console.log("================================ EXHAUST 1:2")
        // Concatenate all the documents
        documents = documents.concat(result.documents);

        // console.log(documents.length)

      // console.log("================================ EXHAUST 1:3")
        // If we have no documents left
        if(Long.ZERO.equals(result.cursorId)) {
          // console.log("+++++++++++++++++++++++++++++++++3")
          cursorId = Long.ZERO;
          // dead = true;
          callbacks.unregister(query.requestId);
          return self.next(callback);
          // return handleCallback(callback, null, documents.shift());
        }

      // console.log("================================ EXHAUST 1:4")
      // console.log("+++++++++++++++++++++++++++++ CURSOR EXHAUST :: " + callbacks.id)
        // Set up next listener
        callbacks.register(result.requestId, processExhaustMessages)

        // Initial result
        if(cursorId == null) {
          cursorId = result.cursorId;
          self.next(callback);
        }
      }    

    // If we have exhaust
    if(options.exhaust && cursorId == null) {
      // console.log("================================ EXHAUST 1 :: " + query.requestId)
      // console.log("+++++++++++++++++++++++++++++ CURSOR EXHAUST START :: " + callbacks.id)
      // Handle all the exhaust responses
      callbacks.register(query.requestId, processExhaustMessages);
      // Write the initial command out
      return connection.write(query);
    } else if(options.exhaust && documents.length > 0) {
      // console.log("================================ EXHAUST 2 :: " + documents.length)
      return handleCallback(callback, null, documents.shift());
    } else if(options.exhaust && Long.ZERO.equals(cursorId)) {
      callbacks.unregister(query.requestId);
      // console.log("================================ EXHAUST 3 :: " + dead)
      return handleCallback(callback, null, null);
    } else if(options.exhaust) {
      // console.log("================================ EXHAUST 4 :: " + dead)
      return setTimeout(function() {
      // console.log("================================ EXHAUST 4:1 :: " + dead)
        if(Long.ZERO.equals(cursorId)) return;
        self.next(callback);
      }, 1);
    }

    // console.log("+++++++++++++++++++++++++++++++++++++++++++ GONE")
    // console.log(options.exhaust)
    // console.log(documents.length)

    // If we don't have a cursorId execute the first query
    if(cursorId == null) {
      execInitialQuery(query, function(err, r) {
        if(err) return handleCallback(callback, err, null);
        if(documents.length == 0) return handleCallback(callback, null, null);
        self.next(callback);
      });
    } else if(documents.length == 0 && !Long.ZERO.equals(cursorId)) {
      execGetMore(function(err, doc) {
        if(err) return handleCallback(callback, err);
        if(documents.length == 0 && Long.ZERO.equals(cursorId)) dead = true;
        // Tailable cursor getMore result, notify owner about it
        // No attempt is made here to retry, this is left to the user of the
        // core module to handle to keep core simple
        if(documents.length == 0 && options.tailable) {
          return handleCallback(callback, MongoError.create({
              message: "No more documents in tailed cursor"
            , tailable: options.tailable
            , awaitData: options.awaitData
          }));
        }

        if(limit > 0 && currentLimit >= limit) {
          dead = true;
          documents = [];
          return handleCallback(callback, null, null);
        }

        self.next(callback);
      });
    } else if(documents.length == 0 && options.tailable) { 
      return handleCallback(callback, MongoError.create({
          message: "No more documents in tailed cursor"
        , tailable: options.tailable
        , awaitData: options.awaitData
      }));
    } else if(documents.length == 0 && Long.ZERO.equals(cursorId)) {
      dead = true;
      handleCallback(callback, null, null);
    } else {
      if(limit > 0 && currentLimit >= limit) {
        dead = true;
        return handleCallback(callback, null, null);
      }

      currentLimit += 1;
      handleCallback(callback, null, documents.shift());
    }
  }

  /**
   * Checks if the cursor is dead
   * @method
   * @return {boolean} A boolean signifying if the cursor is dead or not
   */
  this.isDead = function() {
    return dead == true;
  }

  /**
   * Returns current buffered documents length
   * @method
   * @return {number} The number of items in the buffered documents
   */
  this.bufferedCount = function() {
    return documents.length;
  }

  /**
   * Returns current buffered documents
   * @method
   * @return {Array} An array of buffered documents
   */
  this.readBufferedDocuments = function(number) {
    var length = number < documents.length ? number : documents.length;
    var elements = documents.splice(0, length);
    currentLimit = currentLimit + length;
    return elements;
  }

  /**
   * Resets the cursor
   * @method
   * @return {null}
   */  
  this.rewind = function() {
    if(init) {
      if(!dead) {
        this.kill();
      }

      init = false;
      dead = false;
      killed = false;
      documents = [];
      cursorId = null;
    }  
  }

  /**
   * Kill the cursor
   * @method
   * @param {resultCallback} callback A callback function
   */
  this.kill = function(callback) {
    // Set cursor to dead
    dead = true;
    killed = true;
    // Remove documents
    documents = [];
    // If no cursor id just return
    if(cursorId == null || cursorId.isZero()) {
      if(callback) callback(null, null);
      return;
    }

    // Create a kill cursor command
    var killCursor = new KillCursor(bson, [cursorId]);
    // Execute the kill cursor command
    if(connection && connection.isConnected()) connection.write(killCursor);
    // Set cursor to 0
    cursorId = Long.ZERO;
    // Return to caller
    if(callback) callback(null, null);
  }


  //
  // Execute getMore command
  var execGetMore = function(callback) {
    if(logger.isDebug()) logger.debug(f("schedule getMore call for query [%s]", JSON.stringify(query)))
    // Create getMore command
    var getMore = new GetMore(bson, ns, cursorId, {numberToReturn: batchSize});

    // Query callback
    var queryCallback = function(err, r) {
      if(err) return callback(err);  
      documents = r.documents;
      cursorId = r.cursorId;
      // Return
      callback(null);
    }

    // If we have a raw query decorate the function
    if(options.raw || cmd.raw) {
      queryCallback.raw = options.raw || cmd.raw;
    }
    
      // console.log("+++++++++++++++++++++++++++++ CURSOR GETMORE :: " + callbacks.id)
    // Register a callback
    callbacks.register(getMore.requestId, queryCallback);
    // Write out the getMore command
    connection.write(getMore);
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
            cursorId = typeof id == 'number' ? Long.fromNumber(id) : id;
            // If we have a firstBatch set it
            if(Array.isArray(result.documents[0].cursor.firstBatch)) {
              documents = result.documents[0].cursor.firstBatch;
            }

            // Return after processing command cursor
            return callback(null, null);
        }

        if(Array.isArray(result.documents[0].result)) {
          documents = result.documents[0].result;
          cursorId = Long.ZERO;
          return callback(null, null);
        }
      }

      // Otherwise fall back to regular find path
      cursorId = result.cursorId;
      documents = result.documents;
      callback(null, null);
    }

    // If we have a raw query decorate the function
    if(options.raw || cmd.raw) {
      queryCallback.raw = options.raw || cmd.raw;
    }

    // console.log("(((((((((((((((((((((((((((((((((((((((((((((((((((( 0")

      // console.log("+++++++++++++++++++++++++++++ CURSOR QUERY :: " + callbacks.id)

    // Set up callback
    callbacks.register(query.requestId, queryCallback);

    // console.log("(((((((((((((((((((((((((((((((((((((((((((((((((((( 1")
    // Write the initial command out
    connection.write(query);
  }

  //
  // Execute a find command
  var setupClassicFind = function(ns, cmd, topology, options) {
    // console.log("-------------------------------------- setupClassicFind")
    var readPreference = options.readPreference || new ReadPreference('primary');
    if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
    if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

    // Ensure we have at least some options
    options = options || {};
    // Set the optional batchSize
    batchSize = cmd.batchSize || batchSize;
    var numberToReturn = 0;
    
    // Unpack the limit and batchSize values
    if(limit == 0) {
      numberToReturn = batchSize;
    } else if(limit < 0 || limit < batchSize || (limit > 0 && batchSize == 0)) {
      numberToReturn = limit;
    } else {
      numberToReturn = batchSize;
    }

    var numberToSkip = skip || 0;
    // Build actual find command
    var findCmd = {};
    // Using special modifier
    var usesSpecialModifier = false;

    // We have a Mongos topology, check if we need to add a readPreference
    if(topology.type == 'mongos' && readPreference) {
      findCmd['$readPreference'] = readPreference.toJSON();
      usesSpecialModifier = true;
    }

    // Add special modifiers to the query
    if(cmd.sort) findCmd['orderby'] = cmd.sort, usesSpecialModifier = true;
    if(cmd.hint) findCmd['$hint'] = cmd.hint, usesSpecialModifier = true;
    if(cmd.snapshot) findCmd['$snapshot'] = cmd.snapshot, usesSpecialModifier = true;
    if(cmd.returnKey) findCmd['$returnKey'] = cmd.returnKey, usesSpecialModifier = true;
    if(cmd.maxScan) findCmd['$maxScan'] = cmd.maxScan, usesSpecialModifier = true;
    if(cmd.min) findCmd['$min'] = cmd.min, usesSpecialModifier = true;
    if(cmd.max) findCmd['$max'] = cmd.max, usesSpecialModifier = true;
    if(cmd.showDiskLoc) findCmd['$showDiskLoc'] = cmd.showDiskLoc, usesSpecialModifier = true;
    if(cmd.comment) findCmd['$comment'] = cmd.comment, usesSpecialModifier = true;
    if(cmd.maxTimeMS) findCmd['$maxTimeMS'] = cmd.maxTimeMS, usesSpecialModifier = true;

    // If we have explain, return a single document and close cursor
    if(cmd.explain) {
      numberToReturn = -1;
      usesSpecialModifier = true;
      findCmd['$explain'] = true;
    }

    // If we have a special modifier
    if(usesSpecialModifier) {      
      findCmd['$query'] = cmd.query;
    } else {
      findCmd = cmd.query;
    }

    // Build Query object
    var query = new Query(bson, ns, findCmd, {
        numberToSkip: numberToSkip, numberToReturn: numberToReturn
      , checkKeys: false, returnFieldSelector: cmd.fields
    });

    // Set query flags
    query.slaveOk = readPreference.slaveOk();

    // Set up the option bits for wire protocol
    if(options.tailable) { query.tailable = options.tailable; }
    if(options.oplogReply)query.oplogReply = options.oplogReply;
    if(options.noCursorTimeout) query.noCursorTimeout = options.noCursorTimeout;
    if(options.awaitData) query.awaitData = options.awaitData;
    if(options.exhaust) query.exhaust = options.exhaust;
    if(options.partial) query.partial = options.partial;
    // Return the query
    return query;
  }  

  //
  // Set up a command cursor
  var setupCommand = function(ns, cmd, topology, options) {
    // console.log("-------------------------------------- setupCommand")
    var readPreference = options.readPreference || new ReadPreference('primary');
    if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
    if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

    // Set empty options object
    options = options || {}

    // Final query
    var finalCmd = {};
    for(var name in cmd) {
      finalCmd[name] = cmd[name];
    }

    // Build command namespace
    var parts = ns.split(/\./);
    // Remove namespace db
    parts.pop()
    // Add command for initial execution
    parts.push("$cmd");

    // We have a Mongos topology, check if we need to add a readPreference
    if(topology.type == 'mongos' && readPreference) {
      findCmd['$readPreference'] = readPreference.toJSON();
    }

    // Build Query object
    var query = new Query(bson, parts.join("."), finalCmd, {
        numberToSkip: 0, numberToReturn: -1
      , checkKeys: false
    });

    // Set query flags
    query.slaveOk = readPreference.slaveOk();

    // Options
    if(options.tailable) query.tailable = options.tailable;
    if(options.oplogReply)query.oplogReply = options.oplogReply;
    if(options.noCursorTimeout) query.noCursorTimeout = options.noCursorTimeout;
    if(options.awaitdata) query.awaitdata = options.awaitdata;
    if(options.exhaust) query.exhaust = options.exhaust;
    if(options.partial) query.partial = options.partial;
    // Return the query
    return query;
  }
}

module.exports = Cursor;