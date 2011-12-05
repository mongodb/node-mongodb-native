var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ServerManager = require('../../test/tools/server_manager').ServerManager,
  Step = require("../../deps/step/lib/step");  

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 1}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var serverManager = null;

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    callback();
  },
  
  tearDown: function(callback) {
    // serverManager.stop(9, function(err, result) {
      callback();
    // });
  },

  shouldCorrectlyKeepInsertingDocumentsWhenServerDiesAndComesUp : function(test) {
    var db1 = new Db('mongo-ruby-test-single-server', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];
    // Start server
    serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true})
    serverManager.start(true, function() {
      db1.open(function(err, db) {        
        // Startup the insert of documents
        var intervalId = setInterval(function() {
          db.collection('inserts', function(err, collection) {
            var doc = {timestamp:new Date().getTime()};
            insertDocs.push(doc);
            // Insert document
            collection.insert(doc, {safe:{fsync:true}}, function(err, result) {
              // Save errors
              if(err != null) errs.push(err);
              if(err == null) {
                docs.push(result[0]);                
              }
            })
          });        
        }, 500);        
  
        // Wait for a second and then kill the server
        setTimeout(function() {
          // Kill server instance
          serverManager.stop(9, function(err, result) {
            // Server down for 1 second
            setTimeout(function() {
              // Restart server
              serverManager = new ServerManager({auth:false, purgedirectories:false, journal:true});
              serverManager.start(true, function() {
                // Wait for it
                setTimeout(function() {
                  // Drop db
                  db.dropDatabase(function(err, result) {
                    // Close db
                    db.close();
                    // Check that we got at least one error
                    // test.ok(errs.length > 0);
                    test.ok(docs.length > 0);
                    test.ok(insertDocs.length > 0);
                    // Finish up
                    test.done();                  
                  });
                }, 5000)
              })
            }, 1000);
          });
        }, 3000);
      })      
    });
  },

  shouldCorrectlyInsertKillServerFailThenRestartServerAndSucceed : function(test) {
    var db = new Db('test-single-server-recovery', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {numberOfRetries:3, retryMiliSeconds:500, native_parser: (process.env['TEST_NATIVE'] != null)});
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Start server
    serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true})
    serverManager.start(true, function() {
      db.open(function(err, db) {        
        // Add an error handler
        db.on("error", function(err) {
          console.log("----------------------------------------------- received error")
          console.dir(err)
          errs.push(err);
        });

        db.collection('inserts', function(err, collection) {
          var doc = {timestamp:new Date().getTime(), a:1};
          collection.insert(doc, {safe:true}, function(err, result) {
            test.equal(null, err);
            
            // Kill server instance
            serverManager.stop(9, function(err, result) {
              // Attemp insert (should timeout)
              var doc = {timestamp:new Date().getTime(), b:1};
              collection.insert(doc, {safe:true}, function(err, result) {
                test.ok(err != null);
                test.equal(null, result);
                
                // Restart server
                serverManager = new ServerManager({auth:false, purgedirectories:false, journal:true});
                serverManager.start(true, function() {
                  // Attemp insert again
                  collection.insert(doc, {safe:true}, function(err, result) {
                    // Fetch the documents
                    collection.find({b:1}).toArray(function(err, items) {
                      test.equal(null, err);
                      test.equal(1, items[0].b);
                      test.done();
                    });                    
                  });                  
                });                
              });              
            });            
          })
        });
      });
    });
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})

// Assign out tests
module.exports = tests;