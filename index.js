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
connect.GridFSBucket = require('./lib/gridfs-stream');

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

// // Set up the instrumentation method
// connect.instrument = function(options) {
//   if(!instrumentation) instrumentation = new Instrumentation(core, options)
//   return instrumentation;
// }

// Set our exports to be the connect function
module.exports = connect;
