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
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL, native_parser: (process.env['TEST_NATIVE'] != null) ? true : false}));

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

  shouldCreateRecordsWithCustomPKFactory : function(test) {
    // Custom factory (need to provide a 12 byte array);
    var CustomPKFactory = function() {}
    CustomPKFactory.prototype = new Object();
    CustomPKFactory.createPk = function() {
      return new ObjectID("aaaaaaaaaaaa");
    }
  
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {ssl:useSSL}), {'pk':CustomPKFactory, native_parser: (process.env['TEST_NATIVE'] != null)});
    p_client.open(function(err, p_client) {
      p_client.dropDatabase(function(err, done) {
        p_client.createCollection('test_custom_key', function(err, collection) {
          collection.insert({'a':1}, {safe:true}, function(err, doc) {
            collection.find({'_id':new ObjectID("aaaaaaaaaaaa")}, function(err, cursor) {
              cursor.toArray(function(err, items) {
                test.equal(1, items.length);
  
                p_client.close();
                test.done();
              });
            });
          });
        });
      });
    });
  },

  testConnectBadUrl: function(test) {
    test.throws(function() {
      connect('mango://localhost:27017/' + MONGODB, function(err, db) {
        test.ok(false, 'Bad URL!');
      });
    });
    test.done();
  },

  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;
