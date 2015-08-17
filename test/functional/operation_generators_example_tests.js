"use strict";

var f = require('util').format;

/**************************************************************************
 *
 * COLLECTION TESTS
 *
 *************************************************************************/

/**
 * Call toArray on an aggregation cursor using ES6 generators and the co module
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample2WithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, mongodb:">2.1.0", topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
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
      var collection = db.collection('aggregationExample2_with_generatorsGenerator');

      // Insert the docs
      yield collection.insertMany(docs, {w: 1});

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
      var docs = yield cursor.toArray();
      test.equal(2, docs.length);
      test.done();
      db.close();
    });
    // END
  }
}

/**
 * Call next on an aggregation cursor using a Generator and the co module
 *
 * @example-class AggregationCursor
 * @example-method next
 * @ignore
 */
exports['Aggregation Cursor next Test with Generators'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, mongodb:">2.1.0", topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
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
      var collection = db.collection('aggregation_next_example_with_generatorsGenerator');

      // Insert the docs
      yield collection.insertMany(docs, {w: 1});

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
      var doc = yield cursor.next();
      test.done();
      db.close();
    });
    // END
  }
}

/**
 * Example of running simple count commands against a collection using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method count
 * @ignore
 */
exports.shouldCorrectlyDoSimpleCountExamplesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Crete the collection for the distinct example
      var collection = db.collection('countExample1_with_generators');
      // Insert documents to perform distinct against
      var result = yield collection.insertMany([{a:1}, {a:2}
        , {a:3}, {a:4, b:1}], {w: 1});
      // Perform a total count command
      var count = yield collection.count();
      test.equal(4, count);

      // Peform a partial account where b=1
      var count = yield collection.count({b:1});
      test.equal(1, count);

      // Close database
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A more complex createIndex using a Generator and the co module and a compound unique index in the background and dropping duplicated documents
 *
 * @example-class Collection
 * @example-method createIndex
 * @ignore
 */
exports.shouldCreateComplexIndexOnTwoFieldsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a collection we want to drop later
      var collection = db.collection('createIndexExample1_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax());

      // Create an index on the a field
      yield collection.createIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Show that duplicate records got dropped
      var items = yield collection.find({}).toArray();
      test.equal(4, items.length);

      // Peform a query, with explain to show we hit the query
      var explanation = yield collection.find({a:2}, {explain:true}).toArray()
      test.ok(explanation != null);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of running the distinct command using a Generator and the co module against a collection
 *
 * @example-class Collection
 * @example-method distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Crete the collection for the distinct example
      var collection = db.collection('distinctExample1_with_generators');

      // Insert documents to perform distinct against
      yield collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax());

      // Peform a distinct query against the a field
      var docs = yield collection.distinct('a');
      test.deepEqual([0, 1, 2, 3], docs.sort());

      // Perform a distinct query against the sub-field b.c
      var docs = yield collection.distinct('b.c');
      test.deepEqual(['a', 'b', 'c'], docs.sort());

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of running the distinct command against a collection using a Generator and the co module with a filter query
 *
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Crete the collection for the distinct example
      var collection = db.collection('distinctExample2_with_generators');

      // Insert documents to perform distinct against
      yield collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}, {a:5, c:1}], configuration.writeConcernMax());

      // Peform a distinct query with a filter against the documents
      var docs = yield collection.distinct('a', {c:1});
      test.deepEqual([5], docs.sort());

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of Collection.prototype.drop using a Generator and the co module
 *
 * @example-class Collection
 * @example-method drop
 * @ignore
 */
exports.shouldCorrectlyDropCollectionWithDropFunctionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = yield db.createCollection('test_other_drop_with_generators');

      // Drop the collection
      yield collection.drop();

      // Ensure we don't have the collection in the set of names
      var replies = yield db.listCollections().toArray();

      // Did we find the collection
      var found = false;
      // For each collection in the list of collection names in this db look for the
      // dropped collection
      replies.forEach(function(document) {
        if(document.name == "test_other_drop_with_generators") {
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
    // END
  }
}


/**
 * Example of a how to drop all the indexes on a collection using dropAllIndexes with a Generator and the co module
 *
 * @example-class Collection
 * @example-method dropAllIndexes
 * @ignore
 */
exports.dropAllIndexesExample1WithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      yield db.createCollection('dropExample1_with_generators');
      // Drop the collection
      yield db.collection('dropExample1_with_generators').dropAllIndexes();
      // Let's close the db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An examples showing the creation and dropping of an index using a Generator and the co module
 *
 * @example-class Collection
 * @example-method dropIndex
 * @ignore
 */
exports.shouldCorrectlyCreateAndDropIndexWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection('dropIndexExample1_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1});

      // Create an index on the a field
      yield collection.ensureIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Drop the index
      yield collection.dropIndex("a_1_b_1");

      // Verify that the index is gone
      var indexInformation = yield collection.indexInformation()
      test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
      test.equal(null, indexInformation.a_1_b_1);

      // Close db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method ensureIndex
 * @ignore
 */
exports.shouldCreateComplexEnsureIndexWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection('ensureIndexExample1_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax());

      // Create an index on the a field
      yield db.ensureIndex('ensureIndexExample1_with_generators', {a:1, b:1}
        , {unique:true, background:true, w:1});

      // Show that duplicate records got dropped
      var items = yield collection.find({}).toArray();
      test.equal(4, items.length);

      // Peform a query, with explain to show we hit the query
      var explanation = yield collection.find({a:2}, {explain:true}).toArray();
      test.ok(explanation != null);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method ensureIndex
 * @ignore
 */
exports.ensureIndexExampleWithCompountIndexWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection('ensureIndexExample2_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1});

      // Create an index on the a field
      yield collection.ensureIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Show that duplicate records got dropped
      var items = yield collection.find({}).toArray();
      test.equal(4, items.length);

      // Peform a query, with explain to show we hit the query
      var explanation = yield collection.find({a:2}, {explain:true}).toArray();
      test.ok(explanation != null);

      // Close db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple query using the find method and toArray method with a Generator and the co module.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleQueryWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_query_with_generators');

      // Insert a bunch of documents for the testing
      yield collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax());

      // Peform a simple find and return all the documents
      var docs = yield collection.find().toArray();
      test.equal(3, docs.length);

      // Close the db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple query showing the explain for a query using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleExplainQueryWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_explain_query_with_generators');
      // Insert a bunch of documents for the testing
      yield collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax());

      // Peform a simple find and return all the documents
      var docs = yield collection.find({}, {explain:true}).toArray();
      test.equal(1, docs.length);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple query showing skip and limit using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method find
 * @ignore
 */
exports.shouldPeformASimpleLimitSkipQueryWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_limit_skip_query_with_generators');
      // Insert a bunch of documents for the testing
      yield collection.insertMany([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], configuration.writeConcernMax());

      // Peform a simple find and return all the documents
      var docs = yield collection.find({}, {skip:1, limit:1, fields:{b:1}}).toArray();
      test.equal(1, docs.length);
      test.equal(null, docs[0].a);
      test.equal(2, docs[0].b);

      // Close db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A whole set of different ways to use the findAndModify command with a Generator and the co module..
 *
 * The first findAndModify command modifies a document and returns the modified document back.
 * The second findAndModify command removes the document.
 * The second findAndModify command upserts a document and returns the new document.
 *
 * @example-class Collection
 * @example-method findAndModify
 * @ignore
 */
exports.shouldPerformSimpleFindAndModifyOperationsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a collection we want to drop later
      var collection = db.collection('simple_find_and_modify_operations_with_generators');
      // Insert some test documentations
      yield collection.insertMany([{a:1}, {b:1}, {c:1}], configuration.writeConcernMax());

      // Simple findAndModify command returning the new document
      var doc = yield collection.findAndModify({a:1}, [['a', 1]], {$set:{b1:1}}, {new:true});
      test.equal(1, doc.value.a);
      test.equal(1, doc.value.b1);

      // Simple findAndModify command returning the new document and
      // removing it at the same time
      var doc = yield collection.findAndModify({b:1}, [['b', 1]],
        {$set:{b:2}}, {remove:true});

      // Verify that the document is gone
      var item = yield collection.findOne({b:1});
      test.equal(null, item);

      // Simple findAndModify command performing an upsert and returning the new document
      // executing the command safely
      var doc = yield collection.findAndModify({d:1}, [['b', 1]],
        {d:1, f:1}, {new:true, upsert:true, w:1});
      test.equal(1, doc.value.d);
      test.equal(1, doc.value.f);

      // Close the db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of using findAndRemove using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method findAndRemove
 * @ignore
 */
exports.shouldPerformSimpleFindAndRemoveWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_find_and_modify_operations_2_with_generators');
      // Insert some test documentations
      yield collection.insertMany([{a:1}, {b:1, d:1}, {c:1}], configuration.writeConcernMax());

      // Simple findAndModify command returning the old document and
      // removing it at the same time
      var doc = yield collection.findAndRemove({b:1}, [['b', 1]]);
      test.equal(1, doc.value.b);
      test.equal(1, doc.value.d);

      // Verify that the document is gone
      var item = yield collection.findOne({b:1});
      test.equal(null, item);

      // Db close
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple query using findOne with a Generator and the co module.
 *
 * @example-class Collection
 * @example-method findOne
 * @ignore
 */
exports.shouldPeformASimpleLimitSkipFindOneQueryWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('simple_limit_skip_find_one_query_with_generators');

      // Insert a bunch of documents for the testing
      yield collection.insertMany([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], configuration.writeConcernMax());

      // Peform a simple find and return all the documents
      var doc = yield collection.findOne({a:2}, {fields:{b:1}});
      test.equal(null, doc.a);
      test.equal(2, doc.b);

      // Db close
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple geoNear query across some documents using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method geoNear
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoNearCommandWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("simple_geo_near_command_with_generators");

      // Add a location based index
      yield collection.ensureIndex({loc:"2d"});

      // Save a new location tagged document
      yield collection.insertMany([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax());

      // Use geoNear command to find document
      var docs = yield collection.geoNear(50, 50, {query:{a:1}, num:1});
      test.equal(1, docs.results.length);

      // Close db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple geoHaystackSearch query across some documents using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method geoHaystackSearch
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoHaystackSearchCommandWithGenerators = {
  metadata: { requires: { generators:true, topology: ["single", "replicaset"] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("simple_geo_haystack_command_with_generators");

      // Add a location based index
      yield collection.ensureIndex({loc: "geoHaystack", type: 1}, {bucketSize: 1});

      // Save a new location tagged document
      yield collection.insertMany([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax());

      // Use geoNear command to find document
      var docs = yield collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100});
      test.equal(1, docs.results.length);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A whole lot of different ways to execute the group command using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method group
 * @ignore
 */
exports.shouldCorrectlyExecuteGroupFunctionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      Code = configuration.require.Code;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   Code = require('mongodb').Code;
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_group_with_generators');

      // Peform a simple group by on an empty collection
      var results = yield collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }");
      test.deepEqual([], results);

      // Trigger some inserts on the collection
      yield collection.insertMany([{'a':2}, {'b':5}, {'a':1}], {w:1});

      // Perform a group count
      var results = yield collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }");
      test.equal(3, results[0].count);

      // Pefrom a group count using the eval method
      var results = yield collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", false);
      test.equal(3, results[0].count);

      // Group with a conditional
      var results = yield collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }");
      // Results
      test.equal(1, results[0].count);

      // Group with a conditional using the EVAL method
      var results = yield collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }" , false);
      // Results
      test.equal(1, results[0].count);

      // Insert some more test data
      yield collection.insertMany([{'a':2}, {'b':3}], {w:1});

      // Do a Group by field a
      var results = yield collection.group(['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }");
      // Results
      test.equal(2, results[0].a);
      test.equal(2, results[0].count);
      test.equal(null, results[1].a);
      test.equal(2, results[1].count);
      test.equal(1, results[2].a);
      test.equal(1, results[2].count);

      // Do a Group by field a
      var results = yield collection.group({'a':true}, {}, {"count":0}, function (obj, prev) { prev.count++; }, true);
      // Results
      test.equal(2, results[0].a);
      test.equal(2, results[0].count);
      test.equal(null, results[1].a);
      test.equal(2, results[1].count);
      test.equal(1, results[2].a);
      test.equal(1, results[2].count);

      try {
        // Correctly handle illegal function
        var results = yield collection.group([], {}, {}, "5 ++ 5")
      } catch(err) {
        test.ok(err.message != null);

        // Use a function to select the keys used to group by
        var keyf = function(doc) { return {a: doc.a}; };
        var results = yield collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true);
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
        var results = yield collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true);
        // Results
        results.sort(function(a, b) { return b.count - a.count; });
        test.equal(2, results[0].count);
        test.equal(2, results[0].a);
        test.equal(4, results[0].value);
        test.equal(1, results[1].count);
        test.equal(1, results[1].a);
        test.equal(1, results[1].value);

        try {
          yield collection.group([], {}, {}, "5 ++ 5", false);
        } catch(err) {
          test.ok(err.message != null);

          db.close();
          test.done();
        }
      };
    });
    // END
  }
}

