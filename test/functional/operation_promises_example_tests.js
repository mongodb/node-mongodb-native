"use strict";

var f = require('util').format;

/**************************************************************************
 *
 * COLLECTION TESTS
 *
 *************************************************************************/

/**
 * Call toArray on an aggregation cursor using a Promise
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample2WithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('aggregationExample2_with_promise');
      // Insert the docs
      collection.insertMany(docs, {w: 1}).then(function(result) {
        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], { cursor: { batchSize: 1 } });
        // Get all the aggregation results
        cursor.toArray().then(function(docs) {
          test.equal(2, docs.length);
          test.done();
          db.close();
        }).catch(function(err) {
          console.log(err.stack);
        });
      });
    });
    // END
  }
}

/**
 * Call next on an aggregation cursor using a Promise
 *
 * @example-class AggregationCursor
 * @example-method next
 * @ignore
 */
exports['Aggregation Cursor next Test With Promises'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('aggregation_next_example_with_promise');
      // Insert the docs
      collection.insertMany(docs, {w: 1}).then(function(result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], { cursor: { batchSize: 1 } });
        // Get all the aggregation results
        cursor.next().then(function(docs) {
          test.done();
          db.close();
        });
      });
    });
    // END
  }
}

/**
 * Example of running simple count commands against a collection using a Promise.
 *
 * @example-class Collection
 * @example-method count
 * @ignore
 */
