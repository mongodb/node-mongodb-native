var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  ServerManager = require('../test/tools/server_manager').ServerManager,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});

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

  shouldCorrectlyEmitErrorOnAllDbsOnPoolClose : function(test) {
    if(process.platform !== 'linux') {
      var db = new Db('tests', new Server("127.0.0.1", 27027, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
      // All inserted docs
      var docs = [];
      var errs = [];
      var insertDocs = [];
      var numberOfCloses = 0;

      // Start server
      var serverManager = new ServerManager({auth:false, purgedirectories:true, journal:false, start_port:27027})
      serverManager.start(false, function() {
        db.on("close", function(err) {
          numberOfCloses = numberOfCloses + 1;
        })
        
        db.open(function(err, db) {
          db.createCollection('shouldCorrectlyErrorOnAllDbs', function(err, collection) {
            test.equal(null, err);

            collection.insert({a:1}, {safe:true}, function(err, result) {
              test.equal(null, err);

              // Open a second db
              var db2 = db.db('tests_2');
              // Add a close handler
              db2.on("close", function(err) {
                numberOfCloses = numberOfCloses + 1;              
              });
                                  
              db.serverConfig.connectionPool.openConnections[0].connection.destroy();
              
              // Kill server and end test
              serverManager.stop(9, function() {
                test.equal(2, numberOfCloses)
                test.done();          
              });            
            });
          });
        });
      });      
    } else {
      test.done();
    }
  },

  // Test the auto connect functionality of the db
  shouldCorrectlyUseSameConnectionsForTwoDifferentDbs : function(test) {
    var second_test_database = new Db(MONGODB + "_2", new Server("127.0.0.1", 27017, {auto_reconnect: true, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null), retryMiliSeconds:50});
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
  
  // Test the auto connect functionality of the db
  shouldCorrectlyUseSameConnectionsForTwoDifferentDbs : function(test) {
    var second_test_database = new Db(MONGODB + "_2", new Server("127.0.0.1", 27017, {auto_reconnect: true, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null), retryMiliSeconds:50});
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
