var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  nodeunit = require('nodeunit'),
  Db = require('../lib/mongodb').Db,
  Cursor = require('../lib/mongodb').Cursor,
  Collection = require('../lib/mongodb').Collection,
  Server = require('../lib/mongodb').Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}));

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      // Save reference to db
      client = db_p;
      // Start tests
      callback();
    });
  },
  
  tearDown: function(callback) {
    numberOfTestsRun = numberOfTestsRun - 1;
    // Drop the database and close it
    if(numberOfTestsRun <= 0) {
      client.dropDatabase(function(err, done) {
        client.close();
        callback();
      });        
    } else {
      client.close();
      callback();        
    }      
  },

  shouldCorrectlyExecuteToArray : function(test) {
    // Create a non-unique index and test inserts
    client.createCollection('test_array', function(err, collection) {
      collection.insert({'b':[1, 2, 3]}, function(err, ids) {
        collection.find(function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.deepEqual([1, 2, 3], documents[0].b);
            // Let's close the db
            test.done();
          });
        }, {});
      });
    });    
  },
  
  shouldCorrectlyExecuteToArrayAndFailOnFurtherCursorAccess : function(test) {
    client.createCollection('test_to_a', function(err, collection) {
      test.ok(collection instanceof Collection);
      collection.insert({'a':1}, function(err, ids) {
        collection.find({}, function(err, cursor) {
          cursor.toArray(function(err, items) {
            // Should fail if called again (cursor should be closed)
            cursor.toArray(function(err, items) {
              test.ok(err instanceof Error);
              test.equal("Cursor is closed", err.message);
  
              // Should fail if called again (cursor should be closed)
              cursor.each(function(err, item) {
                test.ok(err instanceof Error);
                test.equal("Cursor is closed", err.message);
                // Let's close the db
                test.done();
              });
            });
          });
        });
      });
    });
  }, 
  
  shouldCorrectlyFailToArrayDueToFinishedEachOperation : function(test) {
    client.createCollection('test_to_a_after_each', function(err, collection) {
      test.ok(collection instanceof Collection);
      collection.insert({'a':1}, function(err, ids) {
        collection.find(function(err, cursor) {
          cursor.each(function(err, item) {
            if(item == null) {
              cursor.toArray(function(err, items) {
                test.ok(err instanceof Error);
                test.equal("Cursor is closed", err.message);
  
                // Let's close the db
                test.done();
              });
            };
          });
        });
      });
    });
  },   
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;