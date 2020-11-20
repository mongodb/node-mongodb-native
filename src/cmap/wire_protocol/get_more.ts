import { Callback, collectionNamespace, maxWireVersion } from '../../utils';
import { CommandOptions, command } from './command';
import { Document, Long, pluckBSONSerializeOptions } from '../../bson';
import { GetMore } from '../commands';
import { MongoError } from '../../error';
import { applyCommonQueryOptions } from './shared';
import type { Server } from '../../sdam/server';

/** @internal */
export interface GetMoreOptions extends CommandOptions {
  batchSize?: number;
  maxTimeMS?: number;
  maxAwaitTimeMS?: number;
  comment?: Document;
}

export function getMore(
  server: Server,
  ns: string,
  cursorId: Long,
  options: GetMoreOptions,
  callback: Callback<Document>
): void {
  options = options || {};

  const fullResult = typeof options.fullResult === 'boolean' ? options.fullResult : false;
  const wireVersion = maxWireVersion(server);
  if (!cursorId) {
    callback(new MongoError('Invalid internal cursor state, no known cursor id'));
    return;
  }

  if (wireVersion < 4) {
    const getMoreOp = new GetMore(ns, cursorId, { numberToReturn: options.batchSize });
    const queryOptions = applyCommonQueryOptions(
      {},
      Object.assign(options, { ...pluckBSONSerializeOptions(options) })
    );

    queryOptions.fullResult = true;
    queryOptions.command = true;
    server.s.pool.write(getMoreOp, queryOptions, (err, response) => {
      if (fullResult) return callback(err, response);
      if (err) return callback(err);
      callback(undefined, { cursor: { id: response.cursorId, nextBatch: response.documents } });
    });

    return;
  }

  const getMoreCmd: Document = {
    getMore: cursorId,
    collection: collectionNamespace(ns)
  };

  if (typeof options.batchSize === 'number') {
    getMoreCmd.batchSize = Math.abs(options.batchSize);
  }

  if (typeof options.maxAwaitTimeMS === 'number') {
    getMoreCmd.maxTimeMS = options.maxAwaitTimeMS;
  }

  const commandOptions = Object.assign(
    {
      returnFieldSelector: null,
      documentsReturnedIn: 'nextBatch'
    },
    options
  );

  command(server, ns, getMoreCmd, commandOptions, callback);
}
