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
const applyCommonQueryOptions = require('./shared').applyCommonQueryOptions;

class WireProtocol {
  insert(pool, ns, bson, ops, options, callback) {
    executeWrite(pool, bson, 'insert', 'documents', ns, ops, options, callback);
  }

  update(pool, ns, bson, ops, options, callback) {
    executeWrite(pool, bson, 'update', 'updates', ns, ops, options, callback);
  }

  remove(pool, ns, bson, ops, options, callback) {
    executeWrite(pool, bson, 'delete', 'deletes', ns, ops, options, callback);
  }

  killCursor(bson, ns, cursorState, pool, callback) {
    const parts = ns.split(/\./);
    const commandns = `${parts.shift()}.$cmd`;
    const cursorId = cursorState.cursorId;
    const killcursorCmd = {
      killCursors: parts.join('.'),
      cursors: [cursorId]
    };

    const query = new Query(bson, commandns, killcursorCmd, {
      numberToSkip: 0,
      numberToReturn: -1,
      checkKeys: false,
      returnFieldSelector: null
    });

    function killCursorCallback(err, result) {
      if (err) {
        if (typeof callback !== 'function') return;
        return callback(err);
      }

      const response = result.message;

      // If we have a timed out query, or a cursor that was killed
      if (response.cursorNotFound) {
        if (typeof callback !== 'function') return;
        return callback(new MongoNetworkError('cursor killed or timed out'), null);
      }

      if (!Array.isArray(response.documents) || response.documents.length === 0) {
        if (typeof callback !== 'function') return;
        return callback(
          new MongoError(`invalid killCursors result returned for cursor id ${cursorId}`)
        );
      }

      if (typeof callback === 'function') {
        callback(null, response.documents[0]);
      }
    }

    const options = { command: true };
    if (typeof cursorState.session === 'object') {
      options.session = cursorState.session;
    }

    if (pool && pool.isConnected()) {
      try {
        pool.write(query, options, killCursorCallback);
      } catch (err) {
        killCursorCallback(err, null);
      }

      return;
    }

    if (typeof callback === 'function') callback(null, null);
  }

  getMore(bson, ns, cursorState, batchSize, connection, options, callback) {
    options = options || {};
    const parts = ns.split(/\./);
    const commandns = `${parts.shift()}.$cmd`;
    const getMoreCmd = {
      getMore: cursorState.cursorId,
      collection: parts.join('.'),
      batchSize: Math.abs(batchSize)
    };

    if (cursorState.cmd.tailable && typeof cursorState.cmd.maxAwaitTimeMS === 'number') {
      getMoreCmd.maxTimeMS = cursorState.cmd.maxAwaitTimeMS;
    }

    const err = decorateWithSessionsData(getMoreCmd, options.session, options, callback);
    if (err) {
      return callback(err, null);
    }

    const query = new Query(bson, commandns, getMoreCmd, {
      numberToSkip: 0,
      numberToReturn: -1,
      checkKeys: false,
      returnFieldSelector: null
    });

    function queryCallback(err, result) {
      if (err) return callback(err);
      const response = result.message;

      // If we have a timed out query or a cursor that was killed
      if (response.cursorNotFound) {
        return callback(new MongoNetworkError('cursor killed or timed out'), null);
      }

      // Raw, return all the extracted documents
      if (cursorState.raw) {
        cursorState.documents = response.documents;
        cursorState.cursorId = response.cursorId;
        return callback(null, response.documents);
      }

      // We have an error detected
      if (response.documents[0].ok === 0) {
        return callback(new MongoError(response.documents[0]));
      }

      // Ensure we have a Long valid cursor id
      const cursorId =
        typeof response.documents[0].cursor.id === 'number'
          ? Long.fromNumber(response.documents[0].cursor.id)
          : response.documents[0].cursor.id;

      cursorState.documents = response.documents[0].cursor.nextBatch;
      cursorState.cursorId = cursorId;

      callback(null, response.documents[0], response.connection);
    }

    const queryOptions = applyCommonQueryOptions(
      { command: true, documentsReturnedIn: 'nextBatch' },
      cursorState
    );

    connection.write(query, queryOptions, queryCallback);
  }

  query(bson, ns, cmd, cursorState, topology, options) {
    options = options || {};
    if (cursorState.cursorId != null) {
      return;
    }

    if (cmd == null) {
      return new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`);
    }

    const query = executeFindCommand(bson, ns, cmd, cursorState, topology, options);
    cmd.virtual = false;
    query.documentsReturnedIn = 'firstBatch';
    return query;
  }

  command(bson, ns, cmd, cursorState, topology, options) {
    options = options || {};
    if (cmd == null) {
      return new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`);
    }

    const readPreference = getReadPreference(cmd, options);
    const parts = ns.split(/\./);

    let finalCmd = Object.assign({}, cmd);
    const serializeFunctions =
      typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
    const ignoreUndefined =
      typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

    if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
      finalCmd = {
        $query: finalCmd,
        $readPreference: readPreference.toJSON()
      };
    }

    const err = decorateWithSessionsData(finalCmd, options.session, options);
    if (err) {
      return err;
    }

    const query = new Query(bson, `${parts.shift()}.$cmd`, finalCmd, {
      numberToSkip: 0,
      numberToReturn: -1,
      checkKeys: false,
      serializeFunctions: serializeFunctions,
      ignoreUndefined: ignoreUndefined
    });

    query.slaveOk = readPreference.slaveOk();
    return query;
  }
}

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

