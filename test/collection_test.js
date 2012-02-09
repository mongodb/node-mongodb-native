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
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Long = require('../lib/mongodb/bson/long').Long,
  Step = require("../deps/step/lib/step"),
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var native_parser = (process.env['TEST_NATIVE'] != null);
var client = null;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
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
 * Example of a simple document save with safe set to false
 *
 * @_class collection
 * @_function save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocument = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch the collection
    db.collection("save_a_simple_document", function(err, collection) {
      
      // Save a document with no safe option
      collection.save({hello:'world'});
      
      // Wait for a second
      setTimeout(function() {
        
        // Find the saved document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
          test.equal('world', item.hello);
          db.close();
          test.done();
        });        
      }, 1000);      
    });    
  });
}

/**
 * Example of a simple document save and then resave with safe set to true
 *
 * @_class collection
 * @_function save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentModifyItAndResaveIt = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch the collection
    db.collection("save_a_simple_document_modify_it_and_resave_it", function(err, collection) {
      
      // Save a document with no safe option
      collection.save({hello:'world'}, {safe:true}, function(err, result) {

        // Find the saved document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
          test.equal('world', item.hello);
          
          // Update the document
          item['hello2'] = 'world2';
          
          // Save the item with the additional field
          collection.save(item, {safe:true}, function(err, result) {
            
            // Find the changed document
            collection.findOne({hello:'world'}, function(err, item) {
              test.equal(null, err);
              test.equal('world', item.hello);
              test.equal('world2', item.hello2);              
              
              db.close();
              test.done();
            });
          });           
        });        
      });
    });    
  });
}

/**
 * @ignore
 */
exports.shouldCorrectExecuteBasicCollectionMethods = function(test) {
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
        test.equal(null, err);
        // Drop the collection and check that it's gone
        client.dropCollection("test_collection_methods2", function(err, result) {
          test.equal(true, result);
          test.done();
        })
      });
    });
  })    
}

/**
 * @ignore
 */
