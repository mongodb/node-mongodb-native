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

  // Test a simple find
  shouldCorrectlyPerformSimpleFind : function(test) {
    client.createCollection('test_find_simple', function(err, r) {
      var collection = client.collection('test_find_simple', function(err, collection) {
        var doc1 = null;
        var doc2 = null;

        // Insert some test documents
        collection.insert([{a:2}, {b:3}], function(err, docs) {doc1 = docs[0]; doc2 = docs[1]});
        // Ensure correct insertion testing via the cursor and the count function
        collection.find(function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(2, documents.length);
          })
        });
        collection.count(function(err, count) {
          test.equal(2, count);
        });
        // Fetch values by selection
        collection.find({'a': doc1.a}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(1, documents.length);
            test.equal(doc1.a, documents[0].a);
            // Let's close the db
            test.done();
          });
        });
      });
    });    
  },
  
  // Test a simple find chained
  shouldCorrectlyPeformSimpleChainedFind : function(test) {
    client.createCollection('test_find_simple_chained', function(err, r) {
      var collection = client.collection('test_find_simple_chained', function(err, collection) {
        var doc1 = null;
        var doc2 = null;

        // Insert some test documents
        collection.insert([{a:2}, {b:3}], function(err, docs) {doc1 = docs[0]; doc2 = docs[1]});
        // Ensure correct insertion testing via the cursor and the count function
        collection.find().toArray(function(err, documents) {
          test.equal(2, documents.length);
        });
        collection.count(function(err, count) {
          test.equal(2, count);
        });
        // Fetch values by selection
        collection.find({'a': doc1.a}).toArray(function(err, documents) {
          test.equal(1, documents.length);
          test.equal(doc1.a, documents[0].a);
          // Let's close the db
          test.done();
        });
      });
    });    
  },
  
  // Test advanced find
  shouldCorrectlyPeformAdvancedFinds : function(test) {
    client.createCollection('test_find_advanced', function(err, r) {
      var collection = client.collection('test_find_advanced', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null;
  
        // Insert some test documents
        collection.insert([{a:1}, {a:2}, {b:3}], function(err, docs) {
          var doc1 = docs[0], doc2 = docs[1], doc3 = docs[2];
  
          // Locate by less than
          collection.find({'a':{'$lt':10}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(2, documents.length);
              // Check that the correct documents are returned
              var results = [];
              // Check that we have all the results we want
              documents.forEach(function(doc) {
                if(doc.a == 1 || doc.a == 2) results.push(1);
              });
              test.equal(2, results.length);
            });
          });
  
          // Locate by greater than
          collection.find({'a':{'$gt':1}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(1, documents.length);
              test.equal(2, documents[0].a);
            });
          });
  
          // Locate by less than or equal to
          collection.find({'a':{'$lte':1}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(1, documents.length);
              test.equal(1, documents[0].a);
            });
          });
  
          // Locate by greater than or equal to
          collection.find({'a':{'$gte':1}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(2, documents.length);
              // Check that the correct documents are returned
              var results = [];
              // Check that we have all the results we want
              documents.forEach(function(doc) {
                if(doc.a == 1 || doc.a == 2) results.push(1);
              });
              test.equal(2, results.length);
            });
          });
  
          // Locate by between
          collection.find({'a':{'$gt':1, '$lt':3}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(1, documents.length);
              test.equal(2, documents[0].a);
            });
          });
  
          // Locate in clause
          collection.find({'a':{'$in':[1,2]}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(2, documents.length);
              // Check that the correct documents are returned
              var results = [];
              // Check that we have all the results we want
              documents.forEach(function(doc) {
                if(doc.a == 1 || doc.a == 2) results.push(1);
              });
              test.equal(2, results.length);
            });
          });
  
          // Locate in _id clause
          collection.find({'_id':{'$in':[doc1['_id'], doc2['_id']]}}, function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(2, documents.length);
              // Check that the correct documents are returned
              var results = [];
              // Check that we have all the results we want
              documents.forEach(function(doc) {
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
  },
  
  // Test sorting of results
  shouldCorrectlyPerformFindWithSort : function(test) {
    client.createCollection('test_find_sorting', function(err, r) {
      client.collection('test_find_sorting', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null, doc4 = null;
        // Insert some test documents
        collection.insert([{a:1, b:2},
            {a:2, b:1},
            {a:3, b:2},
            {a:4, b:1}
          ], function(err, docs) {doc1 = docs[0]; doc2 = docs[1]; doc3 = docs[2]; doc4 = docs[3]});
  
        // Test sorting (ascending)
        collection.find({'a': {'$lt':10}}, {'sort': [['a', 1]]}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(1, documents[0].a);
            test.equal(2, documents[1].a);
            test.equal(3, documents[2].a);
            test.equal(4, documents[3].a);
          });
        });
  
        // Test sorting (descending)
        collection.find({'a': {'$lt':10}}, {'sort': [['a', -1]]}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(4, documents[0].a);
            test.equal(3, documents[1].a);
            test.equal(2, documents[2].a);
            test.equal(1, documents[3].a);
          });
        });
  
        // Test sorting (descending), sort is hash
        collection.find({'a': {'$lt':10}}, {sort: {a: -1}}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(4, documents[0].a);
            test.equal(3, documents[1].a);
            test.equal(2, documents[2].a);
            test.equal(1, documents[3].a);
          });
        });
  
        // Sorting using array of names, assumes ascending order
        collection.find({'a': {'$lt':10}}, {'sort': ['a']}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(1, documents[0].a);
            test.equal(2, documents[1].a);
            test.equal(3, documents[2].a);
            test.equal(4, documents[3].a);
          });
        });
  
        // Sorting using single name, assumes ascending order
        collection.find({'a': {'$lt':10}}, {'sort': 'a'}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(1, documents[0].a);
            test.equal(2, documents[1].a);
            test.equal(3, documents[2].a);
            test.equal(4, documents[3].a);
          });
        });
  
        // Sorting using single name, assumes ascending order, sort is hash
        collection.find({'a': {'$lt':10}}, {sort: {'a':1}}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(1, documents[0].a);
            test.equal(2, documents[1].a);
            test.equal(3, documents[2].a);
            test.equal(4, documents[3].a);
          });
        });
  
        collection.find({'a': {'$lt':10}}, {'sort': ['b', 'a']}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
            test.equal(2, documents[0].a);
            test.equal(4, documents[1].a);
            test.equal(1, documents[2].a);
            test.equal(3, documents[3].a);
          });
        });
  
        // Sorting using empty array, no order guarantee should not blow up
        collection.find({'a': {'$lt':10}}, {'sort': []}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            test.equal(4, documents.length);
          });
        });
  
        /* NONACTUAL */
        // Sorting using ordered hash
        collection.find({'a': {'$lt':10}}, {'sort': {a:-1}}, function(err, cursor) {
          cursor.toArray(function(err, documents) {
            // Fail test if not an error
            test.equal(4, documents.length);
            // Let's close the db
            test.done();
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