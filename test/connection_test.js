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
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});

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

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      if(numberOfTestsRun == Object.keys(tests).length) {
        // If first test drop the db
        client.dropDatabase(function(err, done) {
          callback();
        });                
      } else {
        return callback();        
      }      
    });
  },
  
  tearDown: function(callback) {
    numberOfTestsRun = numberOfTestsRun - 1;
    // Drop the database and close it
    if(numberOfTestsRun <= 0) {
      // client.dropDatabase(function(err, done) {
        client.close();
        callback();
      // });        
    } else {
      client.close();
      callback();        
    }      
  },
  
  testCloseNoCallback : function(test) {
    var db = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(connectionTester(test, 'testCloseNoCallback', function() {
      var dbCloseCount = 0, connectionCloseCount = 0, poolCloseCount = 0;
      // Ensure no close events are fired as we are closing the connection specifically
      db.on('close', function() { dbCloseCount++; });

      var connectionPool = db.serverConfig.connectionPool;
      var connections = connectionPool.getAllConnections();
      var keys = Object.keys(connections);
        
      // Ensure no close events are fired as we are closing the connection specifically
      for(var i = 0; i < keys.length; i++) {
        connections[keys[i]].on("close", function() { test.ok(false); });
      }

      // Force the connection close
      db.serverConfig.connectionPool.stop();
      // Test done
      test.equal(1, dbCloseCount);
      test.done();
    }));
  },
  
  testCloseWithCallback : function(test) {
    var db = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}),{native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(connectionTester(test, 'testCloseWithCallback', function() {
      var dbCloseCount = 0, connectionCloseCount = 0, poolCloseCount = 0;
      // Ensure no close events are fired as we are closing the connection specifically
      db.on('close', function() { dbCloseCount++; });
  
      var connectionPool = db.serverConfig.connectionPool;
      var connections = connectionPool.getAllConnections();
      var keys = Object.keys(connections);
        
      // Ensure no close events are fired as we are closing the connection specifically
      for(var i = 0; i < keys.length; i++) {
        connections[keys[i]].on("close", function() { test.ok(false); });
      }
  
      db.close(function() {
        // Test done
        test.equal(0, dbCloseCount);
        test.done();
      });
    }));
  },  
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
});

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;