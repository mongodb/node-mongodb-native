import { OpQueryOptions, Query } from '../commands';
import type { Callback, MongoDBNamespace } from '../../utils';
import { BSONSerializeOptions, Document, pluckBSONSerializeOptions } from '../../bson';
import type { Server } from '../../sdam/server';
import { ReadPreference } from '../../read_preference';

/** @internal */
export interface QueryOptions extends BSONSerializeOptions {
  readPreference: ReadPreference;
  documentsReturnedIn?: string;
  batchSize?: number;
  limit?: number;
  skip?: number;
  projection?: Document;
  tailable?: boolean;
  awaitData?: boolean;
  noCursorTimeout?: boolean;
  /** @deprecated use `noCursorTimeout` instead */
  timeout?: boolean;
  partial?: boolean;
  oplogReplay?: boolean;
}

export function query(
  server: Server,
  ns: MongoDBNamespace,
  findCommand: Document,
  options: QueryOptions,
  callback: Callback
): void {
  options = options || {};

  const isExplain = typeof findCommand.$explain !== 'undefined';
  const readPreference = options.readPreference ?? ReadPreference.primary;
  const batchSize = options.batchSize || 0;
  const limit = options.limit;
  const numberToSkip = options.skip || 0;
  let numberToReturn = 0;
  if (
    limit &&
    (limit < 0 || (limit !== 0 && limit < batchSize) || (limit > 0 && batchSize === 0))
  ) {
    numberToReturn = limit;
  } else {
    numberToReturn = batchSize;
  }

  if (isExplain) {
    // nToReturn must be 0 (match all) or negative (match N and close cursor)
    // nToReturn > 0 will give explain results equivalent to limit(0)
    numberToReturn = -Math.abs(limit || 0);
  }

  const queryOptions: OpQueryOptions = {
    numberToSkip,
    numberToReturn,
    pre32Limit: typeof limit === 'number' ? limit : undefined,
    checkKeys: false,
    slaveOk: readPreference.slaveOk()
  };

  if (options.projection) {
    queryOptions.returnFieldSelector = options.projection;
  }

  const query = new Query(ns.toString(), findCommand, queryOptions);
  if (typeof options.tailable === 'boolean') {
    query.tailable = options.tailable;
  }

  if (typeof options.oplogReplay === 'boolean') {
    query.oplogReplay = options.oplogReplay;
  }

  if (typeof options.timeout === 'boolean') {
    query.noCursorTimeout = options.timeout;
  } else if (typeof options.noCursorTimeout === 'boolean') {
    query.noCursorTimeout = options.noCursorTimeout;
  }

  if (typeof options.awaitData === 'boolean') {
    query.awaitData = options.awaitData;
  }

  if (typeof options.partial === 'boolean') {
    query.partial = options.partial;
  }

  server.s.pool.write(
    query,
    { fullResult: true, ...pluckBSONSerializeOptions(options) },
    (err, result) => {
      if (err || !result) return callback(err, result);
      if (isExplain && result.documents && result.documents[0]) {
        return callback(undefined, result.documents[0]);
      }

      callback(undefined, result);
    }
  );
}
