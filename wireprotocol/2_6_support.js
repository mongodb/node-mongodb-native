'use strict';

var copy = require('../connection/utils').copy,
  retrieveBSON = require('../connection/utils').retrieveBSON,
  KillCursor = require('../connection/commands').KillCursor,
  GetMore = require('../connection/commands').GetMore,
  Query = require('../connection/commands').Query,
  f = require('util').format,
  MongoError = require('../error').MongoError,
  getReadPreference = require('./shared').getReadPreference;

var BSON = retrieveBSON(),
  Long = BSON.Long;

var WireProtocol = function() {};

//
// Execute a write operation
var executeWrite = function(pool, bson, type, opsField, ns, ops, options, callback) {
  if (ops.length === 0) throw new MongoError('insert must contain at least one document');
  if (typeof options === 'function') {
    callback = options;
    options = {};
    options = options || {};
  }

  // Split the ns up to get db and collection
  var p = ns.split('.');
  var d = p.shift();
  // Options
  var ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  var writeConcern = options.writeConcern;

  // return skeleton
  var writeCommand = {};
  writeCommand[type] = p.join('.');
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;

  // Did we specify a write concern
  if (writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  // Do we have bypassDocumentValidation set, then enable it on the write command
  if (typeof options.bypassDocumentValidation === 'boolean') {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // Options object
  var opts = { command: true };
  if (typeof options.session !== 'undefined') opts.session = options.session;
  var queryOptions = { checkKeys: false, numberToSkip: 0, numberToReturn: 1 };
  if (type === 'insert') queryOptions.checkKeys = false;
  if (typeof options.checkKeys === 'boolean') queryOptions.checkKeys = options.checkKeys;
  // Ensure we support serialization of functions
  if (options.serializeFunctions) queryOptions.serializeFunctions = options.serializeFunctions;
  // Do not serialize the undefined fields
  if (options.ignoreUndefined) queryOptions.ignoreUndefined = options.ignoreUndefined;

  try {
    // Create write command
    var cmd = new Query(bson, f('%s.$cmd', d), writeCommand, queryOptions);
    // Execute command
    pool.write(cmd, opts, callback);
  } catch (err) {
    callback(err);
  }
};

//
// Needs to support legacy mass insert as well as ordered/unordered legacy
// emulation
//
WireProtocol.prototype.insert = function(pool, ismaster, ns, bson, ops, options, callback) {
  executeWrite(pool, bson, 'insert', 'documents', ns, ops, options, callback);
};

WireProtocol.prototype.update = function(pool, ismaster, ns, bson, ops, options, callback) {
  executeWrite(pool, bson, 'update', 'updates', ns, ops, options, callback);
};

WireProtocol.prototype.remove = function(pool, ismaster, ns, bson, ops, options, callback) {
  executeWrite(pool, bson, 'delete', 'deletes', ns, ops, options, callback);
};

WireProtocol.prototype.killCursor = function(bson, ns, cursorState, pool, callback) {
  var cursorId = cursorState.cursorId;
  // Create a kill cursor command
  var killCursor = new KillCursor(bson, ns, [cursorId]);

  // Build killCursor options
  const options = {
    immediateRelease: true,
    noResponse: true
  };

  if (typeof cursorState.session === 'object') {
    options.session = cursorState.session;
  }

  // Execute the kill cursor command
  if (pool && pool.isConnected()) {
    try {
      pool.write(killCursor, options, callback);
    } catch (err) {
      if (typeof callback === 'function') {
        callback(err, null);
      } else {
        console.warn(err);
      }
    }
  }
};

WireProtocol.prototype.getMore = function(
  bson,
  ns,
  cursorState,
  batchSize,
  raw,
  connection,
  options,
  callback
) {
  // Create getMore command
  var getMore = new GetMore(bson, ns, cursorState.cursorId, { numberToReturn: batchSize });

  // Query callback
  var queryCallback = function(err, result) {
    if (err) return callback(err);
    // Get the raw message
    var r = result.message;

    // If we have a timed out query or a cursor that was killed
    if ((r.responseFlags & (1 << 0)) !== 0) {
      return callback(new MongoError('cursor does not exist, was killed or timed out'), null);
    }

    // Ensure we have a Long valie cursor id
    var cursorId = typeof r.cursorId === 'number' ? Long.fromNumber(r.cursorId) : r.cursorId;

    // Set all the values
    cursorState.documents = r.documents;
    cursorState.cursorId = cursorId;

    // Return
    callback(null, null, r.connection);
  };

  // Contains any query options
  var queryOptions = {};

  // If we have a raw query decorate the function
  if (raw) {
    queryOptions.raw = raw;
  }

  // Check if we need to promote longs
  if (typeof cursorState.promoteLongs === 'boolean') {
    queryOptions.promoteLongs = cursorState.promoteLongs;
  }

  if (typeof cursorState.promoteValues === 'boolean') {
    queryOptions.promoteValues = cursorState.promoteValues;
  }

  if (typeof cursorState.promoteBuffers === 'boolean') {
    queryOptions.promoteBuffers = cursorState.promoteBuffers;
  }

  if (typeof cursorState.session === 'object') {
    queryOptions.session = cursorState.session;
  }

  // Write out the getMore command
  connection.write(getMore, queryOptions, queryCallback);
};

WireProtocol.prototype.command = function(bson, ns, cmd, cursorState, topology, options) {
  // Establish type of command
  if (cmd.find) {
    return setupClassicFind(bson, ns, cmd, cursorState, topology, options);
  } else if (cursorState.cursorId != null) {
    return;
  } else if (cmd) {
    return setupCommand(bson, ns, cmd, cursorState, topology, options);
  } else {
    throw new MongoError(f('command %s does not return a cursor', JSON.stringify(cmd)));
  }
};

//
// Execute a find command
var setupClassicFind = function(bson, ns, cmd, cursorState, topology, options) {
  // Ensure we have at least some options
  options = options || {};
  // Get the readPreference
  var readPreference = getReadPreference(cmd, options);
  // Set the optional batchSize
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;
  var numberToReturn = 0;

  // Unpack the limit and batchSize values
  if (cursorState.limit === 0) {
    numberToReturn = cursorState.batchSize;
  } else if (
    cursorState.limit < 0 ||
    cursorState.limit < cursorState.batchSize ||
    (cursorState.limit > 0 && cursorState.batchSize === 0)
  ) {
    numberToReturn = cursorState.limit;
  } else {
    numberToReturn = cursorState.batchSize;
  }

  var numberToSkip = cursorState.skip || 0;
  // Build actual find command
  var findCmd = {};

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference) {
    findCmd['$readPreference'] = readPreference.toJSON();
  }

  // Add special modifiers to the query
  if (cmd.sort) findCmd['$orderby'] = cmd.sort;
  if (cmd.hint) findCmd['$hint'] = cmd.hint;
  if (cmd.snapshot) findCmd['$snapshot'] = cmd.snapshot;
  if (typeof cmd.returnKey !== 'undefined') findCmd['$returnKey'] = cmd.returnKey;
  if (cmd.maxScan) findCmd['$maxScan'] = cmd.maxScan;
  if (cmd.min) findCmd['$min'] = cmd.min;
  if (cmd.max) findCmd['$max'] = cmd.max;
  if (typeof cmd.showDiskLoc !== 'undefined') findCmd['$showDiskLoc'] = cmd.showDiskLoc;
  if (cmd.comment) findCmd['$comment'] = cmd.comment;
  if (cmd.maxTimeMS) findCmd['$maxTimeMS'] = cmd.maxTimeMS;

  if (cmd.explain) {
    // nToReturn must be 0 (match all) or negative (match N and close cursor)
    // nToReturn > 0 will give explain results equivalent to limit(0)
    numberToReturn = -Math.abs(cmd.limit || 0);
    findCmd['$explain'] = true;
  }

  // Add the query
  findCmd['$query'] = cmd.query;

  // Throw on majority readConcern passed in
  if (cmd.readConcern && cmd.readConcern.level !== 'local') {
    throw new MongoError(
      f('server find command does not support a readConcern level of %s', cmd.readConcern.level)
    );
  }

  // Remove readConcern, ensure no failing commands
  if (cmd.readConcern) {
    cmd = copy(cmd);
    delete cmd['readConcern'];
  }

  // Serialize functions
  var serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
  var ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  // Build Query object
  var query = new Query(bson, ns, findCmd, {
    numberToSkip: numberToSkip,
    numberToReturn: numberToReturn,
    pre32Limit: typeof cmd.limit !== 'undefined' ? cmd.limit : undefined,
    checkKeys: false,
    returnFieldSelector: cmd.fields,
    serializeFunctions: serializeFunctions,
    ignoreUndefined: ignoreUndefined
  });

  // Set query flags
  query.slaveOk = readPreference.slaveOk();

  // Set up the option bits for wire protocol
  if (typeof cmd.tailable === 'boolean') {
    query.tailable = cmd.tailable;
  }

  if (typeof cmd.oplogReplay === 'boolean') {
    query.oplogReplay = cmd.oplogReplay;
  }

  if (typeof cmd.noCursorTimeout === 'boolean') {
    query.noCursorTimeout = cmd.noCursorTimeout;
  }

  if (typeof cmd.awaitData === 'boolean') {
    query.awaitData = cmd.awaitData;
  }

  if (typeof cmd.partial === 'boolean') {
    query.partial = cmd.partial;
  }

  // Return the query
  return query;
};

//
// Set up a command cursor
var setupCommand = function(bson, ns, cmd, cursorState, topology, options) {
  // Set empty options object
  options = options || {};
  // Get the readPreference
  var readPreference = getReadPreference(cmd, options);

  // Final query
  var finalCmd = {};
  for (var name in cmd) {
    finalCmd[name] = cmd[name];
  }

  // Build command namespace
  var parts = ns.split(/\./);

  // Serialize functions
  var serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;

  var ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  // Throw on majority readConcern passed in
  if (cmd.readConcern && cmd.readConcern.level !== 'local') {
    throw new MongoError(
      f(
        'server %s command does not support a readConcern level of %s',
        JSON.stringify(cmd),
        cmd.readConcern.level
      )
    );
  }

  // Remove readConcern, ensure no failing commands
  if (cmd.readConcern) delete cmd['readConcern'];

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
    finalCmd = {
      $query: finalCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  // Build Query object
  var query = new Query(bson, f('%s.$cmd', parts.shift()), finalCmd, {
    numberToSkip: 0,
    numberToReturn: -1,
    checkKeys: false,
    serializeFunctions: serializeFunctions,
    ignoreUndefined: ignoreUndefined
  });

  // Set query flags
  query.slaveOk = readPreference.slaveOk();

  // Return the query
  return query;
};

module.exports = WireProtocol;
