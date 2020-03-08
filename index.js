'use strict';
const error = require('./lib/error');
const Instrumentation = require('./lib/apm');
const BSON = require('./lib/utils').retrieveBSON();
const { Cursor, AggregationCursor, CommandCursor } = require('./lib/cursor');

// Set up the connect function
const connect = require('./lib/mongo_client').connect;

// Expose error class
connect.MongoError = error.MongoError;
connect.MongoNetworkError = error.MongoNetworkError;
connect.MongoTimeoutError = error.MongoTimeoutError;
connect.MongoServerSelectionError = error.MongoServerSelectionError;
connect.MongoParseError = error.MongoParseError;
connect.MongoWriteConcernError = error.MongoWriteConcernError;
connect.MongoBulkWriteError = require('./lib/bulk/common').BulkWriteError;
connect.BulkWriteError = connect.MongoBulkWriteError;

// Actual driver classes exported
connect.Admin = require('./lib/admin');
connect.MongoClient = require('./lib/mongo_client');
connect.Db = require('./lib/db');
connect.Collection = require('./lib/collection');
connect.ReadPreference = require('./lib/read_preference');
connect.GridStore = require('./lib/gridfs/grid_store');
connect.Chunk = require('./lib/gridfs/chunk');
connect.Logger = require('./lib/logger');
connect.AggregationCursor = AggregationCursor;
connect.CommandCursor = CommandCursor;
connect.Cursor = Cursor;
connect.GridFSBucket = require('./lib/gridfs-stream');

// BSON types exported
connect.Binary = BSON.Binary;
connect.Code = BSON.Code;
connect.Map = BSON.Map;
connect.DBRef = BSON.DBRef;
connect.Double = BSON.Double;
connect.Int32 = BSON.Int32;
connect.Long = BSON.Long;
connect.MinKey = BSON.MinKey;
connect.MaxKey = BSON.MaxKey;
connect.ObjectID = BSON.ObjectID;
connect.ObjectId = BSON.ObjectID;
connect.Symbol = BSON.Symbol;
connect.Timestamp = BSON.Timestamp;
connect.BSONRegExp = BSON.BSONRegExp;
connect.Decimal128 = BSON.Decimal128;

// Add connect method
connect.connect = connect;

// Set up the instrumentation method
connect.instrument = function(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const instrumentation = new Instrumentation();
  instrumentation.instrument(connect.MongoClient, callback);
  return instrumentation;
};

// Set our exports to be the connect function
module.exports = connect;
