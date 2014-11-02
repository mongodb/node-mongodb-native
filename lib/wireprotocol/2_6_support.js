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

var LegacySupport = function() {}

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
  var writeConcern = options.writeConcern || {};
  // return skeleton
  var writeCommand = {};
  writeCommand[type] = p.join('.');
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;
  writeCommand.writeConcern = writeConcern;    

  // Options object
  var opts = {};
  if(type == 'insert') opts.checkKeys = true;
  // Ensure we support serialization of functions
  if(options.serializeFunctions) opts.serializeFunctions = options.serializeFunctions;

  // Execute command
  topology.command(f("%s.$cmd", d), writeCommand, opts, callback);    
}

//
// Needs to support legacy mass insert as well as ordered/unordered legacy
// emulation
//
LegacySupport.prototype.insert = function(topology, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
  executeWrite(topology, 'insert', 'documents', ns, ops, options, callback);
}

LegacySupport.prototype.update = function(topology, ismaster, ns, bson, pool, callbacks, ops, options, callback) {    
  executeWrite(topology, 'update', 'updates', ns, ops, options, callback);
}  

LegacySupport.prototype.remove = function(topology, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
  executeWrite(topology, 'delete', 'deletes', ns, ops, options, callback);
}

LegacySupport.prototype.killCursor = function(bson, cursorId, connection, callback) {
  // Create a kill cursor command
  var killCursor = new KillCursor(bson, [cursorId]);
  // Execute the kill cursor command
  if(connection && connection.isConnected()) connection.write(killCursor);
  // Set cursor to 0
  cursorId = Long.ZERO;
  // Return to caller
  if(callback) callback(null, null);
}

LegacySupport.prototype.getMore = function(bson, ns, cursorState, batchSize, raw, connection, callbacks, options, callback) {
  // Create getMore command
  var getMore = new GetMore(bson, ns, cursorState.cursorId, {numberToReturn: batchSize});

  // Query callback
  var queryCallback = function(err, r) {
    if(err) return callback(err);

    // If we have a timed out query or a cursor that was killed
    if((r.responseFlags & (1 << 0)) != 0) {
      return callback(new MongoError("cursor killed or timed out"), null);
    }

    // Set all the values
    cursorState.documents = r.documents;
    cursorState.cursorId = r.cursorId;
    // Return
    callback(null);
  }

  // If we have a raw query decorate the function
  if(raw) {
    queryCallback.raw = raw;
  }
  
  // Register a callback
  callbacks.register(getMore.requestId, queryCallback);
  // Write out the getMore command
  connection.write(getMore);
}

LegacySupport.prototype.command = function(bson, ns, cmd, cursorState, topology, options) {
  // Establish type of command
  if(cmd.find) {
    return setupClassicFind(bson, ns, cmd, cursorState, topology, options)
  } else if(cursorState.cursorId != null) {
  } else if(cmd) {
    return setupCommand(bson, ns, cmd, cursorState, topology, options);
  } else {
    throw new MongoError(f("command %s does not return a cursor", JSON.stringify(cmd)));
  }
}

//
// Execute a find command
var setupClassicFind = function(bson, ns, cmd, cursorState, topology, options) {
  var readPreference = options.readPreference || new ReadPreference('primary');
  if(typeof readPreference == 'string') readPreference = new ReadPreference(readPreference);
  if(!(readPreference instanceof ReadPreference)) throw new MongoError('readPreference must be a ReadPreference instance');

  // Ensure we have at least some options
  options = options || {};
  // Set the optional batchSize
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;
  var numberToReturn = 0;
  
  // Unpack the limit and batchSize values
  if(cursorState.limit == 0) {
    numberToReturn = cursorState.batchSize;
  } else if(cursorState.limit < 0 || cursorState.limit < cursorState.batchSize || (cursorState.limit > 0 && cursorState.batchSize == 0)) {
    numberToReturn = cursorState.limit;
  } else {
    numberToReturn = cursorState.batchSize;
  }

  var numberToSkip = cursorState.skip || 0;
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
  if(typeof cmd.tailable == 'boolean') query.tailable = cmd.tailable;
  if(typeof cmd.oplogReplay == 'boolean') query.oplogReplay = cmd.oplogReplay;
  if(typeof cmd.noCursorTimeout == 'boolean') query.noCursorTimeout = cmd.noCursorTimeout;
  if(typeof cmd.awaitData == 'boolean') query.awaitData = cmd.awaitData;
  if(typeof cmd.exhaust == 'boolean') query.exhaust = cmd.exhaust;
  if(typeof cmd.partial == 'boolean') query.partial = cmd.partial;
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

  // We have a Mongos topology, check if we need to add a readPreference
  if(topology.type == 'mongos' && readPreference) {
    finalCmd['$readPreference'] = readPreference.toJSON();
  }

  // Build Query object
  var query = new Query(bson, f('%s.$cmd', parts.shift()), finalCmd, {
      numberToSkip: 0, numberToReturn: -1
    , checkKeys: false
  });

  // Set query flags
  query.slaveOk = readPreference.slaveOk();

  // Options
  if(typeof options.tailable == 'boolean') query.tailable = options.tailable;
  if(typeof options.oplogReplay == 'boolean') query.oplogReplay = options.oplogReplay;
  if(typeof options.noCursorTimeout == 'boolean') query.noCursorTimeout = options.noCursorTimeout;
  if(typeof options.awaitdata == 'boolean') query.awaitdata = options.awaitdata;
  if(typeof options.exhaust == 'boolean') query.exhaust = options.exhaust;
  if(typeof options.partial == 'boolean') query.partial = options.partial;
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

module.exports = LegacySupport;