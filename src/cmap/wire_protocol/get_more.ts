import { GetMore } from '../commands';
import { Long } from '../../bson';
import { MongoError, MongoNetworkError } from '../../error';
import { applyCommonQueryOptions } from './shared';
import { maxWireVersion, collectionNamespace } from '../../utils';
import command = require('./command');

function getMore(
  server: any,
  ns: any,
  cursorState: any,
  batchSize: any,
  options: any,
  callback: Function
) {
  options = options || {};

  const wireVersion = maxWireVersion(server);
  function queryCallback(err?: any, result?: any) {
    if (err) return callback(err);
    const response = result.message;

    // If we have a timed out query or a cursor that was killed
    if (response.cursorNotFound) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    if (wireVersion < 4) {
      const cursorId =
        typeof response.cursorId === 'number'
          ? Long.fromNumber(response.cursorId)
          : response.cursorId;

      cursorState.documents = response.documents;
      cursorState.cursorId = cursorId;

      callback(null, null, response.connection);
      return;
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

  if (wireVersion < 4) {
    const getMoreOp = new GetMore(ns, cursorState.cursorId, { numberToReturn: batchSize });
    const queryOptions = applyCommonQueryOptions({}, cursorState);
    server.s.pool.write(getMoreOp, queryOptions, queryCallback);
    return;
  }

  const cursorId =
    cursorState.cursorId instanceof Long
      ? cursorState.cursorId
      : Long.fromNumber(cursorState.cursorId);

  const getMoreCmd = {
    getMore: cursorId,
    collection: collectionNamespace(ns),
    batchSize: Math.abs(batchSize)
  } as any;

  if (cursorState.cmd.tailable && typeof cursorState.cmd.maxAwaitTimeMS === 'number') {
    getMoreCmd.maxTimeMS = cursorState.cmd.maxAwaitTimeMS;
  }

  const commandOptions = Object.assign(
    {
      returnFieldSelector: null,
      documentsReturnedIn: 'nextBatch'
    },
    options
  );

  if (cursorState.session) {
    commandOptions.session = cursorState.session;
  }

  command(server, ns, getMoreCmd, commandOptions, queryCallback);
}

export = getMore;
