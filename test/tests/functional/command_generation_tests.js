var BaseCommand = require("../../../lib/mongodb/commands/base_command").BaseCommand,
  InsertCommand = require("../../../lib/mongodb/commands/insert_command").InsertCommand,
  UpdateCommand = require("../../../lib/mongodb/commands/update_command").UpdateCommand,
  DeleteCommand = require("../../../lib/mongodb/commands/delete_command").DeleteCommand,
  GetMoreCommand = require("../../../lib/mongodb/commands/get_more_command").GetMoreCommand,
  KillCursorCommand = require("../../../lib/mongodb/commands/kill_cursor_command").KillCursorCommand,
  QueryCommand = require("../../../lib/mongodb/commands/query_command").QueryCommand,
  MongoReply = require("../../../lib/mongodb/responses/mongo_reply").MongoReply;

/**
 * @ignore
 */
exports['Should Correctly Generate an Insert Command'] = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  var full_collection_name = "db.users";
  var insert_command = new InsertCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, false, {keepGoing:true});
  insert_command.add({name: 'peter pan'});
  insert_command.add({name: 'monkey king'});
  // assert the length of the binary
  test.equal(81, insert_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  test.done();
}

/**
 * @ignore
 */
exports['Should Correctly Generate an Update Command'] = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  var full_collection_name = "db.users";
  var selector = {name: 'peter pan'};
  var document = {$set: {value:1}};
  // Create the command
  var update_command = new UpdateCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, selector, document, {upsert:1});
  test.equal(85, update_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  test.done();
}

/**
 * @ignore
 */
exports['Should Correctly Generate a Delete Command'] = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  var full_collection_name = "db.users";      
  var selector = {name: 'peter pan'};
  // Create the command
  var delete_command = new DeleteCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, selector);
  // assert the length of the binary
  test.equal(58, delete_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  test.done();
}

/**
 * @ignore
 */
exports['Should Correctly Generate a Get More Command'] = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  var full_collection_name = "db.users";    
  var numberToReturn = 100;
  var cursorId = Long.fromNumber(10000222);
  // Create the command
  var get_more_command = new GetMoreCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, numberToReturn, cursorId);
  // assert the length of the binary
  test.equal(41, get_more_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  test.done();
}

/**
 * @ignore
 */
exports['Should Correctly Generate a Kill Cursors Command'] = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  Array.prototype.toXml = function() {}    
  var cursorIds = [Long.fromNumber(1), Long.fromNumber(10000222)];
  // Create the command
  var kill_cursor_command = new KillCursorCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, cursorIds);
  // assert the length of the binary
  test.equal(40, kill_cursor_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  test.done();
}

/**
 * @ignore
 */
exports['Should Correctly Generate a Query Command'] = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  var full_collection_name = "db.users";
  var options = QueryCommand.OPTS_SLAVE;
  var numberToSkip = 100;
  var numberToReturn = 200;
  var query = {name:'peter pan'};
  var query_command = new QueryCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, options, numberToSkip, numberToReturn, query, null);
  // assert the length of the binary
  test.equal(62, query_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  // Generate command with return field filter
  query_command = new QueryCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, options, numberToSkip, numberToReturn, query, { a : 1, b : 1, c : 1});
  test.equal(88, query_command.toBinary({
      disableDriverBSONSizeCheck:true
    , maxBsonSize: 1000000
    , maxMessageSizeBytes: 1000000
  }).length);
  test.done();
}

/**
 * @ignore
 */
exports.shouldCorrectlyGetErrorOnIllegalBSON = function(configuration, test) {
  var mongodb = configuration.getMongoPackage()
    , BSON = mongodb.BSON
    , Code = mongodb.Code
    , Binary = mongodb.Binary
    , Symbol = mongodb.Symbol
    , DBRef = mongodb.DBRef
    , Double = mongodb.Double
    , MinKey = mongodb.MinKey
    , MaxKey = mongodb.MaxKey
    , BinaryParser = mongodb.BinaryParser
    , Timestamp = mongodb.Timestamp
    , Long = mongodb.Long
    , ObjectID = mongodb.ObjectID
    , DBRef = mongodb.DBRef;

  var mongoReply = new MongoReply()
  var bytes = [0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 2, 5, 8, 1, 0, 2, 6, 32, 11, 0, 5
    ,0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 40, 2, 5, 8, 1, 0, 2, 6, 32, 11, 0, 5
    ,0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 2, 5, 8, 1, 0, 2, 6, 32, 11, 0, 5
    ,0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 2, 5, 8, 1, 0, 2, 6, 32, 11, 0, 5
    ,0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 2, 5, 8, 1, 0, 2, 6, 32, 11, 0, 5];
  var buffer = new Buffer(bytes.length);

  for(var i = 0; i < bytes.length; i++) {
    buffer[i] = bytes[i];
  }

  // Bson instance
  var bson = new mongodb.BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);
  // Set up mongo reply
  mongoReply.parseHeader(buffer, bson);
  // Fire up parseBody
  mongoReply.parseBody(buffer, bson, false, function(err, result) {
    test.ok(err != null);
    test.done();
  });      
}