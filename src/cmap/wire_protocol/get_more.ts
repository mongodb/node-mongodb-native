import { GetMore } from '../commands';
import { Long } from '../../bson';
import { MongoError, MongoNetworkError } from '../../error';
import { applyCommonQueryOptions } from './shared';
import { maxWireVersion, collectionNamespace } from '../../utils';
import { command } from './command';
import type { Server } from '../../sdam/server';
import type { Connection } from '../connection';
import type { Callback, Callback2, Document } from '../../types';
import type { InternalCursorState } from '../../cursor/core_cursor';

export interface GetMoreOptions {
  [key: string]: unknown;
}

export function getMore(
  server: Server,
  ns: string,
  cursorState: InternalCursorState,
  batchSize: number,
  options: GetMoreOptions,
  callback: Callback2<Document, Connection>
): void {
  options = options || {};

  const wireVersion = maxWireVersion(server);
  const queryCallback: Callback<Document> = function (err, result) {
    if (err || !result) return callback(err);
    const response = result.message;

    // If we have a timed out query or a cursor that was killed
    if (response.cursorNotFound) {
      return callback(new MongoNetworkError('cursor killed or timed out'));
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
  };

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

  const getMoreCmd: Document = {
    getMore: cursorId,
    collection: collectionNamespace(ns),
    batchSize: Math.abs(batchSize)
  };

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
