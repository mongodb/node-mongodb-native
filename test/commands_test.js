var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../dev/tools/gleak'),
  fs = require('fs'),
  BSON = mongodb.BSON,
  Code = mongodb.Code, 
  Binary = mongodb.Binary,
  Symbol = mongodb.Symbol,
  DBRef = mongodb.DBRef,
  Double = mongodb.Double,
  MinKey = mongodb.MinKey,
  MaxKey = mongodb.MaxKey,
  Timestamp = mongodb.Timestamp,
  Long = mongodb.Long,
  ObjectID = mongodb.ObjectID,
  DBRef = mongodb.DBRef,
  BaseCommand = mongodb.BaseCommand,
  InsertCommand = mongodb.InsertCommand,
  UpdateCommand = mongodb.UpdateCommand,
  DeleteCommand = mongodb.DeleteCommand,
  GetMoreCommand = mongodb.GetMoreCommand,
  KillCursorCommand = mongodb.KillCursorCommand,
  QueryCommand = mongodb.QueryCommand,
  MongoReply = mongodb.MongoReply,
  BinaryParser = mongodb.BinaryParser;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  callback();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  callback();
}

exports['Should Correctly Generate an Insert Command'] = function(test) {
  var full_collection_name = "db.users";
  var insert_command = new InsertCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name);
  insert_command.add({name: 'peter pan'});
  insert_command.add({name: 'monkey king'});
  // assert the length of the binary
  test.equal(81, insert_command.toBinary().length);
  test.done();
}

exports['Should Correctly Generate an Update Command'] = function(test) {
  var full_collection_name = "db.users";
  var flags = UpdateCommand.DB_UPSERT;
  var selector = {name: 'peter pan'};
  var document = {name: 'peter pan junior'};
  // Create the command
  var update_command = new UpdateCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, selector, document, flags);
  // assert the length of the binary
  test.equal(90, update_command.toBinary().length);
  test.done();
}

exports['Should Correctly Generate a Delete Command'] = function(test) {
  var full_collection_name = "db.users";      
  var selector = {name: 'peter pan'};
  // Create the command
  var delete_command = new DeleteCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, selector);
  // assert the length of the binary
  test.equal(58, delete_command.toBinary().length);
  test.done();
}

exports['Should Correctly Generate a Get More Command'] = function(test) {
  var full_collection_name = "db.users";    
  var numberToReturn = 100;
  var cursorId = Long.fromNumber(10000222);
  // Create the command
  var get_more_command = new GetMoreCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, full_collection_name, numberToReturn, cursorId);
  // assert the length of the binary
  test.equal(41, get_more_command.toBinary().length);
  test.done();
}

exports['Should Correctly Generate a Kill Cursors Command'] = function(test) {
  Array.prototype.toXml = function() {}    
  var cursorIds = [Long.fromNumber(1), Long.fromNumber(10000222)];
  // Create the command
  var kill_cursor_command = new KillCursorCommand({bson: new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey])}, cursorIds);
  // assert the length of the binary
  test.equal(40, kill_cursor_command.toBinary().length);
  test.done();
}

exports['Should Correctly Generate a Query Command'] = function(test) {
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
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}