/**
 * A simple map reduce example using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformSimpleMapReduceFunctionsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_with_generators');

      // Insert some documents to perform map reduce over
      yield collection.insertMany([{'user_id':1}, {'user_id':2}], {w:1});

      // Map function
      var map = function() { emit(this.user_id, 1); };
      // Reduce function
      var reduce = function(k,vals) { return 1; };

      // Peform the map reduce
      var collection = yield collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}});

      // Mapreduce returns the temporary collection with the results
      var result = yield collection.findOne({'_id':1});
      test.equal(1, result.value);
      var result = yield collection.findOne({'_id':2});
      test.equal(1, result.value);

      // Db close
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformMapReduceFunctionInlineWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, mongodb: '>1.7.6', topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_inline_with_generators');

      // Insert some test documents
      yield collection.insertMany([{'user_id':1}, {'user_id':2}], {w:1});

      // Map function
      var map = function() { emit(this.user_id, 1); };
      // Reduce function
      var reduce = function(k,vals) { return 1; };

      // Execute map reduce and return results inline
      var result = yield collection.mapReduce(map, reduce, {out : {inline: 1}, verbose:true});
      test.equal(2, result.results.length);
      test.ok(result.stats != null);

      var result = yield collection.mapReduce(map, reduce, {out : {replace: 'mapreduce_integration_test'}, verbose:true});
      test.ok(result.stats != null);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Mapreduce using a provided scope containing a javascript function executed using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformMapReduceWithContextWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co')
      , Code = configuration.require.Code;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_scope_with_generators');

      // Insert some test documents
      yield collection.insertMany([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1});

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

      // Execute with output collection
      var outCollection = yield collection.mapReduce(map, reduce, o);
      // Find all entries in the map-reduce collection
      var results = yield outCollection.find().toArray()
      test.equal(2, results[0].value);

      // mapReduce with scope containing plain function
      var o = {};
      o.scope =  { fn: t }
      o.out = { replace: 'replacethiscollection' }

      // Execute with outCollection
      var outCollection = yield collection.mapReduce(map, reduce, o);
      // Find all entries in the map-reduce collection
      var results = yield outCollection.find().toArray();
      test.equal(2, results[0].value)

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Mapreduce using a scope containing javascript objects with functions using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method mapReduce
 * @ignore
 */
exports.shouldPerformMapReduceInContextObjectsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      Code = configuration.require.Code;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection
      var collection = db.collection('test_map_reduce_functions_scope_objects_with_generators');

      // Insert some test documents
      yield collection.insertMany([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1});

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

      // Execute returning outCollection
      var outCollection = yield collection.mapReduce(map, reduce, o);

      // Find all entries in the map-reduce collection
      var results = yield outCollection.find().toArray();
      test.equal(2, results[0].value)

      // mapReduce with scope containing plain function
      var o = {};
      o.scope =  { obj: {fn: t} }
      o.out = { replace: 'replacethiscollection' }

      // Execute returning outCollection
      var outCollection = yield collection.mapReduce(map, reduce, o);
      // Find all entries in the map-reduce collection
      var results = yield outCollection.find().toArray();
      test.equal(2, results[0].value)
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of retrieving a collections indexes using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method indexes
 * @ignore
 */
exports.shouldCorrectlyRetriveACollectionsIndexesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Crete the collection for the distinct example
      var collection = db.collection('simple_key_based_distinct_with_generators');

      // Create a geo 2d index
      yield collection.ensureIndex({loc:"2d"}, configuration.writeConcernMax());

      // Create a simple single field index
      yield collection.ensureIndex({a:1}, configuration.writeConcernMax());

      setTimeout(function() {
        co(function*() {
          // List all of the indexes on the collection
          var indexes = yield collection.indexes()
          test.equal(3, indexes.length);

          db.close();
          test.done();
        });
      }, 1000);
    });
    // END
  }
}

/**
 * An example showing the use of the indexExists function using a Generator and the co module for a single index name and a list of index names.
 *
 * @example-class Collection
 * @example-method indexExists
 * @ignore
 */
