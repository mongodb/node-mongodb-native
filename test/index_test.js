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
 * A simple createIndex using a simple single field index
 *
 * @_class collection
 * @_function createIndex
 */
exports.shouldCreateASimpleIndexOnASingleField = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('simple_index_test', function(err, collection) {      
      test.equal(null, err);
      
      // Insert a bunch of documents for the index
      collection.insert([{a:1}, {a:2}, {a:3}, {a:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
        
        // Create an index on the a field
        collection.createIndex('a', function(err, indexName) {
          test.equal("a_1", indexName);
          
          // Peform a query, with explain to show we hit the query
          collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
            test.deepEqual([[2, 2]], explanation[0].indexBounds.a);
            
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * A more complex createIndex using a compound unique index in the background and dropping duplicated documents
 *
 * @_class collection
 * @_function createIndex
 */
exports.shouldCreateComplexIndexOnTwoFields = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
  
    // Create a collection we want to drop later
    db.createCollection('more_complex_index_test', function(err, collection) {      
      test.equal(null, err);

      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
  
        // Create an index on the a field
        collection.createIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
    
          // Show that duplicate records got dropped
          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);
      
            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
              test.equal(null, err);
              test.ok(explanation[0].indexBounds.a != null);
              test.ok(explanation[0].indexBounds.b != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
  });
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents.
 *
 * @_class collection
 * @_function ensureIndex
 */
exports.shouldCreateComplexEnsureIndex = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('more_complex_ensure_index_test', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
          // Show that duplicate records got dropped
          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);
        
            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
              test.equal(null, err);
              test.ok(explanation[0].indexBounds.a != null);
              test.ok(explanation[0].indexBounds.b != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
  });
}

/**
 * An examples showing the information returned by indexInformation
 *
 * @_class collection
 * @_function indexInformation
 */
exports.shouldCorrectlyShowTheResultsFromIndexInformation = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('more_index_information_test', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
          // Fetch basic indexInformation for collection
          collection.indexInformation(function(err, indexInformation) {
            test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
            test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

            // Fetch full index information
            collection.indexInformation({full:true}, function(err, indexInformation) {
              test.deepEqual({ _id: 1 }, indexInformation[0].key);
              test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

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
 * An examples showing the creation and dropping of an index
 *
 * @_class collection
 * @_function dropIndex
 */
exports.shouldCorrectlyCreateAndDropIndex = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('create_and_drop_an_index', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
          // Drop the index
          collection.dropIndex("a_1_b_1", function(err, result) {
            test.equal(null, err);
        
            // Verify that the index is gone
            collection.indexInformation(function(err, indexInformation) {              
              test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
              test.equal(null, indexInformation.a_1_b_1);

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
 * An examples showing the creation and dropping of an index
 *
 * @_class collection
 * @_function dropIndexes
 */
exports.shouldCorrectlyCreateAndDropAllIndex = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('create_and_drop_all_indexes', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {

          // Create an additional index
          collection.ensureIndex({c:1}
            , {unique:true, background:true, dropDups:true}, function(err, indexName) {
      
            // Drop the index
            collection.dropAllIndexes(function(err, result) {
              test.equal(null, err);
        
              // Verify that the index is gone
              collection.indexInformation(function(err, indexInformation) {              
                test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
                test.equal(null, indexInformation.a_1_b_1);
                test.equal(null, indexInformation.c_1);

                db.close();
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
 * An example showing how to force a reindex of a collection.
 *
 * @_class collection
 * @_function reIndex
 */
exports.shouldCorrectlyForceReindexOnCollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a collection we want to drop later
    db.createCollection('create_and_drop_all_indexes', function(err, collection) {      
      test.equal(null, err);
  
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {safe:true}, function(err, result) {
        test.equal(null, err);
    
        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, dropDups:true}, function(err, indexName) {

          // Force a reindex of the collection
          collection.reIndex(function(err, result) {
            test.equal(null, err);
            test.equal(true, result);
        
            // Verify that the index is gone
            collection.indexInformation(function(err, indexInformation) {              
              test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
              test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

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
exports.shouldCorrectlyExtractIndexInformation = function(test) {
  client.createCollection('test_index_information', function(err, collection) {
    collection.insert({a:1}, {safe:true}, function(err, ids) {
      // Create an index on the collection
      client.createIndex(collection.collectionName, 'a', function(err, indexName) {
        test.equal("a_1", indexName);
        // Let's fetch the index information
        client.indexInformation(collection.collectionName, function(err, collectionInfo) {
          test.ok(collectionInfo['_id_'] != null);
          test.equal('_id', collectionInfo['_id_'][0][0]);
          test.ok(collectionInfo['a_1'] != null);
          test.deepEqual([["a", 1]], collectionInfo['a_1']);

          client.indexInformation(function(err, collectionInfo2) {
            var count1 = 0, count2 = 0;
            // Get count of indexes
            for(var i in collectionInfo) { count1 += 1;}
            for(var i in collectionInfo2) { count2 += 1;}

            // Tests
            test.ok(count2 >= count1);
            test.ok(collectionInfo2['_id_'] != null);
            test.equal('_id', collectionInfo2['_id_'][0][0]);
            test.ok(collectionInfo2['a_1'] != null);
            test.deepEqual([["a", 1]], collectionInfo2['a_1']);
            test.ok((collectionInfo[indexName] != null));
            test.deepEqual([["a", 1]], collectionInfo[indexName]);

            // Let's close the db
            test.done();
          });
        });
      });
    })
  });    
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleColumnIndexes = function(test) {
  client.createCollection('test_multiple_index_cols', function(err, collection) {
    collection.insert({a:1}, function(err, ids) {
      // Create an index on the collection
      client.createIndex(collection.collectionName, [['a', -1], ['b', 1], ['c', -1]], function(err, indexName) {
        test.equal("a_-1_b_1_c_-1", indexName);
        // Let's fetch the index information
        client.indexInformation(collection.collectionName, function(err, collectionInfo) {
          var count1 = 0;
          // Get count of indexes
          for(var i in collectionInfo) { count1 += 1;}

          // Test
          test.equal(2, count1);
          test.ok(collectionInfo[indexName] != null);
          test.deepEqual([['a', -1], ['b', 1], ['c', -1]], collectionInfo[indexName]);

          // Let's close the db
          test.done();
        });
      });
    });
  });    
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleUniqueIndex = function(test) {
  // Create a non-unique index and test inserts
  client.createCollection('test_unique_index', function(err, collection) {
    client.createIndex(collection.collectionName, 'hello', function(err, indexName) {
      // Insert some docs
      collection.insert([{'hello':'world'}, {'hello':'mike'}, {'hello':'world'}], {safe:true}, function(err, errors) {
        // Assert that we have no erros
        client.error(function(err, errors) {
          test.equal(1, errors.length);
          test.equal(null, errors[0].err);
  
          // Create a unique index and test that insert fails
          client.createCollection('test_unique_index2', function(err, collection) {
            client.createIndex(collection.collectionName, 'hello', {unique:true}, function(err, indexName) {
              // Insert some docs
              collection.insert([{'hello':'world'}, {'hello':'mike'}, {'hello':'world'}], {safe:true}, function(err, ids) {                            
                test.ok(err != null);
                test.equal(11000, err.code);
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
exports.shouldCorrectlyCreateSubfieldIndex = function(test) {
  // Create a non-unique index and test inserts
  client.createCollection('test_index_on_subfield', function(err, collection) {
    collection.insert([{'hello': {'a':4, 'b':5}}, {'hello': {'a':7, 'b':2}}, {'hello': {'a':4, 'b':10}}], {safe:true}, function(err, ids) {
      // Assert that we have no erros
      client.error(function(err, errors) {
        test.equal(1, errors.length);
        test.ok(errors[0].err == null);

        // Create a unique subfield index and test that insert fails
        client.createCollection('test_index_on_subfield2', function(err, collection) {
          client.createIndex(collection.collectionName, 'hello.a', true, function(err, indexName) {
            collection.insert([{'hello': {'a':4, 'b':5}}, {'hello': {'a':7, 'b':2}}, {'hello': {'a':4, 'b':10}}], {safe:true}, function(err, ids) {
              // Assert that we have erros
              test.ok(err != null);
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
exports.shouldCorrectlyDropIndexes = function(test) {
  client.createCollection('test_drop_indexes', function(err, collection) {
    collection.insert({a:1}, {safe:true}, function(err, ids) {
      // Create an index on the collection
      client.createIndex(collection.collectionName, 'a', function(err, indexName) {
        test.equal("a_1", indexName);
        // Drop all the indexes
        collection.dropAllIndexes(function(err, result) {
          test.equal(true, result);

          collection.indexInformation(function(err, result) {
            test.ok(result['a_1'] == null);
            test.done();
          })
        })
      });
    })
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexes = function(test) {
  client.createCollection('test_distinct_queries', function(err, collection) {
    collection.insert([{'a':0, 'b':{'c':'a'}},
      {'a':1, 'b':{'c':'b'}},
      {'a':1, 'b':{'c':'c'}},
      {'a':2, 'b':{'c':'a'}}, {'a':3}, {'a':3}], {safe:true}, function(err, ids) {
        collection.distinct('a', function(err, docs) {
          test.deepEqual([0, 1, 2, 3], docs.sort());
        });

        collection.distinct('b.c', function(err, docs) {
          test.deepEqual(['a', 'b', 'c'], docs.sort());
          test.done();
        });
    })
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteEnsureIndex = function(test) {
  client.createCollection('test_ensure_index', function(err, collection) {
    // Create an index on the collection
    client.ensureIndex(collection.collectionName, 'a', function(err, indexName) {
      test.equal("a_1", indexName);
      // Let's fetch the index information
      client.indexInformation(collection.collectionName, function(err, collectionInfo) {
        test.ok(collectionInfo['_id_'] != null);
        test.equal('_id', collectionInfo['_id_'][0][0]);
        test.ok(collectionInfo['a_1'] != null);
        test.deepEqual([["a", 1]], collectionInfo['a_1']);

        client.ensureIndex(collection.collectionName, 'a', function(err, indexName) {
          test.equal("a_1", indexName);
          // Let's fetch the index information
          client.indexInformation(collection.collectionName, function(err, collectionInfo) {
            test.ok(collectionInfo['_id_'] != null);
            test.equal('_id', collectionInfo['_id_'][0][0]);
            test.ok(collectionInfo['a_1'] != null);
            test.deepEqual([["a", 1]], collectionInfo['a_1']);
            // Let's close the db
            test.done();
          });
        });
      });
    });
  })
}  

/**
 * @ignore
 */
exports.shouldCorrectlyCreateAndUseSparseIndex = function(test) {
  client.createCollection('create_and_use_sparse_index_test', function(err, r) {
    client.collection('create_and_use_sparse_index_test', function(err, collection) {
      
      collection.ensureIndex({title:1}, {sparse:true}, function(err, indexName) {
        collection.insert([{name:"Jim"}, {name:"Sarah", title:"Princess"}], {safe:true}, function(err, result) {            
          collection.find({title:{$ne:null}}).sort({title:1}).toArray(function(err, items) {
            test.equal(1, items.length);
            test.equal("Sarah", items[0].name);

            // Fetch the info for the indexes
            collection.indexInformation({full:true}, function(err, indexInfo) {
              test.equal(null, err);
              test.equal(2, indexInfo.length);
              test.done();
            })
          })
        });          
      })
    })
  })    
}
  
/**
 * @ignore
 */
exports["Should correctly execute insert with keepGoing option on mongod >= 1.9.1"] = function(test) {
  client.admin().serverInfo(function(err, result){
    if(parseInt((result.version.replace(/\./g, ''))) >= 191) {
      client.createCollection('shouldCorrectlyExecuteKeepGoingWithMongodb191OrHigher', function(err, collection) {
        collection.ensureIndex({title:1}, {unique:true}, function(err, indexName) {
          collection.insert([{name:"Jim"}, {name:"Sarah", title:"Princess"}], {safe:true}, function(err, result) {
            // Force keep going flag, ignoring unique index issue
            collection.insert([{name:"Jim"}, {name:"Sarah", title:"Princess"}, {name:'Gump', title:"Gump"}], {safe:true, keepGoing:true}, function(err, result) {
              collection.count(function(err, count) {
                test.equal(3, count);
                test.done();        
              })
            });
          });
        });
      });      
    } else {
      test.done();      
    }      
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleGeospatialIndexes = function(test) {
  client.admin().serverInfo(function(err, result){
    if(parseInt((result.version.replace(/\./g, ''))) >= 191) {
      client.createCollection('geospatial_index_test', function(err, r) {
        client.collection('geospatial_index_test', function(err, collection) {
          collection.ensureIndex({loc:'2d'}, function(err, indexName) {
            collection.insert({'loc': [-100,100]}, {safe:true}, function(err, result) {
              test.equal(err,null);
              collection.insert({'loc': [200,200]}, {safe:true}, function(err, result) {
                err = err ? err : {};
                test.equal(err.err,"point not in interval of [ -180, 180 )");
                test.done();
              });
            });
           });   
        });
      });
    } else {
      test.done();      
    }      
  });        
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleGeospatialIndexesAlteredRange = function(test) {
  client.admin().serverInfo(function(err, result){
    if(parseInt((result.version.replace(/\./g, ''))) >= 191) {
      client.createCollection('geospatial_index_altered_test', function(err, r) {
        client.collection('geospatial_index_altered_test', function(err, collection) {
          collection.ensureIndex({loc:'2d'},{min:0,max:1024}, function(err, indexName) {
            collection.insert({'loc': [100,100]}, {safe:true}, function(err, result) {
              test.equal(err,null);
              collection.insert({'loc': [200,200]}, {safe:true}, function(err, result) {
                test.equal(err,null);
                collection.insert({'loc': [-200,-200]}, {safe:true}, function(err, result) {
                  err = err ? err : {};
                  test.equal(err.err,"point not in interval of [ 0, 1024 )");
                  test.done();
                });
              });
            });
           });   
        });
      });    
    } else {
      test.done();      
    }      
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