'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { Code } = require('../../src');
const { expect } = require('chai');

/**************************************************************************
 *
 * COLLECTION TESTS
 *
 *************************************************************************/

describe('Operation (Generators)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  /**
   * Call toArray on an aggregation cursor using ES6 generators and the co module
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('aggregationExample2WithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>2.1.0', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Some docs for insertion
        var docs = [
          {
            title: 'this is my title',
            author: 'bob',
            posted: new Date(),
            pageViews: 5,
            tags: ['fun', 'good', 'fun'],
            other: { foo: 5 },
            comments: [
              { author: 'joe', text: 'this is cool' },
              { author: 'sam', text: 'this is bad' }
            ]
          }
        ];

        // Create a collection
        var collection = db.collection('aggregationExample2_with_generatorsGenerator');

        // Insert the docs
        yield collection.insertMany(docs, { w: 1 });

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate(
          [
            {
              $project: {
                author: 1,
                tags: 1
              }
            },
            { $unwind: '$tags' },
            {
              $group: {
                _id: { tags: '$tags' },
                authors: { $addToSet: '$author' }
              }
            }
          ],
          { cursor: { batchSize: 1 } }
        );

        // Get all the aggregation results
        docs = yield cursor.toArray();
        test.equal(2, docs.length);
        yield client.close();
      });
      // END
    }
  });

  /**
   * Call next on an aggregation cursor using a Generator and the co module
   *
   * @example-class AggregationCursor
   * @example-method next
   */
  it('Aggregation Cursor next Test with Generators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>2.1.0', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Some docs for insertion
        var docs = [
          {
            title: 'this is my title',
            author: 'bob',
            posted: new Date(),
            pageViews: 5,
            tags: ['fun', 'good', 'fun'],
            other: { foo: 5 },
            comments: [
              { author: 'joe', text: 'this is cool' },
              { author: 'sam', text: 'this is bad' }
            ]
          }
        ];

        // Create a collection
        var collection = db.collection('aggregation_next_example_with_generatorsGenerator');

        // Insert the docs
        yield collection.insertMany(docs, { w: 1 });

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate(
          [
            {
              $project: {
                author: 1,
                tags: 1
              }
            },
            { $unwind: '$tags' },
            {
              $group: {
                _id: { tags: '$tags' },
                authors: { $addToSet: '$author' }
              }
            }
          ],
          { cursor: { batchSize: 1 } }
        );
        // Get all the aggregation results
        yield cursor.next();

        // Closing cursor to close implicit session,
        // since the cursor is not exhausted
        cursor.close();
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of running simple count commands against a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method count
   */
  it('shouldCorrectlyDoSimpleCountExamplesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Crete the collection for the distinct example
        var collection = db.collection('countExample1_with_generators');
        // Insert documents to perform distinct against
        yield collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4, b: 1 }], {
          w: 1
        });
        // Perform a total count command
        var count = yield collection.count();
        test.equal(4, count);

        // Perform a partial account where b=1
        count = yield collection.count({ b: 1 });
        test.equal(1, count);

        // Close database
        yield client.close();
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a Generator and the co module and a compound unique index in the background and dropping duplicated documents
   *
   * @example-class Collection
   * @example-method createIndex
   */
  it('shouldCreateComplexIndexOnTwoFieldsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample1_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax()
        );

        // Create an index on the a field
        yield collection.createIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Show that duplicate records got dropped
        var items = yield collection.find({}).toArray();
        test.equal(4, items.length);

        // Perform a query, with explain to show we hit the query
        var explanation = yield collection.find({ a: 2 }).explain();
        test.ok(explanation != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of running the distinct command using a Generator and the co module against a collection
   *
   * @example-class Collection
   * @example-method distinct
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Crete the collection for the distinct example
        var collection = db.collection('distinctExample1_with_generators');

        // Insert documents to perform distinct against
        yield collection.insertMany(
          [
            { a: 0, b: { c: 'a' } },
            { a: 1, b: { c: 'b' } },
            { a: 1, b: { c: 'c' } },
            { a: 2, b: { c: 'a' } },
            { a: 3 },
            { a: 3 }
          ],
          configuration.writeConcernMax()
        );

        // Perform a distinct query against the a field
        var docs = yield collection.distinct('a');
        test.deepEqual([0, 1, 2, 3], docs.sort());

        // Perform a distinct query against the sub-field b.c
        docs = yield collection.distinct('b.c');
        test.deepEqual(['a', 'b', 'c'], docs.sort());

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of running the distinct command against a collection using a Generator and the co module with a filter query
   */
  it('shouldCorrectlyHandleDistinctIndexesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Crete the collection for the distinct example
        var collection = db.collection('distinctExample2_with_generators');

        // Insert documents to perform distinct against
        yield collection.insertMany(
          [
            { a: 0, b: { c: 'a' } },
            { a: 1, b: { c: 'b' } },
            { a: 1, b: { c: 'c' } },
            { a: 2, b: { c: 'a' } },
            { a: 3 },
            { a: 3 },
            { a: 5, c: 1 }
          ],
          configuration.writeConcernMax()
        );

        // Perform a distinct query with a filter against the documents
        var docs = yield collection.distinct('a', { c: 1 });
        test.deepEqual([5], docs.sort());

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of Collection.prototype.drop using a Generator and the co module
   *
   * @example-class Collection
   * @example-method drop
   */
  it('shouldCorrectlyDropCollectionWithDropFunctionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
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
        replies.forEach(function (document) {
          if (document.name === 'test_other_drop_with_generators') {
            found = true;
            return;
          }
        });

        // Ensure the collection is not found
        test.equal(false, found);

        // Let's close the db
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a how to drop all the indexes on a collection using dropAllIndexes with a Generator and the co module
   *
   * @example-class Collection
   * @example-method dropAllIndexes
   */
  it('dropAllIndexesExample1WithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        yield db.createCollection('dropExample1_with_generators');
        // Drop the collection
        yield db.collection('dropExample1_with_generators').dropAllIndexes();
        // Let's close the db
        yield client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using a Generator and the co module
   *
   * @example-class Collection
   * @example-method dropIndex
   */
  it('shouldCorrectlyCreateAndDropIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        var collection = db.collection('dropIndexExample1_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Drop the index
        yield collection.dropIndex('a_1_b_1');

        // Verify that the index is gone
        var indexInformation = yield collection.indexInformation();
        test.deepEqual([['_id', 1]], indexInformation._id_);
        expect(indexInformation.a_1_b_1).to.not.exist;

        // Close db
        yield client.close();
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method ensureIndex
   */
  it('shouldCreateComplexEnsureIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        var collection = db.collection('ensureIndexExample1_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax()
        );

        // Create an index on the a field
        yield db.ensureIndex(
          'ensureIndexExample1_with_generators',
          { a: 1, b: 1 },
          { unique: true, background: true, w: 1 }
        );

        // Show that duplicate records got dropped
        var items = yield collection.find({}).toArray();
        test.equal(4, items.length);

        // Perform a query, with explain to show we hit the query
        var explanation = yield collection.find({ a: 2 }).explain();
        test.ok(explanation != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method ensureIndex
   */
  it('ensureIndexExampleWithCompountIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        var collection = db.collection('ensureIndexExample2_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Show that duplicate records got dropped
        var items = yield collection.find({}).toArray();
        test.equal(4, items.length);

        // Perform a query, with explain to show we hit the query
        var explanation = yield collection.find({ a: 2 }).explain();
        test.ok(explanation != null);

        // Close db
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple query using the find method and toArray method with a Generator and the co module.
   *
   * @example-class Collection
   * @example-method find
   */
  it('shouldPerformASimpleQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_query_with_generators');

        // Insert a bunch of documents for the testing
        yield collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax()
        );

        // Perform a simple find and return all the documents
        var docs = yield collection.find().toArray();
        test.equal(3, docs.length);

        // Close the db
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple query showing the explain for a query using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method find
   */
  it('shouldPerformASimpleExplainQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_explain_query_with_generators');
        // Insert a bunch of documents for the testing
        yield collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax()
        );

        // Perform a simple find and return all the documents
        var explain = yield collection.find({}).explain();
        test.ok(explain != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple query showing skip and limit using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method find
   */
  it('shouldPerformASimpleLimitSkipQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_query_with_generators');
        // Insert a bunch of documents for the testing
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 }
          ],
          configuration.writeConcernMax()
        );

        // Perform a simple find and return all the documents
        var docs = yield collection.find({}).skip(1).limit(1).project({ b: 1 }).toArray();

        test.equal(1, docs.length);
        expect(docs[0].a).to.not.exist;
        test.equal(2, docs[0].b);

        // Close db
        yield client.close();
      });
      // END
    }
  });

  /**
   * A whole set of different ways to use the findAndModify command with a Generator and the co module..
   *
   * The first findAndModify command modifies a document and returns the modified document back.
   * The second findAndModify command removes the document.
   * The second findAndModify command upserts a document and returns the new document.
   *
   * @example-class Collection
   * @example-method findAndModify
   */
  it('shouldPerformSimpleFindAndModifyOperationsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_with_generators');
        // Insert some test documentations
        yield collection.insertMany(
          [{ a: 1 }, { b: 1 }, { c: 1 }],
          configuration.writeConcernMax()
        );

        // Simple findAndModify command returning the new document
        var doc = yield collection.findAndModify(
          { a: 1 },
          [['a', 1]],
          { $set: { b1: 1 } },
          { new: true }
        );
        test.equal(1, doc.value.a);
        test.equal(1, doc.value.b1);

        // Simple findAndModify command returning the new document and
        // removing it at the same time
        doc = yield collection.findAndModify(
          { b: 1 },
          [['b', 1]],
          { $set: { b: 2 } },
          { remove: true }
        );

        // Verify that the document is gone
        var item = yield collection.findOne({ b: 1 });
        expect(item).to.not.exist;

        // Simple findAndModify command performing an upsert and returning the new document
        // executing the command safely
        doc = yield collection.findAndModify(
          { d: 1 },
          [['b', 1]],
          { d: 1, f: 1 },
          { new: true, upsert: true, w: 1 }
        );
        test.equal(1, doc.value.d);
        test.equal(1, doc.value.f);

        // Close the db
        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of using findAndRemove using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findAndRemove
   */
  it('shouldPerformSimpleFindAndRemoveWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_2_with_generators');
        // Insert some test documentations
        yield collection.insertMany(
          [{ a: 1 }, { b: 1, d: 1 }, { c: 1 }],
          configuration.writeConcernMax()
        );

        // Simple findAndModify command returning the old document and
        // removing it at the same time
        var doc = yield collection.findAndRemove({ b: 1 }, [['b', 1]]);
        test.equal(1, doc.value.b);
        test.equal(1, doc.value.d);

        // Verify that the document is gone
        var item = yield collection.findOne({ b: 1 });
        expect(item).to.not.exist;

        // Db close
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple query using findOne with a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOne
   */
  it('shouldPerformASimpleLimitSkipFindOneQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_find_one_query_with_generators');

        // Insert a bunch of documents for the testing
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 }
          ],
          configuration.writeConcernMax()
        );

        // Perform a simple find and return all the documents
        var doc = yield collection.findOne({ a: 2 }, { fields: { b: 1 } });
        expect(doc.a).to.not.exist;
        test.equal(2, doc.b);

        // Db close
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple map reduce example using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it('shouldPerformSimpleMapReduceFunctionsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_with_generators');

        // Insert some documents to perform map reduce over
        yield collection.insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 });

        // Map function
        var map = function () {
          emit(this.user_id, 1); // eslint-disable-line
        };
        // Reduce function
        // eslint-disable-next-line
        var reduce = function(k, vals) {
          return 1;
        };

        // Perform the map reduce
        collection = yield collection.mapReduce(map, reduce, {
          out: { replace: 'tempCollection' }
        });

        // Mapreduce returns the temporary collection with the results
        var result = yield collection.findOne({ _id: 1 });
        test.equal(1, result.value);
        result = yield collection.findOne({ _id: 2 });
        test.equal(1, result.value);

        // Db close
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it('shouldPerformMapReduceFunctionInlineWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>1.7.6', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_inline_with_generators');

        // Insert some test documents
        yield collection.insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 });

        // Map function
        var map = function () {
          emit(this.user_id, 1); // eslint-disable-line
        };
        // Reduce function
        // eslint-disable-next-line
        var reduce = function(k, vals) {
          return 1;
        };

        // Execute map reduce and return results inline
        var result = yield collection.mapReduce(map, reduce, { out: { inline: 1 }, verbose: true });
        test.equal(2, result.results.length);
        test.ok(result.stats != null);

        result = yield collection.mapReduce(map, reduce, {
          out: { replace: 'mapreduce_integration_test' },
          verbose: true
        });

        test.ok(result.stats != null);
        yield client.close();
      });
      // END
    }
  });

  /**
   * Mapreduce using a provided scope containing a javascript function executed using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it('shouldPerformMapReduceWithContextWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_scope_with_generators');

        // Insert some test documents
        yield collection.insertMany(
          [
            { user_id: 1, timestamp: new Date() },
            { user_id: 2, timestamp: new Date() }
          ],
          { w: 1 }
        );

        // Map function
        var map = function () {
          emit(fn(this.timestamp.getYear()), 1); // eslint-disable-line
        };

        // Reduce function
        var reduce = function (k, v) {
          var count = 0;
          for (var i = 0; i < v.length; i++) {
            count += v[i];
          }

          return count;
        };

        // Javascript function available in the map reduce scope
        var t = function (val) {
          return val + 1;
        };

        // Execute the map reduce with the custom scope
        var o = {};
        o.scope = { fn: new Code(t.toString()) };
        o.out = { replace: 'replacethiscollection' };

        // Execute with output collection
        var outCollection = yield collection.mapReduce(map, reduce, o);
        // Find all entries in the map-reduce collection
        var results = yield outCollection.find().toArray();
        test.equal(2, results[0].value);

        // mapReduce with scope containing plain function
        o = {};
        o.scope = { fn: t };
        o.out = { replace: 'replacethiscollection' };

        // Execute with outCollection
        outCollection = yield collection.mapReduce(map, reduce, o);
        // Find all entries in the map-reduce collection
        results = yield outCollection.find().toArray();
        test.equal(2, results[0].value);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Mapreduce using a scope containing javascript objects with functions using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it.skip('shouldPerformMapReduceInContextObjectsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_scope_objects_with_generators');

        // Insert some test documents
        yield collection.insertMany(
          [
            { user_id: 1, timestamp: new Date() },
            { user_id: 2, timestamp: new Date() }
          ],
          { w: 1 }
        );

        // Map function
        var map = function () {
          emit(obj.fn(this.timestamp.getYear()), 1); // eslint-disable-line
        };

        // Reduce function
        var reduce = function (k, v) {
          var count = 0;
          for (var i = 0; i < v.length; i++) {
            count += v[i];
          }

          return count;
        };

        // Javascript function available in the map reduce scope
        var t = function (val) {
          return val + 1;
        };

        // Execute the map reduce with the custom scope containing objects
        var o = {};
        o.scope = { obj: { fn: new Code(t.toString()) } };
        o.out = { replace: 'replacethiscollection' };

        // Execute returning outCollection
        var outCollection = yield collection.mapReduce(map, reduce, o);

        // Find all entries in the map-reduce collection
        var results = yield outCollection.find().toArray();
        test.equal(2, results[0].value);

        // mapReduce with scope containing plain function
        o = {};
        o.scope = { obj: { fn: t } };
        o.out = { replace: 'replacethiscollection' };

        // Execute returning outCollection
        outCollection = yield collection.mapReduce(map, reduce, o);
        // Find all entries in the map-reduce collection
        results = yield outCollection.find().toArray();
        test.equal(2, results[0].value);
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections indexes using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method indexes
   */
  it('shouldCorrectlyRetrieveACollectionsIndexesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Crete the collection for the distinct example
        var collection = db.collection('simple_key_based_distinct_with_generators');

        // Create a geo 2d index
        yield collection.ensureIndex({ loc: '2d' }, configuration.writeConcernMax());

        // Create a simple single field index
        yield collection.ensureIndex({ a: 1 }, configuration.writeConcernMax());

        // List all of the indexes on the collection
        var indexes = yield collection.indexes();
        test.equal(3, indexes.length);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example showing the use of the indexExists function using a Generator and the co module for a single index name and a list of index names.
   *
   * @example-class Collection
   * @example-method indexExists
   */
  it('shouldCorrectlyExecuteIndexExistsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Create a test collection that we are getting the options back from
        var collection = db.collection(
          'test_collection_index_exists_with_generators',
          configuration.writeConcernMax()
        );
        // Create an index on the collection
        yield collection.createIndex('a', configuration.writeConcernMax());

        // Let's test to check if a single index exists
        var result = yield collection.indexExists('a_1');
        test.equal(true, result);

        // Let's test to check if multiple indexes are available
        result = yield collection.indexExists(['a_1', '_id_']);
        test.equal(true, result);

        // Check if a non existing index exists
        result = yield collection.indexExists('c_1');
        test.equal(false, result);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example showing the information returned by indexInformation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method indexInformation
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformationWithGenerators', {
    metadata: {
      requires: { generators: true, topology: ['single'] }
    },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_2_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax()
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Fetch basic indexInformation for collection
        var indexInformation = yield db.indexInformation(
          'more_index_information_test_2_with_generators'
        );
        test.deepEqual([['_id', 1]], indexInformation._id_);
        test.deepEqual(
          [
            ['a', 1],
            ['b', 1]
          ],
          indexInformation.a_1_b_1
        );

        // Fetch full index information
        indexInformation = yield collection.indexInformation({ full: true });
        test.deepEqual({ _id: 1 }, indexInformation[0].key);
        test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

        // Close db
        yield client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the information returned by indexInformation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method indexInformation
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformationWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_3_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Fetch basic indexInformation for collection
        var indexInformation = yield collection.indexInformation();
        test.deepEqual([['_id', 1]], indexInformation._id_);
        test.deepEqual(
          [
            ['a', 1],
            ['b', 1]
          ],
          indexInformation.a_1_b_1
        );

        // Fetch full index information
        indexInformation = yield collection.indexInformation({ full: true });
        test.deepEqual({ _id: 1 }, indexInformation[0].key);
        test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple document insert using a Generator and the co module example, not using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },
    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        var collection = db.collection('simple_document_insert_collection_no_safe_with_generators');
        // Insert a single document
        yield collection.insertOne({ hello: 'world_no_safe' });

        var item = yield collection.findOne({ hello: 'world_no_safe' });
        test.equal('world_no_safe', item.hello);
        yield client.close();
      });
      // END
    }
  });

  /**
   * A batch document insert using a Generator and the co module example, using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafeWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Fetch a collection to insert document into
        var collection = db.collection('batch_document_insert_collection_safe_with_generators');

        // Insert a single document
        yield collection.insertMany(
          [{ hello: 'world_safe1' }, { hello: 'world_safe2' }],
          configuration.writeConcernMax()
        );

        // Fetch the document
        var item = yield collection.findOne({ hello: 'world_safe2' });
        test.equal('world_safe2', item.hello);
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of inserting a document containing functions using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method insert
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Fetch a collection to insert document into
        var collection = db.collection('simple_document_insert_with_function_safe_with_generators');

        // Get the option
        var o = configuration.writeConcernMax();
        o.serializeFunctions = true;

        // Insert a single document
        yield collection.insertOne({ hello: 'world', func: function () {} }, o);

        // Fetch the document
        var item = yield collection.findOne({ hello: 'world' });
        test.ok('function() {}', item.code);
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of using keepGoing to allow batch insert using a Generator and the co module to complete even when there are illegal documents in the batch
   *
   * @example-class Collection
   * @example-method insert
   */
  it('Should correctly execute insert with keepGoing option on mongod >= 1.9.1 with Generators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>1.9.1', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection
        var collection = db.collection('keepGoingExample_with_generators');

        // Add an unique index to title to force errors in the batch insert
        yield collection.ensureIndex({ title: 1 }, { unique: true });

        // Insert some intial data into the collection
        yield collection.insertMany(
          [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
          configuration.writeConcernMax()
        );

        try {
          // Force keep going flag, ignoring unique index issue
          yield collection.insert(
            [
              { name: 'Jim' },
              { name: 'Sarah', title: 'Princess' },
              { name: 'Gump', title: 'Gump' }
            ],
            { w: 1, keepGoing: true }
          );
        } catch (err) {} // eslint-disable-line
        // Count the number of documents left (should not include the duplicates)
        var count = yield collection.count();
        test.equal(3, count);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example showing how to establish if it's a capped collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method isCapped
   */
  it('shouldCorrectlyExecuteIsCappedWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a test collection that we are getting the options back from
        var collection = yield db.createCollection('test_collection_is_capped_with_generators', {
          capped: true,
          size: 1024
        });
        test.equal('test_collection_is_capped_with_generators', collection.collectionName);

        // Let's fetch the collection options
        var capped = yield collection.isCapped();
        test.equal(true, capped);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example returning the options for a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method options
   */
  it('shouldCorrectlyRetrieveCollectionOptionsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a test collection that we are getting the options back from
        var collection = yield db.createCollection('test_collection_options_with_generators', {
          capped: true,
          size: 1024
        });
        test.equal('test_collection_options_with_generators', collection.collectionName);

        // Let's fetch the collection options
        var options = yield collection.options();
        test.equal(true, options.capped);
        test.ok(options.size >= 1024);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example removing all documents in a collection not using safe mode using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method remove
   */
  it('shouldRemoveAllDocumentsNoSafeWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Fetch a collection to insert document into
        var collection = db.collection('remove_all_documents_no_safe_with_generators');

        // Insert a bunch of documents
        yield collection.insertMany([{ a: 1 }, { b: 2 }], { w: 1 });

        // Remove all the document
        collection.removeMany();

        // Fetch all results
        var items = yield collection.find().toArray();
        test.equal(0, items.length);
        yield client.close();
      });
      // END
    }
  });

  /**
   * An example removing a subset of documents using safe mode to ensure removal of documents using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method remove
   */
  it('shouldRemoveSubsetOfDocumentsSafeModeWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Fetch a collection to insert document into
        var collection = db.collection('remove_subset_of_documents_safe_with_generators');
        // Insert a bunch of documents
        yield collection.insertMany([{ a: 1 }, { b: 2 }], { w: 1 });
        // Remove all the document
        var r = yield collection.removeOne({ a: 1 }, { w: 1 });
        expect(r).property('deletedCount').to.equal(1);
        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of illegal and legal renaming of a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method rename
   */
  it('shouldCorrectlyRenameCollectionWithGenerators', {
    metadata: {
      requires: { generators: true, topology: ['single'] }
    },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Open a couple of collections
        var collection1 = yield db.createCollection('test_rename_collection_with_generators');
        var collection2 = yield db.createCollection('test_rename_collection2_with_generators');
        // Attemp to rename a collection to a number
        try {
          collection1.rename(5, function(err, collection) {}); // eslint-disable-line
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal('collection name must be a String', err.message);
        }

        // Attemp to rename a collection to an empty string
        try {
          collection1.rename('', function(err, collection) {}); // eslint-disable-line
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal('collection names cannot be empty', err.message);
        }

        // Attemp to rename a collection to an illegal name including the character $
        try {
          collection1.rename('te$t', function(err, collection) {}); // eslint-disable-line
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal("collection names must not contain '$'", err.message);
        }

        // Attemp to rename a collection to an illegal name starting with the character .
        try {
          collection1.rename('.test', function(err, collection) {}); // eslint-disable-line
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal("collection names must not start or end with '.'", err.message);
        }

        // Attemp to rename a collection to an illegal name ending with the character .
        try {
          collection1.rename('test.', function(err, collection) {}); // eslint-disable-line
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal("collection names must not start or end with '.'", err.message);
        }

        // Attemp to rename a collection to an illegal name with an empty middle name
        try {
          collection1.rename('tes..t', function(err, collection) {}); // eslint-disable-line
        } catch (err) {
          test.equal('collection names cannot be empty', err.message);
        }

        // Insert a couple of documents
        yield collection1.insertMany([{ x: 1 }, { x: 2 }], configuration.writeConcernMax());

        try {
          // Attemp to rename the first collection to the second one, this will fail
          yield collection1.rename('test_rename_collection2_with_generators');
        } catch (err) {
          test.ok(err instanceof Error);
          test.ok(err.message.length > 0);

          // Attemp to rename the first collection to a name that does not exist
          // this will be successful
          collection2 = yield collection1.rename('test_rename_collection3_with_generators');
          test.equal('test_rename_collection3_with_generators', collection2.collectionName);

          // Ensure that the collection is pointing to the new one
          var count = yield collection2.count();
          test.equal(2, count);
          yield client.close();
        }
      });
      // END
    }
  });

  /**
   * Example of a simple document update with safe set to false on an existing document using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method update
   */
  it('shouldCorrectlyUpdateASimpleDocumentWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Get a collection
        var collection = db.collection('update_a_simple_document_with_generators');

        // Insert a document, then update it
        yield collection.insertOne({ a: 1 }, configuration.writeConcernMax());

        // Update the document with an atomic operator
        yield collection.updateOne({ a: 1 }, { $set: { b: 2 } });

        var item = yield collection.findOne({ a: 1 });

        test.equal(1, item.a);
        test.equal(2, item.b);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple document update using upsert (the document will be inserted if it does not exist) using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method update
   */
  it('shouldCorrectlyUpsertASimpleDocumentWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Get a collection
        var collection = db.collection('update_a_simple_document_upsert_with_generators');
        // Update the document using an upsert operation, ensuring creation if it does not exist
        var result = yield collection.updateOne(
          { a: 1 },
          { $set: { b: 2, a: 1 } },
          { upsert: true, w: 1 }
        );
        test.equal(1, result.result.n);

        // Fetch the document that we modified and check if it got inserted correctly
        var item = yield collection.findOne({ a: 1 });
        test.equal(1, item.a);
        test.equal(2, item.b);
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of an update across multiple documents using the multi option and using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method update
   */
  it('shouldCorrectlyUpdateMultipleDocumentsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Get a collection
        var collection = db.collection('update_a_simple_document_multi_with_generators');

        // Insert a couple of documentations
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 1, b: 2 }
          ],
          configuration.writeConcernMax()
        );

        var o = configuration.writeConcernMax();
        var r = yield collection.updateMany({ a: 1 }, { $set: { b: 0 } }, o);
        test.equal(2, r.result.n);

        // Fetch all the documents and verify that we have changed the b value
        var items = yield collection.find().toArray();
        test.equal(1, items[0].a);
        test.equal(0, items[0].b);
        test.equal(1, items[1].a);
        test.equal(0, items[1].b);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections stats using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method stats
   */
  it('shouldCorrectlyReturnACollectionsStatsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Crete the collection for the distinct example
        var collection = db.collection('collection_stats_test_with_generators');

        // Insert some documents
        yield collection.insertMany(
          [{ a: 1 }, { hello: 'world' }],
          configuration.writeConcernMax()
        );

        // Retrieve the statistics for the collection
        var stats = yield collection.stats();
        test.equal(2, stats.count);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using Generators.
   *
   * @example-class Collection
   * @example-method dropIndexes
   */
  it('shouldCorrectlyCreateAndDropAllIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('shouldCorrectlyCreateAndDropAllIndex_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4, c: 4 }
          ],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Create an additional index
        yield collection.ensureIndex(
          { c: 1 },
          { unique: true, background: true, sparse: true, w: 1 }
        );

        // Drop the index
        yield collection.dropAllIndexes();

        // Verify that the index is gone
        var indexInformation = yield collection.indexInformation();
        test.deepEqual([['_id', 1]], indexInformation._id_);
        expect(indexInformation.a_1_b_1).to.not.exist;
        expect(indexInformation.c_1).to.not.exist;

        yield client.close();
      });
      // END
    }
  });

  /**************************************************************************
   *
   * DB TESTS
   *
   *************************************************************************/

  /**
   * An example of retrieving the collections list for a database using a Generator and the co module.
   *
   * @example-class Db
   * @example-method listCollections
   */
  it('shouldCorrectlyRetrievelistCollectionsWithGenerators', {
    metadata: {
      requires: { generators: true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] }
    },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();

        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get an empty db
        var db1 = client.db('listCollectionTestDb2Generator');
        // Create a collection
        var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_generators');
        // Ensure the collection was created
        yield collection.insertOne({ a: 1 });

        // Return the information of a single collection name
        var items = yield db1
          .listCollections({ name: 'shouldCorrectlyRetrievelistCollections_with_generators' })
          .toArray();
        test.equal(1, items.length);

        // Return the information of a all collections, using the callback format
        items = yield db1.listCollections().toArray();
        test.ok(items.length >= 1);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of retrieving all collections for a db as Collection objects using a Generator and the co module.
   *
   * @example-class Db
   * @example-method collections
   */
  it('shouldCorrectlyRetrieveAllCollectionsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Retry to get the collection, should work as it's now created
        var collections = yield db.collections();
        test.ok(collections.length > 0);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of adding a user to the database using a Generator and the co module.
   *
   * @example-class Db
   * @example-method addUser
   */
  it('shouldCorrectlyAddUserToDbWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Add a user to the database
        yield db.addUser('user', 'name');

        // Remove the user from the db
        yield db.removeUser('user');
        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of removing a user using a Generator and the co module.
   *
   * @example-class Db
   * @example-method removeUser
   */
  it('shouldCorrectlyAddAndRemoveUserWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Add a user to the database
        yield db.addUser('user', 'name');

        // Authenticate
        var client2 = configuration.newClient(
          'mongodb://user:name@localhost:27017/' + configuration.db
        );

        yield client2.connect();
        client2.close();

        // Remove the user from the db
        yield db.removeUser('user');

        try {
          // Authenticate
          const client = configuration.newClient('mongodb://user:name@localhost:27017/admin', {
            serverSelectionTimeoutMS: 10
          });

          yield client.connect();
          test.ok(false);
        } catch (err) {} // eslint-disable-line

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the creation of a collection using a Generator and the co module.
   *
   * @example-class Db
   * @example-method createCollection
   */
  it('shouldCorrectlyCreateACollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Create a capped collection with a maximum of 1000 documents
        var collection = yield db.createCollection('a_simple_collection_with_generators', {
          capped: true,
          size: 10000,
          max: 1000,
          w: 1
        });

        // Insert a document in the capped collection
        yield collection.insertOne({ a: 1 }, configuration.writeConcernMax());
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone using a Generator and the co module.
   *
   * @example-class Db
   * @example-method dropCollection
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServerWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Execute ping against the server
        yield db.command({ ping: 1 });

        // Create a capped collection with a maximum of 1000 documents
        var collection = yield db.createCollection(
          'a_simple_create_drop_collection_with_generators',
          { capped: true, size: 10000, max: 1000, w: 1 }
        );

        // Insert a document in the capped collection
        yield collection.insertOne({ a: 1 }, configuration.writeConcernMax());

        // Drop the collection from this world
        yield db.dropCollection('a_simple_create_drop_collection_with_generators');

        // Verify that the collection is gone
        var names = yield db
          .listCollections({ name: 'a_simple_create_drop_collection_with_generators' })
          .toArray();
        test.equal(0, names.length);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example executing a command against the server using a Generator and the co module.
   *
   * @example-class Db
   * @example-method command
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Execute ping against the server
        yield db.command({ ping: 1 });
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone.
   *
   * @example-class Db
   * @example-method renameCollection
   */
  it('shouldCorrectlyRenameACollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Create a collection
        var collection = yield db.createCollection(
          'simple_rename_collection_with_generators',
          configuration.writeConcernMax()
        );

        // Insert a document in the collection
        yield collection.insertOne({ a: 1 }, configuration.writeConcernMax());

        // Retrieve the number of documents from the collection
        var count = yield collection.count();
        test.equal(1, count);

        // Rename the collection
        var collection2 = yield db.renameCollection(
          'simple_rename_collection_with_generators',
          'simple_rename_collection_2_with_generators'
        );

        // Retrieve the number of documents from the collection
        count = yield collection2.count();
        test.equal(1, count);

        // Verify that the collection is gone
        var names = yield db
          .listCollections({ name: 'simple_rename_collection_with_generators' })
          .toArray();
        test.equal(0, names.length);

        // Verify that the new collection exists
        names = yield db
          .listCollections({ name: 'simple_rename_collection_2_with_generators' })
          .toArray();
        test.equal(1, names.length);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
   *
   * @example-class Db
   * @example-method createIndex
   */
  it('shouldCreateOnDbComplexIndexOnTwoFieldsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_complex_index_test_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax()
        );

        // Create an index on the a field
        yield db.createIndex(
          'more_complex_index_test_with_generators',
          { a: 1, b: 1 },
          { unique: true, background: true, w: 1 }
        );

        // Show that duplicate records got dropped
        var items = yield collection.find({}).toArray();
        test.equal(4, items.length);

        // Perform a query, with explain to show we hit the query
        var explanation = yield collection.find({ a: 2 }).explain();
        test.ok(explanation != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
   *
   * @example-class Db
   * @example-method ensureIndex
   */
  it('shouldCreateComplexEnsureIndexDbWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_complex_ensure_index_db_test_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax()
        );

        // Create an index on the a field
        yield db.ensureIndex(
          'more_complex_ensure_index_db_test_with_generators',
          { a: 1, b: 1 },
          { unique: true, background: true, w: 1 }
        );

        // Show that duplicate records got dropped
        var items = yield collection.find({}).toArray();
        test.equal(4, items.length);

        // Perform a query, with explain to show we hit the query
        var explanation = yield collection.find({ a: 2 }).explain();
        test.ok(explanation != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the dropping of a database using a Generator and the co module.
   *
   * @example-class Db
   * @example-method dropDatabase
   */
  it('shouldCorrectlyDropTheDatabaseWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection
        var collection = db.collection('more_index_information_test_1_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax()
        );

        // Let's drop the database
        yield db.dropDatabase();

        // Wait two seconds to let it replicate across
        yield new Promise(resolve => setTimeout(resolve, 2000));
        // Get the admin database
        var dbs = yield db.admin().listDatabases();
        // Grab the databases
        dbs = dbs.databases;
        // Did we find the db
        var found = false;

        // Check if we have the db in the list
        for (var i = 0; i < dbs.length; i++) {
          if (dbs[i].name === 'integration_tests_to_drop') found = true;
        }

        // We should not find the databases
        if (process.env['JENKINS'] == null) test.equal(false, found);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example showing how to retrieve the db statistics using a Generator and the co module.
   *
   * @example-class Db
   * @example-method stats
   */
  it('shouldCorrectlyRetrieveDbStatsWithGeneratorsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        var stats = yield db.stats();
        test.ok(stats != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Simple example connecting to two different databases sharing the socket connections below using a Generator and the co module.
   *
   * @example-class Db
   * @example-method db
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Reference a different database sharing the same connections
        // for the data transfer
        var secondDb = client.db('integration_tests_2');

        // Fetch the collections
        var multipleColl1 = db.collection('multiple_db_instances_with_generators');
        var multipleColl2 = secondDb.collection('multiple_db_instances_with_generators');

        // Write a record into each and then count the records stored
        yield multipleColl1.insertOne({ a: 1 }, { w: 1 });
        yield multipleColl2.insertOne({ a: 1 }, { w: 1 });

        // Count over the results ensuring only on record in each collection
        var count = yield multipleColl1.count();
        test.equal(1, count);

        count = yield multipleColl2.count();
        test.equal(1, count);

        yield client.close();
      });
      // END
    }
  });

  /**************************************************************************
   *
   * ADMIN TESTS
   *
   *************************************************************************/

  /**
   * Retrieve the buildInfo for the current MongoDB instance using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method buildInfo
   */
  it('shouldCorrectlyRetrieveBuildInfoWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrieve the build information for the MongoDB instance
        yield adminDb.buildInfo();

        yield client.close();
      });
      // END
    }
  });

  /**
   * Retrieve the buildInfo using the command function using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method command
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommandWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrieve the build information using the admin command
        yield adminDb.command({ buildInfo: 1 });

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of how to use the setProfilingInfo using a Generator and the co module.
   * Use this command to set the Profiling level on the MongoDB server
   *
   * @example-class Db
   * @example-method setProfilingLevel
   */
  it('shouldCorrectlyChangeProfilingLevelWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_generators');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        yield collection.insertOne({ a: 1 }, { w: 1 });

        // Set the profiling level to only profile slow queries
        yield db.setProfilingLevel('slow_only');

        // Retrieve the profiling level and verify that it's set to slow_only
        var level = yield db.profilingLevel();
        test.equal('slow_only', level);

        // Turn profiling off
        yield db.setProfilingLevel('off');

        // Retrieve the profiling level and verify that it's set to off
        level = yield db.profilingLevel();
        test.equal('off', level);

        // Set the profiling level to log all queries
        yield db.setProfilingLevel('all');

        // Retrieve the profiling level and verify that it's set to all
        level = yield db.profilingLevel();
        test.equal('all', level);

        try {
          // Attempt to set an illegal profiling level
          yield db.setProfilingLevel('medium');
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal('Error: illegal profiling level value medium', err.message);

          yield client.close();
        }
      });
      // END
    }
  });

  /**
   * An example of how to use the profilingInfo using a Generator and the co module.
   * Use this command to pull back the profiling information currently set for Mongodb
   *
   * @example-class Db
   * @example-method profilingInfo
   */
  it('shouldCorrectlySetAndExtractProfilingInfoWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_generators');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        yield collection.insertOne({ a: 1 }, { w: 1 });

        // Set the profiling level to all
        yield db.setProfilingLevel('all');

        // Execute a query command
        yield collection.find().toArray();

        // Turn off profiling
        yield db.setProfilingLevel('off');

        // Retrieve the profiling information
        var infos = yield db.profilingInfo();
        test.ok(infos.constructor === Array);
        test.ok(infos.length >= 1);
        test.ok(infos[0].ts.constructor === Date);
        test.ok(infos[0].millis.constructor === Number);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of how to use the validateCollection command using a Generator and the co module.
   * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
   *
   * @example-class Admin
   * @example-method validateCollection
   */
  it('shouldCorrectlyCallValidateCollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_generators');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        yield collection.insertOne({ a: 1 }, { w: 1 });

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Validate the 'test' collection
        var doc = yield adminDb.validateCollection('test_with_generators');
        test.ok(doc != null);

        yield client.close();
      });
    }
  });

  /**
   * An example of how to add a user to the admin database using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method ping
   */
  it('shouldCorrectlyPingTheMongoDbInstanceWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Ping the server
        yield adminDb.ping();

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of how to add a user to the admin database using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method addUser
   */
  it('shouldCorrectlyAddAUserToAdminDbWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        yield adminDb.addUser('admin11', 'admin11');

        var result = yield adminDb.removeUser('admin11');
        test.ok(result);

        yield client.close();
      });
    }
  });

  /**
   * An example of how to remove a user from the admin database using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method removeUser
   */
  it('shouldCorrectlyAddAUserAndRemoveItFromAdminDbWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        yield adminDb.addUser('admin12', 'admin12');

        // Remove the user
        var result = yield adminDb.removeUser('admin12');
        test.equal(true, result);

        yield client.close();
      });
      // END
    }
  });

  /**
   * An example of listing all available databases. using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method listDatabases
   */
  it('shouldCorrectlyListAllAvailableDatabasesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // List all the available databases
        var dbs = yield adminDb.listDatabases();
        test.ok(dbs.databases.length > 0);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Retrieve the current server Info using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method serverStatus
   */
  it('shouldCorrectlyRetrieveServerInfoWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_generators');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        yield collection.insertOne({ a: 1 }, { w: 1 });

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrieve the server Info
        var info = yield adminDb.serverStatus();
        test.ok(info != null);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Retrieve the current replicaset status if the server is running as part of a replicaset using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method replSetGetStatus
   */
  it('shouldCorrectlyRetrieveReplSetGetStatusWithGenerators', {
    metadata: { requires: { generators: true, topology: ['replicaset'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_generators');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        yield collection.insertOne({ a: 1 }, { w: 1 });

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrieve the server Info, returns error if we are not
        // running a replicaset
        yield adminDb.replSetGetStatus();

        yield client.close();
      });
      // END
    }
  });

  /**************************************************************************
   *
   * CURSOR TESTS
   *
   *************************************************************************/

  /**
   * An example showing the information returned by indexInformation using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method toArray
   */
  it('shouldCorrectlyExecuteToArrayWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection to hold our documents
        var collection = db.collection('test_array_with_generators');

        // Insert a test document
        yield collection.insertOne({ b: [1, 2, 3] }, configuration.writeConcernMax());

        // Retrieve all the documents in the collection
        var documents = yield collection.find().toArray();
        test.equal(1, documents.length);
        test.deepEqual([1, 2, 3], documents[0].b);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the count function of the cursor using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method count
   */
  it('shouldCorrectlyUseCursorCountFunctionWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Creat collection
        var collection = db.collection('cursor_count_collection_with_generators');

        // Insert some docs
        yield collection.insertMany([{ a: 1 }, { a: 2 }], configuration.writeConcernMax());

        // Do a find and get the cursor count
        var count = yield collection.find().count();
        test.equal(2, count);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the use of next and co module to iterate over cursor
   *
   * @example-class Cursor
   * @example-method next
   */
  it('shouldCorrectlyPerformNextOnCursorWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection
        var collection = db.collection('simple_next_object_collection_next_with_generators');

        // Insert some documents we can sort on
        yield collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax()
        );

        // Get a cursor
        var cursor = collection.find({});

        // Get the document
        var docs = [];

        // Iterate over the cursor
        while (yield cursor.hasNext()) {
          docs.push(yield cursor.next());
        }

        // Validate the correct number of elements
        test.equal(3, docs.length);
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor explain function using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method explain
   */
  it('shouldCorrectlyPerformSimpleExplainCursorWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a collection
        var collection = db.collection('simple_explain_collection_with_generators');

        // Insert some documents we can sort on
        yield collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax()
        );

        // Do normal ascending sort
        yield collection.find().explain();
        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor close function using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method close
   */
  it('shouldStreamDocumentsUsingTheCloseFunctionWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN

        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_close_function_on_cursor_with_generators');

        // Insert documents into collection
        yield collection.insertMany(docs, configuration.writeConcernMax());
        // Perform a find to get a cursor
        var cursor = collection.find();

        // Fetch the first object
        yield cursor.next();

        // Close the cursor, this is the same as reseting the query
        yield cursor.close();
        yield client.close();
      });
      // END
    }
  });

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
   */
  it('Should correctly execute ordered batch with no errors using write commands with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('batch_write_ordered_ops_0_with_generators');
        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();
        // Add some operations to be executed in order
        batch.insert({ a: 1 });
        batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
        batch
          .find({ a: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });
        batch.insert({ a: 3 });
        batch.find({ a: 3 }).remove({ a: 3 });

        // Execute the operations
        var result = yield batch.execute();
        // Check state of result
        test.equal(2, result.nInserted);
        test.equal(1, result.nUpserted);
        test.equal(1, result.nMatched);
        test.ok(1 === result.nModified || result.nModified == null);
        test.equal(1, result.nRemoved);

        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(2, upserts[0].index);
        test.ok(upserts[0]._id != null);

        var upsert = result.getUpsertedIdAt(0);
        test.equal(2, upsert.index);
        test.ok(upsert._id != null);

        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple ordered insert/update/upsert/remove ordered collection using a Generator and the co module.
   *
   *
   * @example-class Collection
   * @example-method initializeUnorderedBulkOp
   */
  it('Should correctly execute unordered batch with no errors with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('batch_write_unordered_ops_legacy_0_with_generators');
        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp({ useLegacyOps: true });

        // Add some operations to be executed in order
        batch.insert({ a: 1 });
        batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
        batch
          .find({ a: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });
        batch.insert({ a: 3 });
        batch.find({ a: 3 }).remove({ a: 3 });

        // Execute the operations
        var result = yield batch.execute();
        // Check state of result
        test.equal(2, result.nInserted);
        test.equal(1, result.nUpserted);
        test.equal(1, result.nMatched);
        test.ok(1 === result.nModified || result.nModified == null);
        test.equal(1, result.nRemoved);

        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(2, upserts[0].index);
        test.ok(upserts[0]._id != null);

        var upsert = result.getUpsertedIdAt(0);
        test.equal(2, upsert.index);
        test.ok(upsert._id != null);

        // Finish up test
        yield client.close();
      });
      // END
    }
  });

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
   */
  it('Should correctly execute insertOne operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('insert_one_with_generators');
        var r = yield col.insertOne({ a: 1 });
        test.equal(1, r.insertedCount);
        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple insertMany operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method insertMany
   */
  it('Should correctly execute insertMany operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('insert_many_with_generators');
        var r = yield col.insertMany([{ a: 1 }, { a: 2 }]);
        test.equal(2, r.insertedCount);
        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple updateOne operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method updateOne
   */
  it('Should correctly execute updateOne operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('update_one_with_generators');
        var r = yield col.updateOne({ a: 1 }, { $set: { a: 2 } }, { upsert: true });
        test.equal(0, r.matchedCount);
        test.equal(1, r.upsertedCount);
        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple updateMany operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method updateMany
   */
  it('Should correctly execute updateMany operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('update_many_with_generators');
        var r = yield col.insertMany([{ a: 1 }, { a: 1 }]);
        test.equal(2, r.insertedCount);

        // Update all documents
        r = yield col.updateMany({ a: 1 }, { $set: { b: 1 } });
        test.equal(2, r.matchedCount);
        test.equal(2, r.modifiedCount);

        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple removeOne operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method removeOne
   */
  it('Should correctly execute removeOne operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('remove_one_with_generators');
        var r = yield col.insertMany([{ a: 1 }, { a: 1 }]);
        test.equal(2, r.insertedCount);

        r = yield col.removeOne({ a: 1 });
        test.equal(1, r.deletedCount);
        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple removeMany operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method removeMany
   */
  it('Should correctly execute removeMany operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('remove_many_with_generators');
        var r = yield col.insertMany([{ a: 1 }, { a: 1 }]);
        test.equal(2, r.insertedCount);

        // Update all documents
        r = yield col.removeMany({ a: 1 });
        test.equal(2, r.deletedCount);

        // Finish up test
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple bulkWrite operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method bulkWrite
   */
  it('Should correctly execute bulkWrite operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('bulk_write_with_generators');
        var r = yield col.bulkWrite(
          [
            { insertOne: { document: { a: 1 } } },
            { updateOne: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { updateMany: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { deleteOne: { filter: { c: 1 } } },
            { deleteMany: { filter: { c: 1 } } },
            { replaceOne: { filter: { c: 3 }, replacement: { c: 4 }, upsert: true } }
          ],
          { ordered: true, w: 1 }
        );
        test.equal(1, r.nInserted);
        test.equal(2, r.nUpserted);
        test.equal(0, r.nRemoved);

        // Crud fields
        test.equal(1, r.insertedCount);
        test.equal(1, Object.keys(r.insertedIds).length);
        test.equal(1, r.matchedCount);
        test.ok(r.modifiedCount === 0 || r.modifiedCount === 1);
        test.equal(0, r.deletedCount);
        test.equal(2, r.upsertedCount);
        test.equal(2, Object.keys(r.upsertedIds).length);

        // Ordered bulk operation
        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndDelete operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOneAndDelete
   */
  it('Should correctly execute findOneAndDelete operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_delete_with_generators');
        var r = yield col.insertMany([{ a: 1, b: 1 }], { w: 1 });
        test.equal(1, r.result.n);

        r = yield col.findOneAndDelete({ a: 1 }, { projection: { b: 1 }, sort: { a: 1 } });
        test.equal(1, r.lastErrorObject.n);
        test.equal(1, r.value.b);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndReplace operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOneAndReplace
   */
  it('Should correctly execute findOneAndReplace operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_replace_with_generators');
        var r = yield col.insertMany([{ a: 1, b: 1 }], { w: 1 });
        test.equal(1, r.result.n);

        r = yield col.findOneAndReplace(
          { a: 1 },
          { c: 1, b: 1 },
          {
            projection: { b: 1, c: 1 },
            sort: { a: 1 },
            returnOriginal: false,
            upsert: true
          }
        );
        test.equal(1, r.lastErrorObject.n);
        test.equal(1, r.value.b);
        test.equal(1, r.value.c);

        yield client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndUpdate operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOneAndUpdate
   */
  it('Should correctly execute findOneAndUpdate operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_update_with_generators');
        var r = yield col.insertMany([{ a: 1, b: 1 }], { w: 1 });
        test.equal(1, r.result.n);

        r = yield col.findOneAndUpdate(
          { a: 1 },
          { $set: { d: 1 } },
          {
            projection: { b: 1, d: 1 },
            sort: { a: 1 },
            returnOriginal: false,
            upsert: true
          }
        );
        test.equal(1, r.lastErrorObject.n);
        test.equal(1, r.value.b);
        test.equal(1, r.value.d);

        yield client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the listening to a capped collection using a Generator and the co module.
   *
   * @example-class Db
   * @example-method createCollection
   */
  it('Should correctly add capped collection options to cursor with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        // Connect
        var client = yield configuration
          .newClient(configuration.writeConcernMax(), { poolSize: 1 })
          .connect();
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   co = require('co');
        // LINE   test = require('assert');
        // LINE
        // LINE co(function*() {
        // LINE   const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE   yield client.connect();
        // LINE
        // LINE   var db = client.db('test');
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // BEGIN
        // Create a capped collection with a maximum of 1000 documents
        var collection = yield db.createCollection('a_simple_collection_2_with_generators', {
          capped: true,
          size: 100000,
          max: 10000,
          w: 1
        });
        var docs = [];
        for (var i = 0; i < 1000; i++) docs.push({ a: i });

        // Insert a document in the capped collection
        yield collection.insertMany(docs, configuration.writeConcernMax());

        yield new Promise((resolve, reject) => {
          var total = 0;
          // Get the cursor
          var cursor = collection
            .find({})
            .addCursorFlag('tailable', true)
            .addCursorFlag('awaitData', true);

          cursor.on('data', function () {
            total = total + 1;

            if (total === 1000) {
              cursor.kill();
            }
          });

          cursor.on('end', function () {
            // TODO: forced because the cursor is still open/active
            client.close(true, err => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   */
  it('Correctly handle sample aggregation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        generators: true,
        mongodb: '>=3.2.0',
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function () {
      var configuration = this.configuration;
      var co = require('co');

      return co(function* () {
        var client = configuration.newClient({ w: 1 }, { poolSize: 1 });
        client = yield client.connect();
        var db = client.db(configuration.db);
        var string = new Array(6000000).join('x');
        // Get the collection
        var collection = db.collection('bigdocs_aggregate_sample_issue');

        // Go over the number of
        for (var i = 0; i < 100; i++) {
          yield collection.insertOne({
            s: string
          });
        }

        yield collection.count();

        var options = {
          maxTimeMS: 10000,
          allowDiskUse: true
        };

        var index = 0;

        collection
          .aggregate(
            [
              {
                $sample: {
                  size: 100
                }
              }
            ],
            options
          )
          .batchSize(10)
          .on('error', function () {
            client.close();
          })
          .on('data', function () {
            index = index + 1;
          })
          // `end` sometimes emits before any `data` events have been emitted,
          // depending on document size.
          .on('end', function () {
            test.equal(100, index);

            client.close();
          });
      });
    }
  });
});
