import Instrumentation = require('./apm');
import { BSON } from './deps';
import { Cursor, AggregationCursor, CommandCursor } from './cursor';
import PromiseProvider = require('./promise_provider');
import Admin = require('./admin');
import MongoClient = require('./mongo_client');
import Db = require('./db');
import Collection = require('./collection');
import ReadPreference = require('./read_preference');
import Logger = require('./logger');
import GridFSBucket = require('./gridfs-stream');

const {
  Binary,
  Code,
  Map,
  DBRef,
  Double,
  Int32,
  Long,
  MinKey,
  MaxKey,
  ObjectID,
  ObjectId,
  BSONSymbol,
  Timestamp,
  BSONRegExp,
  Decimal128
} = BSON;

// Set up the instrumentation method
function instrument(options: any, callback: Function) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const instrumentation = new Instrumentation();
  instrumentation.instrument(MongoClient, callback);
  return instrumentation;
}

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
  GridFSBucket,
  // BSON types exported
  Binary,
  Code,
  Map,
  DBRef,
  Double,
  Int32,
  Long,
  MinKey,
  MaxKey,
  ObjectID,
  ObjectId,
  BSONSymbol,
  Timestamp,
  BSONRegExp,
  Decimal128
};
