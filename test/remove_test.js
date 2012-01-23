var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var native_parser = (process.env['TEST_NATIVE'] != null);

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

/**
 * An example removing all documents in a collection not using safe mode
 *
 * @_class collection
 * @_function remove
 * @ignore
 */
exports.shouldRemoveAllDocumentsNoSafe = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch a collection to insert document into
    db.collection("remove_all_documents_no_safe", function(err, collection) {
      
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:2}], {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Remove all the document
        collection.remove();
        
        // Wait for a second to ensure command went through
        setTimeout(function() {
          
          // Fetch all results
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(0, items.length);
            db.close();
            test.done();
          });
        }, 1000);        
      });
    })
  });  
}

/**
 * An example removing a subset of documents using safe mode to ensure removal of documents
 *
 * @_class collection
 * @_function remove
 * @ignore
 */
exports.shouldRemoveSubsetOfDocumentsSafeMode = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch a collection to insert document into
    db.collection("remove_subset_of_documents_safe", function(err, collection) {
      
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:2}], {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Remove all the document
        collection.remove({a:1}, {safe:true}, function(err, numberOfRemovedDocs) {
          test.equal(null, err);
          test.equal(1, numberOfRemovedDocs);
          db.close();
          test.done();
        });        
      });
    })
  });  
}

/**
 * @ignore
 */
exports.shouldCorrectlyClearOutCollection = function(test) {
  client.createCollection('test_clear', function(err, r) {
    client.collection('test_clear', function(err, collection) {
      collection.insert({i:1}, {safe:true}, function(err, ids) {
        collection.insert({i:2}, {safe:true}, function(err, ids) {
          collection.count(function(err, count) {
            test.equal(2, count);
            // Clear the collection
            collection.remove({}, {safe:true}, function(err, result) {
              test.equal(2, result);
              
              collection.count(function(err, count) {
                test.equal(0, count);
                // Let's close the db
                test.done();
              });
            });
          });
        });
      });
    });
  });    
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;