var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  ServerManager = require('../test/tools/server_manager').ServerManager,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var native_parser = (process.env['TEST_NATIVE'] != null);
var client = null;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

/**
 * @ignore
 */
exports.shouldCorrectlyEmitErrorOnAllDbsOnPoolClose = function(test) {
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
}

/**
 * Test the auto connect functionality of the db
 * 
 * @ignore
 */
exports.shouldCorrectlyUseSameConnectionsForTwoDifferentDbs = function(test) {
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
}

/**
 * Test the auto connect functionality of the db
 * 
 * @ignore
 */
exports.shouldCorrectlyUseSameConnectionsForTwoDifferentDbs = function(test) {
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
}

/**
 * Simple example connecting to two different databases sharing the socket connections below.
 *
 * @_class db
 * @_function db
 */
exports.shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstances = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    test.equal(null, err);
    
    // Reference a different database sharing the same connections
    // for the data transfer
    var secondDb = db.db("integration_tests_2");
    
    // Fetch the collections
    var multipleColl1 = db.collection("multiple_db_instances");
    var multipleColl2 = secondDb.collection("multiple_db_instances");
    
    // Write a record into each and then count the records stored
    multipleColl1.insert({a:1}, {safe:true}, function(err, result) {      
      multipleColl2.insert({a:1}, {safe:true}, function(err, result) {
        
        // Count over the results ensuring only on record in each collection
        multipleColl1.count(function(err, count) {
          test.equal(1, count);

          multipleColl2.count(function(err, count) {
            test.equal(1, count);

            db.close();
            test.done();
          });
        });
      });
    });
  });
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

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;