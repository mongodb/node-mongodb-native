'use strict';

const Query = require('../connection/commands').Query;
const retrieveBSON = require('../connection/utils').retrieveBSON;
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const getReadPreference = require('./shared').getReadPreference;
const BSON = retrieveBSON();
const Long = BSON.Long;
const ReadPreference = require('../topologies/read_preference');
const TxnState = require('../transactions').TxnState;

const WireProtocol = function() {};

function isTransactionCommand(command) {
  return !!(command.commitTransaction || command.abortTransaction);
}

/**
 * Optionally decorate a command with sessions specific keys
 *
 * @param {Object} command the command to decorate
 * @param {ClientSession} session the session tracking transaction state
 * @param {Object} [options] Optional settings passed to calling operation
 * @param {Function} [callback] Optional callback passed from calling operation
 * @return {MongoError|null} An error, if some error condition was met
 */
function decorateWithSessionsData(command, session, options) {
  if (!session) {
    return;
  }

  // first apply non-transaction-specific sessions data
  const serverSession = session.serverSession;
  const inTransaction = session.inTransaction() || isTransactionCommand(command);
  const isRetryableWrite = options.willRetryWrite;

  if (serverSession.txnNumber && (isRetryableWrite || inTransaction)) {
    command.txnNumber = BSON.Long.fromNumber(serverSession.txnNumber);
  }

  // now attempt to apply transaction-specific sessions data
  if (!inTransaction) {
    if (session.transaction.state !== TxnState.NO_TRANSACTION) {
      session.transaction.transition(TxnState.NO_TRANSACTION);
    }

    // for causal consistency
    if (session.supports.causalConsistency && session.operationTime) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }

    return;
  }

  if (options.readPreference && !options.readPreference.equals(ReadPreference.primary)) {
    return new MongoError(
      `Read preference in a transaction must be primary, not: ${options.readPreference.mode}`
    );
  }

  // `autocommit` must always be false to differentiate from retryable writes
  command.autocommit = false;

  if (session.transaction.state === TxnState.STARTING_TRANSACTION) {
    session.transaction.transition(TxnState.TRANSACTION_IN_PROGRESS);
    command.startTransaction = true;

    const readConcern =
      session.transaction.options.readConcern || session.clientOptions.readConcern;
    if (readConcern) {
      command.readConcern = readConcern;
    }

    if (session.supports.causalConsistency && session.operationTime) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }
  }
}