exports.shouldCorrectlyDoSimpleCountExamplesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Crete the collection for the distinct example
      var collection = db.collection('countExample1_with_promise');
      // Insert documents to perform distinct against
      collection.insertMany([{a:1}, {a:2}
        , {a:3}, {a:4, b:1}], {w: 1}).then(function(ids) {
        // Perform a total count command
        collection.count().then(function(count) {
          test.equal(4, count);

          // Peform a partial account where b=1
          collection.count({b:1}).then(function(count) {
            test.equal(1, count);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A more complex createIndex using a Promise and a compound unique index in the background and dropping duplicated documents
 *
 * @example-class Collection
 * @example-method createIndex
 * @ignore
 */
exports.shouldCreateComplexIndexOnTwoFieldsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a collection we want to drop later
      var collection = db.collection('createIndexExample1_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax()).then(function(result) {

        // Create an index on the a field
        collection.createIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray().then(function(items) {
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray().then(function(explanation) {
              test.ok(explanation != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
    // END
  }
}

/**
 * Example of running the distinct command using a Promise against a collection
 *
 * @example-class Collection
 * @example-method distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Crete the collection for the distinct example
      var collection = db.collection('distinctExample1_with_promise');

      // Insert documents to perform distinct against
      collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax()).then(function(ids) {

        // Peform a distinct query against the a field
        collection.distinct('a').then(function(docs) {
          test.deepEqual([0, 1, 2, 3], docs.sort());

          // Perform a distinct query against the sub-field b.c
          collection.distinct('b.c').then(function(docs) {
            test.deepEqual(['a', 'b', 'c'], docs.sort());

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * Example of running the distinct command against a collection using a Promise with a filter query
 *
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Crete the collection for the distinct example
      var collection = db.collection('distinctExample2_with_promise');

      // Insert documents to perform distinct against
      collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}, {a:5, c:1}], configuration.writeConcernMax(), function(err, ids) {

        // Peform a distinct query with a filter against the documents
        collection.distinct('a', {c:1}).then(function(docs) {
          test.deepEqual([5], docs.sort());

          db.close();
          test.done();
        });
      })
    });
    // END
  }
}

/**
 * Example of Collection.prototype.drop using a Promise
 *
 * @example-class Collection
 * @example-method drop
 * @ignore
 */
exports.shouldCorrectlyDropCollectionWithDropFunctionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      db.createCollection('test_other_drop_with_promise').then(function(collection) {
        // Drop the collection
        collection.drop().then(function(reply) {

          // Ensure we don't have the collection in the set of names
          db.listCollections().toArray().then(function(replies) {

            var found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function(document) {
              if(document.name == "test_other_drop_with_promise") {
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
    // END
  }
}


/**
 * Example of a how to drop all the indexes on a collection using dropAllIndexes with a Promise
 *
 * @example-class Collection
 * @example-method dropAllIndexes
 * @ignore
 */
exports.dropAllIndexesExample1WithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      db.createCollection('dropExample1_with_promise').then(function(r) {
        // Drop the collection
        db.collection('dropExample1_with_promise').dropAllIndexes().then(function(reply) {
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * An examples showing the creation and dropping of an index using a Promise
 *
 * @example-class Collection
 * @example-method dropIndex
 * @ignore
 */
exports.shouldCorrectlyCreateAndDropIndexWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection('dropIndexExample1_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}).then(function(result) {

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Drop the index
          collection.dropIndex("a_1_b_1").then(function(result) {

            // Verify that the index is gone
            collection.indexInformation().then(function(indexInformation) {
              test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
              test.equal(null, indexInformation.a_1_b_1);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
 *
 * @example-class Collection
 * @example-method ensureIndex
 * @ignore
 */
exports.shouldCreateComplexEnsureIndexWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection('ensureIndexExample1_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax()).then(function(result) {

        // Create an index on the a field
        db.ensureIndex('ensureIndexExample1_with_promise', {a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray().then(function(items) {
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray().then(function(explanation) {
              test.ok(explanation != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background using a Promise.
 *
 * @example-class Collection
 * @example-method ensureIndex
 * @ignore
 */
exports.ensureIndexExampleWithCompountIndexWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection('ensureIndexExample2_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}).then(function(result) {

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray().then(function(items) {
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray().then(function(explanation) {
              test.ok(explanation != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
    // END
  }
}

/**
 * A simple query using the find method and toArray method with a Promise.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleQueryWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_query_with_promise');

      // Insert a bunch of documents for the testing
      collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax()).then(function(result) {

        // Peform a simple find and return all the documents
        collection.find().toArray().then(function(docs) {
          test.equal(3, docs.length);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple query showing the explain for a query using a Promise.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleExplainQueryWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_explain_query_with_promise');
      // Insert a bunch of documents for the testing
      collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax()).then(function(result) {

        // Peform a simple find and return all the documents
        collection.find({}, {explain:true}).toArray().then(function(docs) {
          test.equal(1, docs.length);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple query showing skip and limit using a Promise.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleLimitSkipQueryWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_limit_skip_query_with_promise');
      // Insert a bunch of documents for the testing
      collection.insertMany([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], configuration.writeConcernMax()).then(function(result) {

        // Peform a simple find and return all the documents
        collection.find({}, {skip:1, limit:1, fields:{b:1}}).toArray().then(function(docs) {
          test.equal(1, docs.length);
          test.equal(null, docs[0].a);
          test.equal(2, docs[0].b);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A whole set of different ways to use the findAndModify command with a Promise..
 *
 * The first findAndModify command modifies a document and returns the modified document back.
 * The second findAndModify command removes the document.
 * The second findAndModify command upserts a document and returns the new document.
 *
 * @example-class Collection
 * @example-method findAndModify
 * @ignore
 */
exports.shouldPerformSimpleFindAndModifyOperationsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a collection we want to drop later
      var collection = db.collection('simple_find_and_modify_operations_with_promise');
      // Insert some test documentations
      collection.insertMany([{a:1}, {b:1}, {c:1}], configuration.writeConcernMax()).then(function(result) {

        // Simple findAndModify command returning the new document
        collection.findAndModify({a:1}, [['a', 1]], {$set:{b1:1}}, {new:true}).then(function(doc) {
          test.equal(1, doc.value.a);
          test.equal(1, doc.value.b1);

          // Simple findAndModify command returning the new document and
          // removing it at the same time
          collection.findAndModify({b:1}, [['b', 1]],
            {$set:{b:2}}, {remove:true}).then(function(doc) {

            // Verify that the document is gone
            collection.findOne({b:1}).then(function(item) {
              test.equal(null, item);

              // Simple findAndModify command performing an upsert and returning the new document
              // executing the command safely
              collection.findAndModify({d:1}, [['b', 1]],
                {d:1, f:1}, {new:true, upsert:true, w:1}).then(function(doc) {
                  test.equal(1, doc.value.d);
                  test.equal(1, doc.value.f);

                  db.close();
                  test.done();
              })
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of using findAndRemove using a Promise.
 *
 * @example-class Collection
 * @example-method findAndRemove
 * @ignore
 */
exports.shouldPerformSimpleFindAndRemoveWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_find_and_modify_operations_2_with_promise');
      // Insert some test documentations
      collection.insertMany([{a:1}, {b:1, d:1}, {c:1}], configuration.writeConcernMax()).then(function(result) {

        // Simple findAndModify command returning the old document and
        // removing it at the same time
        collection.findAndRemove({b:1}, [['b', 1]]).then(function(doc) {
          test.equal(1, doc.value.b);
          test.equal(1, doc.value.d);

          // Verify that the document is gone
          collection.findOne({b:1}).then(function(item) {
            test.equal(null, item);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple query using findOne with a Promise.
 *
 * @example-class Collection
 * @example-method findOne
 * @ignore
 */
exports.shouldPeformASimpleLimitSkipFindOneQueryWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_limit_skip_find_one_query_with_promise');
      // Insert a bunch of documents for the testing
      collection.insertMany([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], configuration.writeConcernMax()).then(function(result) {

        // Peform a simple find and return all the documents
        collection.findOne({a:2}, {fields:{b:1}}).then(function(doc) {
          test.equal(null, doc.a);
          test.equal(2, doc.b);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple geoNear query across some documents using a Promise.
 *
 * @example-class Collection
 * @example-method geoNear
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoNearCommandWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("simple_geo_near_command_with_promise");

      // Add a location based index
      collection.ensureIndex({loc:"2d"}).then(function(result) {

        // Save a new location tagged document
        collection.insertMany([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax()).then(function(result) {

          // Use geoNear command to find document
          collection.geoNear(50, 50, {query:{a:1}, num:1}).then(function(docs) {
            test.equal(1, docs.results.length);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple geoHaystackSearch query across some documents using a Promise.
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoHaystackSearchCommandWithPromises = {
  metadata: { requires: { promises:true, topology: ["single", "replicaset"] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("simple_geo_haystack_command_with_promise");

      // Add a location based index
      collection.ensureIndex({loc: "geoHaystack", type: 1}, {bucketSize: 1}).then(function(result) {

        // Save a new location tagged document
        collection.insertMany([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax()).then(function(result) {

          // Use geoNear command to find document
          collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100}).then(function(docs) {
            test.equal(1, docs.results.length);
            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A whole lot of different ways to execute the group command using a Promise.
 *
 * @example-class Collection
 * @example-method group
 * @ignore
 */
exports.shouldCorrectlyExecuteGroupFunctionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_group_with_promise');

      // Peform a simple group by on an empty collection
      collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }").then(function(results) {
        test.deepEqual([], results);

        // Trigger some inserts on the collection
        collection.insertMany([{'a':2}, {'b':5}, {'a':1}], {w:1}).then(function(ids) {

          // Perform a group count
          collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }").then(function(results) {
            test.equal(3, results[0].count);

            // Pefrom a group count using the eval method
            collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", false).then(function(results) {
              test.equal(3, results[0].count);

              // Group with a conditional
              collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }").then(function(results) {
                // Results
                test.equal(1, results[0].count);

                // Group with a conditional using the EVAL method
                collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }" , false).then(function(results) {
                  // Results
                  test.equal(1, results[0].count);
                  // Insert some more test data
                  collection.insertMany([{'a':2}, {'b':3}], {w:1}).then(function(ids) {

                    // Do a Group by field a
                    collection.group(['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }").then(function(results) {
                      // Results
                      test.equal(2, results[0].a);
                      test.equal(2, results[0].count);
                      test.equal(null, results[1].a);
                      test.equal(2, results[1].count);
                      test.equal(1, results[2].a);
                      test.equal(1, results[2].count);

                      // Do a Group by field a
                      collection.group({'a':true}, {}, {"count":0}, function (obj, prev) { prev.count++; }, true).then(function(results) {
                        // Results
                        test.equal(2, results[0].a);
                        test.equal(2, results[0].count);
                        test.equal(null, results[1].a);
                        test.equal(2, results[1].count);
                        test.equal(1, results[2].a);
                        test.equal(1, results[2].count);

                        // Correctly handle illegal function
                        collection.group([], {}, {}, "5 ++ 5").then(function(err, results) {
                        }).catch(function(err) {
                          test.ok(err.message != null);

                          // Use a function to select the keys used to group by
                          var keyf = function(doc) { return {a: doc.a}; };
                          collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true).then(function(results) {
                            // Results
                            results.sort(function(a, b) { return b.count - a.count; });
                            test.equal(2, results[0].count);
                            test.equal(2, results[0].a);
                            test.equal(4, results[0].value);
                            test.equal(1, results[1].count);
                            test.equal(1, results[1].a);
                            test.equal(1, results[1].value);

                            // Use a Code object to select the keys used to group by
                            var keyf = new Code(function(doc) { return {a: doc.a}; });
                            collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true).then(function(results) {
                              // Results
                              results.sort(function(a, b) { return b.count - a.count; });
                              test.equal(2, results[0].count);
                              test.equal(2, results[0].a);
                              test.equal(4, results[0].value);
                              test.equal(1, results[1].count);
                              test.equal(1, results[1].a);
                              test.equal(1, results[1].value);

                              // Correctly handle illegal function when using the EVAL method
                              collection.group([], {}, {}, "5 ++ 5", false).then(function(results) {
                              }).catch(function(err) {
                                test.ok(err.message != null);

                                db.close();
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
        });
      });
    });
    // END
  }
}

/**
 * A simple map reduce example using a Promise.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformSimpleMapReduceFunctionsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_with_promise');

      // Insert some documents to perform map reduce over
      collection.insertMany([{'user_id':1}, {'user_id':2}], {w:1}).then(function(r) {

        // Map function
        var map = function() { emit(this.user_id, 1); };
        // Reduce function
        var reduce = function(k,vals) { return 1; };

        // Peform the map reduce
        collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}}).then(function(collection) {

          // Mapreduce returns the temporary collection with the results
          collection.findOne({'_id':1}).then(function(result) {
            test.equal(1, result.value);

            collection.findOne({'_id':2}).then(function(result) {
              test.equal(1, result.value);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics using a Promise.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformMapReduceFunctionInlineWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, mongodb: '>1.7.6', topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_inline_with_promise');

      // Insert some test documents
      collection.insertMany([{'user_id':1}, {'user_id':2}], {w:1}).then(function(r) {

        // Map function
        var map = function() { emit(this.user_id, 1); };
        // Reduce function
        var reduce = function(k,vals) { return 1; };

        // Execute map reduce and return results inline
        collection.mapReduce(map, reduce, {out : {inline: 1}, verbose:true}).then(function(result) {
          test.equal(2, result.results.length);
          test.ok(result.stats != null);

          collection.mapReduce(map, reduce, {out : {replace: 'mapreduce_integration_test'}, verbose:true}).then(function(result) {
            test.ok(result.stats != null);
            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * Mapreduce using a provided scope containing a javascript function executed using a Promise.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformMapReduceWithContextWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_scope_with_promise');

      // Insert some test documents
      collection.insertMany([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1}).then(function(r) {

        // Map function
        var map = function(){
            emit(fn(this.timestamp.getYear()), 1);
        }

        // Reduce function
        var reduce = function(k, v){
            count = 0;
            for(i = 0; i < v.length; i++) {
                count += v[i];
            }
            return count;
        }

        // Javascript function available in the map reduce scope
        var t = function(val){ return val+1; }

        // Execute the map reduce with the custom scope
        var o = {};
        o.scope =  { fn: new Code(t.toString()) }
        o.out = { replace: 'replacethiscollection' }

        collection.mapReduce(map, reduce, o).then(function(outCollection) {

          // Find all entries in the map-reduce collection
          outCollection.find().toArray().then(function(results) {
            test.equal(2, results[0].value)

            // mapReduce with scope containing plain function
            var o = {};
            o.scope =  { fn: t }
            o.out = { replace: 'replacethiscollection' }

            collection.mapReduce(map, reduce, o).then(function(outCollection) {
              // Find all entries in the map-reduce collection
              outCollection.find().toArray().then(function(results) {
                test.equal(2, results[0].value)

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Mapreduce using a scope containing javascript objects with functions using a Promise.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformMapReduceInContextObjectsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_scope_objects_with_promise');

      // Insert some test documents
      collection.insertMany([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1}).then(function(r) {

        // Map function
        var map = function(){
          emit(obj.fn(this.timestamp.getYear()), 1);
        }

        // Reduce function
        var reduce = function(k, v){
          count = 0;
          for(i = 0; i < v.length; i++) {
            count += v[i];
          }
          return count;
        }

        // Javascript function available in the map reduce scope
        var t = function(val){ return val+1; }

        // Execute the map reduce with the custom scope containing objects
        var o = {};
        o.scope =  { obj: {fn: new Code(t.toString())} }
        o.out = { replace: 'replacethiscollection' }

        collection.mapReduce(map, reduce, o).then(function(outCollection) {

          // Find all entries in the map-reduce collection
          outCollection.find().toArray().then(function(results) {
            test.equal(2, results[0].value)

            // mapReduce with scope containing plain function
            var o = {};
            o.scope =  { obj: {fn: t} }
            o.out = { replace: 'replacethiscollection' }

            collection.mapReduce(map, reduce, o).then(function(outCollection) {
              // Find all entries in the map-reduce collection
              outCollection.find().toArray().then(function(results) {
                test.equal(2, results[0].value)
                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Example of retrieving a collections indexes using a Promise.
 *
 * @example-class Collection
 * @example-method indexes
 * @ignore
 */
exports.shouldCorrectlyRetriveACollectionsIndexesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Crete the collection for the distinct example
      var collection = db.collection('simple_key_based_distinct_with_promise');

      // Create a geo 2d index
      collection.ensureIndex({loc:"2d"}, configuration.writeConcernMax()).then(function(result) {

        // Create a simple single field index
        collection.ensureIndex({a:1}, configuration.writeConcernMax()).then(function(result) {

          setTimeout(function() {
            // List all of the indexes on the collection
            collection.indexes().then(function(indexes) {
              test.equal(3, indexes.length);

              db.close();
              test.done();
            });
          }, 1000);
        });
      });
    });
    // END
  }
}

/**
 * An example showing the use of the indexExists function using a Promise for a single index name and a list of index names.
 *
 * @example-class Collection
 * @example-method indexExists
 * @ignore
 */
exports.shouldCorrectlyExecuteIndexExistsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a test collection that we are getting the options back from
      var collection = db.collection('test_collection_index_exists_with_promise', configuration.writeConcernMax());
      // Create an index on the collection
      collection.createIndex('a', configuration.writeConcernMax()).then(function(indexName) {
        // Let's test to check if a single index exists
        collection.indexExists("a_1").then(function(result) {
          test.equal(true, result);

          // Let's test to check if multiple indexes are available
          collection.indexExists(["a_1", "_id_"]).then(function(result) {
            test.equal(true, result);

            // Check if a non existing index exists
            collection.indexExists("c_1").then(function(result) {
              test.equal(false, result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example showing the information returned by indexInformation using a Promise.
 *
 * @example-class Collection
 * @example-method indexInformation
 * @ignore
 */
exports.shouldCorrectlyShowTheResultsFromIndexInformationWithPromises = {
  metadata: {
    requires: { promises:true, topology: ["single", "replicaset"] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0, native_parser:false}, {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_index_information_test_2_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax()).then(function(result) {

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {
          // Fetch basic indexInformation for collection
          db.indexInformation('more_index_information_test_2_with_promise').then(function(indexInformation) {
            test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
            test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

            // Fetch full index information
            collection.indexInformation({full:true}).then(function(indexInformation) {
              test.deepEqual({ _id: 1 }, indexInformation[0].key);
              test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

              db.close();
              test.done();
            });
          }).catch(function(err) {
            console.dir(err)
          });
        });
      }).catch(function(err) {
        console.dir(err)
      });
    });
    // END
  }
}

/**
 * An examples showing the information returned by indexInformation using a Promise.
 *
 * @example-class Collection
 * @example-method indexInformation
 * @ignore
 */
exports.shouldCorrectlyShowAllTheResultsFromIndexInformationWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_index_information_test_3_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}).then(function(result) {

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Fetch basic indexInformation for collection
          collection.indexInformation().then(function(indexInformation) {
            test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
            test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

            // Fetch full index information
            collection.indexInformation({full:true}).then(function(indexInformation) {
              test.deepEqual({ _id: 1 }, indexInformation[0].key);
              test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple document insert using a Promise example, not using safe mode to ensure document persistance on MongoDB
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection("simple_document_insert_collection_no_safe_with_promise");
      // Insert a single document
      collection.insertOne({hello:'world_no_safe'});

      // Wait for a second before finishing up, to ensure we have written the item to disk
      setTimeout(function() {

        // Fetch the document
        collection.findOne({hello:'world_no_safe'}).then(function(item) {
          test.equal('world_no_safe', item.hello);
          db.close();
          test.done();
        })
      }, 100);
    });
    // END
  }
}

/**
 * A batch document insert using a Promise example, using safe mode to ensure document persistance on MongoDB
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformABatchDocumentInsertSafeWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Fetch a collection to insert document into
      var collection = db.collection("batch_document_insert_collection_safe_with_promise");
      // Insert a single document
      collection.insertMany([{hello:'world_safe1'}
        , {hello:'world_safe2'}], configuration.writeConcernMax()).then(function(result) {

        // Fetch the document
        collection.findOne({hello:'world_safe2'}).then(function(item) {
          test.equal('world_safe2', item.hello);
          db.close();
          test.done();
        })
      });
    });
    // END
  }
}

/**
 * Example of inserting a document containing functions using a Promise.
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Fetch a collection to insert document into
      var collection = db.collection("simple_document_insert_with_function_safe_with_promise");

      var o = configuration.writeConcernMax();
      o.serializeFunctions = true;
      // Insert a single document
      collection.insertOne({hello:'world'
        , func:function() {}}, o).then(function(result) {

        // Fetch the document
        collection.findOne({hello:'world'}).then(function(item) {
          test.ok("function() {}", item.code);
          db.close();
          test.done();
        })
      });
    });
    // END
  }
}

/**
 * Example of using keepGoing to allow batch insert using a Promise to complete even when there are illegal documents in the batch
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports["Should correctly execute insert with keepGoing option on mongod >= 1.9.1 With Promises"] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, mongodb:">1.9.1", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('keepGoingExample_with_promise');
      collection.drop(function() {
        // Add an unique index to title to force errors in the batch insert
        collection.ensureIndex({title:1}, {unique:true}).then(function(indexName) {

          // Insert some intial data into the collection
          collection.insertMany([{name:"Jim"}
            , {name:"Sarah", title:"Princess"}], configuration.writeConcernMax()).then(function(result) {

            // Force keep going flag, ignoring unique index issue
            collection.insert([{name:"Jim"}
              , {name:"Sarah", title:"Princess"}
              , {name:'Gump', title:"Gump"}], {w:1, keepGoing:true}).then(function(result) {
              }).catch(function(err) {
              // Count the number of documents left (should not include the duplicates)
              collection.count().then(function(count) {
                test.equal(3, count);
                test.done();
              })
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example showing how to establish if it's a capped collection using a Promise.
 *
 * @example-class Collection
 * @example-method isCapped
 * @ignore
 */
exports.shouldCorrectlyExecuteIsCappedWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_is_capped_with_promise', {'capped':true, 'size':1024}).then(function(collection) {
        test.equal('test_collection_is_capped_with_promise', collection.collectionName);

        // Let's fetch the collection options
        collection.isCapped().then(function(capped) {
          test.equal(true, capped);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * An example returning the options for a collection using a Promise.
 *
 * @example-class Collection
 * @example-method options
 * @ignore
 */
exports.shouldCorrectlyRetriveCollectionOptionsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_options_with_promise', {'capped':true, 'size':1024}).then(function(collection) {
        test.equal('test_collection_options_with_promise', collection.collectionName);

        // Let's fetch the collection options
        collection.options().then(function(options) {
          test.equal(true, options.capped);
          test.ok(options.size >= 1024);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A parallelCollectionScan example using a Promise.
 *
 * @example-class Collection
 * @example-method parallelCollectionScan
 * @ignore
 */
exports['Should correctly execute parallelCollectionScan with multiple cursors With Promises'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, mongodb: ">2.5.5", topology: ["single", "replicaset"] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var docs = [];

      // Insert some documents
      for(var i = 0; i < 1000; i++) {
        docs.push({a:i});
      }

      // Get the collection
      var collection = db.collection('parallelCollectionScan_with_promise');
      // Insert 1000 documents in a batch
      collection.insertMany(docs).then(function(result) {
        var results = [];
        var numCursors = 3;

        // Execute parallelCollectionScan command
        collection.parallelCollectionScan({numCursors:numCursors}).then(function(cursors) {
          test.ok(cursors != null);
          test.ok(cursors.length > 0);
          var left = cursors.length;

          for(var i = 0; i < cursors.length; i++) {
            cursors[i].toArray().then(function(items) {
              // Add docs to results array
              results = results.concat(items);
              left = left - 1;

              // No more cursors let's ensure we got all results
              if(left == 0) {
                test.equal(docs.length, results.length);

                db.close();
                test.done();
              }
            });
          }
        });
      });
    });
    // END
  }
}

/**
 * An example showing how to force a reindex of a collection using a Promise.
 *
 * @example-class Collection
 * @example-method reIndex
 * @ignore
 */
exports.shouldCorrectlyIndexAndForceReindexOnCollectionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('shouldCorrectlyForceReindexOnCollection_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {w:1}).then(function(result) {

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Force a reindex of the collection
          collection.reIndex().then(function(result) {
            test.equal(true, result);

            // Verify that the index is gone
            collection.indexInformation().then(function(indexInformation) {
              test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
              test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example removing all documents in a collection not using safe mode using a Promise.
 *
 * @example-class Collection
 * @example-method remove
 * @ignore
 */
exports.shouldRemoveAllDocumentsNoSafeWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch a collection to insert document into
      var collection = db.collection("remove_all_documents_no_safe_with_promise");
      // Insert a bunch of documents
      collection.insertMany([{a:1}, {b:2}], {w:1}).then(function(result) {
        // Remove all the document
        collection.removeMany();

        // Fetch all results
        collection.find().toArray().then(function(items) {
          test.equal(0, items.length);
          db.close();
          test.done();
        });
      })
    });
    // END
  }
}

/**
 * An example removing a subset of documents using safe mode to ensure removal of documents using a Promise.
 *
 * @example-class Collection
 * @example-method remove
 * @ignore
 */
exports.shouldRemoveSubsetOfDocumentsSafeModeWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch a collection to insert document into
      var collection = db.collection("remove_subset_of_documents_safe_with_promise");
      // Insert a bunch of documents
      collection.insertMany([{a:1}, {b:2}], {w:1}).then(function(result) {
        // Remove all the document
        collection.removeOne({a:1}, {w:1}).then(function(r) {
          test.equal(1, r.result.n);
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * An example of illegal and legal renaming of a collection using a Promise.
 *
 * @example-class Collection
 * @example-method rename
 * @ignore
 */
exports.shouldCorrectlyRenameCollectionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Open a couple of collections
      db.createCollection('test_rename_collection_with_promise').then(function(collection1) {
        db.createCollection('test_rename_collection2_with_promise').then(function(collection2) {
          // Attemp to rename a collection to a number
          try {
            collection1.rename(5, function(err, collection) {});
          } catch(err) {
            test.ok(err instanceof Error);
            test.equal("collection name must be a String", err.message);
          }

          // Attemp to rename a collection to an empty string
          try {
            collection1.rename("", function(err, collection) {});
          } catch(err) {
            test.ok(err instanceof Error);
            test.equal("collection names cannot be empty", err.message);
          }

          // Attemp to rename a collection to an illegal name including the character $
          try {
            collection1.rename("te$t", function(err, collection) {});
          } catch(err) {
            test.ok(err instanceof Error);
            test.equal("collection names must not contain '$'", err.message);
          }

          // Attemp to rename a collection to an illegal name starting with the character .
          try {
            collection1.rename(".test", function(err, collection) {});
          } catch(err) {
            test.ok(err instanceof Error);
            test.equal("collection names must not start or end with '.'", err.message);
          }

          // Attemp to rename a collection to an illegal name ending with the character .
          try {
            collection1.rename("test.", function(err, collection) {});
          } catch(err) {
            test.ok(err instanceof Error);
            test.equal("collection names must not start or end with '.'", err.message);
          }

          // Attemp to rename a collection to an illegal name with an empty middle name
          try {
            collection1.rename("tes..t", function(err, collection) {});
          } catch(err) {
            test.equal("collection names cannot be empty", err.message);
          }

          // Insert a couple of documents
          collection1.insertMany([{'x':1}, {'x':2}], configuration.writeConcernMax()).then(function(docs) {

            // Attemp to rename the first collection to the second one, this will fail
            collection1.rename('test_rename_collection2_with_promise').then(function(err, collection) {
            }).catch(function(err) {
              test.ok(err instanceof Error);
              test.ok(err.message.length > 0);

              // Attemp to rename the first collection to a name that does not exist
              // this will be succesful
              collection1.rename('test_rename_collection3_with_promise').then(function(collection2) {
                test.equal("test_rename_collection3_with_promise", collection2.collectionName);

                // Ensure that the collection is pointing to the new one
                collection2.count().then(function(count) {
                  test.equal(2, count);
                  db.close();
                  test.done();
                });
              });
            });
          });

        });
      });
    });
    // END
  }
}

/**
 * Example of a simple document save with safe set to false using a Promise.
 *
 * @example-class Collection
 * @example-method save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("save_a_simple_document_with_promise");
      // Save a document with no safe option
      collection.save({hello:'world'});

      // Wait for a second
      setTimeout(function() {

        // Find the saved document
        collection.findOne({hello:'world'}).then(function(item) {
          test.equal('world', item.hello);
          db.close();
          test.done();
        });
      }, 2000);
    });
    // END
  }
}

/**
 * Example of a simple document save and then resave with safe set to true using a Promise.
 *
 * @example-class Collection
 * @example-method save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentModifyItAndResaveItWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("save_a_simple_document_modify_it_and_resave_it_with_promise");

      // Save a document with no safe option
      collection.save({hello:'world'}, configuration.writeConcernMax()).then(function(result) {

        // Find the saved document
        collection.findOne({hello:'world'}).then(function(item) {
          test.equal('world', item.hello);

          // Update the document
          item['hello2'] = 'world2';

          // Save the item with the additional field
          collection.save(item, configuration.writeConcernMax()).then(function(result) {

            // Find the changed document
            collection.findOne({hello:'world'}).then(function(item) {
              test.equal('world', item.hello);
              test.equal('world2', item.hello2);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple document update with safe set to false on an existing document using a Promise.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpdateASimpleDocumentWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Get a collection
      var collection = db.collection('update_a_simple_document_with_promise');

      // Insert a document, then update it
      collection.insertOne({a:1}, configuration.writeConcernMax()).then(function(doc) {

        // Update the document with an atomic operator
        collection.updateOne({a:1}, {$set:{b:2}});

        // Wait for a second then fetch the document
        setTimeout(function() {

          // Fetch the document that we modified
          collection.findOne({a:1}).then(function(item) {
            test.equal(1, item.a);
            test.equal(2, item.b);
            db.close();
            test.done();
          });
        }, 1000);
      });
    });
    // END
  }
}

/**
 * Example of a simple document update using upsert (the document will be inserted if it does not exist) using a Promise.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpsertASimpleDocumentWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Get a collection
      var collection = db.collection('update_a_simple_document_upsert_with_promise');
      // Update the document using an upsert operation, ensuring creation if it does not exist
      collection.updateOne({a:1}, {b:2, a:1}, {upsert:true, w: 1}).then(function(result) {
        test.equal(1, result.result.n);

        // Fetch the document that we modified and check if it got inserted correctly
        collection.findOne({a:1}).then(function(item) {
          test.equal(1, item.a);
          test.equal(2, item.b);
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of an update across multiple documents using the multi option and using a Promise.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpdateMultipleDocumentsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Get a collection
      var collection = db.collection('update_a_simple_document_multi_with_promise');

      // Insert a couple of documentations
      collection.insertMany([{a:1, b:1}, {a:1, b:2}], configuration.writeConcernMax()).then(function(result) {

        var o = configuration.writeConcernMax();
        o.multi = true
        // Update multiple documents using the multi option
        collection.updateMany({a:1}, {$set:{b:0}}, o).then(function(r) {
          test.equal(2, r.result.n);

          // Fetch all the documents and verify that we have changed the b value
          collection.find().toArray().then(function(items) {
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
    // END
  }
}

/**
 * Example of retrieving a collections stats using a Promise.
 *
 * @example-class Collection
 * @example-method stats
 * @ignore
 */
exports.shouldCorrectlyReturnACollectionsStatsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Crete the collection for the distinct example
      var collection = db.collection('collection_stats_test_with_promise');

      // Insert some documents
      collection.insertMany([{a:1}, {hello:'world'}], configuration.writeConcernMax()).then(function(result) {

        // Retrieve the statistics for the collection
        collection.stats().then(function(stats) {
          test.equal(2, stats.count);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * An examples showing the creation and dropping of an index using Promises.
 *
 * @example-class Collection
 * @example-method dropIndexes
 * @ignore
 */
exports.shouldCorrectlyCreateAndDropAllIndexWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('shouldCorrectlyCreateAndDropAllIndex_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {w:1}).then(function(result) {

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Create an additional index
          collection.ensureIndex({c:1}
            , {unique:true, background:true, sparse:true, w:1}).then(function(indexName) {

            // Drop the index
            collection.dropAllIndexes().then(function(result) {

              // Verify that the index is gone
              collection.indexInformation().then(function(indexInformation) {
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
    // END
  }
}

/**************************************************************************
 *
 * DB TESTS
 *
 *************************************************************************/

/**
 * An example that shows how to force close a db connection so it cannot be reused using a Promise..
 *
 * @example-class Db
 * @example-method close
 * @ignore
 */
exports.shouldCorrectlyFailOnRetryDueToAppCloseOfDbWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch a collection
      var collection = db.collection('shouldCorrectlyFailOnRetryDueToAppCloseOfDb_with_promise');
      // Insert a document
      collection.insertOne({a:1}, configuration.writeConcernMax()).then(function(result) {

        // Force close the connection
        db.close(true).then(function() {
          // Attemp to insert should fail now with correct message 'db closed by application'
          collection.insertOne({a:2}, configuration.writeConcernMax()).then(function(result) {
          }).catch(function(err) {
            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A whole bunch of examples on how to use eval on the server with a Promise.
 *
 * @example-class Db
 * @example-method eval
 * @ignore
 */
exports.shouldCorrectlyExecuteEvalFunctionsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code
      , ReadPreference = configuration.require.ReadPreference;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var numberOfTests = 10;

      var tests_done = function() {
        numberOfTests = numberOfTests - 1;

        if(numberOfTests == 0) {
          db.close();
          test.done();
        }
      }

      // Evaluate a function on the server with the parameter 3 passed in
      db.eval('function (x) {return x;}', [3]).then(function(result) {
        test.equal(3, result); tests_done();

        // Evaluate a function on the server with the parameter 3 passed in no lock aquired for eval
        // on server
        db.eval('function (x) {return x;}', [3], {nolock:true}).then(function(result) {
          test.equal(3, result); tests_done();
        });

        // Evaluate a function on the server that writes to a server collection
        db.eval('function (x) {db.test_eval_with_promise.save({y:x});}', [5], {readPreference: ReadPreference.PRIMARY}).then(function(result) {
          setTimeout(function() {
            // Locate the entry
            db.collection('test_eval_with_promise', function(err, collection) {
              collection.findOne().then(function(item) {
                test.equal(5, item.y); tests_done();

                // Evaluate a function with 2 parameters passed in
                db.eval('function (x, y) {return x + y;}', [2, 3]).then(function(result) {
                  test.equal(5, result); tests_done();

                  // Evaluate a function with no parameters passed in
                  db.eval('function () {return 5;}').then(function(result) {
                    test.equal(5, result); tests_done();

                    // Evaluate a statement
                    db.eval('2 + 3;').then(function(result) {
                      test.equal(5, result); tests_done();

                      // Evaluate a statement using the code object
                      db.eval(new Code("2 + 3;")).then(function(result) {
                        test.equal(5, result); tests_done();

                        // Evaluate a statement using the code object including a scope
                        db.eval(new Code("return i;", {'i':2})).then(function(result) {
                          test.equal(2, result); tests_done();

                          // Evaluate a statement using the code object including a scope
                          db.eval(new Code("i + 3;", {'i':2})).then(function(result) {
                            test.equal(5, result); tests_done();

                            // Evaluate an illegal statement
                            db.eval("5 ++ 5;").then(function(result) {
                            }).catch(function(err) {
                              test.ok(err instanceof Error);
                              test.ok(err.message != null);
                              tests_done();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          }, 1000);
        });
      });
    });
    // END
  }
}

/**
 * Defining and calling a system level javascript function (NOT recommended, http://www.mongodb.org/display/DOCS/Server-side+Code+Execution) using a Promise.
 *
 * @example-class Db
 * @example-method eval
 * @ignore
 */
exports.shouldCorrectlyDefineSystemLevelFunctionAndExecuteFunctionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Clean out the collection
      db.collection("system.js").deleteMany({}, configuration.writeConcernMax()).then(function(result) {

        // Define a system level function
        db.collection("system.js").insertOne({_id: "echo", value: new Code("function(x) { return x; }")}, configuration.writeConcernMax()).then(function(result) {

          db.eval("echo(5)").then(function(result) {
            test.equal(5, result);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of a simple single server db connection and close function using a Promise.
 *
 * @example-class Db
 * @example-method close
 * @ignore
 */
exports.shouldCorrectlyOpenASimpleDbSingleServerConnectionAndCloseWithCallbackWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Close the connection with a callback that is optional
      db.close().then(function(result) {
        test.done();
      });
    });
    // END
  }
}

/**
 * An example of retrieving the collections list for a database using a Promise.
 *
 * @example-class Db
 * @example-method listCollections
 * @ignore
 */
exports.shouldCorrectlyRetrievelistCollectionsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get an empty db
      var db1 = db.db('listCollectionTestDb2');
      // Create a collection
      var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');
      // Ensure the collection was created
      collection.insertOne({a:1}).then(function(r) {

        // Return the information of a single collection name
        db1.listCollections({name: "shouldCorrectlyRetrievelistCollections_with_promise"}).toArray().then(function(items) {
          test.equal(1, items.length);

          // Return the information of a all collections, using the callback format
          db1.listCollections().toArray().then(function(items) {
            test.ok(items.length >= 1);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrievelistCollectionsWiredTigerWithPromises = {
  metadata: { requires: { promises:true, topology: ['wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
      // Get an empty db
      var db1 = db.db('listCollectionTestDb2');
      // Create a collection
      var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');
      // Ensure the collection was created
      collection.insertOne({a:1}).then(function(r) {

        // Return the information of a single collection name
        db1.listCollections({name: "shouldCorrectlyRetrievelistCollections_with_promise"}).toArray().then(function(items) {
          test.equal(1, items.length);

          // Return the information of a all collections, using the callback format
          db1.listCollections().toArray().then(function(items) {
            test.equal(1, items.length);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * An example of retrieving a collection from a db using the collection function with a Promise.
 *
 * @example-class Db
 * @example-method collection
 * @ignore
 */
exports.shouldCorrectlyAccessACollectionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Grab a collection without a callback no safe mode
      var col1 = db.collection('test_correctly_access_collections_with_promise');
      // Grab a collection with a callback but no safe operation
      db.collection('test_correctly_access_collections_with_promise', function(err, col2) {

        // Grab a collection with a callback in safe mode, ensuring it exists (should fail as it's not created)
        db.collection('test_correctly_access_collections_with_promise', {strict:true}, function(err, col3) {
          // Create the collection
          db.createCollection('test_correctly_access_collections_with_promise').then(function(err, result) {

            // Retry to get the collection, should work as it's now created
            db.collection('test_correctly_access_collections_with_promise', {strict:true}, function(err, col3) {
              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of retrieving all collections for a db as Collection objects using a Promise.
 *
 * @example-class Db
 * @example-method collections
 * @ignore
 */
exports.shouldCorrectlyRetrieveAllCollectionsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create the collection
      var collection = db.collection('test_correctly_access_collections2_with_promise');
      // Retry to get the collection, should work as it's now created
      db.collections().then(function(collections) {
        test.ok(collections.length > 0);

        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * An example of using the logout command for the database with a Promise.
 *
 * @example-class Db
 * @example-method logout
 * @ignore
 */
exports.shouldCorrectlyLogoutFromTheDatabaseWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Add a user to the database
      db.addUser('user3', 'name').then(function(result) {

        // Authenticate
        db.authenticate('user3', 'name').then(function(result) {
          test.equal(true, result);

          // Logout the db
          db.logout().then(function(result) {
            test.equal(true, result);

            // Remove the user
            db.removeUser('user3').then(function(result) {
              test.equal(true, result);

              db.close();
              test.done();
            }).catch(function(err) {
              console.dir(err)
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of using the authenticate command with a Promise.
 *
 * @example-class Db
 * @example-method authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAgainstTheDatabaseWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Add a user to the database
      db.addUser('user2', 'name').then(function(result) {

        // Authenticate
        db.authenticate('user2', 'name').then(function(result) {
          test.equal(true, result);

          // Remove the user from the db
          db.removeUser('user2').then(function(result) {
            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of adding a user to the database using a Promise.
 *
 * @example-class Db
 * @example-method addUser
 * @ignore
 */
exports.shouldCorrectlyAddUserToDbWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Add a user to the database
      db.addUser('user', 'name').then(function(result) {

        // Remove the user from the db
        db.removeUser('user').then(function(result) {
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * An example of removing a user using a Promise.
 *
 * @example-class Db
 * @example-method removeUser
 * @ignore
 */
exports.shouldCorrectlyAddAndRemoveUserWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Add a user to the database
      db.addUser('user', 'name').then(function(result) {

        // Authenticate
        db.authenticate('user', 'name').then(function(result) {
          test.equal(true, result);

          // Logout the db
          db.logout().then(function(result) {
            test.equal(true, result);

            // Remove the user from the db
            db.removeUser('user').then(function(result) {

              // Authenticate
              db.authenticate('user', 'name').then(function(result) {
                test.equal(false, result);

                db.close();
                test.done();
              }).catch(function(err) {
                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the creation of a collection using a Promise.
 *
 * @example-class Db
 * @example-method createCollection
 * @ignore
 */
exports.shouldCorrectlyCreateACollectionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a capped collection with a maximum of 1000 documents
      db.createCollection("a_simple_collection_with_promise", {capped:true, size:10000, max:1000, w:1}).then(function(collection) {

        // Insert a document in the capped collection
        collection.insertOne({a:1}, configuration.writeConcernMax()).then(function(result) {
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple example creating, dropping a collection and then verifying that the collection is gone using a Promise.
 *
 * @example-class Db
 * @example-method dropCollection
 * @ignore
 */
exports.shouldCorrectlyExecuteACommandAgainstTheServerWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Execute ping against the server
      db.command({ping:1}).then(function(result) {

        // Create a capped collection with a maximum of 1000 documents
        db.createCollection("a_simple_create_drop_collection_with_promise", {capped:true, size:10000, max:1000, w:1}).then(function(collection) {

          // Insert a document in the capped collection
          collection.insertOne({a:1}, configuration.writeConcernMax()).then(function(result) {

            // Drop the collection from this world
            db.dropCollection("a_simple_create_drop_collection_with_promise").then(function(result) {

              // Verify that the collection is gone
              db.listCollections({name:"a_simple_create_drop_collection_with_promise"}).toArray().then(function(names) {
                test.equal(0, names.length);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example executing a command against the server using a Promise.
 *
 * @example-class Db
 * @example-method command
 * @ignore
 */
exports.shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Execute ping against the server
      db.command({ping:1}).then(function(result) {
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * A simple example creating, dropping a collection and then verifying that the collection is gone.
 *
 * @example-class Db
 * @example-method renameCollection
 * @ignore
 */
exports.shouldCorrectlyRenameACollectionWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a collection
      db.createCollection("simple_rename_collection_with_promise", configuration.writeConcernMax()).then(function(collection) {

        // Insert a document in the collection
        collection.insertOne({a:1}, configuration.writeConcernMax()).then(function(result) {

          // Retrieve the number of documents from the collection
          collection.count().then(function(count) {
            test.equal(1, count);

            // Rename the collection
            db.renameCollection("simple_rename_collection_with_promise", "simple_rename_collection_2_with_promise").then(function(collection2) {

              // Retrieve the number of documents from the collection
              collection2.count().then(function(count) {
                test.equal(1, count);

                // Verify that the collection is gone
                db.listCollections({name:"simple_rename_collection_with_promise"}).toArray().then(function(names) {
                  test.equal(0, names.length);

                  // Verify that the new collection exists
                  db.listCollections({name:"simple_rename_collection_2_with_promise"}).toArray().then(function(names) {
                    test.equal(1, names.length);

                    db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A more complex createIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
 *
 * @example-class Db
 * @example-method createIndex
 * @ignore
 */
exports.shouldCreateOnDbComplexIndexOnTwoFieldsWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_complex_index_test_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax()).then(function(result) {

        // Create an index on the a field
        db.createIndex('more_complex_index_test_with_promise', {a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray().then(function(items) {
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray().then(function(explanation) {
              test.ok(explanation != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
 *
 * @example-class Db
 * @example-method ensureIndex
 * @ignore
 */
exports.shouldCreateComplexEnsureIndexDbWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_complex_ensure_index_db_test_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax()).then(function(result) {

        // Create an index on the a field
        db.ensureIndex('more_complex_ensure_index_db_test_with_promise', {a:1, b:1}
          , {unique:true, background:true, w:1}).then(function(indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray().then(function(items) {
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray().then(function(explanation) {
              test.ok(explanation != null);

              db.close();
              test.done();
            });
          })
        });
      });
    });
    // END
  }
}

/**
 * An examples showing the dropping of a database using a Promise.
 *
 * @example-class Db
 * @example-method dropDatabase
 * @ignore
 */
exports.shouldCorrectlyDropTheDatabaseWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('more_index_information_test_1_with_promise');
      // Insert a bunch of documents for the index
      collection.insertMany([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax()).then(function(result) {

        // Let's drop the database
        db.dropDatabase().then(function(result) {

          // Wait to seconds to let it replicate across
          setTimeout(function() {
            // Get the admin database
            db.admin().listDatabases().then(function(dbs) {
              // Grab the databases
              dbs = dbs.databases;
              // Did we find the db
              var found = false;

              // Check if we have the db in the list
              for(var i = 0; i < dbs.length; i++) {
                if(dbs[i].name == 'integration_tests_to_drop') found = true;
              }

              // We should not find the databases
              if(process.env['JENKINS'] == null) test.equal(false, found);

              db.close();
              test.done();
            });
          }, 2000);
        });
      });
    });
    // END
  }
}

/**
 * An example showing how to retrieve the db statistics using a Promise.
 *
 * @example-class Db
 * @example-method stats
 * @ignore
 */
exports.shouldCorrectlyRetrieveDbStatsWithPromisesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      db.stats().then(function(stats) {
        test.ok(stats != null);

        db.close();
        test.done();
      })
    });
    // END
  }
}

/**
 * Simple example connecting to two different databases sharing the socket connections below using a Promise.
 *
 * @example-class Db
 * @example-method db
 * @ignore
 */
exports.shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Reference a different database sharing the same connections
      // for the data transfer
      var secondDb = db.db("integration_tests_2");

      // Fetch the collections
      var multipleColl1 = db.collection("multiple_db_instances_with_promise");
      var multipleColl2 = secondDb.collection("multiple_db_instances_with_promise");

      // Write a record into each and then count the records stored
      multipleColl1.insertOne({a:1}, {w:1}).then(function(result) {
        multipleColl2.insertOne({a:1}, {w:1}).then(function(result) {

          // Count over the results ensuring only on record in each collection
          multipleColl1.count().then(function(count) {
            test.equal(1, count);

            multipleColl2.count().then(function(count) {
              test.equal(1, count);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Simple replicaset connection setup, requires a running replicaset on the correct ports using a Promise.
 *
 * @example-class Db
 * @example-method open
 * @ignore
 */
exports['Should correctly connect with default replicasetNoOption With Promises'] = {
  metadata: { requires: { promises:true, topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ]
      , {rs_name:configuration.replicasetName}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN
      p_db.close();
      test.done();
    });
    // END
  }
}

/**************************************************************************
 *
 * ADMIN TESTS
 *
 *************************************************************************/

/**
 * Authenticate against MongoDB Admin user using a Promise.
 *
 * @example-class Admin
 * @example-method authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN
      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w:1}).then(function(doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin2', 'admin2').then(function(result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin2', 'admin2').then(function(result) {
            test.ok(result);

            adminDb.removeUser('admin2').then(function(result) {
              test.ok(result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Retrieve the buildInfo for the current MongoDB instance using a Promise.
 *
 * @example-class Admin
 * @example-method buildInfo
 * @ignore
 */
exports.shouldCorrectlyRetrieveBuildInfoWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin3', 'admin3').then(function(result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin3', 'admin3').then(function(result) {
          test.ok(result);

          // Retrive the build information for the MongoDB instance
          adminDb.buildInfo().then(function(info) {

            adminDb.removeUser('admin3').then(function(result) {
              test.ok(result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Retrieve the buildInfo using the command function using a Promise.
 *
 * @example-class Admin
 * @example-method command
 * @ignore
 */
exports.shouldCorrectlyRetrieveBuildInfoUsingCommandWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin4', 'admin4').then(function(result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin4', 'admin4').then(function(result) {
          test.ok(result);

          // Retrive the build information using the admin command
          adminDb.command({buildInfo:1}).then(function(info) {

            adminDb.removeUser('admin4').then(function(result) {
              test.ok(result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * Retrieve the current profiling level set for the MongoDB instance using a Promise.
 *
 * @example-class Admin
 * @example-method profilingLevel
 * @ignore
 */
exports.shouldCorrectlySetDefaultProfilingLevelWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w: 1}).then(function(doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin5', 'admin5').then(function(result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin5', 'admin5').then(function(replies) {

            // Retrive the profiling level
            adminDb.profilingLevel().then(function(level) {

              adminDb.removeUser('admin5').then(function(result) {
                test.ok(result);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of how to use the setProfilingInfo using a Promise.
 * Use this command to set the Profiling level on the MongoDB server
 *
 * @example-class Admin
 * @example-method setProfilingLevel
 * @ignore
 */
exports.shouldCorrectlyChangeProfilingLevelWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w: 1}).then(function(doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin6', 'admin6').then(function(result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin6', 'admin6').then(function(replies) {

            // Set the profiling level to only profile slow queries
            adminDb.setProfilingLevel('slow_only').then(function(level) {

              // Retrive the profiling level and verify that it's set to slow_only
              adminDb.profilingLevel().then(function(level) {
                test.equal('slow_only', level);

                // Turn profiling off
                adminDb.setProfilingLevel('off').then(function(level) {

                  // Retrive the profiling level and verify that it's set to off
                  adminDb.profilingLevel().then(function(level) {
                    test.equal('off', level);

                    // Set the profiling level to log all queries
                    adminDb.setProfilingLevel('all').then(function(level) {

                      // Retrive the profiling level and verify that it's set to all
                      adminDb.profilingLevel().then(function(level) {
                        test.equal('all', level);

                        // Attempt to set an illegal profiling level
                        adminDb.setProfilingLevel('medium').then(function(level) {
                        }).catch(function(err) {
                          test.ok(err instanceof Error);
                          test.equal("Error: illegal profiling level value medium", err.message);

                          adminDb.removeUser('admin6').then(function(result) {
                            test.ok(result);

                            db.close();
                            test.done();
                          });
                        });
                      })
                    });
                  })
                });
              })
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of how to use the profilingInfo using a Promise.
 * Use this command to pull back the profiling information currently set for Mongodb
 *
 * @example-class Admin
 * @example-method profilingInfo
 * @ignore
 */
exports.shouldCorrectlySetAndExtractProfilingInfoWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w: 1}).then(function(doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin7', 'admin7').then(function(result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin7', 'admin7').then(function(replies) {

            // Set the profiling level to all
            adminDb.setProfilingLevel('all').then(function(level) {

              // Execute a query command
              collection.find().toArray().then(function(items) {

                // Turn off profiling
                adminDb.setProfilingLevel('off').then(function(level) {

                  // Retrive the profiling information
                  adminDb.profilingInfo().then(function(infos) {
                    test.ok(infos.constructor == Array);
                    test.ok(infos.length >= 1);
                    test.ok(infos[0].ts.constructor == Date);
                    test.ok(infos[0].millis.constructor == Number);

                    adminDb.removeUser('admin7').then(function(result) {
                      test.ok(result);

                      db.close();
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
    // END
  }
}

/**
 * An example of how to use the validateCollection command using a Promise.
 * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
 *
 * @example-class Admin
 * @example-method validateCollection
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w: 1}).then(function(doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin8', 'admin8').then(function(result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin8', 'admin8').then(function(replies) {

            // Validate the 'test' collection
            adminDb.validateCollection('test_with_promise').then(function(doc) {

              // Remove the user
              adminDb.removeUser('admin8').then(function(result) {
                test.ok(result);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  }
}

/**
 * An example of how to add a user to the admin database using a Promise.
 *
 * @example-class Admin
 * @example-method ping
 * @ignore
 */
exports.shouldCorrectlyPingTheMongoDbInstanceWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin9', 'admin9').then(function(result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin9', 'admin9').then(function(result) {
          test.ok(result);

          // Ping the server
          adminDb.ping().then(function(pingResult) {

            adminDb.removeUser('admin9').then(function(result) {
              test.ok(result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of how add a user, authenticate and logout using a Promise.
 *
 * @example-class Admin
 * @example-method logout
 * @ignore
 */
exports.shouldCorrectlyUseLogoutFunctionWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin10', 'admin10').then(function(result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin10', 'admin10').then(function(result) {
          test.ok(result);

          // Logout the user
          adminDb.logout().then(function(result) {
            test.equal(true, result);

            adminDb.removeUser('admin10').then(function(result) {
              test.ok(result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * An example of how to add a user to the admin database using a Promise.
 *
 * @example-class Admin
 * @example-method addUser
 * @ignore
 */
exports.shouldCorrectlyAddAUserToAdminDbWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin11', 'admin11').then(function(result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin11', 'admin11').then(function(result) {
          test.ok(result);

          adminDb.removeUser('admin11').then(function(result) {
            test.ok(result);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * An example of how to remove a user from the admin database using a Promise.
 *
 * @example-class Admin
 * @example-method removeUser
 * @ignore
 */
exports.shouldCorrectlyAddAUserAndRemoveItFromAdminDbWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      adminDb.addUser('admin12', 'admin12').then(function(result) {

        // Authenticate using the newly added user
        adminDb.authenticate('admin12', 'admin12').then(function(result) {
          test.ok(result);

          // Remove the user
          adminDb.removeUser('admin12').then(function(result) {
            test.equal(true, result);

            // Authenticate using the removed user should fail
            adminDb.authenticate('admin12', 'admin12').then(function(result) {
            }).catch(function(err) {
              db.close();
              test.done();
            });
          })
        });
      });
    });
    // END
  }
}

/**
 * An example of listing all available databases. using a Promise.
 *
 * @example-class Admin
 * @example-method listDatabases
 * @ignore
 */
exports.shouldCorrectlyListAllAvailableDatabasesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // List all the available databases
      adminDb.listDatabases().then(function(dbs) {
        test.ok(dbs.databases.length > 0);

        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Retrieve the current server Info using a Promise.
 *
 * @example-class Admin
 * @example-method serverStatus
 * @ignore
 */
exports.shouldCorrectlyRetrieveServerInfoWithPromises = {
  metadata: { requires: { promises:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w: 1}).then(function(doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin13', 'admin13').then(function(result) {

          // Authenticate using the newly added user
          adminDb.authenticate('admin13', 'admin13').then(function(result) {

            // Retrive the server Info
            adminDb.serverStatus().then(function(info) {
              test.ok(info != null);

              adminDb.removeUser('admin13').then(function(result) {
                test.ok(result);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**************************************************************************
 *
 * CURSOR TESTS
 *
 *************************************************************************/
var fs = require('fs');

/**
 * An example showing the information returned by indexInformation using a Promise.
 *
 * @example-class Cursor
 * @example-method toArray
 * @ignore
 */
exports.shouldCorrectlyExecuteToArrayWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection to hold our documents
      var collection = db.collection('test_array_with_promise');

      // Insert a test document
      collection.insertOne({'b':[1, 2, 3]}, configuration.writeConcernMax()).then(function(ids) {

        // Retrieve all the documents in the collection
        collection.find().toArray().then(function(documents) {
          test.equal(1, documents.length);
          test.deepEqual([1, 2, 3], documents[0].b);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the count function of the cursor using a Promise.
 *
 * @example-class Cursor
 * @example-method count
 * @ignore
 */
exports.shouldCorrectlyUseCursorCountFunctionWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Creat collection
      var collection = db.collection('cursor_count_collection_with_promise');

      // Insert some docs
      collection.insertMany([{a:1}, {a:2}], configuration.writeConcernMax()).then(function(docs) {

        // Do a find and get the cursor count
        collection.find().count().then(function(count) {
          test.equal(2, count);

          db.close();
          test.done();
        })
      });
    });
    // END
  }
}

/**
 * A simple example showing the use of nextObject using a Promise.
 *
 * @example-class Cursor
 * @example-method nextObject
 * @ignore
 */
exports.shouldCorrectlyPeformNextObjectOnCursorWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('simple_next_object_collection_with_promise');

      // Insert some documents we can sort on
      collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax()).then(function(docs) {

        // Do normal ascending sort
        collection.find().nextObject().then(function(item) {
          test.equal(1, item.a);

          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the use of the cursor explain function using a Promise.
 *
 * @example-class Cursor
 * @example-method explain
 * @ignore
 */
exports.shouldCorrectlyPeformSimpleExplainCursorWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('simple_explain_collection_with_promise');

      // Insert some documents we can sort on
      collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax()).then(function(docs) {

        // Do normal ascending sort
        collection.find().explain().then(function(explaination) {
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the use of the cursor close function using a Promise.
 *
 * @example-class Cursor
 * @example-method close
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCloseFunctionWithPromises = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a lot of documents to insert
      var docs = []
      for(var i = 0; i < 100; i++) {
        docs.push({'a':i})
      }

      // Create a collection
      var collection = db.collection('test_close_function_on_cursor_with_promise');

      // Insert documents into collection
      collection.insertMany(docs, configuration.writeConcernMax()).then(function(ids) {
        // Peform a find to get a cursor
        var cursor = collection.find();

        // Fetch the first object
        cursor.nextObject().then(function(object) {

          // Close the cursor, this is the same as reseting the query
          cursor.close().then(function(result) {
            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**************************************************************************
 *
 * MONGOCLIENT TESTS
 *
 *************************************************************************/

/**
 * Example of a simple url connection string to a replicaset, with acknowledgement of writes using a Promise.
 *
 * @example-class MongoClient
 * @example-method MongoClient.connect
 * @ignore
 */
exports['Should correctly connect to a replicaset With Promises'] = {
  metadata: { requires: { promises:true, topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient;

    // Create url
    var url = f("mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s"
      , f("%s:%s", configuration.host, configuration.port)
      , f("%s:%s", configuration.host, configuration.host + 1)
      , "integration_test_"
      , configuration.replicasetName
      , "primary");

    MongoClient.connect(url).then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:30000,localhost:30001,localhost:30002/test?replicaSet=rs', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN
      test.ok(db != null);

      db.collection("replicaset_mongo_client_collection_with_promise").updateOne({a:1}, {b:1}, {upsert:true}).then(function(result) {
        test.equal(1, result.result.n);

        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple url connection string to a shard, with acknowledgement of writes using a Promise.
 *
 * @example-class MongoClient
 * @example-method MongoClient.connect
 * @ignore
 */
exports['Should connect to mongos proxies using connectiong string With Promises'] = {
  metadata: { requires: { promises:true, topology: 'mongos' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    var url = f('mongodb://%s:%s,%s:%s/sharded_test_db?w=1'
      , configuration.host, configuration.port
      , configuration.host, configuration.port + 1);

    MongoClient.connect(url).then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:50000,localhost:50001/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN
      test.ok(db != null);

      db.collection("replicaset_mongo_client_collection_with_promise").updateOne({a:1}, {b:1}, {upsert:true}).then(function(result) {
        test.equal(1, result);

        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple url connection string for a single server connection
 *
 * @example-class MongoClient
 * @example-method MongoClient.connect
 * @ignore
 */
exports['Should correctly connect using MongoClient to a single server using connect With Promises'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { promises:true, topology: 'single'} },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;
    // DOC_START
    // Connect using the connection string
    MongoClient.connect("mongodb://localhost:27017/integration_tests", {native_parser:true}).then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN
      db.collection('mongoclient_test_with_promise').updateOne({a:1}, {b:1}, {upsert:true}).then(function(result) {
        test.equal(1, result.result.n);

        db.close();
        test.done();
      });
    });
    // END
  }
}

/**************************************************************************
 *
 * GRIDSTORE TESTS
 *
 *************************************************************************/

/**
 * A simple example showing the usage of the Gridstore.exist method using a Promise.
 *
 * @example-class GridStore
 * @example-method GridStore.exist
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExistsByObjectIdWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Open a file for writing
      var gridStore = new GridStore(db, null, "w");
      gridStore.open().then(function(gridStore) {

        // Writing some content to the file
        gridStore.write("hello world!").then(function(gridStore) {

          // Flush the file to GridFS
          gridStore.close().then(function(result) {

            // Check if the file exists using the id returned from the close function
            GridStore.exist(db, result._id).then(function(result) {
              test.equal(true, result);
            })

            // Show that the file does not exist for a random ObjectID
            GridStore.exist(db, new ObjectID()).then(function(result) {
              test.equal(false, result);
            });

            // Show that the file does not exist for a different file root
            GridStore.exist(db, result._id, 'another_root').then(function(result) {
              test.equal(false, result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the usage of the eof method using a Promise.
 *
 * @example-class GridStore
 * @example-method GridStore.list
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreListWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file id
      var fileId = new ObjectID();

      // Open a file for writing
      var gridStore = new GridStore(db, fileId, "foobar2", "w");
      gridStore.open().then(function(gridStore) {

        // Write some content to the file
        gridStore.write("hello world!").then(function(gridStore) {
          // Flush to GridFS
          gridStore.close().then(function(result) {

            // List the existing files
            GridStore.list(db).then(function(items) {
              var found = false;
              items.forEach(function(filename) {
                if(filename == 'foobar2') found = true;
              });

              test.ok(items.length >= 1);
              test.ok(found);
            });

            // List the existing files but return only the file ids
            GridStore.list(db, {id:true}).then(function(items) {
              var found = false;
              items.forEach(function(id) {
                test.ok(typeof id == 'object');
              });

              test.ok(items.length >= 1);
            });

            // List the existing files in a specific root collection
            GridStore.list(db, 'fs').then(function(items) {
              var found = false;
              items.forEach(function(filename) {
                if(filename == 'foobar2') found = true;
              });

              test.ok(items.length >= 1);
              test.ok(found);
            });

            // List the existing files in a different root collection where the file is not located
            GridStore.list(db, 'my_fs').then(function(items) {
              var found = false;
              items.forEach(function(filename) {
                if(filename == 'foobar2') found = true;
              });

              test.ok(items.length >= 0);
              test.ok(!found);

              // Specify seperate id
              var fileId2 = new ObjectID();
              // Write another file to GridFS
              var gridStore2 = new GridStore(db, fileId2, "foobar3", "w");
              gridStore2.open().then(function(gridStore) {
                // Write the content
                gridStore2.write('my file').then(function(gridStore) {
                  // Flush to GridFS
                  gridStore.close().then(function(result) {

                    // List all the available files and verify that our files are there
                    GridStore.list(db).then(function(items) {
                      var found = false;
                      var found2 = false;

                      items.forEach(function(filename) {
                        if(filename == 'foobar2') found = true;
                        if(filename == 'foobar3') found2 = true;
                      });

                      test.ok(items.length >= 2);
                      test.ok(found);
                      test.ok(found2);

                      db.close();
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
    // END
  }
}

/**
 * A simple example showing the usage of the puts method using a Promise.
 *
 * @example-class GridStore
 * @example-method puts
 * @ignore
 */
exports.shouldCorrectlyReadlinesAndPutLinesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Open a file for writing
      var gridStore = new GridStore(db, "test_gs_puts_and_readlines", "w");
      gridStore.open().then(function(gridStore) {

        // Write a line to the file using the puts method
        gridStore.puts("line one").then(function(gridStore) {

          // Flush the file to GridFS
          gridStore.close().then(function(result) {

            // Read in the entire contents
            GridStore.read(db, 'test_gs_puts_and_readlines').then(function(data) {
              test.equal("line one\n", data.toString());

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the usage of the GridStore.unlink method using a Promise.
 *
 * @example-class GridStore
 * @example-method GridStore.unlink
 * @ignore
 */
exports.shouldCorrectlyUnlinkWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Open a new file for writing
      var gridStore = new GridStore(db, "test_gs_unlink", "w");
      db.dropDatabase().then(function(r) {

        gridStore.open().then(function(gridStore) {

          // Write some content
          gridStore.write("hello, world!").then(function(gridStore) {

            // Flush file to GridFS
            gridStore.close().then(function(result) {

              // Verify the existance of the fs.files document
              db.collection('fs.files', function(err, collection) {
                collection.count().then(function(count) {
                  test.equal(1, count);
                })
              });

              // Verify the existance of the fs.chunks chunk document
              db.collection('fs.chunks', function(err, collection) {
                collection.count().then(function(count) {
                  test.equal(1, count);

                  // Unlink the file (removing it)
                  GridStore.unlink(db, 'test_gs_unlink').then(function(gridStore) {

                    // Verify that fs.files document is gone
                    db.collection('fs.files', function(err, collection) {
                      collection.count().then(function(count) {
                        test.equal(0, count);
                      })
                    });

                    // Verify that fs.chunks chunk documents are gone
                    db.collection('fs.chunks', function(err, collection) {
                      collection.count().then(function(count) {
                        test.equal(0, count);

                        db.close();
                        test.done();
                      })
                    });
                  });
                })
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the usage of the read method using a Promise.
 *
 * @example-class GridStore
 * @example-method read
 * @ignore
 */
exports.shouldCorrectlyWriteAndReadJpgImageWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Read in the content of a file
      var data = fs.readFileSync('./test/functional/data/iya_logo_final_bw.jpg');
      // Create a new file
      var gs = new GridStore(db, "test", "w");
      // Open the file
      gs.open().then(function(gs) {
        // Write the file to GridFS
        gs.write(data).then(function(gs) {
          // Flush to the GridFS
          gs.close().then(function(gs) {

            // Define the file we wish to read
            var gs2 = new GridStore(db, "test", "r");
            // Open the file
            gs2.open().then(function(gs) {
              // Set the pointer of the read head to the start of the gridstored file
              gs2.seek(0).then(function() {
                // Read the entire file
                gs2.read().then(function(data2) {
                  // Compare the file content against the orgiinal
                  test.equal(data.toString('base64'), data2.toString('base64'));

                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing opening a file using a filename, writing to it and saving it using a Promise.
 *
 * @example-class GridStore
 * @example-method open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingFilenameWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a new instance of the gridstore
      var gridStore = new GridStore(db, 'ourexamplefiletowrite.txt', 'w');

      // Open the file
      gridStore.open().then(function(gridStore) {

        // Write some data to the file
        gridStore.write('bar').then(function(gridStore) {

          // Close (Flushes the data to MongoDB)
          gridStore.close().then(function(result) {

            // Verify that the file exists
            GridStore.exist(db, 'ourexamplefiletowrite.txt').then(function(result) {
              test.equal(true, result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing opening a file using an ObjectID, writing to it and saving it using a Promise.
 *
 * @example-class GridStore
 * @example-method open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingObjectIDWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Create a new instance of the gridstore
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the file
      gridStore.open().then(function(gridStore) {

        // Write some data to the file
        gridStore.write('bar').then(function(gridStore) {

          // Close (Flushes the data to MongoDB)
          gridStore.close().then(function(result) {

            // Verify that the file exists
            GridStore.exist(db, fileId).then(function(result) {
              test.equal(true, result);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing how to write a file to Gridstore using file location path using a Promise.
 *
 * @example-class GridStore
 * @example-method writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Read the filesize of file on disk (provide your own)
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      // Read the buffered data for comparision reasons
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write the file to gridFS
        gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png').then(function(doc) {

          // Read back all the written content and verify the correctness
          GridStore.read(db, fileId).then(function(fileData) {
            test.equal(data.toString('base64'), fileData.toString('base64'))
            test.equal(fileSize, fileData.length);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing how to write a file to Gridstore using a file handle using a Promise.
 *
 * @example-class GridStore
 * @example-method writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandleWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Read the filesize of file on disk (provide your own)
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      // Read the buffered data for comparision reasons
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

      // Open a file handle for reading the file
      var fd = fs.openSync('./test/functional/data/test_gs_weird_bug.png', 'r', parseInt('0666',8));

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write the file to gridFS using the file handle
        gridStore.writeFile(fd).then(function(doc) {

          // Read back all the written content and verify the correctness
          GridStore.read(db, fileId).then(function(fileData) {
            test.equal(data.toString('base64'), fileData.toString('base64'));
            test.equal(fileSize, fileData.length);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing how to use the write command with strings and Buffers using a Promise.
 *
 * @example-class GridStore
 * @example-method write
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffersWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write a text string
        gridStore.write('Hello world').then(function(gridStore) {

          // Write a buffer
          gridStore.write(new Buffer('Buffer Hello world')).then(function(gridStore) {

            // Close the
            gridStore.close().then(function(result) {

              // Read back all the written content and verify the correctness
              GridStore.read(db, fileId).then(function(fileData) {
                test.equal('Hello worldBuffer Hello world', fileData.toString());

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing how to use the write command with strings and Buffers using a Promise.
 *
 * @example-class GridStore
 * @example-method close
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write a text string
        gridStore.write('Hello world').then(function(gridStore) {

          // Close the
          gridStore.close().then(function(result) {

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing how to use the instance level unlink command to delete a gridstore item using a Promise.
 *
 * @example-class GridStore
 * @example-method unlink
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkItWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write a text string
        gridStore.write('Hello world').then(function(gridStore) {

          // Close the
          gridStore.close().then(function(result) {

            // Open the file again and unlin it
            new GridStore(db, fileId, 'r').open().then(function(gridStore) {

              // Unlink the file
              gridStore.unlink().then(function(result) {

                // Verify that the file no longer exists
                GridStore.exist(db, fileId).then(function(result) {
                  test.equal(false, result);

                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Promise.
 *
 * @example-class GridStore
 * @example-method GridStore.readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlinesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write one line to gridStore
        gridStore.puts("line one").then(function(gridStore) {

          // Write second line to gridStore
          gridStore.puts("line two").then(function(gridStore) {

            // Write third line to gridStore
            gridStore.puts("line three").then(function(gridStore) {

              // Flush file to disk
              gridStore.close().then(function(result) {

                // Read back all the lines
                GridStore.readlines(db, fileId).then(function(lines) {
                  test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);

                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Promise.
 *
 * @example-class GridStore
 * @example-method readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlinesWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      gridStore.open().then(function(gridStore) {

        // Write one line to gridStore
        gridStore.puts("line one").then(function(gridStore) {

          // Write second line to gridStore
          gridStore.puts("line two").then(function(gridStore) {

            // Write third line to gridStore
            gridStore.puts("line three").then(function(gridStore) {

              // Flush file to disk
              gridStore.close().then(function(result) {

                // Open file for reading
                gridStore = new GridStore(db, fileId, 'r');
                gridStore.open().then(function(gridStore) {

                  // Read all the lines and verify correctness
                  gridStore.readlines().then(function(lines) {
                    test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);

                    db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the usage of the read method using a Promise.
 *
 * @example-class GridStore
 * @example-method GridStore.read
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreReadWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a new file
      var gridStore = new GridStore(db, null, "w");
      // Read in the content from a file, replace with your own
      var data = fs.readFileSync("./test/functional/data/test_gs_weird_bug.png");

      // Open the file
      gridStore.open().then(function(gridStore) {
        // Write the binary file data to GridFS
        gridStore.write(data).then(function(gridStore) {
          // Flush the remaining data to GridFS
          gridStore.close().then(function(result) {

            // Read in the whole file and check that it's the same content
            GridStore.read(db, result._id).then(function(fileData) {
              test.equal(data.length, fileData.length);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // END
  }
}

/*
 * A simple example showing the usage of the seek method using a Promise.
 *
 * @example-class GridStore
 * @example-method seek
 * @ignore
 */
exports.shouldCorrectlySeekWithBufferWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a file and open it
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "w");
      gridStore.open().then(function(gridStore) {
        // Write some content to the file
        gridStore.write(new Buffer("hello, world!", "utf8")).then(function(gridStore) {
          // Flush the file to GridFS
          gridStore.close().then(function(result) {

            // Open the file in read mode
            var gridStore2 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore2.open().then(function(gridStore) {
              // Seek to start
              gridStore.seek(0).then(function(gridStore) {
                // Read first character and verify
                gridStore.getc().then(function(chr) {
                  test.equal('h', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore3 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore3.open().then(function(gridStore) {
              // Seek to 7 characters from the beginning off the file and verify
              gridStore.seek(7).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('w', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore5 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore5.open().then(function(gridStore) {
              // Seek to -1 characters from the end off the file and verify
              gridStore.seek(-1, GridStore.IO_SEEK_END).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('!', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore6 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore6.open().then(function(gridStore) {
              // Seek to -6 characters from the end off the file and verify
              gridStore.seek(-6, GridStore.IO_SEEK_END).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('w', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore7 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore7.open().then(function(gridStore) {

              // Seek forward 7 characters from the current read position and verify
              gridStore.seek(7, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('w', chr);

                  // Seek forward -1 characters from the current read position and verify
                  gridStore.seek(-1, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                    gridStore.getc().then(function(chr) {
                      test.equal('w', chr);

                      // Seek forward -4 characters from the current read position and verify
                      gridStore.seek(-4, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                        gridStore.getc().then(function(chr) {
                          test.equal('o', chr);

                          // Seek forward 3 characters from the current read position and verify
                          gridStore.seek(3, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                            gridStore.getc().then(function(chr) {
                              test.equal('o', chr);

                              db.close();
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
      });
    });
    // END
  }
}

/**
 * A simple example showing how to rewind and overwrite the file using a Promise.
 *
 * @example-class GridStore
 * @example-method rewind
 * @ignore
 */
exports.shouldCorrectlyRewingAndTruncateOnWriteWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Create a new file
      var gridStore = new GridStore(db, fileId, "w");
      // Open the file
      gridStore.open().then(function(gridStore) {
        // Write to the file
        gridStore.write("hello, world!").then(function(gridStore) {
          // Flush the file to disk
          gridStore.close().then(function(result) {

            // Reopen the file
            gridStore = new GridStore(db, fileId, "w");
            gridStore.open().then(function(gridStore) {
              // Write some more text to the file
              gridStore.write('some text is inserted here').then(function(gridStore) {

                // Let's rewind to truncate the file
                gridStore.rewind().then(function(gridStore) {

                  // Write something from the start
                  gridStore.write('abc').then(function(gridStore) {

                    // Flush the data to mongodb
                    gridStore.close().then(function(result) {

                      // Verify that the new data was written
                      GridStore.read(db, fileId).then(function(data) {
                        test.equal("abc", data);

                        db.close();
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
    // END
  }
}

/**
 * A simple example showing the usage of the tell method using a Promise.
 *
 * @example-class GridStore
 * @example-method tell
 * @ignore
 */
exports.shouldCorrectlyExecuteGridstoreTellWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a new file
      var gridStore = new GridStore(db, "test_gs_tell", "w");
      // Open the file
      gridStore.open().then(function(gridStore) {
        // Write a string to the file
        gridStore.write("hello, world!").then(function(gridStore) {
          // Flush the file to GridFS
          gridStore.close().then(function(result) {

            // Open the file in read only mode
            var gridStore2 = new GridStore(db, "test_gs_tell", "r");
            gridStore2.open().then(function(gridStore) {

              // Read the first 5 characters
              gridStore.read(5).then(function(data) {
                test.equal("hello", data);

                // Get the current position of the read head
                gridStore.tell().then(function(position) {
                  test.equal(5, position);

                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the usage of the seek method using a Promise.
 *
 * @example-class GridStore
 * @example-method getc
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetCWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a file and open it
      var gridStore = new GridStore(db, "test_gs_getc_file", "w");
      gridStore.open().then(function(gridStore) {
        // Write some content to the file
        gridStore.write(new Buffer("hello, world!", "utf8")).then(function(gridStore) {
          // Flush the file to GridFS
          gridStore.close().then(function(result) {

            // Open the file in read mode
            var gridStore2 = new GridStore(db, "test_gs_getc_file", "r");
            gridStore2.open().then(function(gridStore) {

              // Read first character and verify
              gridStore.getc().then(function(chr) {
                test.equal('h', chr);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing how to save a file with a filename allowing for multiple files with the same name using a Promise.
 *
 * @example-class GridStore
 * @example-method open
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetCWithPromises = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   GridStore = require('mongodb').GridStore,
    // LINE   ObjectID = require('mongodb').ObjectID,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a file and open it
      var gridStore = new GridStore(db, new ObjectID(), "test_gs_getc_file", "w");
      gridStore.open().then(function(gridStore) {
        // Write some content to the file
        gridStore.write(new Buffer("hello, world!", "utf8")).then(function(gridStore) {
          // Flush the file to GridFS
          gridStore.close().then(function(fileData) {

            // Create another file with same name and and save content to it
            gridStore = new GridStore(db, new ObjectID(), "test_gs_getc_file", "w");
            gridStore.open().then(function(gridStore) {
              // Write some content to the file
              gridStore.write(new Buffer("hello, world!", "utf8")).then(function(gridStore) {
                // Flush the file to GridFS
                gridStore.close().then(function(fileData) {

                  // Open the file in read mode using the filename
                  var gridStore2 = new GridStore(db, "test_gs_getc_file", "r");
                  gridStore2.open().then(function(gridStore) {

                    // Read first character and verify
                    gridStore.getc().then(function(chr) {
                      test.equal('h', chr);

                      // Open the file using an object id
                      gridStore2 = new GridStore(db, fileData._id, "r");
                      gridStore2.open().then(function(gridStore) {

                        // Read first character and verify
                        gridStore.getc().then(function(chr) {
                          test.equal('h', chr);

                          db.close();
                          test.done();
                        })
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
    // END
  }
}

/**************************************************************************
 *
 * BULK TESTS
 *
 *************************************************************************/

/**
 * Example of a simple ordered insert/update/upsert/remove ordered collection using a Promise.
 *
 * @example-class Collection
 * @example-method initializeOrderedBulkOp
 * @ignore
 */
exports['Should correctly execute ordered batch with no errors using write commands With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_0_with_promise');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp();
      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      batch.execute().then(function(result) {
        // Check state of result
        test.equal(2, result.nInserted);
        test.equal(1, result.nUpserted);
        test.equal(1, result.nMatched);
        test.ok(1 == result.nModified || result.nModified == null);
        test.equal(1, result.nRemoved);

        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(2, upserts[0].index);
        test.ok(upserts[0]._id != null);

        var upsert = result.getUpsertedIdAt(0);
        test.equal(2, upsert.index);
        test.ok(upsert._id != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple ordered insert/update/upsert/remove ordered collection using a Promise.
 *
 *
 * @example-class Collection
 * @example-method initializeUnorderedBulkOp
 * @ignore
 */
exports['Should correctly execute unordered batch with no errors With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_0_with_promise');
      // Initialize the unordered Batch
      var batch = col.initializeUnorderedBulkOp();

      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      batch.execute().then(function(result) {
        // Check state of result
        test.equal(2, result.nInserted);
        test.equal(1, result.nUpserted);
        test.equal(1, result.nMatched);
        test.ok(1 == result.nModified || result.nModified == null);
        test.equal(1, result.nRemoved);

        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(2, upserts[0].index);
        test.ok(upserts[0]._id != null);

        var upsert = result.getUpsertedIdAt(0);
        test.equal(2, upsert.index);
        test.ok(upsert._id != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**************************************************************************
 *
 * CRUD TESTS
 *
 *************************************************************************/

/**
 * Example of a simple insertOne operation using a Promise.
 *
 * @example-class Collection
 * @example-method insertOne
 * @ignore
 */
exports['Should correctly execute insertOne operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('insert_one_with_promise');
      col.insertOne({a:1}).then(function(r) {
        test.equal(1, r.insertedCount);
        // Finish up test
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple insertMany operation using a Promise.
 *
 * @example-class Collection
 * @example-method insertMany
 * @ignore
 */
exports['Should correctly execute insertMany operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('insert_many_with_promise');
      col.insertMany([{a:1}, {a:2}]).then(function(r) {
        test.equal(2, r.insertedCount);
        // Finish up test
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple updateOne operation using a Promise.
 *
 * @example-class Collection
 * @example-method updateOne
 * @ignore
 */
exports['Should correctly execute updateOne operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('update_one_with_promise');
      col.updateOne({a:1}
        , {$set: {a:2}}
        , {upsert:true}).then(function(r) {
        test.equal(1, r.matchedCount);
        test.equal(1, r.upsertedCount);
        // Finish up test
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple updateMany operation using a Promise.
 *
 * @example-class Collection
 * @example-method updateMany
 * @ignore
 */
exports['Should correctly execute updateMany operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('update_many_with_promise');
      col.insertMany([{a:1}, {a:1}]).then(function(r) {
        test.equal(2, r.insertedCount);

        // Update all documents
        col.updateMany({a:1}, {$set: {b: 1}}).then(function(r) {
          test.equal(2, r.matchedCount);
          test.equal(2, r.modifiedCount);

          // Finish up test
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple removeOne operation using a Promise.
 *
 * @example-class Collection
 * @example-method removeOne
 * @ignore
 */
exports['Should correctly execute removeOne operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('remove_one_with_promise');
      col.insertMany([{a:1}, {a:1}]).then(function(r) {
        test.equal(2, r.insertedCount);

        col.removeOne({a:1}).then(function(r) {
          test.equal(1, r.deletedCount);
          // Finish up test
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple removeMany operation using a Promise.
 *
 * @example-class Collection
 * @example-method removeMany
 * @ignore
 */
exports['Should correctly execute removeMany operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('remove_many_with_promise');
      col.insertMany([{a:1}, {a:1}]).then(function(r) {
        test.equal(2, r.insertedCount);

        // Update all documents
        col.removeMany({a:1}).then(function(r) {
          test.equal(2, r.deletedCount);

          // Finish up test
          db.close();
          test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple bulkWrite operation using a Promise.
 *
 * @example-class Collection
 * @example-method bulkWrite
 * @ignore
 */
exports['Should correctly execute bulkWrite operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('bulk_write_with_promise');
      col.bulkWrite([
          { insertOne: { document: { a: 1 } } }
        , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
        , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
        , { deleteOne: { filter: {c:1} } }
        , { deleteMany: { filter: {c:1} } }
        , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
      , {ordered:true, w:1}).then(function(r) {
        test.equal(1, r.nInserted);
        test.equal(2, r.nUpserted);
        test.equal(0, r.nRemoved);

        // Crud fields
        test.equal(1, r.insertedCount);
        test.equal(1, Object.keys(r.insertedIds).length);
        test.equal(1, r.matchedCount);
        test.equal(0, r.modifiedCount);
        test.equal(0, r.deletedCount);
        test.equal(2, r.upsertedCount);
        test.equal(2, Object.keys(r.upsertedIds).length);

        // Ordered bulk operation
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * Example of a simple findOneAndDelete operation using a Promise.
 *
 * @example-class Collection
 * @example-method findOneAndDelete
 * @ignore
 */
exports['Should correctly execute findOneAndDelete operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_delete_with_promise');
      col.insertMany([{a:1, b:1}], {w:1}).then(function(r) {
        test.equal(1, r.result.n);

        col.findOneAndDelete({a:1}
          , { projection: {b:1}, sort: {a:1} }
          ).then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple findOneAndReplace operation using a Promise.
 *
 * @example-class Collection
 * @example-method findOneAndReplace
 * @ignore
 */
exports['Should correctly execute findOneAndReplace operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_replace_with_promise');
      col.insertMany([{a:1, b:1}], {w:1}).then(function(r) {
        test.equal(1, r.result.n);

        col.findOneAndReplace({a:1}
          , {c:1, b:1}
          , {
                projection: {b:1, c:1}
              , sort: {a:1}
              , returnOriginal: false
              , upsert: true
            }
          ).then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);
            test.equal(1, r.value.c);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * Example of a simple findOneAndUpdate operation using a Promise.
 *
 * @example-class Collection
 * @example-method findOneAndUpdate
 * @ignore
 */
exports['Should correctly execute findOneAndUpdate operation With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_update_with_promise');
      col.insertMany([{a:1, b:1}], {w:1}).then(function(r) {
        test.equal(1, r.result.n);

        col.findOneAndUpdate({a:1}
          , {$set: {d:1}}
          , {
                projection: {b:1, d:1}
              , sort: {a:1}
              , returnOriginal: false
              , upsert: true
            }
          ).then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);
            test.equal(1, r.value.d);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * A simple example showing the listening to a capped collection using a Promise.
 *
 * @example-class Db
 * @example-method createCollection
 * @ignore
 */
exports['Should correctly add capped collection options to cursor With Promises'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a capped collection with a maximum of 1000 documents
      db.createCollection("a_simple_collection_2_with_promise", {capped:true, size:10000, max:1000, w:1}).then(function(collection) {
        var docs = [];
        for(var i = 0; i < 1000; i++) docs.push({a:i});

        // Insert a document in the capped collection
        collection.insertMany(docs, configuration.writeConcernMax()).then(function(result) {

          // Start date
          var s = new Date();

          // Get the cursor
          var cursor = collection.find({})
            .addCursorFlag('tailable', true)
            .addCursorFlag('awaitData', true)
            .setCursorOption('numberOfRetries', 5)
            .setCursorOption('tailableRetryInterval', 100);

          cursor.on('data', function() {});

          cursor.on('end', function() {
            test.ok((new Date().getTime() - s.getTime()) > 1000);

            db.close();
            test.done();
          });
        });
      });
    });
    // END
  }
}
