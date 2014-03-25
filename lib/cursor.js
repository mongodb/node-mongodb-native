var Response = require('./connection/commands').Response
  , GetMore = require('./connection/commands').GetMore
  , Query = require('./connection/commands').Query
  , Long = require('bson').Long
  , ReadPreference = require('./topologies/read_preference')
  , MongoError = require('./error');

var Cursor = function(bson, ns, cmd, options, connection, callbacks, options) {
  options = options || {};
  // Initial query
  var query = null;
  // Unpack options
  var batchSize = options.batchSize || 0;

  // All internal state
  var self = this;
  var cursorId = null;
  var documents = [];
  var dead = false;

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
      execGetMore(function(err, r) {
        if(err) return callback(err, null);
        self.next(callback);
      });
    } else if(documents.length == 0 && Long.ZERO.equals(cursorId)) {
      dead = true;
      callback(null, null);
    } else {
      callback(null, documents.shift());
    }
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
    if(cmd.tailable) query.tailable = cmd.tailable;
    if(cmd.oplogReply)query.oplogReply = cmd.oplogReply;
    if(cmd.noCursorTimeout) query.noCursorTimeout = cmd.noCursorTimeout;
    if(cmd.awaitdata) query.awaitdata = cmd.awaitdata;
    if(cmd.exhaust) query.exhaust = cmd.exhaust;
    if(cmd.partial) query.partial = cmd.partial;
    // Return the query
    return query;
  }  

  // Establish type of command
  if(cmd.find) {
    query = setupClassicFind(ns, cmd, options)
  }  
}

module.exports = Cursor;