exports.shouldAccessToCollections = function(test) {
  // Create two collections
  client.createCollection('test.spiderman', function(r) {
    client.createCollection('test.mario', function(r) {
      // Insert test documents (creates collections)
      client.collection('test.spiderman', function(err, spiderman_collection) {
        spiderman_collection.insert({foo:5}, {safe:true}, function(err, r) {
          
          client.collection('test.mario', function(err, mario_collection) {
            mario_collection.insert({bar:0}, {safe:true}, function(err, r) {
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
        });
      });
    });
  });    
}

/**
 * @ignore
 */
exports.shouldCorrectlyDropCollection = function(test) {
  client.createCollection('test_drop_collection2', function(err, r) {
    client.dropCollection('test_drop_collection', function(err, r) {
      test.ok(err instanceof Error);
      test.equal("ns not found", err.message);
      var found = false;
      // Ensure we don't have the collection in the set of names
      client.collectionNames(function(err, replies) {
        replies.forEach(function(err, document) {
          if(document.name == "test_drop_collection") {
            found = true;
            return;
          }
        });
        // If we have an instance of the index throw and error
        if(found) throw new Error("should not fail");
        // Let's close the db
        test.done();
      });
    });
  });    
}

/**
 * Example of a simple document save and then resave with safe set to true
 *
 * @_class collection
 * @_function drop
 * @ignore
 */
exports.shouldCorrectlyDropCollectionWithDropFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('test_other_drop', function(err, collection) {
      test.equal(null, err);
      
      // Drop the collection
      collection.drop(function(err, reply) {        

        // Ensure we don't have the collection in the set of names
        db.collectionNames(function(err, replies) {
          
          var found = false;
          // For each collection in the list of collection names in this db look for the
          // dropped collection
          replies.forEach(function(document) {
            if(document.name == "test_other_drop") {
              found = true;
              return;
            }
          });

          // Ensure the collection is not found
          test.equal(false, found);

          // Let's close the db
          db.close();
          test.done();
        });
      });
    });    
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetriveCollectionNames = function(test) {
  client.createCollection('test_collection_names', function(err, r) {
    client.collectionNames(function(err, documents) {
      var found = false;
      var found2 = false;
      documents.forEach(function(document) {
        if(document.name == MONGODB + '.test_collection_names') found = true;
      });
      test.ok(found);
      // Insert a document in an non-existing collection should create the collection
      client.collection('test_collection_names2', function(err, collection) {
        collection.insert({a:1}, {safe:true}, function(err, r) {
          client.collectionNames(function(err, documents) {
            documents.forEach(function(document) {
              if(document.name == MONGODB + '.test_collection_names2') found = true;
              if(document.name == MONGODB + '.test_collection_names') found2 = true;
            });

            test.ok(found);
            test.ok(found2);
            // Let's close the db
            test.done();
          });            
        })
      });
    });
  });    
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieveCollectionInfo = function(test) {
  client.createCollection('test_collections_info', function(err, r) {
    client.collectionsInfo(function(err, cursor) {
      test.ok((cursor instanceof Cursor));
      // Fetch all the collection info
      cursor.toArray(function(err, documents) {
        test.ok(documents.length > 1);

        var found = false;
        documents.forEach(function(document) {
          if(document.name == MONGODB + '.test_collections_info') found = true;
        });
        test.ok(found);
        // Let's close the db
        test.done();
      });
    });
  });    
}

/**
 * An example returning the options for a collection.
 *
 * @_class collection
 * @_function options
 */
exports.shouldCorrectlyRetriveCollectionOptions = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a test collection that we are getting the options back from
    db.createCollection('test_collection_options', {'capped':true, 'size':1024}, function(err, collection) {
      test.ok(collection instanceof Collection);
      test.equal('test_collection_options', collection.collectionName);

      // Let's fetch the collection options
      collection.options(function(err, options) {
        test.equal(true, options.capped);
        test.equal(1024, options.size);
        test.equal("test_collection_options", options.create);

        db.close();
        test.done();
      });
    });    
  });
}

/**
 * An example showing how to establish if it's a capped collection
 *
 * @_class collection
 * @_function isCapped
 */
exports.shouldCorrectlyExecuteIsCapped = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a test collection that we are getting the options back from
    db.createCollection('test_collection_is_capped', {'capped':true, 'size':1024}, function(err, collection) {
      test.ok(collection instanceof Collection);
      test.equal('test_collection_is_capped', collection.collectionName);

      // Let's fetch the collection options
      collection.isCapped(function(err, capped) {
        test.equal(true, capped);

        db.close();
        test.done();
      });
    });    
  });
}

/**
 * An example showing the use of the indexExists function for a single index name and a list of index names.
 *
 * @_class collection
 * @_function indexExists
 */
exports.shouldCorrectlyExecuteIndexExists = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a test collection that we are getting the options back from
    db.createCollection('test_collection_index_exists', function(err, collection) {
      test.equal(null, err);

      // Create an index on the collection
      collection.createIndex('a', function(err, indexName) {
        
        // Let's test to check if a single index exists
        collection.indexExists("a_1", function(err, result) {
          test.equal(true, result);

          // Let's test to check if multiple indexes are available
          collection.indexExists(["a_1", "_id_"], function(err, result) {
            test.equal(true, result);

            // Check if a non existing index exists
            collection.indexExists("c_1", function(err, result) {
              test.equal(false, result);

              db.close();
              test.done();
            });
          });
        });
      });
    });    
  });
}

/**
 * @ignore
 */