exports.shouldCorrectlyExecuteIndexExistsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a test collection that we are getting the options back from
      var collection = db.collection('test_collection_index_exists_with_generators', configuration.writeConcernMax());
      // Create an index on the collection
      yield collection.createIndex('a', configuration.writeConcernMax());

      // Let's test to check if a single index exists
      var result = yield collection.indexExists("a_1");
      test.equal(true, result);

      // Let's test to check if multiple indexes are available
      var result = yield collection.indexExists(["a_1", "_id_"]);
      test.equal(true, result);

      // Check if a non existing index exists
      var result = yield collection.indexExists("c_1");
      test.equal(false, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example showing the information returned by indexInformation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method indexInformation
 * @ignore
 */
exports.shouldCorrectlyShowTheResultsFromIndexInformationWithGenerators = {
  metadata: {
    requires: { generators:true, topology: ["single", "replicaset"] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_index_information_test_2_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax());

      // Create an index on the a field
      yield collection.ensureIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Fetch basic indexInformation for collection
      var indexInformation = yield db.indexInformation('more_index_information_test_2_with_generators');
      test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
      test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

      // Fetch full index information
      var indexInformation = yield collection.indexInformation({full:true});
      test.deepEqual({ _id: 1 }, indexInformation[0].key);
      test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

      // Close db
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An examples showing the information returned by indexInformation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method indexInformation
 * @ignore
 */
exports.shouldCorrectlyShowAllTheResultsFromIndexInformationWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_index_information_test_3_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], {w:1});

      // Create an index on the a field
      yield collection.ensureIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Fetch basic indexInformation for collection
      var indexInformation = yield collection.indexInformation();
      test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
      test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

      // Fetch full index information
      var indexInformation = yield collection.indexInformation({full:true});
      test.deepEqual({ _id: 1 }, indexInformation[0].key);
      test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple document insert using a Generator and the co module example, not using safe mode to ensure document persistance on MongoDB
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },
  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var collection = db.collection("simple_document_insert_collection_no_safe_with_generators");
      // Insert a single document
      collection.insertOne({hello:'world_no_safe'});

      // Wait for a second before finishing up, to ensure we have written the item to disk
      setTimeout(function() {
        co(function*() {
          // Fetch the document
          var item = yield collection.findOne({hello:'world_no_safe'});
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
 * A batch document insert using a Generator and the co module example, using safe mode to ensure document persistance on MongoDB
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformABatchDocumentInsertSafeWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Fetch a collection to insert document into
      var collection = db.collection("batch_document_insert_collection_safe_with_generators");

      // Insert a single document
      yield collection.insertMany([{hello:'world_safe1'}
        , {hello:'world_safe2'}], configuration.writeConcernMax());

      // Fetch the document
      var item = yield collection.findOne({hello:'world_safe2'});
      test.equal('world_safe2', item.hello);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of inserting a document containing functions using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Fetch a collection to insert document into
      var collection = db.collection("simple_document_insert_with_function_safe_with_generators");

      // Get the option
      var o = configuration.writeConcernMax();
      o.serializeFunctions = true;

      // Insert a single document
      yield collection.insertOne({hello:'world', func:function() {}}, o);

      // Fetch the document
      var item = yield collection.findOne({hello:'world'});
      test.ok("function() {}", item.code);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of using keepGoing to allow batch insert using a Generator and the co module to complete even when there are illegal documents in the batch
 *
 * @example-class Collection
 * @example-method insert
 * @ignore
 */
exports["Should correctly execute insert with keepGoing option on mongod >= 1.9.1 with Generators"] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, mongodb:">1.9.1", topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('keepGoingExample_with_generators');

      // Add an unique index to title to force errors in the batch insert
      yield collection.ensureIndex({title:1}, {unique:true});

      // Insert some intial data into the collection
      yield collection.insertMany([{name:"Jim"}
        , {name:"Sarah", title:"Princess"}], configuration.writeConcernMax());

      try {
        // Force keep going flag, ignoring unique index issue
        yield collection.insert([{name:"Jim"}
          , {name:"Sarah", title:"Princess"}
          , {name:'Gump', title:"Gump"}], {w:1, keepGoing:true});
      } catch(err) {}
      // Count the number of documents left (should not include the duplicates)
      var count = yield collection.count();
      test.equal(3, count);
      test.done();
    }).catch(function(err) {
      console.log(err.stack)
    });
    // END
  }
}

/**
 * An example showing how to establish if it's a capped collection using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method isCapped
 * @ignore
 */
exports.shouldCorrectlyExecuteIsCappedWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection that we are getting the options back from
      var collection = yield db.createCollection('test_collection_is_capped_with_generators', {'capped':true, 'size':1024});
      test.equal('test_collection_is_capped_with_generators', collection.collectionName);

      // Let's fetch the collection options
      var capped = yield collection.isCapped();
      test.equal(true, capped);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example returning the options for a collection using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method options
 * @ignore
 */
exports.shouldCorrectlyRetriveCollectionOptionsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a test collection that we are getting the options back from
      var collection = yield db.createCollection('test_collection_options_with_generators', {'capped':true, 'size':1024});
      test.equal('test_collection_options_with_generators', collection.collectionName);

      // Let's fetch the collection options
      var options = yield collection.options();
      test.equal(true, options.capped);
      test.ok(options.size >= 1024);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A parallelCollectionScan example using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method parallelCollectionScan
 * @ignore
 */
exports['Should correctly execute parallelCollectionScan with multiple cursors with Generators'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, mongodb: ">2.5.5", topology: ["single", "replicaset"] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var docs = [];

      // Insert some documents
      for(var i = 0; i < 1000; i++) {
        docs.push({a:i});
      }

      // Get the collection
      var collection = db.collection('parallelCollectionScan_with_generators');
      // Insert 1000 documents in a batch
      yield collection.insertMany(docs);
      var results = [];
      var numCursors = 3;

      // Execute parallelCollectionScan command
      var cursors = yield collection.parallelCollectionScan({numCursors:numCursors});
      test.ok(cursors != null);
      test.ok(cursors.length >= 0);

      for(var i = 0; i < cursors.length; i++) {
        var items = yield cursors[i].toArray();
        // Add docs to results array
        results = results.concat(items);
      }

      test.equal(docs.length, results.length);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example showing how to force a reindex of a collection using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method reIndex
 * @ignore
 */
exports.shouldCorrectlyIndexAndForceReindexOnCollectionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('shouldCorrectlyForceReindexOnCollection_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {w:1});

      // Create an index on the a field
      yield collection.ensureIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Force a reindex of the collection
      var result = yield collection.reIndex();
      test.equal(true, result);

      // Verify that the index is gone
      var indexInformation = yield collection.indexInformation();
      test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
      test.deepEqual([ [ 'a', 1 ], [ 'b', 1 ] ], indexInformation.a_1_b_1);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example removing all documents in a collection not using safe mode using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method remove
 * @ignore
 */
exports.shouldRemoveAllDocumentsNoSafeWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch a collection to insert document into
      var collection = db.collection("remove_all_documents_no_safe_with_generators");

      // Insert a bunch of documents
      yield collection.insertMany([{a:1}, {b:2}], {w:1});

      // Remove all the document
      collection.removeMany();

      // Fetch all results
      var items = yield collection.find().toArray();
      test.equal(0, items.length);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example removing a subset of documents using safe mode to ensure removal of documents using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method remove
 * @ignore
 */
exports.shouldRemoveSubsetOfDocumentsSafeModeWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch a collection to insert document into
      var collection = db.collection("remove_subset_of_documents_safe_with_generators");
      // Insert a bunch of documents
      yield collection.insertMany([{a:1}, {b:2}], {w:1});
      // Remove all the document
      var r = yield collection.removeOne({a:1}, {w:1});
      test.equal(1, r.result.n);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of illegal and legal renaming of a collection using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method rename
 * @ignore
 */
exports.shouldCorrectlyRenameCollectionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Open a couple of collections
      var collection1 = yield db.createCollection('test_rename_collection_with_generators');
      var collection2 = yield db.createCollection('test_rename_collection2_with_generators');
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
      yield collection1.insertMany([{'x':1}, {'x':2}], configuration.writeConcernMax());

      try {
        // Attemp to rename the first collection to the second one, this will fail
        yield collection1.rename('test_rename_collection2_with_generators');
      } catch(err) {
        test.ok(err instanceof Error);
        test.ok(err.message.length > 0);

        // Attemp to rename the first collection to a name that does not exist
        // this will be succesful
        var collection2 = yield collection1.rename('test_rename_collection3_with_generators');
        test.equal("test_rename_collection3_with_generators", collection2.collectionName);

        // Ensure that the collection is pointing to the new one
        var count = yield collection2.count();
        test.equal(2, count);
        db.close();
        test.done();
      }
    });
    // END
  }
}

/**
 * Example of a simple document save with safe set to false using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("save_a_simple_document_with_generators");
      // Save a document with no safe option
      collection.save({hello:'world'});

      // Wait for a second
      setTimeout(function() {
        co(function*() {
          // Find the saved document
          var item = yield collection.findOne({hello:'world'});
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
 * Example of a simple document save and then resave with safe set to true using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentModifyItAndResaveItWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch the collection
      var collection = db.collection("save_a_simple_document_modify_it_and_resave_it_with_generators");

      // Save a document with no safe option
      yield collection.save({hello:'world'}, configuration.writeConcernMax());

      // Find the saved document
      var item = yield collection.findOne({hello:'world'})
      test.equal('world', item.hello);

      // Update the document
      item['hello2'] = 'world2';

      // Save the item with the additional field
      yield collection.save(item, configuration.writeConcernMax());

      // Find the changed document
      var item = yield collection.findOne({hello:'world'});
      test.equal('world', item.hello);
      test.equal('world2', item.hello2);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple document update with safe set to false on an existing document using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpdateASimpleDocumentWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Get a collection
      var collection = db.collection('update_a_simple_document_with_generators');

      // Insert a document, then update it
      yield collection.insertOne({a:1}, configuration.writeConcernMax());

      // Update the document with an atomic operator
      collection.updateOne({a:1}, {$set:{b:2}});

      // Wait for a second then fetch the document
      setTimeout(function() {
        co(function*() {
          // Fetch the document that we modified
          var item = yield collection.findOne({a:1});
          test.equal(1, item.a);
          test.equal(2, item.b);

          db.close();
          test.done();
        });
      }, 1000);
    });
    // END
  }
}

/**
 * Example of a simple document update using upsert (the document will be inserted if it does not exist) using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpsertASimpleDocumentWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Get a collection
      var collection = db.collection('update_a_simple_document_upsert_with_generators');
      // Update the document using an upsert operation, ensuring creation if it does not exist
      var result = yield collection.updateOne({a:1}, {b:2, a:1}, {upsert:true, w: 1});
      test.equal(1, result.result.n);

      // Fetch the document that we modified and check if it got inserted correctly
      var item = yield collection.findOne({a:1});
      test.equal(1, item.a);
      test.equal(2, item.b);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of an update across multiple documents using the multi option and using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method update
 * @ignore
 */
