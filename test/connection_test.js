var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  connect = mongodb.connect,
  Script = require('vm'),
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ServerManager = require('../test/tools/server_manager').ServerManager,
  Step = require("../deps/step/lib/step");

// Test db
var MONGODB = 'integration_tests';

function connectionTester(test, testName, callback) {
  return function(err, db) {
    test.equal(err, null);
    db.collection(testName, function(err, collection) {
      test.equal(err, null);
      var doc = {foo:123};
      collection.insert({foo:123}, {safe:true}, function(err, docs) {
        test.equal(err, null);
        db.dropDatabase(function(err, done) {
          test.equal(err, null);
          test.ok(done);
          callback();
        });
      });
    });
  };
};

var console = require('console');
exports.testCloseNoCallback = function(test) {
  var db = new Db(MONGODB,
                  new Server("127.0.0.1", 27017,
                             {auto_reconnect: true, poolSize: 4}),
                  {native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(connectionTester(test, 'testCloseNoCallback', function() {
    var dbCloseCount = 0, connectionCloseCount = 0, poolCloseCount = 0;
    db.on('close', function() { ++dbCloseCount; });
    var connection = db.serverConfig.connection;
    connection.on('close', function() { ++connectionCloseCount; });
    connection.pool.forEach(function(poolMember) {
      poolMember.connection.on('close', function() { ++poolCloseCount; });
    });
    db.close();
    setTimeout(function() {
      test.equal(dbCloseCount, 1);
      test.equal(connectionCloseCount, 1);
      test.equal(poolCloseCount, 4);
      test.done();
    }, 250);
  }));
};

exports.testCloseWithCallback = function(test) {
  var db = new Db(MONGODB,
                  new Server("127.0.0.1", 27017,
                             {auto_reconnect: true, poolSize: 4}),
                  {native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(connectionTester(test, 'testCloseWithCallback', function() {
    var dbCloseCount = 0, connectionCloseCount = 0, poolCloseCount = 0;
    db.on('close', function() { ++dbCloseCount; });
    var connection = db.serverConfig.connection;
    connection.on('close', function() { ++connectionCloseCount; });
    connection.pool.forEach(function(poolMember) {
      poolMember.connection.on('close', function() { ++poolCloseCount; });
    });
    db.close(function() {
      // Let all events fire.
      process.nextTick(function() {
        test.equal(dbCloseCount, 1);
        test.equal(connectionCloseCount, 1);
        test.equal(poolCloseCount, 4);
        test.done();
      });
    });
  }));
};

// run this last
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}
