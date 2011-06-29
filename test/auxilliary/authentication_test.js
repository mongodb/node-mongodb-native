var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ServerManager = require('../../test/tools/server_manager').ServerManager;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 1}), {native_parser: (process.env['TEST_NATIVE'] != null)});

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    callback();
  },
  
  tearDown: function(callback) {
    callback();
  },

  shouldCorrectlyAuthenticateAgainstAdminDb : function(test) {
    // Boot up a simple server, then 
    var serverManager = new ServerManager({auth:false, purgedirectories:true})
    serverManager.start(true, function(err, result) {
      // Set up a connection and add a user to the db
      var db = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}), {native_parser: (process.env['TEST_NATIVE'] != null)});
      db.open(function(err, db) {
        db.admin().addUser('admin', 'admin', function(err, result){
          db.close();
          // Restart the server in auth mode (not purging the directories)
          serverManager = new ServerManager({auth:true, purgedirectories:false})
          serverManager.start(true, function(err, result) {            
            // Connect to the db
            db.open(function(err, db) {
              db.admin().authenticate('admin', 'admin', function(err, result) {
                test.ok(result);
                test.done();
              })              
            })            
          });
        });
      });
    });
  }
})

// Assign out tests
module.exports = tests;