exports.shouldCorrectlyUpdateMultipleDocumentsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Get a collection
      var collection = db.collection('update_a_simple_document_multi_with_generators');

      // Insert a couple of documentations
      yield collection.insertMany([{a:1, b:1}, {a:1, b:2}], configuration.writeConcernMax());

      var o = configuration.writeConcernMax();
      o.multi = true

      // Update multiple documents using the multi option
      var r = yield collection.updateMany({a:1}, {$set:{b:0}}, o);
      test.equal(2, r.result.n);

      // Fetch all the documents and verify that we have changed the b value
      var items = yield collection.find().toArray();
      test.equal(1, items[0].a);
      test.equal(0, items[0].b);
      test.equal(1, items[1].a);
      test.equal(0, items[1].b);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of retrieving a collections stats using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method stats
 * @ignore
 */
exports.shouldCorrectlyReturnACollectionsStatsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Crete the collection for the distinct example
      var collection = db.collection('collection_stats_test_with_generators');

      // Insert some documents
      yield collection.insertMany([{a:1}, {hello:'world'}], configuration.writeConcernMax());

      // Retrieve the statistics for the collection
      var stats = yield collection.stats();
      test.equal(2, stats.count);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An examples showing the creation and dropping of an index using Generators.
 *
 * @example-class Collection
 * @example-method dropIndexes
 * @ignore
 */
exports.shouldCorrectlyCreateAndDropAllIndexWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('shouldCorrectlyCreateAndDropAllIndex_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4, c:4}], {w:1});

      // Create an index on the a field
      yield collection.ensureIndex({a:1, b:1}
        , {unique:true, background:true, w:1});

      // Create an additional index
      yield collection.ensureIndex({c:1}
        , {unique:true, background:true, sparse:true, w:1});

      // Drop the index
      yield collection.dropAllIndexes();

      // Verify that the index is gone
      var indexInformation = yield collection.indexInformation();
      test.deepEqual([ [ '_id', 1 ] ], indexInformation._id_);
      test.equal(null, indexInformation.a_1_b_1);
      test.equal(null, indexInformation.c_1);

      db.close();
      test.done();
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
 * An example that shows how to force close a db connection so it cannot be reused using a Generator and the co module..
 *
 * @example-class Db
 * @example-method close
 * @ignore
 */
exports.shouldCorrectlyFailOnRetryDueToAppCloseOfDbWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Fetch a collection
      var collection = db.collection('shouldCorrectlyFailOnRetryDueToAppCloseOfDb_with_generators');
      // Insert a document
      yield collection.insertOne({a:1}, configuration.writeConcernMax());

      // Force close the connection
      yield db.close(true)

      try {
        // Attemp to insert should fail now with correct message 'db closed by application'
        yield collection.insertOne({a:2}, configuration.writeConcernMax());
      } catch(err) {
        db.close();
        test.done();
      }
    });
    // END
  }
}

/**
 * A whole bunch of examples on how to use eval on the server with a Generator and the co module.
 *
 * @example-class Db
 * @example-method eval
 * @ignore
 */
exports.shouldCorrectlyExecuteEvalFunctionsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      Code = configuration.require.Code,
      ReadPreference = configuration.require.ReadPreference;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
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
      var result = yield db.eval('function (x) {return x;}', [3]);
      test.equal(3, result); tests_done();

      // Evaluate a function on the server with the parameter 3 passed in no lock aquired for eval
      // on server
      var result = yield db.eval('function (x) {return x;}', [3], {nolock:true})
      test.equal(3, result); tests_done();

      // Evaluate a function on the server that writes to a server collection
      var result = yield db.eval('function (x) {db.test_eval_with_generators.save({y:x});}', [5], {readPreference: ReadPreference.PRIMARY});
      setTimeout(function() {
        co(function*() {
          // Locate the entry
          var collection = db.collection('test_eval_with_generators');
          var item = yield collection.findOne();
          test.equal(5, item.y); tests_done();

          // Evaluate a function with 2 parameters passed in
          var result = yield db.eval('function (x, y) {return x + y;}', [2, 3]);
          test.equal(5, result); tests_done();

          // Evaluate a function with no parameters passed in
          var result = yield db.eval('function () {return 5;}');
          test.equal(5, result); tests_done();

          // Evaluate a statement
          var result = yield db.eval('2 + 3;');
          test.equal(5, result); tests_done();

          // Evaluate a statement using the code object
          var result = yield db.eval(new Code("2 + 3;"));
          test.equal(5, result); tests_done();

          // Evaluate a statement using the code object including a scope
          var result = yield db.eval(new Code("return i;", {'i':2}))
          test.equal(2, result); tests_done();

          // Evaluate a statement using the code object including a scope
          var result = yield db.eval(new Code("i + 3;", {'i':2}));
          test.equal(5, result); tests_done();

          try {
            // Evaluate an illegal statement
            yield db.eval("5 ++ 5;");
          } catch(err) {
            test.ok(err instanceof Error);
            test.ok(err.message != null);
            tests_done();
          }
        });
      }, 1000);
    });
    // END
  }
}

/**
 * Defining and calling a system level javascript function (NOT recommended, http://www.mongodb.org/display/DOCS/Server-side+Code+Execution) using a Generator and the co module.
 *
 * @example-class Db
 * @example-method eval
 * @ignore
 */
exports.shouldCorrectlyDefineSystemLevelFunctionAndExecuteFunctionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      Code = configuration.require.Code;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Clean out the collection
      yield db.collection("system.js").deleteMany({}, configuration.writeConcernMax());

      // Define a system level function
      yield db.collection("system.js").insertOne({_id: "echo", value: new Code("function(x) { return x; }")}, configuration.writeConcernMax());

      var result = yield db.eval("echo(5)");
      test.equal(5, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of retrieving the collections list for a database using a Generator and the co module.
 *
 * @example-class Db
 * @example-method listCollections
 * @ignore
 */
exports.shouldCorrectlyRetrievelistCollectionsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get an empty db
      var db1 = db.db('listCollectionTestDb2Generator');
      // Create a collection
      var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_generators');
      // Ensure the collection was created
      yield collection.insertOne({a:1});

      // Return the information of a single collection name
      var items = yield db1.listCollections({name: "shouldCorrectlyRetrievelistCollections_with_generators"}).toArray();
      test.equal(1, items.length);

      // Return the information of a all collections, using the callback format
      var items = yield db1.listCollections().toArray();
      test.ok(items.length >= 1);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of retrieving all collections for a db as Collection objects using a Generator and the co module.
 *
 * @example-class Db
 * @example-method collections
 * @ignore
 */
exports.shouldCorrectlyRetrieveAllCollectionsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create the collection
      var collection = db.collection('test_correctly_access_collections2_with_generators');
      // Retry to get the collection, should work as it's now created
      var collections = yield db.collections();
      test.ok(collections.length > 0);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of using the logout command for the database with a Generator and the co module.
 *
 * @example-class Db
 * @example-method logout
 * @ignore
 */
exports.shouldCorrectlyLogoutFromTheDatabaseWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Add a user to the database
      var result = yield db.addUser('user3', 'name')

      // Authenticate
      var result = yield db.authenticate('user3', 'name');
      test.equal(true, result);

      // Logout the db
      var result = yield db.logout()
      test.equal(true, result);

      // Remove the user
      var result = yield db.removeUser('user3');
      test.equal(true, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of using the authenticate command with a Generator and the co module.
 *
 * @example-class Db
 * @example-method authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAgainstTheDatabaseWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Add a user to the database
      yield db.addUser('user2', 'name');

      // Authenticate
      var result = yield db.authenticate('user2', 'name');
      test.equal(true, result);

      // Remove the user from the db
      yield db.removeUser('user2');
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of adding a user to the database using a Generator and the co module.
 *
 * @example-class Db
 * @example-method addUser
 * @ignore
 */
exports.shouldCorrectlyAddUserToDbWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Add a user to the database
      yield db.addUser('user', 'name');

      // Remove the user from the db
      yield db.removeUser('user');
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of removing a user using a Generator and the co module.
 *
 * @example-class Db
 * @example-method removeUser
 * @ignore
 */
exports.shouldCorrectlyAddAndRemoveUserWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Add a user to the database
      yield db.addUser('user', 'name');

      // Authenticate
      var result = yield db.authenticate('user', 'name');
      test.equal(true, result);

      // Logout the db
      var result = yield db.logout();
      test.equal(true, result);

      // Remove the user from the db
      yield db.removeUser('user');

      try {
        // Authenticate
        var result = yield db.authenticate('user', 'name');
        assert.ok(false);
      } catch(err) {}

      db.close();
      test.done();
    }).catch(function(err) {
      console.log(err.stack)
    });
    // END
  }
}

/**
 * A simple example showing the creation of a collection using a Generator and the co module.
 *
 * @example-class Db
 * @example-method createCollection
 * @ignore
 */
exports.shouldCorrectlyCreateACollectionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a capped collection with a maximum of 1000 documents
      var collection = yield db.createCollection("a_simple_collection_with_generators", {capped:true, size:10000, max:1000, w:1});

      // Insert a document in the capped collection
      yield collection.insertOne({a:1}, configuration.writeConcernMax());
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example creating, dropping a collection and then verifying that the collection is gone using a Generator and the co module.
 *
 * @example-class Db
 * @example-method dropCollection
 * @ignore
 */
exports.shouldCorrectlyExecuteACommandAgainstTheServerWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Execute ping against the server
      yield db.command({ping:1});

      // Create a capped collection with a maximum of 1000 documents
      var collection = yield db.createCollection("a_simple_create_drop_collection_with_generators", {capped:true, size:10000, max:1000, w:1});

      // Insert a document in the capped collection
      yield collection.insertOne({a:1}, configuration.writeConcernMax());

      // Drop the collection from this world
      yield db.dropCollection("a_simple_create_drop_collection_with_generators");

      // Verify that the collection is gone
      var names = yield db.listCollections({name:"a_simple_create_drop_collection_with_generators"}).toArray();
      test.equal(0, names.length);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example executing a command against the server using a Generator and the co module.
 *
 * @example-class Db
 * @example-method command
 * @ignore
 */
exports.shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Execute ping against the server
      yield db.command({ping:1});
      db.close();
      test.done();
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
exports.shouldCorrectlyRenameACollectionWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a collection
      var collection = yield db.createCollection("simple_rename_collection_with_generators", configuration.writeConcernMax());

      // Insert a document in the collection
      yield collection.insertOne({a:1}, configuration.writeConcernMax());

      // Retrieve the number of documents from the collection
      var count = yield collection.count();
      test.equal(1, count);

      // Rename the collection
      var collection2 = yield db.renameCollection("simple_rename_collection_with_generators", "simple_rename_collection_2_with_generators");

      // Retrieve the number of documents from the collection
      var count = yield collection2.count();
      test.equal(1, count);

      // Verify that the collection is gone
      var names = yield db.listCollections({name:"simple_rename_collection_with_generators"}).toArray();
      test.equal(0, names.length);

      // Verify that the new collection exists
      var names = yield db.listCollections({name:"simple_rename_collection_2_with_generators"}).toArray();
      test.equal(1, names.length);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A more complex createIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
 *
 * @example-class Db
 * @example-method createIndex
 * @ignore
 */
exports.shouldCreateOnDbComplexIndexOnTwoFieldsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_complex_index_test_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax());

      // Create an index on the a field
      yield db.createIndex('more_complex_index_test_with_generators', {a:1, b:1}
        , {unique:true, background:true, w:1});

      // Show that duplicate records got dropped
      var items = yield collection.find({}).toArray();
      test.equal(4, items.length);

      // Peform a query, with explain to show we hit the query
      var explanation = yield collection.find({a:2}, {explain:true}).toArray();
      test.ok(explanation != null);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
 *
 * @example-class Db
 * @example-method ensureIndex
 * @ignore
 */
exports.shouldCreateComplexEnsureIndexDbWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection we want to drop later
      var collection = db.collection('more_complex_ensure_index_db_test_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax());

      // Create an index on the a field
      yield db.ensureIndex('more_complex_ensure_index_db_test_with_generators', {a:1, b:1}
        , {unique:true, background:true, w:1});

      // Show that duplicate records got dropped
      var items = yield collection.find({}).toArray();
      test.equal(4, items.length);

      // Peform a query, with explain to show we hit the query
      var explanation = yield collection.find({a:2}, {explain:true}).toArray();
      test.ok(explanation != null);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An examples showing the dropping of a database using a Generator and the co module.
 *
 * @example-class Db
 * @example-method dropDatabase
 * @ignore
 */
exports.shouldCorrectlyDropTheDatabaseWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('more_index_information_test_1_with_generators');
      // Insert a bunch of documents for the index
      yield collection.insertMany([{a:1, b:1}, {a:1, b:1}
        , {a:2, b:2}, {a:3, b:3}, {a:4, b:4}], configuration.writeConcernMax());

      // Let's drop the database
      yield db.dropDatabase();

      // Wait to seconds to let it replicate across
      setTimeout(function() {
        co(function*() {
          // Get the admin database
          var dbs = yield db.admin().listDatabases();
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
    // END
  }
}

/**
 * An example showing how to retrieve the db statistics using a Generator and the co module.
 *
 * @example-class Db
 * @example-method stats
 * @ignore
 */
exports.shouldCorrectlyRetrieveDbStatsWithGeneratorsWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      var stats = yield db.stats()
      test.ok(stats != null);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Simple example connecting to two different databases sharing the socket connections below using a Generator and the co module.
 *
 * @example-class Db
 * @example-method db
 * @ignore
 */
exports.shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Reference a different database sharing the same connections
      // for the data transfer
      var secondDb = db.db("integration_tests_2");

      // Fetch the collections
      var multipleColl1 = db.collection("multiple_db_instances_with_generators");
      var multipleColl2 = secondDb.collection("multiple_db_instances_with_generators");

      // Write a record into each and then count the records stored
      yield multipleColl1.insertOne({a:1}, {w:1});
      yield multipleColl2.insertOne({a:1}, {w:1})

      // Count over the results ensuring only on record in each collection
      var count = yield multipleColl1.count();
      test.equal(1, count);

      var count = yield multipleColl2.count();
      test.equal(1, count);

      db.close();
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
 * Authenticate against MongoDB Admin user using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method authenticate
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w:1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin2', 'admin2');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin2', 'admin2');
      test.ok(result);

      var result = yield adminDb.removeUser('admin2')
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Retrieve the buildInfo for the current MongoDB instance using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method buildInfo
 * @ignore
 */
exports.shouldCorrectlyRetrieveBuildInfoWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin3', 'admin3');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin3', 'admin3');
      test.ok(result);

      // Retrive the build information for the MongoDB instance
      yield adminDb.buildInfo();

      var result = yield adminDb.removeUser('admin3');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Retrieve the buildInfo using the command function using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method command
 * @ignore
 */
exports.shouldCorrectlyRetrieveBuildInfoUsingCommandWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin4', 'admin4');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin4', 'admin4');
      test.ok(result);

      // Retrive the build information using the admin command
      yield adminDb.command({buildInfo:1})

      var result = yield adminDb.removeUser('admin4');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Retrieve the current profiling level set for the MongoDB instance using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method profilingLevel
 * @ignore
 */
exports.shouldCorrectlySetDefaultProfilingLevelWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w: 1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin5', 'admin5');

      // Authenticate using the newly added user
      yield adminDb.authenticate('admin5', 'admin5');

      // Retrive the profiling level
      yield adminDb.profilingLevel();

      var result = yield adminDb.removeUser('admin5');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of how to use the setProfilingInfo using a Generator and the co module.
 * Use this command to set the Profiling level on the MongoDB server
 *
 * @example-class Admin
 * @example-method setProfilingLevel
 * @ignore
 */
exports.shouldCorrectlyChangeProfilingLevelWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w: 1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin6', 'admin6');

      // Authenticate using the newly added user
      yield adminDb.authenticate('admin6', 'admin6');

      // Set the profiling level to only profile slow queries
      yield adminDb.setProfilingLevel('slow_only')

      // Retrive the profiling level and verify that it's set to slow_only
      var level = yield adminDb.profilingLevel();
      test.equal('slow_only', level);

      // Turn profiling off
      yield adminDb.setProfilingLevel('off');

      // Retrive the profiling level and verify that it's set to off
      var level = yield adminDb.profilingLevel();
      test.equal('off', level);

      // Set the profiling level to log all queries
      yield adminDb.setProfilingLevel('all');

      // Retrive the profiling level and verify that it's set to all
      var level = yield adminDb.profilingLevel();
      test.equal('all', level);

      try {
        // Attempt to set an illegal profiling level
        yield adminDb.setProfilingLevel('medium');
      } catch(err) {
        test.ok(err instanceof Error);
        test.equal("Error: illegal profiling level value medium", err.message);

        var result = yield adminDb.removeUser('admin6');
        test.ok(result);

        db.close();
        test.done();
      }
    });
    // END
  }
}

/**
 * An example of how to use the profilingInfo using a Generator and the co module.
 * Use this command to pull back the profiling information currently set for Mongodb
 *
 * @example-class Admin
 * @example-method profilingInfo
 * @ignore
 */
exports.shouldCorrectlySetAndExtractProfilingInfoWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w: 1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin7', 'admin7');

      // Authenticate using the newly added user
      yield adminDb.authenticate('admin7', 'admin7');

      // Set the profiling level to all
      yield adminDb.setProfilingLevel('all');

      // Execute a query command
      yield collection.find().toArray();

      // Turn off profiling
      yield adminDb.setProfilingLevel('off');

      // Retrive the profiling information
      var infos = yield adminDb.profilingInfo();
      test.ok(infos.constructor == Array);
      test.ok(infos.length >= 1);
      test.ok(infos[0].ts.constructor == Date);
      test.ok(infos[0].millis.constructor == Number);

      var result = yield adminDb.removeUser('admin7');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of how to use the validateCollection command using a Generator and the co module.
 * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
 *
 * @example-class Admin
 * @example-method validateCollection
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w: 1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin8', 'admin8');

      // Authenticate using the newly added user
      yield adminDb.authenticate('admin8', 'admin8');

      // Validate the 'test' collection
      var doc = yield adminDb.validateCollection('test_with_generators');
      test.ok(doc != null);

      var result = yield adminDb.removeUser('admin8')
      test.ok(result);

      db.close();
      test.done();
    });
  }
}

