import { command, CommandOptions } from './command';
import { Query } from '../commands';
import { MongoError } from '../../error';
import { maxWireVersion, collectionNamespace, Callback } from '../../utils';
import { getReadPreference, isSharded, applyCommonQueryOptions } from './shared';
import type { Document } from '../../bson';
import type { Server } from '../../sdam/server';
import type { ReadPreferenceLike } from '../../read_preference';
import type { InternalCursorState } from '../../cursor/core_cursor';

/** @internal */
export interface QueryOptions extends CommandOptions {
  readPreference?: ReadPreferenceLike;
}

export function query(
  server: Server,
  ns: string,
  cmd: Document,
  cursorState: InternalCursorState,
  options: QueryOptions,
  callback: Callback
): void {
  options = options || {};
  if (cursorState.cursorId != null) {
    return callback();
  }

  if (cmd == null) {
    return callback(new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`));
  }

  if (maxWireVersion(server) < 4) {
    const query = prepareLegacyFindQuery(server, ns, cmd, cursorState, options);
    const queryOptions = applyCommonQueryOptions({}, cursorState);
    queryOptions.fullResult = true;

    if (typeof query.documentsReturnedIn === 'string') {
      queryOptions.documentsReturnedIn = query.documentsReturnedIn;
    }

    server.s.pool.write(query, queryOptions, callback);
    return;
  }

  const readPreference = getReadPreference(cmd, options);
  const findCmd = prepareFindCommand(server, ns, cmd, cursorState);

  // NOTE: This actually modifies the passed in cmd, and our code _depends_ on this
  //       side-effect. Change this ASAP
  cmd.virtual = false;

  const commandOptions = Object.assign(
    {
      documentsReturnedIn: 'firstBatch',
      numberToReturn: 1,
      slaveOk: readPreference.slaveOk()
    },
    options
  );

  if (cmd.readPreference) {
    commandOptions.readPreference = readPreference;
  }

  if (cursorState.session) {
    commandOptions.session = cursorState.session;
  }

  command(server, ns, findCmd, commandOptions, callback);
}

function prepareFindCommand(
  server: Server,
  ns: string,
  cmd: Document,
  cursorState: InternalCursorState
) {
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;
  let findCmd: Document = {
    find: collectionNamespace(ns)
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
    const sortObject: Document = {};

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

  if (typeof cmd.allowDiskUse === 'boolean') {
    findCmd.allowDiskUse = cmd.allowDiskUse;
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

  return findCmd;
}

function prepareLegacyFindQuery(
  server: Server,
  ns: string,
  cmd: Document,
  cursorState: InternalCursorState,
  options: CommandOptions
): Query {
  options = options || {};
  const readPreference = getReadPreference(cmd, options);
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  let numberToReturn = 0;
  if (
    cursorState.limit < 0 ||
    (cursorState.limit !== 0 && cursorState.limit < cursorState.batchSize) ||
    (cursorState.limit > 0 && cursorState.batchSize === 0)
  ) {
    numberToReturn = cursorState.limit;
  } else {
    numberToReturn = cursorState.batchSize;
  }

  const numberToSkip = cursorState.skip || 0;

  const findCmd: Document = {};
  if (isSharded(server) && readPreference) {
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

  const query = new Query(ns, findCmd, {
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
