'use strict';

const retrieveBSON = require('../connection/utils').retrieveBSON;
const KillCursor = require('../connection/commands').KillCursor;
const GetMore = require('../connection/commands').GetMore;
const Query = require('../connection/commands').Query;
const MongoError = require('../error').MongoError;
const getReadPreference = require('./shared').getReadPreference;
const applyCommonQueryOptions = require('./shared').applyCommonQueryOptions;
const BSON = retrieveBSON();
const Long = BSON.Long;

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
    const cursorId = cursorState.cursorId;
    const killCursor = new KillCursor(bson, ns, [cursorId]);
    const options = {
      immediateRelease: true,
      noResponse: true
    };

    if (typeof cursorState.session === 'object') {
      options.session = cursorState.session;
    }

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
  }

  getMore(bson, ns, cursorState, batchSize, connection, options, callback) {
    const getMore = new GetMore(bson, ns, cursorState.cursorId, { numberToReturn: batchSize });
    function queryCallback(err, result) {
      if (err) return callback(err);
      const response = result.message;

      // If we have a timed out query or a cursor that was killed
      if (response.cursorNotFound) {
        return callback(new MongoError('Cursor does not exist, was killed, or timed out'), null);
      }

      const cursorId =
        typeof response.cursorId === 'number'
          ? Long.fromNumber(response.cursorId)
          : response.cursorId;

      cursorState.documents = response.documents;
      cursorState.cursorId = cursorId;

      callback(null, null, response.connection);
    }

    const queryOptions = applyCommonQueryOptions({}, cursorState);
    connection.write(getMore, queryOptions, queryCallback);
  }

  query(pool, bson, ns, cmd, cursorState, topology, options, callback) {
    if (cursorState.cursorId != null) {
      return;
    }

    const query = setupClassicFind(bson, ns, cmd, cursorState, topology, options);
    const queryOptions = applyCommonQueryOptions({}, cursorState);
    if (typeof query.documentsReturnedIn === 'string') {
      queryOptions.documentsReturnedIn = query.documentsReturnedIn;
    }

    pool.write(query, queryOptions, callback);
  }

  command(pool, bson, ns, cmd, topology, options, callback) {
    if (cmd == null) {
      return callback(new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`));
    }

    options = options || {};
    const readPreference = getReadPreference(cmd, options);
    const parts = ns.split(/\./);

    let finalCmd = Object.assign({}, cmd);
    const serializeFunctions =
      typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
    const ignoreUndefined =
      typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

    if (cmd.readConcern && cmd.readConcern.level !== 'local') {
      return callback(
        new MongoError(
          `server ${JSON.stringify(cmd)} command does not support a readConcern level of ${
            cmd.readConcern.level
          }`
        )
      );
    }

    if (cmd.readConcern) delete cmd['readConcern'];

    if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
      finalCmd = {
        $query: finalCmd,
        $readPreference: readPreference.toJSON()
      };
    }

    const query = new Query(bson, `${parts.shift()}.$cmd`, finalCmd, {
      numberToSkip: 0,
      numberToReturn: -1,
      checkKeys: false,
      serializeFunctions: serializeFunctions,
      ignoreUndefined: ignoreUndefined
    });

    query.slaveOk = readPreference.slaveOk();

    const queryOptions = applyCommonQueryOptions({ command: true }, options);
    if (typeof query.documentsReturnedIn === 'string') {
      queryOptions.documentsReturnedIn = query.documentsReturnedIn;
    }

    pool.write(query, queryOptions, callback);
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

  if (options.bypassDocumentValidation === true) {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

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

function setupClassicFind(bson, ns, cmd, cursorState, topology, options) {
  options = options || {};
  const readPreference = getReadPreference(cmd, options);
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  let numberToReturn = 0;
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

  const numberToSkip = cursorState.skip || 0;

  const findCmd = {};
  if (topology.type === 'mongos' && readPreference) {
    findCmd['$readPreference'] = readPreference.toJSON();
  }

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

  findCmd['$query'] = cmd.query;
  if (cmd.readConcern && cmd.readConcern.level !== 'local') {
    throw new MongoError(
      `server find command does not support a readConcern level of ${cmd.readConcern.level}`
    );
  }

  if (cmd.readConcern) {
    cmd = Object.assign({}, cmd);
    delete cmd['readConcern'];
  }

  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  const query = new Query(bson, ns, findCmd, {
    numberToSkip: numberToSkip,
    numberToReturn: numberToReturn,
    pre32Limit: typeof cmd.limit !== 'undefined' ? cmd.limit : undefined,
    checkKeys: false,
    returnFieldSelector: cmd.fields,
    serializeFunctions: serializeFunctions,
    ignoreUndefined: ignoreUndefined
  });

  if (typeof cmd.tailable === 'boolean') query.tailable = cmd.tailable;
  if (typeof cmd.oplogReplay === 'boolean') query.oplogReplay = cmd.oplogReplay;
  if (typeof cmd.noCursorTimeout === 'boolean') query.noCursorTimeout = cmd.noCursorTimeout;
  if (typeof cmd.awaitData === 'boolean') query.awaitData = cmd.awaitData;
  if (typeof cmd.partial === 'boolean') query.partial = cmd.partial;

  query.slaveOk = readPreference.slaveOk();
  return query;
}

module.exports = WireProtocol;