/**
 * An example of how to add a user to the admin database using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method ping
 * @ignore
 */
exports.shouldCorrectlyPingTheMongoDbInstanceWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin9', 'admin9');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin9', 'admin9');
      test.ok(result);

      // Ping the server
      yield adminDb.ping();

      var result = yield adminDb.removeUser('admin9');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of how add a user, authenticate and logout using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method logout
 * @ignore
 */
exports.shouldCorrectlyUseLogoutFunctionWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin10', 'admin10');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin10', 'admin10')
      test.ok(result);

      // Logout the user
      var result = yield adminDb.logout();
      test.equal(true, result);

      var result = adminDb.removeUser('admin10');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * An example of how to add a user to the admin database using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method addUser
 * @ignore
 */
exports.shouldCorrectlyAddAUserToAdminDbWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin11', 'admin11');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin11', 'admin11');
      test.ok(result);

      var result = yield adminDb.removeUser('admin11');
      test.ok(result);

      db.close();
      test.done();
    });
  }
}

/**
 * An example of how to remove a user from the admin database using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method removeUser
 * @ignore
 */
exports.shouldCorrectlyAddAUserAndRemoveItFromAdminDbWithGenerators = {
  metadata: { requires: { generators:true, topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin12', 'admin12');

      // Authenticate using the newly added user
      var result = yield adminDb.authenticate('admin12', 'admin12');
      test.ok(result);

      // Remove the user
      var result = yield adminDb.removeUser('admin12');
      test.equal(true, result);

      try {
        // Authenticate using the removed user should fail
        yield adminDb.authenticate('admin12', 'admin12');
      } catch(err) {
        db.close();
        test.done();
      }
    });
    // END
  }
}

/**
 * An example of listing all available databases. using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method listDatabases
 * @ignore
 */
exports.shouldCorrectlyListAllAvailableDatabasesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Use the admin database for the operation
      var adminDb = db.admin();

      // List all the available databases
      var dbs = yield adminDb.listDatabases();
      test.ok(dbs.databases.length > 0);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Retrieve the current server Info using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method serverStatus
 * @ignore
 */
exports.shouldCorrectlyRetrieveServerInfoWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w: 1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Add the new user to the admin database
      yield adminDb.addUser('admin13', 'admin13');

      // Authenticate using the newly added user
      yield adminDb.authenticate('admin13', 'admin13');

      // Retrive the server Info
      var info = yield adminDb.serverStatus();
      test.ok(info != null);

      var result = yield adminDb.removeUser('admin13');
      test.ok(result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Retrieve the current replicaset status if the server is running as part of a replicaset using a Generator and the co module.
 *
 * @example-class Admin
 * @example-method replSetGetStatus
 * @ignore
 */
exports.shouldCorrectlyRetrieveReplSetGetStatusWithGenerators = {
  metadata: { requires: { generators:true, topology: ['replicaset'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Grab a collection object
      var collection = db.collection('test_with_generators');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      yield collection.insertOne({'a':1}, {w: 1});

      // Use the admin database for the operation
      var adminDb = db.admin();

      // Retrive the server Info, returns error if we are not
      // running a replicaset
      yield adminDb.replSetGetStatus();

      db.close();
      test.done();
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
 * An example showing the information returned by indexInformation using a Generator and the co module.
 *
 * @example-class Cursor
 * @example-method toArray
 * @ignore
 */
exports.shouldCorrectlyExecuteToArrayWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection to hold our documents
      var collection = db.collection('test_array_with_generators');

      // Insert a test document
      yield collection.insertOne({'b':[1, 2, 3]}, configuration.writeConcernMax());

      // Retrieve all the documents in the collection
      var documents = yield collection.find().toArray();
      test.equal(1, documents.length);
      test.deepEqual([1, 2, 3], documents[0].b);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the count function of the cursor using a Generator and the co module.
 *
 * @example-class Cursor
 * @example-method count
 * @ignore
 */
exports.shouldCorrectlyUseCursorCountFunctionWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Creat collection
      var collection = db.collection('cursor_count_collection_with_generators');

      // Insert some docs
      yield collection.insertMany([{a:1}, {a:2}], configuration.writeConcernMax());

      // Do a find and get the cursor count
      var count = yield collection.find().count();
      test.equal(2, count);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the use of nextObject using a Generator and the co module.
 *
 * @example-class Cursor
 * @example-method nextObject
 * @ignore
 */
exports.shouldCorrectlyPeformNextObjectOnCursorWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('simple_next_object_collection_with_generators');

      // Insert some documents we can sort on
      yield collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax());

      // Do normal ascending sort
      var item = yield collection.find().nextObject();
      test.equal(1, item.a);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the use of next and co module to iterate over cursor
 *
 * @example-class Cursor
 * @example-method next
 * @ignore
 */
exports.shouldCorrectlyPeformNextOnCursorWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('simple_next_object_collection_next_with_generators');

      // Insert some documents we can sort on
      yield collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax());

      // Get a cursor
      var cursor = collection.find({});

      // Get the document
      var doc = null;
      var docs = [];

      // Iterate over the cursor
      while(yield cursor.hasNext()) {
        docs.push(yield cursor.next());
      }

      // Validate the correct number of elements
      test.equal(3, docs.length);
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the use of the cursor explain function using a Generator and the co module.
 *
 * @example-class Cursor
 * @example-method explain
 * @ignore
 */
exports.shouldCorrectlyPeformSimpleExplainCursorWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a collection
      var collection = db.collection('simple_explain_collection_with_generators');

      // Insert some documents we can sort on
      yield collection.insertMany([{a:1}, {a:2}, {a:3}], configuration.writeConcernMax());

      // Do normal ascending sort
      yield collection.find().explain();
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the use of the cursor close function using a Generator and the co module.
 *
 * @example-class Cursor
 * @example-method close
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCloseFunctionWithGenerators = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Create a lot of documents to insert
      var docs = []
      for(var i = 0; i < 100; i++) {
        docs.push({'a':i})
      }

      // Create a collection
      var collection = db.collection('test_close_function_on_cursor_with_generators');

      // Insert documents into collection
      yield collection.insertMany(docs, configuration.writeConcernMax());
      // Peform a find to get a cursor
      var cursor = collection.find();

      // Fetch the first object
      yield cursor.nextObject();

      // Close the cursor, this is the same as reseting the query
      yield cursor.close();
      db.close();
      test.done();
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
 * A simple example showing the usage of the Gridstore.exist method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method GridStore.exist
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExistsByObjectIdWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Open a file for writing
      var gridStore = new GridStore(db, null, "w");
      yield gridStore.open();
      // Writing some content to the file
      yield gridStore.write("hello world!");

      // Flush the file to GridFS
      var result = yield gridStore.close();

      // Check if the file exists using the id returned from the close function
      var result = yield GridStore.exist(db, result._id);
      test.equal(true, result);

      // Show that the file does not exist for a random ObjectID
      var result = yield GridStore.exist(db, new ObjectID());
      test.equal(false, result);

      // Show that the file does not exist for a different file root
      var result = yield GridStore.exist(db, result._id, 'another_root');
      test.equal(false, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the usage of the eof method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method GridStore.list
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreListWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file id
      var fileId = new ObjectID();

      // Open a file for writing
      var gridStore = new GridStore(db, fileId, "foobar2", "w");
      yield gridStore.open();
      // Write some content to the file
      yield gridStore.write("hello world!");
      // Flush to GridFS
      yield gridStore.close();

      // List the existing files
      var items = yield GridStore.list(db)
      var found = false;

      items.forEach(function(filename) {
        if(filename == 'foobar2') found = true;
      });

      test.ok(items.length >= 1);
      test.ok(found);

      // List the existing files but return only the file ids
      var items = yield GridStore.list(db, {id:true});
      var found = false;
      items.forEach(function(id) {
        test.ok(typeof id == 'object');
      });

      test.ok(items.length >= 1);

      // List the existing files in a specific root collection
      var items = yield GridStore.list(db, 'fs');
      var found = false;
      items.forEach(function(filename) {
        if(filename == 'foobar2') found = true;
      });

      test.ok(items.length >= 1);
      test.ok(found);

      // List the existing files in a different root collection where the file is not located
      var items = yield GridStore.list(db, 'my_fs');
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
      yield gridStore2.open();

      // Write the content
      yield gridStore2.write('my file');

      // Flush to GridFS
      yield gridStore2.close();

      // List all the available files and verify that our files are there
      var items = yield GridStore.list(db);
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
    // END
  }
}

/**
 * A simple example showing the usage of the puts method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method puts
 * @ignore
 */
exports.shouldCorrectlyReadlinesAndPutLinesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Open a file for writing
      var gridStore = new GridStore(db, "test_gs_puts_and_readlines", "w");
      yield gridStore.open();

      // Write a line to the file using the puts method
      yield gridStore.puts("line one");

      // Flush the file to GridFS
      yield gridStore.close();

      // Read in the entire contents
      var data = yield GridStore.read(db, 'test_gs_puts_and_readlines');
      test.equal("line one\n", data.toString());

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the usage of the GridStore.unlink method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method GridStore.unlink
 * @ignore
 */
exports.shouldCorrectlyUnlinkWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN

      // Open a new file for writing
      var gridStore = new GridStore(db, "test_gs_unlink", "w");
      yield db.dropDatabase();

      yield gridStore.open();

      // Write some content
      yield gridStore.write("hello, world!")

      // Flush file to GridFS
      yield gridStore.close();

      // Verify the existance of the fs.files document
      var collection = db.collection('fs.files');
      var count = yield collection.count();
      test.equal(1, count);

      // Verify the existance of the fs.chunks chunk document
      var collection = db.collection('fs.chunks');
      var count = yield collection.count();
      test.equal(1, count);

      // Unlink the file (removing it)
      yield GridStore.unlink(db, 'test_gs_unlink');

      // Verify that fs.files document is gone
      var collection = db.collection('fs.files');
      var count = yield collection.count();
      test.equal(0, count);

      // Verify that fs.chunks chunk documents are gone
      var collection = db.collection('fs.chunks');
      var count = yield collection.count();
      test.equal(0, count);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the usage of the read method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method read
 * @ignore
 */
exports.shouldCorrectlyWriteAndReadJpgImageWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Read in the content of a file
      var data = fs.readFileSync('./test/functional/data/iya_logo_final_bw.jpg');
      // Create a new file
      var gs = new GridStore(db, "test", "w");
      // Open the file
      yield gs.open();
      // Write the file to GridFS
      yield gs.write(data);
      // Flush to the GridFS
      yield gs.close();

      // Define the file we wish to read
      var gs2 = new GridStore(db, "test", "r");
      // Open the file
      yield gs2.open();
      // Set the pointer of the read head to the start of the gridstored file
      yield gs2.seek(0);
      // Read the entire file
      var data2 = yield gs2.read();
      // Compare the file content against the orgiinal
      test.equal(data.toString('base64'), data2.toString('base64'));

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing opening a file using a filename, writing to it and saving it using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingFilenameWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a new instance of the gridstore
      var gridStore = new GridStore(db, 'ourexamplefiletowrite.txt', 'w');

      // Open the file
      yield gridStore.open();

      // Write some data to the file
      yield gridStore.write('bar');

      // Close (Flushes the data to MongoDB)
      yield gridStore.close();

      // Verify that the file exists
      var result = yield GridStore.exist(db, 'ourexamplefiletowrite.txt');
      test.equal(true, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing opening a file using an ObjectID, writing to it and saving it using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingObjectIDWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Create a new instance of the gridstore
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the file
      yield gridStore.open();

      // Write some data to the file
      yield gridStore.write('bar');

      // Close (Flushes the data to MongoDB)
      yield gridStore.close();

      // Verify that the file exists
      var result = yield GridStore.exist(db, fileId);
      test.equal(true, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to write a file to Gridstore using file location path using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
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
      yield gridStore.open();

      // Write the file to gridFS
      yield gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png');

      // Read back all the written content and verify the correctness
      var fileData = yield GridStore.read(db, fileId);
      test.equal(data.toString('base64'), fileData.toString('base64'))
      test.equal(fileSize, fileData.length);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to write a file to Gridstore using a file handle using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandleWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
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
      yield gridStore.open();

      // Write the file to gridFS using the file handle
      yield gridStore.writeFile(fd);

      // Read back all the written content and verify the correctness
      var fileData = yield GridStore.read(db, fileId);
      test.equal(data.toString('base64'), fileData.toString('base64'));
      test.equal(fileSize, fileData.length);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to use the write command with strings and Buffers using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method write
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffersWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      yield gridStore.open();

      // Write a text string
      yield gridStore.write('Hello world');

      // Write a buffer
      yield gridStore.write(new Buffer('Buffer Hello world'));

      // Close the
      yield gridStore.close();

      // Read back all the written content and verify the correctness
      var fileData = yield GridStore.read(db, fileId);
      test.equal('Hello worldBuffer Hello world', fileData.toString());

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to use the write command with strings and Buffers using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method close
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      yield gridStore.open();

      // Write a text string
      yield gridStore.write('Hello world');

      // Close the
      yield gridStore.close();

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to use the instance level unlink command to delete a gridstore item using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method unlink
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkItWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      yield gridStore.open();

      // Write a text string
      yield gridStore.write('Hello world');

      // Close the
      yield gridStore.close();

      // Open the file again and unlin it
      gridStore = yield new GridStore(db, fileId, 'r').open();

      // Unlink the file
      yield gridStore.unlink();

      // Verify that the file no longer exists
      var result = yield GridStore.exist(db, fileId);
      test.equal(false, result);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method GridStore.readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlinesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      yield gridStore.open();

      // Write one line to gridStore
      yield gridStore.puts("line one");

      // Write second line to gridStore
      yield gridStore.puts("line two");

      // Write third line to gridStore
      yield gridStore.puts("line three");

      // Flush file to disk
      yield gridStore.close();

      // Read back all the lines
      var lines = yield GridStore.readlines(db, fileId);
      test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlinesWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Open the new file
      yield gridStore.open();

      // Write one line to gridStore
      yield gridStore.puts("line one");

      // Write second line to gridStore
      yield gridStore.puts("line two");

      // Write third line to gridStore
      yield gridStore.puts("line three");

      // Flush file to disk
      yield gridStore.close();

      // Open file for reading
      gridStore = new GridStore(db, fileId, 'r');
      yield gridStore.open();

      // Read all the lines and verify correctness
      var lines = yield gridStore.readlines();
      test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the usage of the read method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method GridStore.read
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreReadWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a new file
      var gridStore = new GridStore(db, null, "w");
      // Read in the content from a file, replace with your own
      var data = fs.readFileSync("./test/functional/data/test_gs_weird_bug.png");

      // Open the file
      yield gridStore.open();
      // Write the binary file data to GridFS
      yield gridStore.write(data);
      // Flush the remaining data to GridFS
      var result = yield gridStore.close();
      // Read in the whole file and check that it's the same content
      var fileData = yield GridStore.read(db, result._id);
      test.equal(data.length, fileData.length);

      db.close();
      test.done();
    });
    // END
  }
}

