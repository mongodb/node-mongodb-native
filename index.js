// Core module
var core = require('mongodb-core'),
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits;

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
// Operation id
var operationId = 1;

var Instrumentation = function() {
  EventEmitter.call(this);
  // Names of methods we need to wrap
  var methods = ['command'];
  // Prototype
  var proto = core.Server.prototype;
  // Reference
  var self = this;
  // Core server method we are going to wrap
  methods.forEach(function(x) {
    var func = proto[x];

    // The actual prototype
    proto[x] = function() {
      var requestId = core.Query.nextRequestId();
      var ourOpId = operationId++;
      // Get the aruments
      var args = Array.prototype.slice.call(arguments, 0);
      var ns = args[0];
      var commandObj = args[1];
      var keys = Object.keys(commandObj);
      var commandName = keys[0];
      var db = ns.split('.')[0];

      // Get a connection reference for this server instance
      var connection = this.s.pool.get()
      // Emit the start event for the command
      var command = {type: 'started', operationId: ourOpId};
      command.command = commandObj;
      command.databaseName = db;
      command.commandName = commandName
      command.connectionId = connection;
      command.requestId = requestId;
      self.emit('command', command)

      // Start time
      var startTime = new Date().getTime();

      // Get the callback
      var callback = args.pop();
      args.push(function(err, r) {
        var endTime = new Date().getTime();
        var command = {type: 'succeeded',
          duration: (endTime - startTime),
          requestId: requestId,
          operationId: ourOpId,
          connectionId: connection};

        // If we have an error
        if(err) {
          command.type = 'failed'
          command.failure = err;
        } else {
          command.reply = r;
        }

        // Emit the command
        self.emit('command', command)

        // Return to caller
        callback(err, r);
      });

      // Apply the call
      func.apply(this, args);
    }
  });
}

inherits(Instrumentation, EventEmitter);

var instrumentation = new Instrumentation();

// Set up the instrumentation method
connect.instrument = function() {
  return instrumentation;
}

// Set our exports to be the connect function
module.exports = connect;