//
// Execute a write operation
function executeWrite(pool, bson, type, opsField, ns, ops, options, callback) {
  if (ops.length === 0) throw new MongoError('insert must contain at least one document');
  if (typeof options === 'function') {
    callback = options;
    options = {};
    options = options || {};
  }

  // Split the ns up to get db and collection
  const p = ns.split('.');
  const d = p.shift();
  // Options
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;

  // return skeleton
  const writeCommand = {};
  writeCommand[type] = p.join('.');
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;

  // Did we specify a write concern
  if (writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  // If we have collation passed in
  if (options.collation) {
    for (let i = 0; i < writeCommand[opsField].length; i++) {
      if (!writeCommand[opsField][i].collation) {
        writeCommand[opsField][i].collation = options.collation;
      }
    }
  }

  // Do we have bypassDocumentValidation set, then enable it on the write command
  if (options.bypassDocumentValidation === true) {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // optionally decorate command with transactions data
  const err = decorateWithSessionsData(writeCommand, options.session, options, callback);
  if (err) {
    return callback(err, null);
  }

  // Options object
  const opts = { command: true };
  if (typeof options.session !== 'undefined') opts.session = options.session;
  const queryOptions = { checkKeys: false, numberToSkip: 0, numberToReturn: 1 };
  if (type === 'insert') queryOptions.checkKeys = true;
  if (typeof options.checkKeys === 'boolean') queryOptions.checkKeys = options.checkKeys;

  // Ensure we support serialization of functions
  if (options.serializeFunctions) queryOptions.serializeFunctions = options.serializeFunctions;
  // Do not serialize the undefined fields
  if (options.ignoreUndefined) queryOptions.ignoreUndefined = options.ignoreUndefined;

  try {
    // Create write command
    const cmd = new Query(bson, `${d}.$cmd`, writeCommand, queryOptions);
    // Execute command
    pool.write(cmd, opts, callback);
  } catch (err) {
    callback(err);
  }
}

//
// Needs to support legacy mass insert as well as ordered/unordered legacy
// emulation
//
WireProtocol.prototype.insert = function(pool, ns, bson, ops, options, callback) {
  executeWrite(pool, bson, 'insert', 'documents', ns, ops, options, callback);
};

WireProtocol.prototype.update = function(pool, ns, bson, ops, options, callback) {
  executeWrite(pool, bson, 'update', 'updates', ns, ops, options, callback);
};

WireProtocol.prototype.remove = function(pool, ns, bson, ops, options, callback) {
  executeWrite(pool, bson, 'delete', 'deletes', ns, ops, options, callback);
};

WireProtocol.prototype.killCursor = function(bson, ns, cursorState, pool, callback) {
  // Build command namespace
  const parts = ns.split(/\./);
  // Command namespace
  const commandns = `${parts.shift()}.$cmd`;
  const cursorId = cursorState.cursorId;
  // Create killCursor command
  const killcursorCmd = {
    killCursors: parts.join('.'),
    cursors: [cursorId]
  };

  // Build Query object
  const query = new Query(bson, commandns, killcursorCmd, {
    numberToSkip: 0,
    numberToReturn: -1,
    checkKeys: false,
    returnFieldSelector: null
  });

  // Kill cursor callback
  function killCursorCallback(err, result) {
    if (err) {
      if (typeof callback !== 'function') return;
      return callback(err);
    }

    // Result
    const r = result.message;
    // If we have a timed out query or a cursor that was killed
    if ((r.responseFlags & (1 << 0)) !== 0) {
      if (typeof callback !== 'function') return;
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    if (!Array.isArray(r.documents) || r.documents.length === 0) {
      if (typeof callback !== 'function') return;
      return callback(
        new MongoError(`invalid killCursors result returned for cursor id ${cursorId}`)
      );
    }

    // Return the result
    if (typeof callback === 'function') {
      callback(null, r.documents[0]);
    }
  }

  const options = { command: true };
  if (typeof cursorState.session === 'object') {
    options.session = cursorState.session;
  }

  // Execute the kill cursor command
  if (pool && pool.isConnected()) {
    try {
      pool.write(query, options, killCursorCallback);
    } catch (err) {
      killCursorCallback(err, null);
    }

    return;
  }

  // Callback
  if (typeof callback === 'function') callback(null, null);
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
  options = options || {};
  // Build command namespace
  const parts = ns.split(/\./);
  // Command namespace
  const commandns = `${parts.shift()}.$cmd`;

  // Create getMore command
  const getMoreCmd = {
    getMore: cursorState.cursorId,
    collection: parts.join('.'),
    batchSize: Math.abs(batchSize)
  };

  // optionally decorate command with transactions data
  const err = decorateWithSessionsData(getMoreCmd, options.session, options, callback);
  if (err) {
    return callback(err, null);
  }

  if (cursorState.cmd.tailable && typeof cursorState.cmd.maxAwaitTimeMS === 'number') {
    getMoreCmd.maxTimeMS = cursorState.cmd.maxAwaitTimeMS;
  }

  // Build Query object
  const query = new Query(bson, commandns, getMoreCmd, {
    numberToSkip: 0,
    numberToReturn: -1,
    checkKeys: false,
    returnFieldSelector: null
  });

  // Query callback
  function queryCallback(err, result) {
    if (err) return callback(err);
    // Get the raw message
    const r = result.message;

    // If we have a timed out query or a cursor that was killed
    if ((r.responseFlags & (1 << 0)) !== 0) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    // Raw, return all the extracted documents
    if (raw) {
      cursorState.documents = r.documents;
      cursorState.cursorId = r.cursorId;
      return callback(null, r.documents);
    }

    // We have an error detected
    if (r.documents[0].ok === 0) {
      return callback(new MongoError(r.documents[0]));
    }

    // Ensure we have a Long valid cursor id
    const cursorId =
      typeof r.documents[0].cursor.id === 'number'
        ? Long.fromNumber(r.documents[0].cursor.id)
        : r.documents[0].cursor.id;

    // Set all the values
    cursorState.documents = r.documents[0].cursor.nextBatch;
    cursorState.cursorId = cursorId;

    // Return the result
    callback(null, r.documents[0], r.connection);
  }

  // Query options
  const queryOptions = { command: true };

  // If we have a raw query decorate the function
  if (raw) {
    queryOptions.raw = raw;
  }

  // Add the result field needed
  queryOptions.documentsReturnedIn = 'nextBatch';

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
  connection.write(query, queryOptions, queryCallback);
};

WireProtocol.prototype.command = function(bson, ns, cmd, cursorState, topology, options) {
  options = options || {};
  // Check if this is a wire protocol command or not
  const wireProtocolCommand =
    typeof options.wireProtocolCommand === 'boolean' ? options.wireProtocolCommand : true;

  // Establish type of command
  let query;
  if (cmd.find && wireProtocolCommand) {
    // Create the find command
    query = executeFindCommand(bson, ns, cmd, cursorState, topology, options);

    // Mark the cmd as virtual
    cmd.virtual = false;
    // Signal the documents are in the firstBatch value
    query.documentsReturnedIn = 'firstBatch';
  } else if (cursorState.cursorId != null) {
    return;
  } else if (cmd) {
    query = setupCommand(bson, ns, cmd, cursorState, topology, options);
  } else {
    return new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`);
  }

  if (query instanceof MongoError) {
    return query;
  }

  // optionally decorate query with transaction data
  const err = decorateWithSessionsData(query.query, options.session, options);
  if (err) {
    return err;
  }

  return query;
};

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
function executeFindCommand(bson, ns, cmd, cursorState, topology, options) {
  // Ensure we have at least some options
  options = options || {};
  // Get the readPreference
  const readPreference = getReadPreference(cmd, options);

  // Set the optional batchSize
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  // Build command namespace
  const parts = ns.split(/\./);
  // Command namespace
  const commandns = `${parts.shift()}.$cmd`;

  // Build actual find command
  let findCmd = {
    find: parts.join('.')
  };

  // I we provided a filter
  if (cmd.query) {
    // Check if the user is passing in the $query parameter
    if (cmd.query['$query']) {
      findCmd.filter = cmd.query['$query'];
    } else {
      findCmd.filter = cmd.query;
    }
  }

  // Sort value
  let sortValue = cmd.sort;

  // Handle issue of sort being an Array
  if (Array.isArray(sortValue)) {
    const sortObject = {};

    if (sortValue.length > 0 && !Array.isArray(sortValue[0])) {
      let sortDirection = sortValue[1];
      // Translate the sort order text
      if (sortDirection === 'asc') {
        sortDirection = 1;
      } else if (sortDirection === 'desc') {
        sortDirection = -1;
      }

      // Set the sort order
      sortObject[sortValue[0]] = sortDirection;
    } else {
      for (var i = 0; i < sortValue.length; i++) {
        let sortDirection = sortValue[i][1];
        // Translate the sort order text
        if (sortDirection === 'asc') {
          sortDirection = 1;
        } else if (sortDirection === 'desc') {
          sortDirection = -1;
        }

        // Set the sort order
        sortObject[sortValue[i][0]] = sortDirection;
      }
    }

    sortValue = sortObject;
  }

  // Add sort to command
  if (cmd.sort) findCmd.sort = sortValue;
  // Add a projection to the command
  if (cmd.fields) findCmd.projection = cmd.fields;
  // Add a hint to the command
  if (cmd.hint) findCmd.hint = cmd.hint;
  // Add a skip
  if (cmd.skip) findCmd.skip = cmd.skip;
  // Add a limit
  if (cmd.limit) findCmd.limit = cmd.limit;

  // Check if we wish to have a singleBatch
  if (cmd.limit < 0) {
    findCmd.limit = Math.abs(cmd.limit);
    findCmd.singleBatch = true;
  }

  // Add a batchSize
  if (typeof cmd.batchSize === 'number') {
    if (cmd.batchSize < 0) {
      if (cmd.limit !== 0 && Math.abs(cmd.batchSize) < Math.abs(cmd.limit)) {
        findCmd.limit = Math.abs(cmd.batchSize);
      }

      findCmd.singleBatch = true;
    }

    findCmd.batchSize = Math.abs(cmd.batchSize);
  }

  // If we have comment set
  if (cmd.comment) findCmd.comment = cmd.comment;

  // If we have maxScan
  if (cmd.maxScan) findCmd.maxScan = cmd.maxScan;

  // If we have maxTimeMS set
  if (cmd.maxTimeMS) findCmd.maxTimeMS = cmd.maxTimeMS;

  // If we have min
  if (cmd.min) findCmd.min = cmd.min;

  // If we have max
  if (cmd.max) findCmd.max = cmd.max;

  // If we have returnKey set
  findCmd.returnKey = cmd.returnKey ? cmd.returnKey : false;

  // If we have showDiskLoc set
  findCmd.showRecordId = cmd.showDiskLoc ? cmd.showDiskLoc : false;

  // If we have snapshot set
  if (cmd.snapshot) findCmd.snapshot = cmd.snapshot;

  // If we have tailable set
  if (cmd.tailable) findCmd.tailable = cmd.tailable;

  // If we have oplogReplay set
  if (cmd.oplogReplay) findCmd.oplogReplay = cmd.oplogReplay;

  // If we have noCursorTimeout set
  if (cmd.noCursorTimeout) findCmd.noCursorTimeout = cmd.noCursorTimeout;

  // If we have awaitData set
  if (cmd.awaitData) findCmd.awaitData = cmd.awaitData;
  if (cmd.awaitdata) findCmd.awaitData = cmd.awaitdata;

  // If we have partial set
  if (cmd.partial) findCmd.partial = cmd.partial;

  // If we have collation passed in
  if (cmd.collation) findCmd.collation = cmd.collation;

  // If we have explain, we need to rewrite the find command
  // to wrap it in the explain command
  if (cmd.explain) {
    findCmd = {
      explain: findCmd
    };
  }

  // Did we provide a readConcern
  if (cmd.readConcern) findCmd.readConcern = cmd.readConcern;

  // Set up the serialize and ignoreUndefined fields
  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
    findCmd = {
      $query: findCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  // optionally decorate query with transaction data
  const err = decorateWithSessionsData(findCmd, options.session, options);
  if (err) {
    return err;
  }

  // Build Query object
  const query = new Query(bson, commandns, findCmd, {
    numberToSkip: 0,
    numberToReturn: 1,
    checkKeys: false,
    returnFieldSelector: null,
    serializeFunctions: serializeFunctions,
    ignoreUndefined: ignoreUndefined
  });

  // Set query flags
  query.slaveOk = readPreference.slaveOk();

  // Return the query
  return query;
}

//
// Set up a command cursor
function setupCommand(bson, ns, cmd, cursorState, topology, options) {
  // Set empty options object
  options = options || {};
  // Get the readPreference
  const readPreference = getReadPreference(cmd, options);

  // Final query
  let finalCmd = {};
  for (let name in cmd) {
    finalCmd[name] = cmd[name];
  }

  // Build command namespace
  const parts = ns.split(/\./);

  // Serialize functions
  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;

  // Set up the serialize and ignoreUndefined fields
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
    finalCmd = {
      $query: finalCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  // optionally decorate query with transaction data
  const err = decorateWithSessionsData(finalCmd, options.session, options);
  if (err) {
    return err;
  }

  // Build Query object
  const query = new Query(bson, `${parts.shift()}.$cmd`, finalCmd, {
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
}

module.exports = WireProtocol;
