"use strict";

var Insert = require('./commands').Insert
  , Update = require('./commands').Update
  , Remove = require('./commands').Remove
  , Query = require('../connection/commands').Query
  , copy = require('../connection/utils').copy
  , KillCursor = require('../connection/commands').KillCursor
  , GetMore = require('../connection/commands').GetMore
  , Query = require('../connection/commands').Query
  , ReadPreference = require('../topologies/read_preference')
  , f = require('util').format
  , CommandResult = require('../topologies/command_result')
  , MongoError = require('../error')
  , Long = require('bson').Long;

var WireProtocol = function(legacyWireProtocol) {
  this.legacyWireProtocol = legacyWireProtocol;
}

//
// Execute a write operation
var executeWrite = function(topology, type, opsField, ns, ops, options, callback) {
  if(ops.length == 0) throw new MongoError("insert must contain at least one document");
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  // Split the ns up to get db and collection
  var p = ns.split(".");
  var d = p.shift();
  // Options
  var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
  var writeConcern = options.writeConcern;

  // return skeleton
  var writeCommand = {};
  writeCommand[type] = p.join('.');
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;

  // Did we specify a write concern
  if(writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  // Do we have bypassDocumentValidation set, then enable it on the write command
  if(typeof options.bypassDocumentValidation == 'boolean') {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // Options object
  var opts = {};
  if(type == 'insert') opts.checkKeys = true;
  // Ensure we support serialization of functions
  if(options.serializeFunctions) opts.serializeFunctions = options.serializeFunctions;
  if(options.ignoreUndefined) opts.ignoreUndefined = options.ignoreUndefined;
  // Execute command
  topology.command(f("%s.$cmd", d), writeCommand, opts, callback);
}

//
// Needs to support legacy mass insert as well as ordered/unordered legacy
// emulation
//
WireProtocol.prototype.insert = function(topology, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
  executeWrite(topology, 'insert', 'documents', ns, ops, options, callback);
}

WireProtocol.prototype.update = function(topology, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
  executeWrite(topology, 'update', 'updates', ns, ops, options, callback);
}

WireProtocol.prototype.remove = function(topology, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
  executeWrite(topology, 'delete', 'deletes', ns, ops, options, callback);
}

WireProtocol.prototype.killCursor = function(bson, ns, cursorId, pool, callbacks, callback) {
  // Build command namespace
  var parts = ns.split(/\./);
  // Command namespace
  var commandns = f('%s.$cmd', parts.shift());
  // Create getMore command
  var killcursorCmd = {
    killCursors: parts.join('.'),
    cursors: [cursorId]
  }

  // Build Query object
  var query = new Query(bson, commandns, killcursorCmd, {
      numberToSkip: 0, numberToReturn: -1
    , checkKeys: false, returnFieldSelector: null
  });

  // Set query flags
  query.slaveOk = true;

  // Execute the kill cursor command
  if(pool && pool.isConnected()) {
    pool.write(query.toBin(), callback);
  }

  // Kill cursor callback
  var killCursorCallback = function(err, r) {
    if(err) {
      if(typeof callback != 'function') return;
      return callback(err);
    }

    // If we have a timed out query or a cursor that was killed
    if((r.responseFlags & (1 << 0)) != 0) {
      if(typeof callback != 'function') return;
      return callback(new MongoError("cursor killed or timed out"), null);
    }

    if(!Array.isArray(r.documents) || r.documents.length == 0) {
      if(typeof callback != 'function') return;
      return callback(new MongoError(f('invalid killCursors result returned for cursor id %s', cursorState.cursorId)));
    }

    // Return the result
    if(typeof callback == 'function') {
      callback(null, r.documents[0]);
    }
  }

  // Register a callback
  callbacks.register(query.requestId, killCursorCallback);
}

WireProtocol.prototype.getMore = function(bson, ns, cursorState, batchSize, raw, pool, callbacks, options, callback) {
  var readPreference = options.readPreference || new ReadPreference('primary');
  if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
  if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');
  // Build command namespace
  var parts = ns.split(/\./);
  // Command namespace
  var commandns = f('%s.$cmd', parts.shift());

  // Check if we have an maxTimeMS set
  var maxTimeMS = typeof cursorState.cmd.maxTimeMS == 'number' ? cursorState.cmd.maxTimeMS : 3000;

  // Create getMore command
  var getMoreCmd = {
    getMore: cursorState.cursorId,
    collection: parts.join('.'),
    batchSize: Math.abs(batchSize)
  }

  if(cursorState.cmd.tailable
    && typeof cursorState.cmd.maxAwaitTimeMS == 'number') {
    getMoreCmd.maxTimeMS = cursorState.cmd.maxAwaitTimeMS;
  }

  // Build Query object
  var query = new Query(bson, commandns, getMoreCmd, {
      numberToSkip: 0, numberToReturn: -1
    , checkKeys: false, returnFieldSelector: null
  });

  // Set query flags
  query.slaveOk = true;

  // Query callback
  var queryCallback = function(err, r) {
    if(err) return callback(err);

    // If we have a timed out query or a cursor that was killed
    if((r.responseFlags & (1 << 0)) != 0) {
      return callback(new MongoError("cursor killed or timed out"), null);
    }

    // Raw, return all the extracted documents
    if(raw) {
      cursorState.documents = r.documents;
      cursorState.cursorId = r.cursorId;
      return callback(null, r.documents);
    }

    // We have an error detected
    if(r.documents[0].ok == 0) {
      return callback(MongoError.create(r.documents[0]));
    }

    // Ensure we have a Long valid cursor id
    var cursorId = typeof r.documents[0].cursor.id == 'number'
      ? Long.fromNumber(r.documents[0].cursor.id)
      : r.documents[0].cursor.id;

    // Set all the values
    cursorState.documents = r.documents[0].cursor.nextBatch;
    cursorState.cursorId = cursorId;

    // Return the result
    callback(null, r.documents[0]);
  }

  // If we have a raw query decorate the function
  if(raw) {
    queryCallback.raw = raw;
  }

  // Add the result field needed
  queryCallback.documentsReturnedIn = 'nextBatch';

  // Register a callback
  callbacks.register(query.requestId, queryCallback);
  // Write out the getMore command
  pool.write(query.toBin(), queryCallback);
}

WireProtocol.prototype.command = function(bson, ns, cmd, cursorState, topology, options) {
  // Establish type of command
  if(cmd.find) {
    if(cmd.exhaust) {
      return this.legacyWireProtocol.command(bson, ns, cmd, cursorState, topology, options);
    }

    // Create the find command
    var query = executeFindCommand(bson, ns, cmd, cursorState, topology, options)
    // Mark the cmd as virtual
    cmd.virtual = false;
    // Signal the documents are in the firstBatch value
    query.documentsReturnedIn = 'firstBatch';
    // Return the query
    return query;
  } else if(cursorState.cursorId != null) {
  } else if(cmd) {
    return setupCommand(bson, ns, cmd, cursorState, topology, options);
  } else {
    throw new MongoError(f("command %s does not return a cursor", JSON.stringify(cmd)));
  }
}

// // Command
// {
//     find: ns
//   , query: <object>
//   , limit: <n>
//   , fields: <object>
//   , skip: <n>
//   , hint: <string>
//   , explain: <boolean>
//   , snapshot: <boolean>
//   , batchSize: <n>
//   , returnKey: <boolean>
//   , maxScan: <n>
//   , min: <n>
//   , max: <n>
//   , showDiskLoc: <boolean>
//   , comment: <string>
//   , maxTimeMS: <n>
//   , raw: <boolean>
//   , readPreference: <ReadPreference>
//   , tailable: <boolean>
//   , oplogReplay: <boolean>
//   , noCursorTimeout: <boolean>
//   , awaitdata: <boolean>
//   , exhaust: <boolean>
//   , partial: <boolean>
// }

// FIND/GETMORE SPEC
// {
//     “find”: <string>,
//     “filter”: { ... },
//     “sort”: { ... },
//     “projection”: { ... },
//     “hint”: { ... },
//     “skip”: <int>,
//     “limit”: <int>,
//     “batchSize”: <int>,
//     “singleBatch”: <bool>,
//     “comment”: <string>,
//     “maxScan”: <int>,
//     “maxTimeMS”: <int>,
//     “max”: { ... },
//     “min”: { ... },
//     “returnKey”: <bool>,
//     “showRecordId”: <bool>,
//     “snapshot”: <bool>,
//     “tailable”: <bool>,
//     “oplogReplay”: <bool>,
//     “noCursorTimeout”: <bool>,
//     “awaitData”: <bool>,
//     “partial”: <bool>,
//     “$readPreference”: { ... }
// }

//
// Execute a find command
var executeFindCommand = function(bson, ns, cmd, cursorState, topology, options) {
  var readPreference = options.readPreference || new ReadPreference('primary');
  if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
  if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

  // Does the cmd have a readPreference
  if(cmd.readPreference) {
    readPreference = cmd.readPreference;
  }

  // Ensure we have at least some options
  options = options || {};
  // Set the optional batchSize
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  // Build command namespace
  var parts = ns.split(/\./);
  // Command namespace
  var commandns = f('%s.$cmd', parts.shift());

  // Build actual find command
  var findCmd = {
    find: parts.join('.')
  };

  // I we provided a filter
  if(cmd.query) findCmd.filter = cmd.query;

  // Sort value
  var sortValue = cmd.sort;

  // Handle issue of sort being an Array
  if(Array.isArray(sortValue)) {
    var sortObject = {};

    if(sortValue.length > 0 && !Array.isArray(sortValue[0])) {
      var sortDirection = sortValue[1];
      // Translate the sort order text
      if(sortDirection == 'asc') {
        sortDirection = 1;
      } else if(sortDirection == 'desc') {
        sortDirection = -1;
      }

      // Set the sort order
      sortObject[sortValue[0]] = sortDirection;
    } else {
      for(var i = 0; i < sortValue.length; i++) {
        var sortDirection = sortValue[i][1];
        // Translate the sort order text
        if(sortDirection == 'asc') {
          sortDirection = 1;
        } else if(sortDirection == 'desc') {
          sortDirection = -1;
        }

        // Set the sort order
        sortObject[sortValue[i][0]] = sortDirection;
      }
    }

    sortValue = sortObject;
  };

  // Add sort to command
  if(cmd.sort) findCmd.sort = sortValue;
  // Add a projection to the command
  if(cmd.fields) findCmd.projection = cmd.fields;
  // Add a hint to the command
  if(cmd.hint) findCmd.hint = cmd.hint;
  // Add a skip
  if(cmd.skip) findCmd.skip = cmd.skip;
  // Add a limit
  if(cmd.limit) findCmd.limit = cmd.limit;
  // Add a batchSize
  if(typeof cmd.batchSize == 'number') findCmd.batchSize = Math.abs(cmd.batchSize);

  // Check if we wish to have a singleBatch
  if(cmd.limit < 0) {
    findCmd.limit = Math.abs(cmd.limit);
    findCmd.singleBatch = true;
  }

  // If we have comment set
  if(cmd.comment) findCmd.comment = cmd.comment;

  // If we have maxScan
  if(cmd.maxScan) findCmd.maxScan = cmd.maxScan;

  // If we have maxTimeMS set
  if(cmd.maxTimeMS) findCmd.maxTimeMS = cmd.maxTimeMS;

  // If we have min
  if(cmd.min) findCmd.min = cmd.min;

  // If we have max
  if(cmd.max) findCmd.max = cmd.max;

  // If we have returnKey set
  if(cmd.returnKey) findCmd.returnKey = cmd.returnKey;

  // If we have showDiskLoc set
  if(cmd.showDiskLoc) findCmd.showRecordId = cmd.showDiskLoc;

  // If we have snapshot set
  if(cmd.snapshot) findCmd.snapshot = cmd.snapshot;

  // If we have tailable set
  if(cmd.tailable) findCmd.tailable = cmd.tailable;

  // If we have oplogReplay set
  if(cmd.oplogReplay) findCmd.oplogReplay = cmd.oplogReplay;

  // If we have noCursorTimeout set
  if(cmd.noCursorTimeout) findCmd.noCursorTimeout = cmd.noCursorTimeout;

  // If we have awaitData set
  if(cmd.awaitData) findCmd.awaitData = cmd.awaitData;
  if(cmd.awaitdata) findCmd.awaitData = cmd.awaitdata;

  // If we have partial set
  if(cmd.partial) findCmd.partial = cmd.partial;

  // If we have explain, we need to rewrite the find command
  // to wrap it in the explain command
  if(cmd.explain) {
    findCmd = {
      explain: findCmd
    }
  }

  // Did we provide a readConcern
  if(cmd.readConcern) findCmd.readConcern = cmd.readConcern;

  // Set up the serialize and ignoreUndefined fields
  var serializeFunctions = typeof options.serializeFunctions == 'boolean'
    ? options.serializeFunctions : false;
  var ignoreUndefined = typeof options.ignoreUndefined == 'boolean'
    ? options.ignoreUndefined : false;

  // We have a Mongos topology, check if we need to add a readPreference
  if(topology.type == 'mongos'
    && readPreference
    && readPreference.preference != 'primary') {
    findCmd = {
      '$query': findCmd,
      '$readPreference': readPreference.toJSON()
    };
  }

  // Build Query object
  var query = new Query(bson, commandns, findCmd, {
      numberToSkip: 0, numberToReturn: -1
    , checkKeys: false, returnFieldSelector: null
    , serializeFunctions: serializeFunctions, ignoreUndefined: ignoreUndefined
  });

  // Set query flags
  query.slaveOk = readPreference.slaveOk();

  // Return the query
  return query;
}

//
// Set up a command cursor
var setupCommand = function(bson, ns, cmd, cursorState, topology, options) {
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

  // Serialize functions
  var serializeFunctions = typeof options.serializeFunctions == 'boolean'
    ? options.serializeFunctions : false;

  // Set up the serialize and ignoreUndefined fields
  var ignoreUndefined = typeof options.ignoreUndefined == 'boolean'
    ? options.ignoreUndefined : false;

  // We have a Mongos topology, check if we need to add a readPreference
  if(topology.type == 'mongos'
    && readPreference
    && readPreference.preference != 'primary') {
    finalCmd = {
      '$query': finalCmd,
      '$readPreference': readPreference.toJSON()
    };
  }

  // Build Query object
  var query = new Query(bson, f('%s.$cmd', parts.shift()), finalCmd, {
      numberToSkip: 0, numberToReturn: -1
    , checkKeys: false, serializeFunctions: serializeFunctions
    , ignoreUndefined: ignoreUndefined
  });

  // Set query flags
  query.slaveOk = readPreference.slaveOk();

  // Return the query
  return query;
}

/**
 * @ignore
 */
var bindToCurrentDomain = function(callback) {
  var domain = process.domain;
  if(domain == null || callback == null) {
    return callback;
  } else {
    return domain.bind(callback);
  }
}

module.exports = WireProtocol;