/*
 * A simple example showing the usage of the seek method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method seek
 * @ignore
 */
exports.shouldCorrectlySeekWithBufferWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a file and open it
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "w");
      yield gridStore.open();
      // Write some content to the file
      yield gridStore.write(new Buffer("hello, world!", "utf8"));
      // Flush the file to GridFS
      yield gridStore.close();

      // Open the file in read mode
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "r");
      yield gridStore.open();
      // Seek to start
      yield gridStore.seek(0);
      // Read first character and verify
      var chr = yield gridStore.getc();
      test.equal('h', chr);

      // Open the file in read mode
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "r");
      yield gridStore.open();
      // Seek to 7 characters from the beginning off the file and verify
      yield gridStore.seek(7);
      var chr = yield gridStore.getc();
      test.equal('w', chr);

      // Open the file in read mode
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "r");
      yield gridStore.open();
      // Seek to -1 characters from the end off the file and verify
      yield gridStore.seek(-1, GridStore.IO_SEEK_END);
      var chr = yield gridStore.getc();
      test.equal('!', chr);

      // Open the file in read mode
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "r");
      yield gridStore.open();
      // Seek to -6 characters from the end off the file and verify
      yield gridStore.seek(-6, GridStore.IO_SEEK_END);
      var chr = yield gridStore.getc();
      test.equal('w', chr);

      // Open the file in read mode
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "r");
      yield gridStore.open();

      // Seek forward 7 characters from the current read position and verify
      yield gridStore.seek(7, GridStore.IO_SEEK_CUR);
      var chr = yield gridStore.getc();
      test.equal('w', chr);

      // Seek forward -1 characters from the current read position and verify
      yield gridStore.seek(-1, GridStore.IO_SEEK_CUR);
      var chr = yield gridStore.getc();
      test.equal('w', chr);

      // Seek forward -4 characters from the current read position and verify
      yield gridStore.seek(-4, GridStore.IO_SEEK_CUR);
      var chr = yield gridStore.getc();
      test.equal('o', chr);

      // Seek forward 3 characters from the current read position and verify
      yield gridStore.seek(3, GridStore.IO_SEEK_CUR);
      var chr = yield gridStore.getc();
      test.equal('o', chr);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to rewind and overwrite the file using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method rewind
 * @ignore
 */
exports.shouldCorrectlyRewingAndTruncateOnWriteWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Our file ID
      var fileId = new ObjectID();

      // Create a new file
      var gridStore = new GridStore(db, fileId, "w");
      // Open the file
      yield gridStore.open();
      // Write to the file
      yield gridStore.write("hello, world!");
      // Flush the file to disk
      yield gridStore.close();

      // Reopen the file
      gridStore = new GridStore(db, fileId, "w");
      yield gridStore.open();
      // Write some more text to the file
      yield gridStore.write('some text is inserted here');

      // Let's rewind to truncate the file
      yield gridStore.rewind();

      // Write something from the start
      yield gridStore.write('abc');

      // Flush the data to mongodb
      yield gridStore.close();

      // Verify that the new data was written
      var data = yield GridStore.read(db, fileId);
      test.equal("abc", data);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the usage of the tell method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method tell
 * @ignore
 */
