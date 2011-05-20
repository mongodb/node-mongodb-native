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

  // Test the creation of a collection on the mongo db
  shouldCorrectExecuteBasicCollectionMethods : function(test) {
    client.createCollection('test_collection_methods', function(err, collection) {
      // Verify that all the result are correct coming back (should contain the value ok)
      test.equal('test_collection_methods', collection.collectionName);
      // Let's check that the collection was created correctly
      client.collectionNames(function(err, documents) {
        var found = false;
        documents.forEach(function(document) {
          if(document.name == "integration_tests_.test_collection_methods") found = true;
        });
        test.ok(true, found);
        // Rename the collection and check that it's gone
        client.renameCollection("test_collection_methods", "test_collection_methods2", function(err, reply) {
          test.equal(1, reply.documents[0].ok);
          // Drop the collection and check that it's gone
          client.dropCollection("test_collection_methods2", function(err, result) {
            test.equal(true, result);
            test.done();
          })
        });
      });
    })    
  },
  
  // Test the access to collections
  shouldAccessToCollections : function(test) {
    // Create two collections
    client.createCollection('test.spiderman', function(r) {
      client.createCollection('test.mario', function(r) {
        // Insert test documents (creates collections)
        client.collection('test.spiderman', function(err, spiderman_collection) {
          spiderman_collection.insert({foo:5});
        });
  
        client.collection('test.mario', function(err, mario_collection) {
          mario_collection.insert({bar:0});
        });
  
        // Assert collections
        client.collections(function(err, collections) {
          var found_spiderman = false;
          var found_mario = false;
          var found_does_not_exist = false;
  
          collections.forEach(function(collection) {
            if(collection.collectionName == "test.spiderman") found_spiderman = true;
            if(collection.collectionName == "test.mario") found_mario = true;
            if(collection.collectionName == "does_not_exist") found_does_not_exist = true;
          });
  
          test.ok(found_spiderman);
          test.ok(found_mario);
          test.ok(!found_does_not_exist);
          test.done();
        });
      });
    });    
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;