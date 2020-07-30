import { KillCursor } from '../commands';
import { maxWireVersion, collectionNamespace } from '../../utils';
import { command, CommandOptions } from './command';
import { MongoError, MongoNetworkError } from '../../error';
import type { Server } from '../../sdam/server';
import type { Callback } from '../../types';
import type { InternalCursorState } from '../../cursor/core_cursor';
import type { ClientSession } from '../../sessions';

interface KillCursorOptions {
  session?: ClientSession;
  immediateRelease: boolean;
  noResponse: boolean;
}

export function killCursors(
  server: Server,
  ns: string,
  cursorState: InternalCursorState,
  callback: Callback
): void {
  callback = typeof callback === 'function' ? callback : () => undefined;
  const cursorId = cursorState.cursorId;

  if (maxWireVersion(server) < 4) {
    const pool = server.s.pool;
    const killCursor = new KillCursor(ns, [cursorId]);
    const options: KillCursorOptions = {
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

    return;
  }

  const killCursorCmd = {
    killCursors: collectionNamespace(ns),
    cursors: [cursorId]
  };

  const options: CommandOptions = {};
  if (typeof cursorState.session === 'object') {
    options.session = cursorState.session;
  }

  command(server, ns, killCursorCmd, options, (err, result) => {
    if (err || !result) {
      return callback(err);
    }

    const response = result.message;
    if (response.cursorNotFound) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    if (!Array.isArray(response.documents) || response.documents.length === 0) {
      return callback(
        new MongoError(`invalid killCursors result returned for cursor id ${cursorId}`)
      );
    }

    callback(undefined, response.documents[0]);
  });
}
