var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  mongoO = require('../../lib/mongodb').pure(),
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../tools/gleak'),
  fs = require('fs'),
  BSON = mongodb.BSON,
  Code = mongoO.Code, 
  Binary = mongoO.Binary,
  Symbol = mongoO.Symbol,
  DBRef = mongoO.DBRef,
  Double = mongoO.Double,
  MinKey = mongoO.MinKey,
  MaxKey = mongoO.MaxKey,
  Timestamp = mongoO.Timestamp,
  Long = mongoO.Long,
  ObjectID = mongoO.ObjectID,
  DBRef = mongoO.DBRef,
  BaseCommand = mongoO.BaseCommand,
  InsertCommand = mongoO.InsertCommand,
  UpdateCommand = mongoO.UpdateCommand,
  DeleteCommand = mongoO.DeleteCommand,
  GetMoreCommand = mongoO.GetMoreCommand,
  KillCursorCommand = mongoO.KillCursorCommand,
  QueryCommand = mongoO.QueryCommand,
  MongoReply = mongoO.MongoReply,
  BinaryParser = mongoO.BinaryParser;

var tests = testCase({
  setUp: function(callback) {
    callback();        
  },
  
  tearDown: function(callback) {
    callback();        
  },

  'Should Correctly Generate an Insert Command' : function(test) {
    var full_collection_name = "db.users";
    var insert_command = new InsertCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name);
    insert_command.add({name: 'peter pan'});
    insert_command.add({name: 'monkey king'});
    // assert the length of the binary
    test.equal(81, insert_command.toBinary().length);
    test.done();
  },

  'Should Correctly Generate an Update Command' : function(test) {
    var full_collection_name = "db.users";
    var flags = UpdateCommand.DB_UPSERT;
    var selector = {name: 'peter pan'};
    var document = {name: 'peter pan junior'};
    // Create the command
    var update_command = new UpdateCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, selector, document, flags);
    // assert the length of the binary
    test.equal(90, update_command.toBinary().length);
    test.done();
  },
  
  'Should Correctly Generate a Delete Command' : function(test) {
    var full_collection_name = "db.users";      
    var selector = {name: 'peter pan'};
    // Create the command
    var delete_command = new DeleteCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, selector);
    // assert the length of the binary
    test.equal(58, delete_command.toBinary().length);
    test.done();
  },
  
  'Should Correctly Generate a Get More Command' : function(test) {
    var full_collection_name = "db.users";    
    var numberToReturn = 100;
    var cursorId = Long.fromNumber(10000222);
    // Create the command
    var get_more_command = new GetMoreCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, numberToReturn, cursorId);
    // assert the length of the binary
    test.equal(41, get_more_command.toBinary().length);
    test.done();
  },
  
  'Should Correctly Generate a Kill Cursors Command' : function(test) {
    Array.prototype.toXml = function() {}    
    var cursorIds = [Long.fromNumber(1), Long.fromNumber(10000222)];
    // Create the command
    var kill_cursor_command = new KillCursorCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, cursorIds);
    // assert the length of the binary
    test.equal(40, kill_cursor_command.toBinary().length);
    test.done();
  },
  
  'Should Correctly Generate a Query Command' : function(test) {
    var full_collection_name = "db.users";
    var options = QueryCommand.OPTS_SLAVE;
    var numberToSkip = 100;
    var numberToReturn = 200;
    var query = {name:'peter pan'};
    var query_command = new QueryCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, options, numberToSkip, numberToReturn, query, null);
    // assert the length of the binary
    test.equal(62, query_command.toBinary().length);
    // Generate command with return field filter
    query_command = new QueryCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, options, numberToSkip, numberToReturn, query, { a : 1, b : 1, c : 1});
    test.equal(88, query_command.toBinary().length);
    test.done();
  },
  
  // run this last
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
});

// Assign out tests
module.exports = tests;