exports.shouldCorrectlyExecuteGridstoreTellWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a new file
      var gridStore = new GridStore(db, "test_gs_tell", "w");
      // Open the file
      yield gridStore.open();
      // Write a string to the file
      yield gridStore.write("hello, world!");
      // Flush the file to GridFS
      yield gridStore.close();

      // Open the file in read only mode
      var gridStore = new GridStore(db, "test_gs_tell", "r");
      yield gridStore.open();

      // Read the first 5 characters
      var data = yield gridStore.read(5);
      test.equal("hello", data);

      // Get the current position of the read head
      var position = yield gridStore.tell();
      test.equal(5, position);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the usage of the seek method using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method getc
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetCWithGenerators = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a file and open it
      var gridStore = new GridStore(db, "test_gs_getc_file", "w");
      yield gridStore.open();
      // Write some content to the file
      yield gridStore.write(new Buffer("hello, world!", "utf8"));
      // Flush the file to GridFS
      yield gridStore.close();
      // Open the file in read mode
      var gridStore = new GridStore(db, "test_gs_getc_file", "r");
      yield gridStore.open();

      // Read first character and verify
      var chr = yield gridStore.getc();
      test.equal('h', chr);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing how to save a file with a filename allowing for multiple files with the same name using a Generator and the co module.
 *
 * @example-class GridStore
 * @example-method open
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetCWithGenerators2 = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co'),
      GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID;

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a file and open it
      var gridStore = new GridStore(db, new ObjectID(), "test_gs_getc_file", "w");
      yield gridStore.open();
      // Write some content to the file
      yield gridStore.write(new Buffer("hello, world!", "utf8"));
      // Flush the file to GridFS
      yield gridStore.close();

      // Create another file with same name and and save content to it
      gridStore = new GridStore(db, new ObjectID(), "test_gs_getc_file", "w");
      yield gridStore.open();
      // Write some content to the file
      yield gridStore.write(new Buffer("hello, world!", "utf8"));
      // Flush the file to GridFS
      var fileData = yield gridStore.close();

      // Open the file in read mode using the filename
      var gridStore = new GridStore(db, "test_gs_getc_file", "r");
      yield gridStore.open();

      // Read first character and verify
      var chr = yield gridStore.getc();
      test.equal('h', chr);

      // Open the file using an object id
      gridStore = new GridStore(db, fileData._id, "r");
      yield gridStore.open();

      // Read first character and verify
      var chr = yield gridStore.getc();
      test.equal('h', chr);

      db.close();
      test.done();
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
 * Example of a simple ordered insert/update/upsert/remove ordered collection using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method initializeOrderedBulkOp
 * @ignore
 */
exports['Should correctly execute ordered batch with no errors using write commands with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_0_with_generators');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp();
      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      var result = yield batch.execute();
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
    // END
  }
}

/**
 * Example of a simple ordered insert/update/upsert/remove ordered collection using a Generator and the co module.
 *
 *
 * @example-class Collection
 * @example-method initializeUnorderedBulkOp
 * @ignore
 */
exports['Should correctly execute unordered batch with no errors with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_0_with_generators');
      // Initialize the unordered Batch
      var batch = col.initializeUnorderedBulkOp({useLegacyOps: true});

      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      var result = yield batch.execute();
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
    // END
  }
}

/**************************************************************************
 *
 * CRUD TESTS
 *
 *************************************************************************/

/**
 * Example of a simple insertOne operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method insertOne
 * @ignore
 */
exports['Should correctly execute insertOne operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('insert_one_with_generators');
      var r = yield col.insertOne({a:1});
      test.equal(1, r.insertedCount);
      // Finish up test
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple insertMany operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method insertMany
 * @ignore
 */
exports['Should correctly execute insertMany operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('insert_many_with_generators');
      var r = yield col.insertMany([{a:1}, {a:2}]);
      test.equal(2, r.insertedCount);
      // Finish up test
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple updateOne operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method updateOne
 * @ignore
 */
exports['Should correctly execute updateOne operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('update_one_with_generators');
      var r = yield col.updateOne({a:1}
        , {$set: {a:2}}
        , {upsert:true});
      test.equal(1, r.matchedCount);
      test.equal(1, r.upsertedCount);
      // Finish up test
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple updateMany operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method updateMany
 * @ignore
 */
exports['Should correctly execute updateMany operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('update_many_with_generators');
      var r = yield col.insertMany([{a:1}, {a:1}]);
      test.equal(2, r.insertedCount);

      // Update all documents
      var r = yield col.updateMany({a:1}, {$set: {b: 1}});
      test.equal(2, r.matchedCount);
      test.equal(2, r.modifiedCount);

      // Finish up test
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple removeOne operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method removeOne
 * @ignore
 */
exports['Should correctly execute removeOne operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('remove_one_with_generators');
      var r = yield col.insertMany([{a:1}, {a:1}]);
      test.equal(2, r.insertedCount);

      var r = yield col.removeOne({a:1});
      test.equal(1, r.deletedCount);
      // Finish up test
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple removeMany operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method removeMany
 * @ignore
 */
exports['Should correctly execute removeMany operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('remove_many_with_generators');
      var r = yield col.insertMany([{a:1}, {a:1}]);
      test.equal(2, r.insertedCount);

      // Update all documents
      var r = yield col.removeMany({a:1});
      test.equal(2, r.deletedCount);

      // Finish up test
      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple bulkWrite operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method bulkWrite
 * @ignore
 */
exports['Should correctly execute bulkWrite operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('bulk_write_with_generators');
      var r = yield col.bulkWrite([
          { insertOne: { document: { a: 1 } } }
        , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
        , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
        , { deleteOne: { filter: {c:1} } }
        , { deleteMany: { filter: {c:1} } }
        , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
      , {ordered:true, w:1});
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
    // END
  }
}

/**
 * Example of a simple findOneAndDelete operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method findOneAndDelete
 * @ignore
 */
exports['Should correctly execute findOneAndDelete operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_delete_with_generators');
      var r = yield col.insertMany([{a:1, b:1}], {w:1});
      test.equal(1, r.result.n);

      var r = yield col.findOneAndDelete({a:1}
        , { projection: {b:1}, sort: {a:1} }
        );
      test.equal(1, r.lastErrorObject.n);
      test.equal(1, r.value.b);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple findOneAndReplace operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method findOneAndReplace
 * @ignore
 */
exports['Should correctly execute findOneAndReplace operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_replace_with_generators');
      var r = yield col.insertMany([{a:1, b:1}], {w:1});
      test.equal(1, r.result.n);

      var r = yield col.findOneAndReplace({a:1}
        , {c:1, b:1}
        , {
              projection: {b:1, c:1}
            , sort: {a:1}
            , returnOriginal: false
            , upsert: true
          }
        );
      test.equal(1, r.lastErrorObject.n);
      test.equal(1, r.value.b);
      test.equal(1, r.value.c);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * Example of a simple findOneAndUpdate operation using a Generator and the co module.
 *
 * @example-class Collection
 * @example-method findOneAndUpdate
 * @ignore
 */
exports['Should correctly execute findOneAndUpdate operation with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_update_with_generators');
      var r = yield col.insertMany([{a:1, b:1}], {w:1});
      test.equal(1, r.result.n);

      var r = yield col.findOneAndUpdate({a:1}
        , {$set: {d:1}}
        , {
              projection: {b:1, d:1}
            , sort: {a:1}
            , returnOriginal: false
            , upsert: true
          }
        );
      test.equal(1, r.lastErrorObject.n);
      test.equal(1, r.value.b);
      test.equal(1, r.value.d);

      db.close();
      test.done();
    });
    // END
  }
}

/**
 * A simple example showing the listening to a capped collection using a Generator and the co module.
 *
 * @example-class Db
 * @example-method createCollection
 * @ignore
 */
exports['Should correctly add capped collection options to cursor with Generators'] = {
  metadata: { requires: { generators:true, topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var co = require('co');

    co(function*() {
      // Connect
      var db = yield configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open();
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   co = require('co');
    // LINE   test = require('assert');
    // LINE
    // LINE co(function*() {
    // LINE   var db = yield MongoClient.connect('mongodb://localhost:27017/test');
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Create a capped collection with a maximum of 1000 documents
      var collection = yield db.createCollection("a_simple_collection_2_with_generators", {capped:true, size:10000, max:1000, w:1});
      var docs = [];
      for(var i = 0; i < 1000; i++) docs.push({a:i});

      // Insert a document in the capped collection
      yield collection.insertMany(docs, configuration.writeConcernMax());
      // Start date
      var s = new Date();

      // Get the cursor
      var cursor = collection.find({})
        .addCursorFlag('tailable', true)
        .addCursorFlag('awaitData', true)
        .setCursorOption('numberOfRetries', 2)
        .setCursorOption('tailableRetryInterval', 100);

      cursor.on('data', function() {});

      cursor.on('end', function() {
        test.ok((new Date().getTime() - s.getTime()) > 1000);

        db.close();
        test.done();
      });
    });
    // END
  }
}
