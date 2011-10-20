var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});

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

  shouldCorrectlyHandleThrownError : function(test) {
    client.createCollection('shouldCorrectlyHandleThrownError', function(err, r) {
      try {
        client.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
          test.done();
          //debug(someUndefinedVariable);
        });        
      } catch (err) {
        test.ok(err != null);
        test.done();        
      }
    });
  },  

  shouldCorrectlyHandleThrownErrorInRename : function(test) {
    // Register handler to receive error
    client.on("error", function(err) {
      test.done();
    });
    
    // Execute code
    client.createCollection('shouldCorrectlyHandleThrownErrorInRename', function(err, r) {      
      client.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
        collection.rename("shouldCorrectlyHandleThrownErrorInRename2", function(err, result) {
          test.done();
          //debug(someUndefinedVariable);
        })
      });        
    });
  },

  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;
