import { GetMore } from '../commands';
import { Long, Document } from '../../bson';
import { MongoError, MongoNetworkError } from '../../error';
import { applyCommonQueryOptions } from './shared';
import { maxWireVersion, collectionNamespace, Callback } from '../../utils';
import { command, CommandOptions } from './command';
import type { Server } from '../../sdam/server';
import type { InternalCursorState } from '../../cursor/core_cursor';

/** @internal */
export type GetMoreOptions = CommandOptions;

export function getMore(
  server: Server,
  ns: string,
  cursorState: InternalCursorState,
  batchSize: number,
  options: GetMoreOptions,
  callback: Callback<Document>
): void {
  options = options || {};

  const wireVersion = maxWireVersion(server);
  const queryCallback: Callback<Document> = function (err, response) {
    if (err || !response) return callback(err);

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

      callback();
      return;
    }

    // We have an error detected
    if (response.ok === 0) {
      return callback(new MongoError(response));
    }

    // Ensure we have a Long valid cursor id
    const cursorId =
      typeof response.cursor.id === 'number'
        ? Long.fromNumber(response.cursor.id)
        : response.cursor.id;

    cursorState.documents = response.cursor.nextBatch;
    cursorState.cursorId = cursorId;

    callback(undefined, response);
  };

  if (!cursorState.cursorId) {
    callback(new MongoError('Invalid internal cursor state, no known cursor id'));
    return;
  }

  const cursorId =
    cursorState.cursorId instanceof Long
      ? cursorState.cursorId
      : Long.fromNumber((cursorState.cursorId as unknown) as number);

  if (wireVersion < 4) {
    const getMoreOp = new GetMore(ns, cursorId, { numberToReturn: batchSize });
    const queryOptions = applyCommonQueryOptions({}, cursorState);
    queryOptions.fullResult = true;
    queryOptions.command = true;
    server.s.pool.write(getMoreOp, queryOptions, queryCallback);
    return;
  }

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
