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

  shouldCorrectlyCommunicateUsingSSLSocket : function(test) {
    var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];
    
    // Start server
    serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true, ssl:true})
    serverManager.start(true, function() {
      db1.open(function(err, db) {        
        // Create a collection
        db.createCollection('shouldCorrectlyCommunicateUsingSSLSocket', function(err, collection) {
          collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
          collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
          collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
          collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
          collection.insert([{a:1}, {b:2}, {c:'hello world'}], {safe:true}, function(err, result) {
            collection.find({}).toArray(function(err, items) {
              // test.equal(3, items.length);
              db.close();
              test.done();
            })
          });
        });        
      })      
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