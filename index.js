'use strict';
const Instrumentation = require('./lib/apm');
const { BSON } = require('./lib/deps');
const { Cursor, AggregationCursor, CommandCursor } = require('./lib/cursor');
const {
  MongoError,
  MongoNetworkError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoParseError,
  MongoWriteConcernError
} = require('./lib/error');
const { BulkWriteError } = require('./lib/bulk/common');

const Admin = require('./lib/admin');
const MongoClient = require('./lib/mongo_client');
const Db = require('./lib/db');
const Collection = require('./lib/collection');
const ReadPreference = require('./lib/read_preference');
const Logger = require('./lib/logger');
const GridFSBucket = require('./lib/gridfs-stream');

// Set up the instrumentation method
function instrument(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const instrumentation = new Instrumentation();
  instrumentation.instrument(MongoClient, callback);
  return instrumentation;
}

module.exports = {
  // Expose error class
  MongoError,
  MongoNetworkError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoParseError,
  MongoWriteConcernError,
  BulkWriteError,
  MongoBulkWriteError: BulkWriteError,
  // Actual driver classes exported
  Admin,
  MongoClient,
  Db,
  Collection,
  ReadPreference,
  Logger,
  GridFSBucket,
  AggregationCursor,
  CommandCursor,
  Cursor,
  // BSON types
  Binary: BSON.Binary,
  Code: BSON.Code,
  Map: BSON['Map'], // TODO:(neal) should this just be Map?
  DBRef: BSON.DBRef,
  Double: BSON.Double,
  Int32: BSON.Int32,
  Long: BSON.Long,
  MinKey: BSON.MinKey,
  MaxKey: BSON.MaxKey,
  ObjectId: BSON.ObjectId,
  ObjectID: BSON.ObjectId,
  BSONSymbol: BSON['BSONSymbol'], // TODO:(neal) this is missing from bson types?
  Timestamp: BSON.Timestamp,
  BSONRegExp: BSON.BSONRegExp,
  Decimal128: BSON.Decimal128,
  // connect method
  connect: MongoClient.connect,
  instrument
};