exports.shouldEnsureStrictAccessCollection = function(test) {
  var error_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, ssl:useSSL}), {strict:true, native_parser: (process.env['TEST_NATIVE'] != null)});
  test.equal(true, error_client.strict);
  
  error_client.open(function(err, error_client) {
    error_client.collection('does-not-exist', function(err, collection) {
      test.ok(err instanceof Error);
      test.equal("Collection does-not-exist does not exist. Currently in strict mode.", err.message);
    });
      
    error_client.createCollection('test_strict_access_collection', function(err, collection) {
      error_client.collection('test_strict_access_collection', function(err, collection) {
        test.ok(collection instanceof Collection);
        // Let's close the db
        error_client.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldPerformStrictCreateCollection = function(test) {
  var error_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, ssl:useSSL}), {strict:true, native_parser: (process.env['TEST_NATIVE'] != null)});
  test.equal(true, error_client.strict);

  error_client.open(function(err, error_client) {
    error_client.createCollection('test_strict_create_collection', function(err, collection) {
      test.ok(collection instanceof Collection);

      // Creating an existing collection should fail
      error_client.createCollection('test_strict_create_collection', function(err, collection) {
        test.ok(err instanceof Error);
        test.equal("Collection test_strict_create_collection already exists. Currently in strict mode.", err.message);

        // Switch out of strict mode and try to re-create collection
        error_client.strict = false;
        error_client.createCollection('test_strict_create_collection', function(err, collection) {
          test.ok(collection instanceof Collection);

          // Let's close the db
          error_client.close();
          test.done();
        });
      });
    });
  });
} 

/**
 * @ignore
 */
exports.shouldFailToInsertDueToIllegalKeys = function(test) {
  client.createCollection('test_invalid_key_names', function(err, collection) {
    // Legal inserts
    collection.insert([{'hello':'world'}, {'hello':{'hello':'world'}}], {safe:true}, function(err, r) {        
      // Illegal insert for key
      collection.insert({'$hello':'world'}, {safe:true}, function(err, doc) {
        test.ok(err instanceof Error);
        test.equal("key $hello must not start with '$'", err.message);

        collection.insert({'hello':{'$hello':'world'}}, {safe:true}, function(err, doc) {
          test.ok(err instanceof Error);
          test.equal("key $hello must not start with '$'", err.message);

          collection.insert({'he$llo':'world'}, {safe:true}, function(err, docs) {
            test.ok(docs[0].constructor == Object);

            collection.insert({'hello':{'hell$o':'world'}}, {safe:true}, function(err, docs) {
              test.ok(err == null);

              collection.insert({'.hello':'world'}, {safe:true}, function(err, doc) {
                test.ok(err instanceof Error);
                test.equal("key .hello must not contain '.'", err.message);

                collection.insert({'hello':{'.hello':'world'}}, {safe:true}, function(err, doc) {
                  test.ok(err instanceof Error);
                  test.equal("key .hello must not contain '.'", err.message);

                  collection.insert({'hello.':'world'}, {safe:true}, function(err, doc) {
                    test.ok(err instanceof Error);
                    test.equal("key hello. must not contain '.'", err.message);

                    collection.insert({'hello':{'hello.':'world'}}, {safe:true}, function(err, doc) {
                      test.ok(err instanceof Error);
                      test.equal("key hello. must not contain '.'", err.message);
                      // Let's close the db
                      test.done();
                    });
                  });
                });
              });
            })
          })
        });
      });          
    });
  });
}

/**
 * @ignore
 */
exports.shouldFailDueToIllegalCollectionNames = function(test) {
  client.collection(5, function(err, collection) {
    test.equal("collection name must be a String", err.message);
  });
  
  client.collection("", function(err, collection) {
    test.equal("collection names cannot be empty", err.message);
  });
  
  client.collection("te$t", function(err, collection) {
    test.equal("collection names must not contain '$'", err.message);        
  });

  client.collection(".test", function(err, collection) {
    test.equal("collection names must not start or end with '.'", err.message);        
  });

  client.collection("test.", function(err, collection) {
    test.equal("collection names must not start or end with '.'", err.message);        
  });

  client.collection("test..t", function(err, collection) {
    test.equal("collection names cannot be empty", err.message);
    test.done();        
  });  
}

/**
 * @ignore
 */
exports.shouldCorrectlyCountOnNonExistingCollection = function(test) {
  client.collection('test_multiple_insert_2', function(err, collection) {
    collection.count(function(err, count) {
      test.equal(0, count);
      // Let's close the db
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteSave = function(test) {
  client.createCollection('test_save', function(err, collection) {
    var doc = {'hello':'world'};
    collection.save(doc, {safe:true}, function(err, docs) {
      test.ok(docs._id instanceof ObjectID || Object.prototype.toString.call(docs._id) === '[object ObjectID]');

      collection.count(function(err, count) {
        test.equal(1, count);
        doc = docs;

        collection.save(doc, {safe:true}, function(err, doc2) {

          collection.count(function(err, count) {
            test.equal(1, count);
          
            collection.findOne(function(err, doc3) {
              test.equal('world', doc3.hello);
              
              doc3.hello = 'mike';
          
              collection.save(doc3, {safe:true}, function(err, doc4) {
                collection.count(function(err, count) {
                  test.equal(1, count);
          
                  collection.findOne(function(err, doc5) {
                    test.equal('mike', doc5.hello);

                    // Save another document
                    collection.save({hello:'world'}, {safe:true}, function(err, doc) {
                      collection.count(function(err, count) {
                        test.equal(2, count);
                        // Let's close the db
                        test.done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentWithLongValue = function(test) {
  client.createCollection('test_save_long', function(err, collection) {
    collection.insert({'x':Long.fromNumber(9223372036854775807)}, {safe:true}, function(err, r) {
      collection.findOne(function(err, doc) {
        test.ok(Long.fromNumber(9223372036854775807).equals(doc.x));
        // Let's close the db
        test.done();
      });        
    });
  });
}
  
/**
 * @ignore
 */
exports.shouldSaveObjectThatHasIdButDoesNotExistInCollection = function(test) {
  client.createCollection('test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection', function(err, collection) {
    var a = {'_id':'1', 'hello':'world'};
    collection.save(a, {safe:true}, function(err, docs) {
      collection.count(function(err, count) {
        test.equal(1, count);

        collection.findOne(function(err, doc) {
          test.equal('world', doc.hello);

          doc.hello = 'mike';
          collection.save(doc, {safe:true}, function(err, doc) {
            collection.count(function(err, count) {
              test.equal(1, count);
            });

            collection.findOne(function(err, doc) {
              test.equal('mike', doc.hello);
              // Let's close the db
              test.done();
            });
          });
        });
      });
    });
  });
} 

/**
 * @ignore
 */
exports.shouldCorrectlyPerformUpsert = function(test) {
  client.createCollection('test_should_correctly_do_upsert', function(err, collection) {
    var id = new ObjectID(null)
    var doc = {_id:id, a:1};
  
    Step(
      function test1() {
        var self = this;        

        collection.update({"_id":id}, doc, {upsert:true, safe:true}, function(err, result) {
          test.equal(null, err);        
          test.equal(1, result);

          collection.findOne({"_id":id}, self);
        });          
      },
      
      function test2(err, doc) {
        var self = this;
        test.equal(1, doc.a);

        id = new ObjectID(null)
        doc = {_id:id, a:2};
        
        collection.update({"_id":id}, doc, {safe:true, upsert:true}, function(err, result) {
          test.equal(null, err);
          test.equal(1, result);
          
          collection.findOne({"_id":id}, self);
        });          
      },
      
      function test3(err, doc2) {
        var self = this;
        test.equal(2, doc2.a);

        collection.update({"_id":id}, doc2, {safe:true, upsert:true}, function(err, result) {
          test.equal(null, err);
          test.equal(1, result);
        
          collection.findOne({"_id":id}, function(err, doc) {
            test.equal(2, doc.a);
            test.done();                        
          });
        });
      }        
    );                  
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateWithNoDocs = function(test) {
  client.createCollection('test_should_correctly_do_update_with_no_docs', function(err, collection) {
    var id = new ObjectID(null)
    var doc = {_id:id, a:1};
    collection.update({"_id":id}, doc, {safe:true}, function(err, numberofupdateddocs) {
      test.equal(null, err);
      test.equal(0, numberofupdateddocs);

      test.done();
    });
  });
}

/**
 * Example of a simple document update with safe set to false on an existing document
 *
 * @_class collection
 * @_function update
 */
exports.shouldCorrectlyUpdateASimpleDocument = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Get a collection
    db.collection('update_a_simple_document', function(err, collection) {
      
      // Insert a document, then update it
      collection.insert({a:1}, {safe:true}, function(err, doc) {
        
        // Update the document with an atomic operator
        collection.update({a:1}, {$set:{b:2}});
        
        // Wait for a second then fetch the document
        setTimeout(function() {
          
          // Fetch the document that we modified
          collection.findOne({a:1}, function(err, item) {
            test.equal(null, err);
            test.equal(1, item.a);
            test.equal(2, item.b);
            db.close();
            test.done();
          });          
        }, 1000);
      })
    });
  });
}

/**
 * Example of a simple document update using upsert (the document will be inserted if it does not exist)
 *
 * @_class collection
 * @_function update
 * @ignore
 */
exports.shouldCorrectlyUpsertASimpleDocument = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Get a collection
    db.collection('update_a_simple_document_upsert', function(err, collection) {      

      // Update the document using an upsert operation, ensuring creation if it does not exist
      collection.update({a:1}, {b:2, a:1}, {upsert:true, safe:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        
        // Fetch the document that we modified and check if it got inserted correctly
        collection.findOne({a:1}, function(err, item) {
          test.equal(null, err);
          test.equal(1, item.a);
          test.equal(2, item.b);
          db.close();
          test.done();
        });          
      });
    });
  });
}

/**
 * Example of an update across multiple documents using the multi option.
 *
 * @_class collection
 * @_function update
 * @ignore
 */
exports.shouldCorrectlyUpdateMultipleDocuments = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Get a collection
    db.collection('update_a_simple_document_multi', function(err, collection) {      
      
      // Insert a couple of documentations
      collection.insert([{a:1, b:1}, {a:1, b:2}], {safe:true}, function(err, result) {
        
        // Update multiple documents using the multi option
        collection.update({a:1}, {$set:{b:0}}, {safe:true, multi:true}, function(err, numberUpdated) {
          test.equal(null, err);
          test.equal(2, numberUpdated);
          
          // Fetch all the documents and verify that we have changed the b value
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(1, items[0].a);
            test.equal(0, items[0].b);
            test.equal(1, items[1].a);
            test.equal(0, items[1].b);
            
            db.close();
            test.done();
          });
        })        
      });
    });
  });
}

/**
 * Example of running the distinct command against a collection
 *
 * @_class collection
 * @_function distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexes = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    

    // Crete the collection for the distinct example
    db.createCollection('simple_key_based_distinct', function(err, collection) {

      // Insert documents to perform distinct against
      collection.insert([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], {safe:true}, function(err, ids) {
          
        // Peform a distinct query against the a field
        collection.distinct('a', function(err, docs) {
          test.deepEqual([0, 1, 2, 3], docs.sort());

          // Perform a distinct query against the sub-field b.c
          collection.distinct('b.c', function(err, docs) {
            test.deepEqual(['a', 'b', 'c'], docs.sort());

            db.close();
            test.done();
          });
        });
      })
    });
  });
}

/**
 * Example of running the distinct command against a collection with a filter query
 *
 * @_class collection
 * @_function distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithSubQueryFilter = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    

    // Crete the collection for the distinct example
    db.createCollection('simple_key_based_distinct_sub_query_filter', function(err, collection) {

      // Insert documents to perform distinct against
      collection.insert([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}, {a:5, c:1}], {safe:true}, function(err, ids) {
          
        // Peform a distinct query with a filter against the documents
        collection.distinct('a', {c:1}, function(err, docs) {
          test.deepEqual([5], docs.sort());

          db.close();
          test.done();
        });
      })
    });
  });
}

/**
 * Example of running simple count commands against a collection.
 *
 * @_class collection
 * @_function count
 * @ignore
 */
exports.shouldCorrectlyDoSimpleCountExamples = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    

    // Crete the collection for the distinct example
    db.createCollection('simple_count_example', function(err, collection) {

      // Insert documents to perform distinct against
      collection.insert([{a:1}, {a:2}, {a:3}, {a:4, b:1}], {safe:true}, function(err, ids) {
        
        // Perform a total count command
        collection.count(function(err, count) {
          test.equal(null, err);
          test.equal(4, count);
          
          // Peform a partial account where b=1
          collection.count({b:1}, function(err, count) {
            test.equal(null, err);
            test.equal(1, count);            
            
            db.close();
            test.done();
          });          
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteInsertUpdateDeleteSafeMode = function(test) {
  client.createCollection('test_should_execute_insert_update_delete_safe_mode', function(err, collection) {
    test.ok(collection instanceof Collection);
    test.equal('test_should_execute_insert_update_delete_safe_mode', collection.collectionName);

    collection.insert({i:1}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]._id.toHexString().length == 24);

      // Update the record
      collection.update({i:1}, {"$set":{i:2}}, {safe:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
      
        // Remove safely
        collection.remove({}, {safe:true}, function(err, result) {
          test.equal(null, err);            
          
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldPerformMultipleSaves = function(test) {
   client.createCollection("multiple_save_test", function(err, collection) {
     var doc = {
        name: 'amit',
        text: 'some text'
     };
     
     //insert new user
     collection.save(doc, {safe:true}, function(err, r) {
       collection.find({}, {name: 1}).limit(1).toArray(function(err, users){
         var user = users[0]

         if(err) {
           throw new Error(err)
         } else if(user) {
           user.pants = 'worn'

           collection.save(user, {safe:true}, function(err, result){
             test.equal(null, err);
             test.equal(1, result);

            test.done();
           })
         }
       });         
     })
  });
}
  
/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentWithNestedArray = function(test) {
  var db = new Db(MONGODB, new Server('localhost', 27017, {auto_reconnect: true, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db) {
    db.createCollection("save_error_on_save_test", function(err, collection) {      
      // Create unique index for username
      collection.createIndex([['username', 1]], true, function(err, result) {
        var doc = {
          email: 'email@email.com',
          encrypted_password: 'password',
          friends: 
            [ '4db96b973d01205364000006',
              '4db94a1948a683a176000001',
              '4dc77b24c5ba38be14000002' ],
          location: [ 72.4930088, 23.0431957 ],
          name: 'Amit Kumar',
          password_salt: 'salty',
          profile_fields: [],
          username: 'amit' };
        //insert new user
        collection.save(doc, {safe:true}, function(err, doc) {
        
            collection.find({}).limit(1).toArray(function(err, users) {
              test.equal(null, err);        
              var user = users[0]
              user.friends.splice(1,1)

              collection.save(user, function(err, doc) {
                test.equal(null, err);    

                // Update again
                collection.update({_id:new ObjectID(user._id.toString())}, {friends:user.friends}, {upsert:true, safe:true}, function(err, result) {
                  test.equal(null, err);
                  test.equal(1, result);                
                  
                  db.close();
                  test.done();
                });             
              });
            });        
        });
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldPeformCollectionRemoveWithNoCallback = function(test) {
  client.collection("remove_with_no_callback_bug_test", function(err, collection) {
    collection.save({a:1}, {safe:true}, function(){
      collection.save({b:1}, {safe:true}, function(){
        collection.save({c:1}, {safe:true}, function(){
           collection.remove({a:1}, {safe:true}, function() {
             // Let's perform a count
             collection.count(function(err, count) {
               test.equal(null, err);    
               test.equal(2, count);
               test.done();
             });               
           })             
         });
       });
    });
  });
},  

/**
 * Example of retrieving a collections indexes
 *
 * @_class collection
 * @_function indexes
 * @ignore
 */
exports.shouldCorrectlyRetriveACollectionsIndexes = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    

    // Crete the collection for the distinct example
    db.createCollection('simple_key_based_distinct', function(err, collection) {
      
      // Create a geo 2d index
      collection.ensureIndex({loc:"2d"}, function(err, result) {
        test.equal(null, err);
        
        // Create a simple single field index
        collection.ensureIndex({a:1}, function(err, result) {
          test.equal(null, err);

          // List all of the indexes on the collection
          collection.indexes(function(err, indexes) {
            test.equal(3, indexes.length);
            
            db.close();
            test.done();            
          });
        })
      })
    });
  });
}

/**
 * Example of retrieving a collections stats
 *
 * @_class collection
 * @_function stats
 * @ignore
 */
exports.shouldCorrectlyReturnACollectionsStats = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {    

    // Crete the collection for the distinct example
    db.createCollection('collection_stats_test', function(err, collection) {
      
        // Insert some documents
        collection.insert([{a:1}, {hello:'world'}], {safe:true}, function(err, result) {
          
          // Retrieve the statistics for the collection
          collection.stats(function(err, stats) {
            test.equal(2, stats.count);
            
            db.close();
            test.done();            
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