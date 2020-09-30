import { KillCursor } from '../commands';
import { maxWireVersion, collectionNamespace, Callback } from '../../utils';
import { command, CommandOptions } from './command';
import { MongoError, MongoNetworkError } from '../../error';
import type { Server } from '../../sdam/server';
import type { Long } from '../../bson';

export function killCursors(
  server: Server,
  ns: string,
  cursorIds: Long[],
  options: CommandOptions,
  callback: Callback
): void {
  callback = typeof callback === 'function' ? callback : () => undefined;
  if (!cursorIds || !Array.isArray(cursorIds)) {
    throw new TypeError('Invalid list of cursor ids provided: ' + cursorIds);
  }

  if (maxWireVersion(server) < 4) {
    const pool = server.s.pool;
    const killCursor = new KillCursor(ns, cursorIds);

    try {
      pool.write(killCursor, { noResponse: true, ...options }, callback);
    } catch (err) {
      callback(err);
    }

    return;
  }

  const killCursorCmd = {
    killCursors: collectionNamespace(ns),
    cursors: cursorIds
  };

  command(server, ns, killCursorCmd, { fullResult: true, ...options }, (err, response) => {
    if (err || !response) {
      return callback(err);
    }

    if (response.cursorNotFound) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    if (!Array.isArray(response.documents) || response.documents.length === 0) {
      return callback(
        new MongoError(`invalid killCursors result returned for cursor id ${cursorIds[0]}`)
      );
    }

    callback(undefined, response.documents[0]);
  });
}