function executeWrite(pool, bson, type, opsField, ns, ops, options, callback) {
  if (ops.length === 0) throw new MongoError('insert must contain at least one document');
  if (typeof options === 'function') {
    callback = options;
    options = {};
    options = options || {};
  }

  const p = ns.split('.');
  const d = p.shift();
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;

  const writeCommand = {};
  writeCommand[type] = p.join('.');
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;

  if (writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  if (options.collation) {
    for (let i = 0; i < writeCommand[opsField].length; i++) {
      if (!writeCommand[opsField][i].collation) {
        writeCommand[opsField][i].collation = options.collation;
      }
    }
  }

  if (options.bypassDocumentValidation === true) {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

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
  if (options.serializeFunctions) queryOptions.serializeFunctions = options.serializeFunctions;
  if (options.ignoreUndefined) queryOptions.ignoreUndefined = options.ignoreUndefined;

  try {
    const cmd = new Query(bson, `${d}.$cmd`, writeCommand, queryOptions);
    pool.write(cmd, opts, callback);
  } catch (err) {
    callback(err);
  }
}

function executeFindCommand(bson, ns, cmd, cursorState, topology, options) {
  options = options || {};
  const readPreference = getReadPreference(cmd, options);
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  const parts = ns.split(/\./);
  const commandns = `${parts.shift()}.$cmd`;
  let findCmd = {
    find: parts.join('.')
  };

  if (cmd.query) {
    if (cmd.query['$query']) {
      findCmd.filter = cmd.query['$query'];
    } else {
      findCmd.filter = cmd.query;
    }
  }

  let sortValue = cmd.sort;
  if (Array.isArray(sortValue)) {
    const sortObject = {};

    if (sortValue.length > 0 && !Array.isArray(sortValue[0])) {
      let sortDirection = sortValue[1];
      if (sortDirection === 'asc') {
        sortDirection = 1;
      } else if (sortDirection === 'desc') {
        sortDirection = -1;
      }

      sortObject[sortValue[0]] = sortDirection;
    } else {
      for (let i = 0; i < sortValue.length; i++) {
        let sortDirection = sortValue[i][1];
        if (sortDirection === 'asc') {
          sortDirection = 1;
        } else if (sortDirection === 'desc') {
          sortDirection = -1;
        }

        sortObject[sortValue[i][0]] = sortDirection;
      }
    }

    sortValue = sortObject;
  }

  if (cmd.sort) findCmd.sort = sortValue;
  if (cmd.fields) findCmd.projection = cmd.fields;
  if (cmd.hint) findCmd.hint = cmd.hint;
  if (cmd.skip) findCmd.skip = cmd.skip;
  if (cmd.limit) findCmd.limit = cmd.limit;
  if (cmd.limit < 0) {
    findCmd.limit = Math.abs(cmd.limit);
    findCmd.singleBatch = true;
  }

  if (typeof cmd.batchSize === 'number') {
    if (cmd.batchSize < 0) {
      if (cmd.limit !== 0 && Math.abs(cmd.batchSize) < Math.abs(cmd.limit)) {
        findCmd.limit = Math.abs(cmd.batchSize);
      }

      findCmd.singleBatch = true;
    }

    findCmd.batchSize = Math.abs(cmd.batchSize);
  }

  if (cmd.comment) findCmd.comment = cmd.comment;
  if (cmd.maxScan) findCmd.maxScan = cmd.maxScan;
  if (cmd.maxTimeMS) findCmd.maxTimeMS = cmd.maxTimeMS;
  if (cmd.min) findCmd.min = cmd.min;
  if (cmd.max) findCmd.max = cmd.max;
  findCmd.returnKey = cmd.returnKey ? cmd.returnKey : false;
  findCmd.showRecordId = cmd.showDiskLoc ? cmd.showDiskLoc : false;
  if (cmd.snapshot) findCmd.snapshot = cmd.snapshot;
  if (cmd.tailable) findCmd.tailable = cmd.tailable;
  if (cmd.oplogReplay) findCmd.oplogReplay = cmd.oplogReplay;
  if (cmd.noCursorTimeout) findCmd.noCursorTimeout = cmd.noCursorTimeout;
  if (cmd.awaitData) findCmd.awaitData = cmd.awaitData;
  if (cmd.awaitdata) findCmd.awaitData = cmd.awaitdata;
  if (cmd.partial) findCmd.partial = cmd.partial;
  if (cmd.collation) findCmd.collation = cmd.collation;
  if (cmd.readConcern) findCmd.readConcern = cmd.readConcern;

  // If we have explain, we need to rewrite the find command
  // to wrap it in the explain command
  if (cmd.explain) {
    findCmd = {
      explain: findCmd
    };
  }

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
    findCmd = {
      $query: findCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  const err = decorateWithSessionsData(findCmd, options.session, options);
  if (err) {
    return err;
  }

  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  const query = new Query(bson, commandns, findCmd, {
    numberToSkip: 0,
    numberToReturn: 1,
    checkKeys: false,
    returnFieldSelector: null,
    serializeFunctions: serializeFunctions,
    ignoreUndefined: ignoreUndefined
  });

  query.slaveOk = readPreference.slaveOk();
  return query;
}

module.exports = WireProtocol;
