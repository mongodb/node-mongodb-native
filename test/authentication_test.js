var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, native_parser: (process.env['TEST_NATIVE'] != null) ? true : false}));

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      if(numberOfTestsRun == 0) {
        // client.dropDatabase(function(err, done) {
          callback();
        // });        
      } else {
        // Start tests
        callback();        
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

  // Test the authentication method for the user
  shouldCorrectlyAuthenticate : function(test) {
    var user_name = 'spongebob';
    var password = 'password';
  
    client.authenticate('admin', 'admin', function(err, replies) {
      test.ok(err instanceof Error);
      test.ok(!replies);
  
      // Add a user
      client.addUser(user_name, password, function(err, result) {
        client.authenticate(user_name, password, function(err, replies) {
          test.done();
        });
      });
    });    
  },
  
  shouldCorrectlyAddAndRemoveUser : function(test) {
    var user_name = 'spongebob2';
    var password = 'password';
  
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, native_parser: (process.env['TEST_NATIVE'] != null) ? true : false}), {});
    p_client.bson_deserializer = client.bson_deserializer;
    p_client.bson_serializer = client.bson_serializer;
    p_client.pkFactory = client.pkFactory;
  
    p_client.open(function(err, automatic_connect_client) {
      p_client.authenticate('admin', 'admin', function(err, replies) {
        test.ok(err instanceof Error);
  
        // Add a user
        p_client.addUser(user_name, password, function(err, result) {
          p_client.authenticate(user_name, password, function(err, replies) {
            test.ok(replies);
  
            // Remove the user and try to authenticate again
            p_client.removeUser(user_name, function(err, result) {
              p_client.authenticate(user_name, password, function(err, replies) {
                test.ok(err instanceof Error);
  
                test.done();
                p_client.close();
              });
            });
          });
        });
      });
    });    
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;