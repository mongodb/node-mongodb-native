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


  // Test the auto connect functionality of the db
  shouldCorrectlyUseSameConnectionsForTwoDifferentDbs : function(test) {
    var second_test_database = new Db(MONGODB + "_2", new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null), retryMiliSeconds:50});
    second_test_database.bson_deserializer = client.bson_deserializer;
    second_test_database.bson_serializer = client.bson_serializer;
    second_test_database.pkFactory = client.pkFactory;
    
    // Just create second database
    second_test_database.open(function(err, second_test_database) {
      // Close second database
      second_test_database.close();
      // Let's grab a connection to the different db resusing our connection pools
      var secondDb = client.db(MONGODB + "_2");
      secondDb.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(err, collection) {
        // Insert a dummy document
        collection.insert({a:20}, {safe: true}, function(err, r) {            
          test.equal(null, err);

          // Query it
          collection.findOne({}, function(err, item) {
            test.equal(20, item.a);

            // Use the other db
            client.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(err, collection) {
              // Insert a dummy document
              collection.insert({b:20}, {safe: true}, function(err, r) {            
                test.equal(null, err);            

                // Query it
                collection.findOne({}, function(err, item) {
                  test.equal(20, item.b);
                  
                  // Drop the second db
                  secondDb.dropDatabase(function(err, item) {
                    test.equal(null, err);            
                    test.done();                
                  })              
                })              
              });
            });
          })              
        });
      });
    });    
  },
  
  // run this last
  noGlobalsLeaked: function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;
