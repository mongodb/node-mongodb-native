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
var Cursor = function(bson, ns, cmd, connection, callbacks, options) {
  options = options || {};
  // Initial query
  var query = null;

  // Unpack options
  var batchSize = options.batchSize || cmd.batchSize || 0;
  var limit = options.limit || cmd.limit || 0;
  var skip = options.skip || cmd.skip || 0;
  var currentLimit = 0;

  // All internal state
  var self = this;
  var cursorId = null;
  var documents = options.documents || [];
  var dead = false;
  var killed = false;
  var init = false;

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
      set: function(value) { 
        // console.log("--------------------- set cursor skip")
        skip = value; }
    , get: function() { return skip; }
  });

  var counter = 0;

  /**
   * Retrieve the next document from the cursor
   * @method
   * @param {resultCallback} callback A callback function
   */
  this.next = function(callback) {
    // console.log("))))))))))))))))))))))))))))))))))))))))) next " + documents.length + " = " + cursorId)    
    if(killed) return callback(null, null);
    if(dead) return callback(new MongoError("cursor is dead"));
    // We have just started the cursor
    if(!init) {
      init = true;
      // Establish type of command
      if(cmd.find) {
        query = setupClassicFind(ns, cmd, options)
      } else if(cmd.cursor) {
        query = setupCommand(ns, cmd, options);
      } else if(cursorId != null) {
      } else {
        throw new MongoError(f("command %s does not return a cursor", JSON.stringify(cmd)));
      }      
    }

    // If we don't have a cursorId execute the first query
    if(cursorId == null) {
      execInitialQuery(query, function(err, r) {
        // console.log("----------------------------------- initial")
        // console.dir(documents.length);
        if(err) return callback(err, null);
        // console.log("$$$$$$$$$$$$$$$$$$$$$$$$ execInitialQuery :: " + documents.length)
        // console.dir(documents)
        if(documents.length == 0) return callback(null, null);
        self.next(callback);
      });
    } else if(documents.length == 0 && !Long.ZERO.equals(cursorId)) {
      // console.log("+++++++++++++++++++++++++++++++++++++exec getmore")
      execGetMore(function(err, doc) {
        if(err) return callback(err);
        // console.log("+++++++++++++++++++++++++++++++++++++exec getmore 1")
        // console.dir(err)
        // console.log(cursorId)
        // console.dir(documents.length);
        // next(callback);
        // console.dir(doc)
        if(documents.length == 0 && Long.ZERO.equals(cursorId)) dead = true;
        // Tailable cursor getMore result, notify owner about it
        // No attempt is made here to retry, this is left to the user of the
        // core module to handle to keep core simple
        if(documents.length == 0 && options.tailable) {
          return callback(MongoError.create({
              message: "No more documents in tailed cursor"
            , tailable: options.tailable
            , awaitData: options.awaitData
          }));
        }

        // // console.log("===================== execGetMore :: " + documents.length)
        // // console.dir(documents)
        // // console.dir(cursorId)
        // // console.dir(options)
        // currentLimit += 1;

        if(limit > 0 && currentLimit >= limit) {
          dead = true;
          documents = [];
          return callback(null, null);
        }

        // console.log("===================== execGetMore :: " + documents.length)
        self.next(callback);
        // callback(err, doc);
      });
    } else if(documents.length == 0 && options.tailable) { 
      return callback(MongoError.create({
          message: "No more documents in tailed cursor"
        , tailable: options.tailable
        , awaitData: options.awaitData
      }));
    } else if(documents.length == 0 && Long.ZERO.equals(cursorId)) {
      dead = true;
      // console.log("####################### counter next :: " + counter)
      callback(null, null);
    } else {
    // counter++;
    // console.log(documents.length)
      // console.log("==================================================2")
      // console.log("limit " + limit)
      // console.log("currentLimit " + currentLimit)
      if(limit > 0 && currentLimit >= limit) {
        dead = true;
        return callback(null, null);
      }

      currentLimit += 1;
      callback(null, documents.shift());
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
    if(connection.isConnected()) connection.write(killCursor);
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
    // Register a callback
    callbacks.once(getMore.requestId, function(err, r) {
      // console.dir("+++++++++++++++++++++++++++ EXECUTE")
      // console.dir(err)
      // console.log("---------------------- number returned :: " + r.numberReturned)
      // console.dir(callback)
      if(err) return callback(err);  
      documents = r.documents;
      cursorId = r.cursorId;
      // Return
      callback(null);
    });

    // console.log("connection write :: " + connection.isConnected())
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

    // Set up callback
    callbacks.once(query.requestId, function(err, result) {
      if(err) return callback(err);
      
      // Check if we have a command cursor
      if(Array.isArray(result.documents) && result.documents.length == 1) {
        if(result.documents[0]['$err'] 
          || result.documents[0]['errmsg'])
          return callback(new MongoError(result.documents[0]), null);

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
      }

      // Otherwise fall back to regular find path
      cursorId = result.cursorId;
      documents = result.documents;
      callback(null, null);
    });

    // Write the initial command out
    connection.write(query);
  }

  //
  // Execute a find command
  var setupClassicFind = function(ns, cmd, options) {
    var readPreference = options.readPreference || new ReadPreference('primary');
    if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
    if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

    // Ensure we have at least some options
    options = options || {};
    // Set the optional batchSize
    batchSize = cmd.batchSize || batchSize;
    // console.log("--------------------------- limit :: " + limit)
    // console.log("--------------------------- batchSize :: " + batchSize)
    var numberToReturn = 0;
    
    // Unpack the limit and batchSize values
    if(limit == 0) {
      numberToReturn = batchSize;
    } else if(limit < 0 || limit < batchSize || (limit > 0 && batchSize == 0)) {
      numberToReturn = limit;
    } else {
      numberToReturn = batchSize;
    }

    // var numberToReturn = limit != 0 && limit < batchSize ? limit : batchSize;
    // console.log("--------------------------- numberToReturn :: " + numberToReturn)

    var numberToSkip = skip || 0;
    // console.log("--------------------------- skip :: " + skip)
    // console.log("--------------------------- numberToSkip :: " + numberToSkip)
    // Build actual find command
    var findCmd = {};
    // Using special modifier
    var usesSpecialModifier = false;
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
      findCmd = cmd;
    }

    // console.log("--------------------------- numberToReturn :: " + numberToReturn)
    // console.dir(findCmd)
    // Build Query object
    var query = new Query(bson, ns, findCmd, {
        numberToSkip: numberToSkip, numberToReturn: numberToReturn
      , checkKeys: false, returnFieldSelector: cmd.fields
    });

    // console.dir(options)

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
  var setupCommand = function(ns, cmd, options) {
    var readPreference = options.readPreference || new ReadPreference('primary');
    if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
    if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

    // Set empty options object
    options = options || {}

    // Build command namespace
    var parts = ns.split(/\./);
    // Remove namespace db
    parts.pop()
    // Add command for initial execution
    parts.push("$cmd");

    // Build Query object
    var query = new Query(bson, parts.join("."), cmd, {
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