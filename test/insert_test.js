var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  nodeunit = require('nodeunit'),
  Db = require('../lib/mongodb').Db,
  Server = require('../lib/mongodb').Server,
  Collection = require('../lib/mongodb').Collection,
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

  shouldCorrectlyPerformBasicInsert : function(test) {
    client.createCollection('test_insert', function(err, r) {
      client.collection('test_insert', function(err, collection) {
        for(var i = 1; i < 1000; i++) {
          collection.insert({c:i}, function(err, r) {});
        }

        collection.insert({a:2}, function(err, r) {
          collection.insert({a:3}, function(err, r) {
            collection.count(function(err, count) {
              test.equal(1001, count);
              // Locate all the entries using find
              collection.find(function(err, cursor) {
                cursor.toArray(function(err, results) {
                  test.equal(1001, results.length);
                  test.ok(results[0] != null);

                  // Let's close the db
                  test.done();
                });
              });
            });
          });
        });
      });
    });    
  },
  
  // Test multiple document insert
  shouldCorrectlyHandleMultipleDocumentInsert : function(test) {
    client.createCollection('test_multiple_insert', function(err, r) {
      var collection = client.collection('test_multiple_insert', function(err, collection) {
        var docs = [{a:1}, {a:2}];

        collection.insert(docs, function(err, ids) {
          ids.forEach(function(doc) {
            test.ok(((doc['_id']) instanceof client.bson_serializer.ObjectID || Object.prototype.toString.call(doc['_id']) === '[object ObjectID]'));
          });

          // Let's ensure we have both documents
          collection.find(function(err, cursor) {
            cursor.toArray(function(err, docs) {
              test.equal(2, docs.length);
              var results = [];
              // Check that we have all the results we want
              docs.forEach(function(doc) {
                if(doc.a == 1 || doc.a == 2) results.push(1);
              });
              test.equal(2, results.length);
              // Let's close the db
              test.done();
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