import { Instrumentation } from './apm';
import { Cursor, AggregationCursor, CommandCursor } from './cursor';
import { PromiseProvider } from './promise_provider';
import { Admin } from './admin';
import { MongoClient } from './mongo_client';
import { Db } from './db';
import { Collection } from './collection';
import { ReadPreference } from './read_preference';
import { Logger } from './logger';
import { GridFSBucket } from './gridfs-stream';
import type { Callback } from './utils';

// Set up the instrumentation method
/** @public */
function instrument(options: any, callback: Callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const instrumentation = new Instrumentation();
  instrumentation.instrument(MongoClient, callback);
  return instrumentation;
}

export {
  Binary,
  Code,
  DBRef,
  Double,
  Int32,
  Long,
  MinKey,
  MaxKey,
  ObjectId,
  Timestamp,
  Decimal128
} from './bson';

// NOTE: fix this up after ts-bson lands
const { Map, BSONSymbol, BSONRegExp } = require('bson');
export { Map, BSONSymbol, BSONRegExp };

export {
  MongoError,
  MongoNetworkError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoParseError,
  MongoWriteConcernError
} from './error';
export { BulkWriteError as MongoBulkWriteError } from './bulk/common';
export {
  // Utils
  instrument,
  PromiseProvider as Promise,
  // Actual driver classes exported
  Admin,
  MongoClient,
  Db,
  Collection,
  ReadPreference,
  Logger,
  AggregationCursor,
  CommandCursor,
  Cursor,
  GridFSBucket
};
