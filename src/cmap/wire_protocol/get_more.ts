import { GetMore } from '../commands';
import { Long } from '../../bson';
import { MongoError, MongoNetworkError } from '../../error';
import { applyCommonQueryOptions } from './shared';
import { maxWireVersion, collectionNamespace } from '../../utils';
import { command } from './command';
import type { Server } from '../../sdam/server';
import type { Connection } from '../connection';
import type { Callback } from '../../types';
import type { CommandOptions } from '../types';

export function getMore(
  server: Server,
  ns: string,
  cursorState: any,
  batchSize: number,
  options: CommandOptions,
  callback: (error?: Error, doc?: any, connection?: Connection) => void
) {
  options = options || {};

  const wireVersion = maxWireVersion(server);
  const queryCallback = function (err, result) {
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

      callback(undefined, undefined, response.connection);
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

    callback(undefined, response.documents[0], response.connection);
  } as Callback;

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
