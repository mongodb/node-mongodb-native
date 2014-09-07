/**************************************************************************
 *
 * COLLECTION TESTS
 *
 *************************************************************************/

/**
 * Correctly call the aggregation framework using a pipeline in an Array.
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample1 = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('aggregationExample1');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], function(err, result) {
            test.equal(null, err);
            test.equal('good', result[0]._id.tags);
            test.deepEqual(['bob'], result[0].authors);
            test.equal('fun', result[1]._id.tags);
            test.deepEqual(['bob'], result[1].authors);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation using a cursor
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample2 = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('aggregationExample2');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

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
        cursor.toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(2, docs.length);
          test.done();
          db.close();
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation using a read stream
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample3 = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('aggregationExample3');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

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

        var count = 0;
        // Get all the aggregation results
        cursor.on('data', function(doc) {
          count = count + 1;
        });

        cursor.once('end', function() {
          test.equal(2, count);
          test.done();
          db.close();
        });
      });
    });
    // END
  }
}

/**
 * Example of running simple count commands against a collection.
 *
 * @example-class Collection
 * @example-method count
 * @ignore
 */
exports.shouldCorrectlyDoSimpleCountExamples = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Crete the collection for the distinct example
      var collection = db.collection('countExample1');
      // Insert documents to perform distinct against
      collection.insert([{a:1}, {a:2}
        , {a:3}, {a:4, b:1}], {w: 1}, function(err, ids) {

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
    // END
  }
}

/**
 * A more complex createIndex using a compound unique index in the background and dropping duplicated documents
 *
 * @example-class Collection
 * @example-method createIndex
 * @ignore
 */
exports.shouldCreateComplexIndexOnTwoFields = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Create a collection we want to drop later
      var collection = db.collection('createIndexExample1');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        db.createIndex('createIndexExample1', {a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
              test.equal(null, err);
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
 * A simple createIndex using a simple single field index
 *
 * @example-class Collection
 * @example-method createIndex
 * @ignore
 */
exports.shouldCreateASimpleIndexOnASingleField = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('createIndexExample2');
      // Insert a bunch of documents for the index
      collection.insert([{a:1}, {a:2}, {a:3}, {a:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.createIndex('a', {w:1}, function(err, indexName) {
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
    // END
  }
}

/**
 * A more complex createIndex using a compound unique index in the background
 *
 * @example-class Collection
 * @example-method createIndex
 * @ignore
 */
exports.createIndexExample3 = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {1

      // Create a collection we want to drop later
      var collection = db.collection('createIndexExample3');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        var options = {unique:true, background:true, w:1};
        // Create an index on the a field
        collection.createIndex({a:1, b:1}
          , options, function(err, indexName) {

          test.ok(!options.readPreference);
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
    // END
  }
}

/**
 * Example of running the distinct command against a collection
 *
 * @example-class Collection
 * @example-method distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithSubQueryFilter = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Crete the collection for the distinct example
      var collection = db.collection('distinctExample1');

      // Insert documents to perform distinct against
      collection.insert([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax(), function(err, ids) {

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
      });
    });
    // END
  }
}

/**
 * Example of running the distinct command against a collection with a filter query
 *
 * @example-class Collection
 * @example-method distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      var collection = db.collection('distinctExample2');

      // Insert documents to perform distinct against
      collection.insert([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}, {a:5, c:1}], configuration.writeConcernMax(), function(err, ids) {

        // Peform a distinct query with a filter against the documents
        collection.distinct('a', {c:1}, function(err, docs) {
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
 * Example of a simple document save and then resave with safe set to true
 *
 * @example-class Collection
 * @example-method drop
 * @ignore
 */
exports.shouldCorrectlyDropCollectionWithDropFunction = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('test_other_drop');

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
    // END
  }
}


/**
 * Example of a simple document save and then resave with safe set to true
 *
 * @example-class Collection
 * @example-method dropAllIndexes
 * @ignore
 */
exports.dropAllIndexesExample1 = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Drop the collection
      collection('dropExample1').dropAllIndexes(function(err, reply) {
        test.equal(null, err);

        // Let's close the db
        db.close();
        test.done();
      });
    });
    // END
  }
}

/**
 * An examples showing the creation and dropping of an index
 *
 * @example-class Collection
 * @example-method dropIndex
 * @ignore
 */
exports.shouldCorrectlyCreateAndDropIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      var collection = db.collection('dropIndexExample1');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {

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
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents.
 *
 * @example-class Collection
 * @example-method ensureIndex
 * @ignore
 */
exports.shouldCreateComplexEnsureIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      var collection = db.collection('ensureIndexExample1');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        db.ensureIndex('ensureIndexExample1', {a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {

          // Show that duplicate records got dropped
          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);

            // Peform a query, with explain to show we hit the query
            collection.find({a:2}, {explain:true}).toArray(function(err, explanation) {
              test.equal(null, err);
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
 * A more complex ensureIndex using a compound unique index in the background.
 *
 * @example-class Collection
 * @example-method ensureIndex
 * @ignore
 */
exports.ensureIndexExampleWithCompountIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      var collection = db.collection('ensureIndexExample2');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {
          test.equal(null, err);

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
    // END
  }
}

/**
 * A simple query using the find method on the collection.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleQuery = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('simple_query');

      // Insert a bunch of documents for the testing
      collection.insert([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find().toArray(function(err, docs) {
          test.equal(null, err);
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
 * A simple query showing the explain for a query
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleExplainQuery = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('simple_explain_query');
      // Insert a bunch of documents for the testing
      collection.insert([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({}, {explain:true}).toArray(function(err, docs) {
          test.equal(null, err);
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
 * A simple query showing skip and limit
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleLimitSkipQuery = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('simple_limit_skip_query');
      // Insert a bunch of documents for the testing
      collection.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({}, {skip:1, limit:1, fields:{b:1}}).toArray(function(err, docs) {
          test.equal(null, err);
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
 * A whole set of different ways to use the findAndModify command.
 *
 * The first findAndModify command modifies a document and returns the modified document back.
 * The second findAndModify command removes the document.
 * The second findAndModify command upserts a document and returns the new document.
 * 
 * @example-class Collection
 * @example-method findAndModify
 * @ignore
 */
exports.shouldPerformSimpleFindAndModifyOperations = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Create a collection we want to drop later
      var collection = db.collection('simple_find_and_modify_operations_');

      // Insert some test documentations
      collection.insert([{a:1}, {b:1}, {c:1}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        collection.findAndModify({a:1}, [['a', 1]], {$set:{b1:1}}, {new:true}, function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.value.a);
          test.equal(1, doc.value.b1);

          // Simple findAndModify command returning the new document and
          // removing it at the same time
          collection.findAndModify({b:1}, [['b', 1]],
            {$set:{b:2}}, {remove:true}, function(err, doc) {

            // Verify that the document is gone
            collection.findOne({b:1}, function(err, item) {
              test.equal(null, err);
              test.equal(null, item);

              // Simple findAndModify command performing an upsert and returning the new document
              // executing the command safely
              collection.findAndModify({d:1}, [['b', 1]],
                {d:1, f:1}, {new:true, upsert:true, w:1}, function(err, doc) {
                  test.equal(null, err);
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
 * An example of using findAndRemove
 *
 * @example-class Collection
 * @example-method findAndRemove
 * @ignore
 */
exports.shouldPerformSimpleFindAndRemove = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('simple_find_and_modify_operations_2');
      // Insert some test documentations
      collection.insert([{a:1}, {b:1, d:1}, {c:1}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Simple findAndModify command returning the old document and
        // removing it at the same time
        collection.findAndRemove({b:1}, [['b', 1]], function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.value.b);
          test.equal(1, doc.value.d);

          // Verify that the document is gone
          collection.findOne({b:1}, function(err, item) {
            test.equal(null, err);
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
 * A simple query using findOne
 *
 * @example-class Collection
 * @example-method findOne
 * @ignore
 */
exports.shouldPeformASimpleLimitSkipFindOneQuery = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('simple_limit_skip_find_one_query');
      // Insert a bunch of documents for the testing
      collection.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.findOne({a:2}, {fields:{b:1}}, function(err, doc) {
          test.equal(null, err);
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
 * Example of a simple geoNear query across some documents
 *
 * @example-class Collection
 * @example-method geoNear
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoNearCommand = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      
      // Fetch the collection
      var collection = db.collection("simple_geo_near_command");
        
      // Add a location based index
      collection.ensureIndex({loc:"2d"}, function(err, result) {

        // Save a new location tagged document
        collection.insert([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax(), function(err, result) {
         
          // Use geoNear command to find document
          collection.geoNear(50, 50, {query:{a:1}, num:1}, function(err, docs) {
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
 * Example of a simple geoHaystackSearch query across some documents
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoHaystackSearchCommand = {
  metadata: { requires: { topology: ["single", "replset"] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      
      // Fetch the collection
      var collection = db.collection("simple_geo_haystack_command");
        
      // Add a location based index
      collection.ensureIndex({loc: "geoHaystack", type: 1}, {bucketSize: 1}, function(err, result) {

        // Save a new location tagged document
        collection.insert([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax(), function(err, result) {
         
          // Use geoNear command to find document
          collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100}, function(err, docs) {
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
 * A whole lot of different wayt to execute the group command
 *
 * @example-class Collection
 * @example-method group
 * @ignore
 */
exports.shouldCorrectlyExecuteGroupFunction = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection
      var collection = db.collection('test_group');

      // Peform a simple group by on an empty collection
      collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
        test.deepEqual([], results);

        // Trigger some inserts on the collection
        collection.insert([{'a':2}, {'b':5}, {'a':1}], {w:1}, function(err, ids) {

          // Perform a group count
          collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
            test.equal(3, results[0].count);

            // Pefrom a group count using the eval method
            collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", false, function(err, results) {
              test.equal(3, results[0].count);

              // Group with a conditional
              collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
                // Results
                test.equal(1, results[0].count);

                // Group with a conditional using the EVAL method
                collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }" , false, function(err, results) {
                  // Results
                  test.equal(1, results[0].count);

                  // Insert some more test data
                  collection.insert([{'a':2}, {'b':3}], {w:1}, function(err, ids) {

                    // Do a Group by field a
                    collection.group(['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
                      // Results
                      test.equal(2, results[0].a);
                      test.equal(2, results[0].count);
                      test.equal(null, results[1].a);
                      test.equal(2, results[1].count);
                      test.equal(1, results[2].a);
                      test.equal(1, results[2].count);

                      // Do a Group by field a
                      collection.group({'a':true}, {}, {"count":0}, function (obj, prev) { prev.count++; }, true, function(err, results) {
                        // Results
                        test.equal(2, results[0].a);
                        test.equal(2, results[0].count);
                        test.equal(null, results[1].a);
                        test.equal(2, results[1].count);
                        test.equal(1, results[2].a);
                        test.equal(1, results[2].count);

                        // Correctly handle illegal function
                        collection.group([], {}, {}, "5 ++ 5", function(err, results) {
                          test.ok(err.message != null);

                          // Use a function to select the keys used to group by
                          var keyf = function(doc) { return {a: doc.a}; };
                          collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true, function(err, results) {
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
                            collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true, function(err, results) {
                              // Results
                              results.sort(function(a, b) { return b.count - a.count; });
                              test.equal(2, results[0].count);
                              test.equal(2, results[0].a);
                              test.equal(4, results[0].value);
                              test.equal(1, results[1].count);
                              test.equal(1, results[1].a);
                              test.equal(1, results[1].value);

                              // Correctly handle illegal function when using the EVAL method
                              collection.group([], {}, {}, "5 ++ 5", false, function(err, results) {
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
 * A simple map reduce example
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldPerformSimpleMapReduceFunctions = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions');

      // Insert some documents to perform map reduce over
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {

        // Map function
        var map = function() { emit(this.user_id, 1); };
        // Reduce function
        var reduce = function(k,vals) { return 1; };

        // Peform the map reduce
        collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}}, function(err, collection) {
          test.equal(null, err);

          // Mapreduce returns the temporary collection with the results
          collection.findOne({'_id':1}, function(err, result) {
            test.equal(1, result.value);

            collection.findOne({'_id':2}, function(err, result) {
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
 * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldPerformMapReduceFunctionInline = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: '>1.7.6', topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_inline');

      // Insert some test documents
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {

        // Map function
        var map = function() { emit(this.user_id, 1); };
        // Reduce function
        var reduce = function(k,vals) { return 1; };

        // Execute map reduce and return results inline
        collection.mapReduce(map, reduce, {out : {inline: 1}, verbose:true}, function(err, results, stats) {
          test.equal(2, results.length);
          test.ok(stats != null);

          collection.mapReduce(map, reduce, {out : {replace: 'mapreduce_integration_test'}, verbose:true}, function(err, results, stats) {
            test.ok(stats != null);
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
 * Mapreduce different test with a provided scope containing a javascript function.
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldPerformMapReduceWithContext = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_scope');

      // Insert some test documents
      collection.insert([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1}, function(err, r) {

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

        collection.mapReduce(map, reduce, o, function(err, outCollection) {
          test.equal(null, err);

          // Find all entries in the map-reduce collection
          outCollection.find().toArray(function(err, results) {
            test.equal(null, err);
            test.equal(2, results[0].value)

            // mapReduce with scope containing plain function
            var o = {};
            o.scope =  { fn: t }
            o.out = { replace: 'replacethiscollection' }

            collection.mapReduce(map, reduce, o, function(err, outCollection) {
              test.equal(null, err);

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function(err, results) {
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
 * Mapreduce different test with a provided scope containing javascript objects with functions.
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldPerformMapReduceInContextObjects = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_scope_objects');

      // Insert some test documents
      collection.insert([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1}, function(err, r) {

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

        collection.mapReduce(map, reduce, o, function(err, outCollection) {
          test.equal(null, err);

          // Find all entries in the map-reduce collection
          outCollection.find().toArray(function(err, results) {
            test.equal(null, err);
            test.equal(2, results[0].value)

            // mapReduce with scope containing plain function
            var o = {};
            o.scope =  { obj: {fn: t} }
            o.out = { replace: 'replacethiscollection' }

            collection.mapReduce(map, reduce, o, function(err, outCollection) {
              test.equal(null, err);

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function(err, results) {
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
 * Example of retrieving a collections indexes
 *
 * @example-class Collection
 * @example-method indexes
 * @ignore
 */
exports.shouldCorrectlyRetriveACollectionsIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Crete the collection for the distinct example
      var collection = db.collection('simple_key_based_distinct');
      // Create a geo 2d index
      collection.ensureIndex({loc:"2d"}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Create a simple single field index
        collection.ensureIndex({a:1}, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          setTimeout(function() {
            // List all of the indexes on the collection
            collection.indexes(function(err, indexes) {
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
 * An example showing the use of the indexExists function for a single index name and a list of index names.
 *
 * @example-class Collection
 * @example-method indexExists
 * @ignore
 */
exports.shouldCorrectlyExecuteIndexExists = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Create a test collection that we are getting the options back from
      var collection = db.collection('test_collection_index_exists', configuration.writeConcernMax());
      test.equal(null, err);
      // Create an index on the collection
      collection.createIndex('a', configuration.writeConcernMax(), function(err, indexName) {
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
    // END
  }
}

/**
 * An example showing the information returned by indexInformation
 *
 * @example-class Collection
 * @example-method indexInformation
 * @ignore
 */
exports.shouldCorrectlyShowTheResultsFromIndexInformation = {
  metadata: {
    requires: { topology: ["single", "replicaset"] }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0, native_parser:false}, {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('more_index_information_test');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {

          // Fetch basic indexInformation for collection
          db.indexInformation('more_index_information_test', function(err, indexInformation) {
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
    // END
  }
}

/**
 * An examples showing the information returned by indexInformation
 *
 * @example-class Collection
 * @example-method indexInformation
 * @ignore
 */
exports.shouldCorrectlyShowAllTheResultsFromIndexInformation = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('more_index_information_test');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {
          test.equal(null, err);

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
    // END
  }
}

/**
 * A simple document insert example, not using safe mode to ensure document persistance on MongoDB
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafe = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      var collection = db.collection("simple_document_insert_collection_no_safe");
      // Insert a single document
      collection.insert({hello:'world_no_safe'});

      // Wait for a second before finishing up, to ensure we have written the item to disk
      setTimeout(function() {

        // Fetch the document
        collection.findOne({hello:'world_no_safe'}, function(err, item) {
          test.equal(null, err);
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
 * A batch document insert example, using safe mode to ensure document persistance on MongoDB
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformABatchDocumentInsertSafe = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Fetch a collection to insert document into
      var collection = db.collection("batch_document_insert_collection_safe");
      // Insert a single document
      collection.insert([{hello:'world_safe1'}
        , {hello:'world_safe2'}], configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Fetch the document
        collection.findOne({hello:'world_safe2'}, function(err, item) {
          test.equal(null, err);
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
 * Example of inserting a document containing functions
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafe = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Fetch a collection to insert document into
      var collection = db.collection("simple_document_insert_with_function_safe");

      var o = configuration.writeConcernMax();
      o.serializeFunctions = true;
      // Insert a single document
      collection.insert({hello:'world'
        , func:function() {}}, o, function(err, result) {
        test.equal(null, err);

        // Fetch the document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
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
 * Example of using keepGoing to allow batch insert to complete even when there are illegal documents in the batch
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports["Should correctly execute insert with keepGoing option on mongod >= 1.9.1"] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">1.9.1", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection
      var collection = db.collection('keepGoingExample');

      // Add an unique index to title to force errors in the batch insert
      collection.ensureIndex({title:1}, {unique:true}, function(err, indexName) {

        // Insert some intial data into the collection
        collection.insert([{name:"Jim"}
          , {name:"Sarah", title:"Princess"}], configuration.writeConcernMax(), function(err, result) {

          // Force keep going flag, ignoring unique index issue
          collection.insert([{name:"Jim"}
            , {name:"Sarah", title:"Princess"}
            , {name:'Gump', title:"Gump"}], {w:1, keepGoing:true}, function(err, result) {

            // Count the number of documents left (should not include the duplicates)
            collection.count(function(err, count) {
              test.equal(3, count);
              test.done();
            })
          });
        });
      });
    });
    // END
  }
}

/**
 * An example showing how to establish if it's a capped collection
 *
 * @example-class Collection
 * @example-method isCapped
 * @ignore
 */
exports.shouldCorrectlyExecuteIsCapped = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_is_capped', {'capped':true, 'size':1024}, function(err, collection) {
        test.equal('test_collection_is_capped', collection.collectionName);

        // Let's fetch the collection options
        collection.isCapped(function(err, capped) {
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
 * An example returning the options for a collection.
 *
 * @example-class Collection
 * @example-method options
 * @ignore
 */
exports.shouldCorrectlyRetriveCollectionOptions = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_options', {'capped':true, 'size':1024}, function(err, collection) {
        test.equal('test_collection_options', collection.collectionName);

        // Let's fetch the collection options
        collection.options(function(err, options) {
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
 * A parallelCollectionScan example
 *
 * @example-class Collection
 * @example-method parallelCollectionScan
 * @ignore
 */
exports['Should correctly execute parallelCollectionScan with multiple cursors'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.5.5", topology: ["single", "replicaset"] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      var docs = [];

      // Insert some documents
      for(var i = 0; i < 1000; i++) {
        docs.push({a:i});
      }

      // Get the collection
      var collection = db.collection('parallelCollectionScan');
      // Insert 1000 documents in a batch
      collection.insert(docs, function(err, result) {
        var results = [];
        var numCursors = 3;

        // Execute parallelCollectionScan command
        collection.parallelCollectionScan({numCursors:numCursors}, function(err, cursors) {
          test.equal(null, err);
          test.ok(cursors != null);
          test.ok(cursors.length > 0);

          for(var i = 0; i < cursors.length; i++) {
            cursors[i].toArray(function(err, items) {
              test.equal(err, null);

              // Add docs to results array
              results = results.concat(items);
              numCursors = numCursors - 1;

              // No more cursors let's ensure we got all results
              if(numCursors == 0) {
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
 * An example showing how to force a reindex of a collection.
 *
 * @example-class Collection
 * @example-method reIndex
 * @ignore
 */
exports.shouldCorrectlyIndexAndForceReindexOnCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.collection('shouldCorrectlyForceReindexOnCollection');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {

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
    // END
  }
}

/**
 * An example removing all documents in a collection not using safe mode
 *
 * @example-class Collection
 * @example-method remove
 * @ignore
 */
exports.shouldRemoveAllDocumentsNoSafe = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      
      // Fetch a collection to insert document into
      var collection = db.collection("remove_all_documents_no_safe");        
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:2}], {w:1}, function(err, result) {
        test.equal(null, err);
        
        // Remove all the document
        collection.remove();
        
        // Fetch all results
        collection.find().toArray(function(err, items) {
          test.equal(null, err);
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
 * An example removing a subset of documents using safe mode to ensure removal of documents
 *
 * @example-class Collection
 * @example-method remove
 * @ignore
 */
exports.shouldRemoveSubsetOfDocumentsSafeMode = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      test.equal(null, err);
      
      // Fetch a collection to insert document into
      var collection = db.collection("remove_subset_of_documents_safe");
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:2}], {w:1}, function(err, result) {
        test.equal(null, err);
        
        // Remove all the document
        collection.remove({a:1}, {w:1}, function(err, r) {
          test.equal(null, err);
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
 * An example of illegal and legal renaming of a collection
 *
 * @example-class Collection
 * @example-method rename
 * @ignore
 */
exports.shouldCorrectlyRenameCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {
      // Open a couple of collections
      var collection1 = db.collection('test_rename_collection');
      var collection2 = db.collection('test_rename_collection2');

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
      collection1.insert([{'x':1}, {'x':2}], configuration.writeConcernMax(), function(err, docs) {

        // Attemp to rename the first collection to the second one, this will fail
        collection1.rename('test_rename_collection2', function(err, collection) {
          test.ok(err instanceof Error);
          test.ok(err.message.length > 0);

          // Attemp to rename the first collection to a name that does not exist
          // this will be succesful
          collection1.rename('test_rename_collection3', function(err, collection) {
            test.equal("test_rename_collection3", collection.collectionName);

            // Ensure that the collection is pointing to the new one
            collection1.count(function(err, count) {
              test.equal(2, count);
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
 * Example of a simple document save with safe set to false
 *
 * @example-class Collection
 * @example-method save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Fetch the collection
      var collection = db.collection("save_a_simple_document");
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
      }, 2000);
    });
    // END
  }
}

/**
 * Example of a simple document save and then resave with safe set to true
 *
 * @example-class Collection
 * @example-method save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentModifyItAndResaveIt = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Fetch the collection
      var collection = db.collection("save_a_simple_document_modify_it_and_resave_it");

      // Save a document with no safe option
      collection.save({hello:'world'}, configuration.writeConcernMax(), function(err, result) {

        // Find the saved document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
          test.equal('world', item.hello);

          // Update the document
          item['hello2'] = 'world2';

          // Save the item with the additional field
          collection.save(item, configuration.writeConcernMax(), function(err, result) {

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
    // END
  }
}

/**
 * Example of a simple document update with safe set to false on an existing document
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpdateASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Get a collection
      var collection = db.collection('update_a_simple_document');

      // Insert a document, then update it
      collection.insert({a:1}, configuration.writeConcernMax(), function(err, doc) {

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
      });
    });
    // END
  }
}

/**
 * Example of a simple document update using upsert (the document will be inserted if it does not exist)
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpsertASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Get a collection
      var collection = db.collection('update_a_simple_document_upsert');
      // Update the document using an upsert operation, ensuring creation if it does not exist
      collection.update({a:1}, {b:2, a:1}, {upsert:true, w: 1}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result.result.n);

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
    // END
  }
}

/**
 * Example of an update across multiple documents using the multi option.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpdateMultipleDocuments = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Get a collection
      var collection = db.collection('update_a_simple_document_multi');

      // Insert a couple of documentations
      collection.insert([{a:1, b:1}, {a:1, b:2}], configuration.writeConcernMax(), function(err, result) {

        var o = configuration.writeConcernMax();
        o.multi = true
        // Update multiple documents using the multi option
        collection.update({a:1}, {$set:{b:0}}, o, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

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
    // END
  }
}

/**
 * Example of retrieving a collections stats
 *
 * @example-class Collection
 * @example-method stats
 * @ignore
 */
exports.shouldCorrectlyReturnACollectionsStats = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      var collection = db.collection('collection_stats_test');

      // Insert some documents
      collection.insert([{a:1}, {hello:'world'}], configuration.writeConcernMax(), function(err, result) {

        // Retrieve the statistics for the collection
        collection.stats(function(err, stats) {
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
 * An examples showing the creation and dropping of an index
 *
 * @example-class Collection
 * @example-method dropIndexes
 * @ignore
 */
exports.shouldCorrectlyCreateAndDropAllIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});

    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // BEGIN
    db.open(function(err, db) {

      // Create a collection we want to drop later
      var collection = db.createCollection('shouldCorrectlyCreateAndDropAllIndex');
      // Insert a bunch of documents for the index
      collection.insert([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Create an index on the a field
        collection.ensureIndex({a:1, b:1}
          , {unique:true, background:true, w:1}, function(err, indexName) {

          // Create an additional index
          collection.ensureIndex({c:1}
            , {unique:true, background:true, w:1}, function(err, indexName) {

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
    // END
  }
}
