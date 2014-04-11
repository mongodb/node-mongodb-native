var Response = require('./connection/commands').Response
  , GetMore = require('./connection/commands').GetMore
  , Query = require('./connection/commands').Query
  , KillCursor = require('./connection/commands').KillCursor
  , Long = require('bson').Long
  , ReadPreference = require('./topologies/read_preference')
  , MongoError = require('./error')
  , f = require('util').format;  

var Cursor = function(bson, ns, cmd, options, connection, callbacks, options) {
  options = options || {};
  // Initial query
  var query = null;
  // Unpack options
  var batchSize = options.batchSize || 0;

  // All internal state
  var self = this;
  var cursorId = null;
  var documents = options.documents || [];
  var dead = false;

  // 
  // Did we pass in a cursor id
  if(typeof cmd == 'number') {
    cursorId = Long.fromNumber(cmd);
  } else if(cmd instanceof Long) {
    cursorId = cmd;
  }

  //
  // Retrieve the next document from the cursor
  this.next = function(callback) {
    if(dead) return callback(new MongoError("cursor is dead"));
    // If we don't have a cursorId execute the first query
    if(cursorId == null) {
      execInitialQuery(query, function(err, r) {
        if(err) return callback(err, null);
        self.next(callback);
      });
    } else if(documents.length == 0 && !Long.ZERO.equals(cursorId)) {
      execGetMore(function(err, doc) {
        callback(err, doc);
      });
    } else if(documents.length == 0 && Long.ZERO.equals(cursorId)) {
      dead = true;
      callback(null, null);
    } else {
      callback(null, documents.shift());
    }
  }

  //
  // Kill the cursor
  this.kill = function(callback) {
    // Set cursor to dead
    dead = true;
    // If no cursor id just return
    if(cursorId.isZero()) return callback(null, null);
    // Create a kill cursor command
    var killCursor = new KillCursor(bson, [cursorId]);
    // Execute the kill cursor command
    connection.write(killCursor);
    // Set cursor to 0
    cursorId = Long.ZERO;
    // Return to caller
    callback(null, null);
  }


  //
  // Execute getMore command
  var execGetMore = function(callback) {
    // Create getMore command
    var getMore = new GetMore(bson, ns, cursorId, {numberToReturn: batchSize});
    // Register a callback
    callbacks.once(getMore.requestId, function(err, r) {
      if(err) return callback(err);      
      documents = r.documents;
      cursorId = r.cursorId;
      // Return the next document
      callback(null, documents.shift());
    });

    // Write out the getMore command
    connection.write(getMore);
  }

  // 
  // Execute the first query
  var execInitialQuery = function(query, callback) {
    // Set up callback
    callbacks.once(query.requestId, function(err, result) {
      if(err) return callback(err);

      // Check if we have a command cursor
      if(Array.isArray(result.documents) && result.documents.length == 1) {
        if(result.documents[0].cursor) {
          var id = result.documents[0].cursor.id;
          // Promote id to long if needed
          cursorId = typeof id == 'number' 
            ? Long.fromNumber(id) : id;
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
    if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

    // Ensure we have at least some options
    options = options || {};
    // Unpack the limit and skip values
    var numberToReturn = options.limit || 0;
    var numberToSkip = options.skip || 0;
    var batchSize = options.batchSize || 0;
    // Build actual find command
    var findCmd = { '$query': cmd.query };
    // Add special modifiers to the query
    if(cmd.sort) findCmd['orderby'] = cmd.sort;
    if(cmd.hint) findCmd['$hint'] = cmd.hint;
    if(cmd.snapshot) findCmd['$snapshot'] = cmd.snapshot;    
    if(cmd.returnKey) findCmd['$returnKey'] = cmd.returnKey;
    if(cmd.maxScan) findCmd['$maxScan'] = cmd.maxScan;
    if(cmd.min) findCmd['$min'] = cmd.min;
    if(cmd.max) findCmd['$max'] = cmd.max;
    if(cmd.showDiskLoc) findCmd['$showDiskLoc'] = cmd.showDiskLoc;
    if(cmd.comment) findCmd['$comment'] = cmd.comment;
    if(cmd.maxTimeMS) findCmd['$maxTimeMS'] = cmd.maxTimeMS;

    // If we have explain, return a single document and close cursor
    if(cmd.explain) {
      numberToReturn = -1;
      findCmd['$explain'] = true;
    }

    // Build Query object
    var query = new Query(bson, ns, findCmd, {
        numberToSkip: numberToSkip, numberToReturn: numberToReturn
      , checkKeys: false
    });

    // Set query flags
    query.slaveOk = readPreference.slaveOk();
    // Set up the option bits for wire protocol
    if(options.tailable) query.tailable = options.tailable;
    if(options.oplogReply)query.oplogReply = options.oplogReply;
    if(options.noCursorTimeout) query.noCursorTimeout = options.noCursorTimeout;
    if(options.awaitdata) query.awaitdata = options.awaitdata;
    if(options.exhaust) query.exhaust = options.exhaust;
    if(options.partial) query.partial = options.partial;
    // Return the query
    return query;
  }  

  //
  // Set up a command cursor
  var setupCommand = function(ns, cmd, options) {
    var readPreference = options.readPreference || new ReadPreference('primary');
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

module.exports = Cursor;