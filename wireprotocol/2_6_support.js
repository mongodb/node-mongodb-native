'use strict';

const retrieveBSON = require('../connection/utils').retrieveBSON;
const KillCursor = require('../connection/commands').KillCursor;
const GetMore = require('../connection/commands').GetMore;
const Query = require('../connection/commands').Query;
const MongoError = require('../error').MongoError;
const getReadPreference = require('./shared').getReadPreference;
const applyCommonQueryOptions = require('./shared').applyCommonQueryOptions;
const isMongos = require('./shared').isMongos;
const databaseNamespace = require('./shared').databaseNamespace;
const collectionNamespace = require('./shared').collectionNamespace;

const BSON = retrieveBSON();
const Long = BSON.Long;

class WireProtocol {
  insert(server, ns, ops, options, callback) {
    executeWrite(this, server, 'insert', 'documents', ns, ops, options, callback);
  }

  update(server, ns, ops, options, callback) {
    executeWrite(this, server, 'update', 'updates', ns, ops, options, callback);
  }

  remove(server, ns, ops, options, callback) {
    executeWrite(this, server, 'delete', 'deletes', ns, ops, options, callback);
  }

  killCursor(server, ns, cursorState, callback) {
    const bson = server.s.bson;
    const pool = server.s.pool;
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

  getMore(server, ns, cursorState, batchSize, options, callback) {
    const bson = server.s.bson;
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
    server.s.pool.write(getMore, queryOptions, queryCallback);
  }

  query(server, ns, cmd, cursorState, options, callback) {
    if (cursorState.cursorId != null) {
      return;
    }

    const query = setupClassicFind(server, ns, cmd, cursorState, options);
    const queryOptions = applyCommonQueryOptions({}, cursorState);
    if (typeof query.documentsReturnedIn === 'string') {
      queryOptions.documentsReturnedIn = query.documentsReturnedIn;
    }

    server.s.pool.write(query, queryOptions, callback);
  }

  command(server, ns, cmd, options, callback) {
    if (cmd == null) {
      return callback(new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`));
    }

    options = options || {};
    const bson = server.s.bson;
    const pool = server.s.pool;
    const readPreference = getReadPreference(cmd, options);

    let finalCmd = Object.assign({}, cmd);
    if (finalCmd.readConcern) {
      if (finalCmd.readConcern.level !== 'local') {
        return callback(
          new MongoError(
            `server ${JSON.stringify(finalCmd)} command does not support a readConcern level of ${
              finalCmd.readConcern.level
            }`
          )
        );
      }

      delete finalCmd['readConcern'];
    }

    if (isMongos(server) && readPreference && readPreference.preference !== 'primary') {
      finalCmd = {
        $query: finalCmd,
        $readPreference: readPreference.toJSON()
      };
    }

    const commandOptions = Object.assign(
      {
        command: true,
        numberToSkip: 0,
        numberToReturn: -1,
        checkKeys: false
      },
      options
    );

    // This value is not overridable
    commandOptions.slaveOk = readPreference.slaveOk();

    try {
      const query = new Query(bson, `${databaseNamespace(ns)}.$cmd`, finalCmd, commandOptions);
      pool.write(query, commandOptions, callback);
    } catch (err) {
      callback(err);
    }
  }
}

function executeWrite(handler, server, type, opsField, ns, ops, options, callback) {
  if (ops.length === 0) throw new MongoError('insert must contain at least one document');
  if (typeof options === 'function') {
    callback = options;
    options = {};
    options = options || {};
  }

  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;

  const writeCommand = {};
  writeCommand[type] = collectionNamespace(ns);
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;

  if (writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  if (options.bypassDocumentValidation === true) {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  const commandOptions = Object.assign(
    {
      checkKeys: type === 'insert',
      numberToReturn: 1
    },
    options
  );

  handler.command(server, ns, writeCommand, commandOptions, callback);
}

function setupClassicFind(server, ns, cmd, cursorState, options) {
  options = options || {};
  const bson = server.s.bson;
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
  if (isMongos(server) && readPreference) {
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
