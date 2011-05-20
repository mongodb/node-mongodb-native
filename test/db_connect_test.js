var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  nodeunit = require('nodeunit'),
  Db = require('../lib/mongodb').Db,
  Server = require('../lib/mongodb').Server,
  ServerPair = require('../lib/mongodb').ServerPair;

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

  // Test the auto connect functionality of the db
  shouldCorrectlyPerformAutomaticConnect : function(test) {
    var automatic_connect_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true}), {});
    automatic_connect_client.bson_deserializer = client.bson_deserializer;
    automatic_connect_client.bson_serializer = client.bson_serializer;
    automatic_connect_client.pkFactory = client.pkFactory;
  
    automatic_connect_client.open(function(err, automatic_connect_client) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // Remove the listener for the close to avoid loop
        automatic_connect_client.removeListener("close", closeListener);
        // Let's insert a document
        automatic_connect_client.collection('test_object_id_generation.data2', function(err, collection) {
          // Insert another test document and collect using ObjectId
          collection.insert({"name":"Patty", "age":34}, function(err, ids) {
            test.equal(1, ids.length);
            test.ok(ids[0]._id.toHexString().length == 24);
  
            collection.findOne({"name":"Patty"}, function(err, document) {
              test.equal(ids[0]._id.toHexString(), document._id.toHexString());
              // Let's close the db
              automatic_connect_client.close();
              test.done();
            });
          });
        });
      };
      // Add listener to close event
      automatic_connect_client.on("close", closeListener);
      automatic_connect_client.close();
    });    
  },
  
  // Test that error conditions are handled correctly
  shouldCorrectlyHandleConnectionErrors : function(test) {
    // Test error handling for single server connection
    var serverConfig = new Server("127.0.0.1", 21017, {auto_reconnect: true});
    var error_client = new Db(MONGODB, serverConfig, {});
  
    error_client.on("error", function(err) {});
    error_client.on("close", function(connection) {
      test.ok(typeof connection == typeof serverConfig);
      test.equal("127.0.0.1", connection.host);
      test.equal(21017, connection.port);
      test.equal(true, connection.autoReconnect);
    });
    error_client.open(function(err, error_client) {});
  
    // Test error handling for server pair (works for cluster aswell)
    var serverConfig = new Server("127.0.0.1", 20017, {});
    var normalServer = new Server("127.0.0.1", 27017);
    var serverPairConfig = new ServerPair(normalServer, serverConfig);
    var error_client_pair = new Db(MONGODB, serverPairConfig, {});
  
    var closeListener = function(connection) {
      test.ok(typeof connection == typeof serverConfig);
      test.equal("127.0.0.1", connection.host);
      test.equal(20017, connection.port);
      test.equal(false, connection.autoReconnect);
        // Let's close the db      
      error_client_pair.removeListener("close", closeListener);
      normalServer.close();
      test.done();
    };
  
    error_client_pair.on("error", function(err) {});
    error_client_pair.on("close", closeListener);
    error_client_pair.open(function(err, error_client_pair) {});    
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;