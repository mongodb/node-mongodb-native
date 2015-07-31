// Core module
var core = require('mongodb-core'),
  Instrumentation = require('./lib/apm');

// Set up the connect function
var connect = require('./lib/mongo_client').connect;

// Expose error class
connect.MongoError = core.MongoError;

// Actual driver classes exported
connect.MongoClient = require('./lib/mongo_client');
connect.Db = require('./lib/db');
connect.Collection = require('./lib/collection');
connect.Server = require('./lib/server');
connect.ReplSet = require('./lib/replset');
connect.Mongos = require('./lib/mongos');
connect.ReadPreference = require('./lib/read_preference');
connect.GridStore = require('./lib/gridfs/grid_store');
connect.Chunk = require('./lib/gridfs/chunk');
connect.Logger = core.Logger;
connect.Cursor = require('./lib/cursor');

// BSON types exported
connect.Binary = core.BSON.Binary;
connect.Code = core.BSON.Code;
connect.DBRef = core.BSON.DBRef;
connect.Double = core.BSON.Double;
connect.Long = core.BSON.Long;
connect.MinKey = core.BSON.MinKey;
connect.MaxKey = core.BSON.MaxKey;
connect.ObjectID = core.BSON.ObjectID;
connect.ObjectId = core.BSON.ObjectID;
connect.Symbol = core.BSON.Symbol;
connect.Timestamp = core.BSON.Timestamp;

// Add connect method
connect.connect = connect;

// Instrumentation instance
var instrumentation = null;

// Set up the instrumentation method
connect.instrument = function(options) {
  if(!instrumentation) instrumentation = new Instrumentation(core, options)
  return instrumentation;
}
// Get prototype
var AggregationCursor = require('./lib/aggregation_cursor'),
  CommandCursor = require('./lib/command_cursor'),
  OrderedBulkOperation = require('./lib/bulk/ordered').OrderedBulkOperation,
  UnorderedBulkOperation = require('./lib/bulk/unordered').UnorderedBulkOperation,
  Admin = require('./lib/admin');

// Instrument Hook
connect.instrument = function(callback) {
  var instrumentations = []

  // Classes to support
  var classes = [connect.GridStore, connect.Server, connect.ReplSet, connect.Mongos,
    OrderedBulkOperation, UnorderedBulkOperation, CommandCursor, AggregationCursor,
    connect.Cursor, connect.Collection, connect.Db];

  // Add instrumentations to the available list
  for(var i = 0; i < classes.length; i++) {
    if(classes[i].define) {
      instrumentations.push(classes[i].define.generate());
    }
  }

  // Return the list of instrumentation points
  callback(null, instrumentations);
}

// Set our exports to be the connect function
module.exports = connect;
