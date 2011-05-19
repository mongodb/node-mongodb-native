var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  nodeunit = require('nodeunit'),
  Db = require('../lib/mongodb').Db,
  Server = require('../lib/mongodb').Server;

var client = new Db('integration_tests', new Server("127.0.0.1", 27017, {auto_reconnect: false}));

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
  
    var p_client = new Db('integration_tests', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {});
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