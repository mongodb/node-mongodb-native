'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var Buffer = require('safe-buffer').Buffer;

/**************************************************************************
 *
 * COLLECTION TESTS
 *
 *************************************************************************/

describe('Operation (Generators)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * Call toArray on an aggregation cursor using ES6 generators and the co module
   *
   * @example-class Collection
   * @example-method aggregate
   * @ignore
   */
  it('aggregationExample2WithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>2.1.0', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Call next on an aggregation cursor using a Generator and the co module
   *
   * @example-class AggregationCursor
   * @example-method next
   * @ignore
   */
  it('Aggregation Cursor next Test with Generators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>2.1.0', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of running simple count commands against a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method count
   * @ignore
   */
  it('shouldCorrectlyDoSimpleCountExamplesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a Generator and the co module and a compound unique index in the background and dropping duplicated documents
   *
   * @example-class Collection
   * @example-method createIndex
   * @ignore
   */
  it('shouldCreateComplexIndexOnTwoFieldsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of running the distinct command using a Generator and the co module against a collection
   *
   * @example-class Collection
   * @example-method distinct
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of running the distinct command against a collection using a Generator and the co module with a filter query
   *
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of Collection.prototype.drop using a Generator and the co module
   *
   * @example-class Collection
   * @example-method drop
   * @ignore
   */
  it('shouldCorrectlyDropCollectionWithDropFunctionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        replies.forEach(function(document) {
          if (document.name === 'test_other_drop_with_generators') {
            found = true;
            return;
          }
        });

        // Ensure the collection is not found
        test.equal(false, found);

        // Let's close the db
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a how to drop all the indexes on a collection using dropAllIndexes with a Generator and the co module
   *
   * @example-class Collection
   * @example-method dropAllIndexes
   * @ignore
   */
  it('dropAllIndexesExample1WithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using a Generator and the co module
   *
   * @example-class Collection
   * @example-method dropIndex
   * @ignore
   */
  it('shouldCorrectlyCreateAndDropIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Drop the index
        yield collection.dropIndex('a_1_b_1');

        // Verify that the index is gone
        var indexInformation = yield collection.indexInformation();
        test.deepEqual([['_id', 1]], indexInformation._id_);
        test.equal(undefined, indexInformation.a_1_b_1);

        // Close db
        client.close();
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method ensureIndex
   * @ignore
   */
  it('shouldCreateComplexEnsureIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
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

        client.close();
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method ensureIndex
   * @ignore
   */
  it('ensureIndexExampleWithCompountIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple query using the find method and toArray method with a Generator and the co module.
   *
   * @example-class Collection
   * @example-method find
   * @ignore
   */
  it('shouldPerformASimpleQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple query showing the explain for a query using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method find
   * @ignore
   */
  it('shouldPerformASimpleExplainQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple query showing skip and limit using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method find
   * @ignore
   */
  it('shouldPerformASimpleLimitSkipQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
          configuration.writeConcernMax()
        );

        // Perform a simple find and return all the documents
        var docs = yield collection
          .find({})
          .skip(1)
          .limit(1)
          .project({ b: 1 })
          .toArray();

        test.equal(1, docs.length);
        test.equal(undefined, docs[0].a);
        test.equal(2, docs[0].b);

        // Close db
        client.close();
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
   * @ignore
   */
  it('shouldPerformSimpleFindAndModifyOperationsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        test.equal(null, item);

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
        client.close();
      });
      // END
    }
  });

  /**
   * An example of using findAndRemove using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findAndRemove
   * @ignore
   */
  it('shouldPerformSimpleFindAndRemoveWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        test.equal(null, item);

        // Db close
        client.close();
      });
      // END
    }
  });

  /**
   * A simple query using findOne with a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOne
   * @ignore
   */
  it('shouldPerformASimpleLimitSkipFindOneQueryWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
          configuration.writeConcernMax()
        );

        // Perform a simple find and return all the documents
        var doc = yield collection.findOne({ a: 2 }, { fields: { b: 1 } });
        test.equal(undefined, doc.a);
        test.equal(2, doc.b);

        // Db close
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple geoHaystackSearch query across some documents using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method geoHaystackSearch
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleGeoHaystackSearchCommandWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Fetch the collection
        var collection = db.collection('simple_geo_haystack_command_with_generators');

        // Add a location based index
        yield collection.ensureIndex({ loc: 'geoHaystack', type: 1 }, { bucketSize: 1 });

        // Save a new location tagged document
        yield collection.insertMany(
          [{ a: 1, loc: [50, 30] }, { a: 1, loc: [30, 50] }],
          configuration.writeConcernMax()
        );

        // Use geoHaystackSearch command to find document
        var docs = yield collection.geoHaystackSearch(50, 50, {
          search: { a: 1 },
          limit: 1,
          maxDistance: 100
        });
        test.equal(1, docs.results.length);
        client.close();
      });
      // END
    }
  });

  /**
   * A whole lot of different ways to execute the group command using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method group
   * @ignore
   */
  it('shouldCorrectlyExecuteGroupFunctionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'], mongodb: '<=4.1.0' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        Code = configuration.require.Code;

      return co(function*() {
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
        var collection = db.collection('test_group_with_generators');

        // Perform a simple group by on an empty collection
        var results = yield collection.group(
          [],
          {},
          { count: 0 },
          'function (obj, prev) { prev.count++; }'
        );
        test.deepEqual([], results);

        // Trigger some inserts on the collection
        yield collection.insertMany([{ a: 2 }, { b: 5 }, { a: 1 }], { w: 1 });

        // Perform a group count
        results = yield collection.group(
          [],
          {},
          { count: 0 },
          'function (obj, prev) { prev.count++; }'
        );
        test.equal(3, results[0].count);

        // Perform a group count using the eval method
        results = yield collection.group(
          [],
          {},
          { count: 0 },
          'function (obj, prev) { prev.count++; }',
          false
        );
        test.equal(3, results[0].count);

        // Group with a conditional
        results = yield collection.group(
          [],
          { a: { $gt: 1 } },
          { count: 0 },
          'function (obj, prev) { prev.count++; }'
        );
        // Results
        test.equal(1, results[0].count);

        // Group with a conditional using the EVAL method
        results = yield collection.group(
          [],
          { a: { $gt: 1 } },
          { count: 0 },
          'function (obj, prev) { prev.count++; }',
          false
        );
        // Results
        test.equal(1, results[0].count);

        // Insert some more test data
        yield collection.insertMany([{ a: 2 }, { b: 3 }], { w: 1 });

        // Do a Group by field a
        results = yield collection.group(
          ['a'],
          {},
          { count: 0 },
          'function (obj, prev) { prev.count++; }'
        );
        // Results
        test.equal(2, results[0].a);
        test.equal(2, results[0].count);
        test.equal(null, results[1].a);
        test.equal(2, results[1].count);
        test.equal(1, results[2].a);
        test.equal(1, results[2].count);

        // Do a Group by field a
        results = yield collection.group(
          { a: true },
          {},
          { count: 0 },
          function(obj, prev) {
            prev.count++;
          },
          true
        );

        // Results
        test.equal(2, results[0].a);
        test.equal(2, results[0].count);
        test.equal(null, results[1].a);
        test.equal(2, results[1].count);
        test.equal(1, results[2].a);
        test.equal(1, results[2].count);

        try {
          // Correctly handle illegal function
          results = yield collection.group([], {}, {}, '5 ++ 5');
        } catch (err) {
          test.ok(err.message != null);

          // Use a function to select the keys used to group by
          var keyf = function(doc) {
            return { a: doc.a };
          };

          results = yield collection.group(
            keyf,
            { a: { $gt: 0 } },
            { count: 0, value: 0 },
            function(obj, prev) {
              prev.count++;
              prev.value += obj.a;
            },
            true
          );

          // Results
          results.sort(function(a, b) {
            return b.count - a.count;
          });

          test.equal(2, results[0].count);
          test.equal(2, results[0].a);
          test.equal(4, results[0].value);
          test.equal(1, results[1].count);
          test.equal(1, results[1].a);
          test.equal(1, results[1].value);

          // Use a Code object to select the keys used to group by
          keyf = new Code(function(doc) {
            return { a: doc.a };
          });

          results = yield collection.group(
            keyf,
            { a: { $gt: 0 } },
            { count: 0, value: 0 },
            function(obj, prev) {
              prev.count++;
              prev.value += obj.a;
            },
            true
          );

          // Results
          results.sort(function(a, b) {
            return b.count - a.count;
          });
          test.equal(2, results[0].count);
          test.equal(2, results[0].a);
          test.equal(4, results[0].value);
          test.equal(1, results[1].count);
          test.equal(1, results[1].a);
          test.equal(1, results[1].value);

          try {
            yield collection.group([], {}, {}, '5 ++ 5', false);
          } catch (err) {
            test.ok(err.message != null);

            client.close();
          }
        }
      });
      // END
    }
  });

  /**
   * A simple map reduce example using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformSimpleMapReduceFunctionsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        var map = function() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformMapReduceFunctionInlineWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>1.7.6', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        var map = function() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Mapreduce using a provided scope containing a javascript function executed using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformMapReduceWithContextWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        Code = configuration.require.Code;

      return co(function*() {
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
          [{ user_id: 1, timestamp: new Date() }, { user_id: 2, timestamp: new Date() }],
          { w: 1 }
        );

        // Map function
        var map = function() {
          emit(fn(this.timestamp.getYear()), 1); // eslint-disable-line
        };

        // Reduce function
        var reduce = function(k, v) {
          var count = 0;
          for (var i = 0; i < v.length; i++) {
            count += v[i];
          }

          return count;
        };

        // Javascript function available in the map reduce scope
        var t = function(val) {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Mapreduce using a scope containing javascript objects with functions using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it.skip('shouldPerformMapReduceInContextObjectsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        Code = configuration.require.Code;

      return co(function*() {
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
          [{ user_id: 1, timestamp: new Date() }, { user_id: 2, timestamp: new Date() }],
          { w: 1 }
        );

        // Map function
        var map = function() {
          emit(obj.fn(this.timestamp.getYear()), 1); // eslint-disable-line
        };

        // Reduce function
        var reduce = function(k, v) {
          var count = 0;
          for (var i = 0; i < v.length; i++) {
            count += v[i];
          }

          return count;
        };

        // Javascript function available in the map reduce scope
        var t = function(val) {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections indexes using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method indexes
   * @ignore
   */
  it('shouldCorrectlyRetriveACollectionsIndexesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example showing the use of the indexExists function using a Generator and the co module for a single index name and a list of index names.
   *
   * @example-class Collection
   * @example-method indexExists
   * @ignore
   */
  it('shouldCorrectlyExecuteIndexExistsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example showing the information returned by indexInformation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method indexInformation
   * @ignore
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformationWithGenerators', {
    metadata: {
      requires: { generators: true, topology: ['single'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax()
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Fetch basic indexInformation for collection
        var indexInformation = yield db.indexInformation(
          'more_index_information_test_2_with_generators'
        );
        test.deepEqual([['_id', 1]], indexInformation._id_);
        test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

        // Fetch full index information
        indexInformation = yield collection.indexInformation({ full: true });
        test.deepEqual({ _id: 1 }, indexInformation[0].key);
        test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

        // Close db
        client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the information returned by indexInformation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method indexInformation
   * @ignore
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformationWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Fetch basic indexInformation for collection
        var indexInformation = yield collection.indexInformation();
        test.deepEqual([['_id', 1]], indexInformation._id_);
        test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

        // Fetch full index information
        indexInformation = yield collection.indexInformation({ full: true });
        test.deepEqual({ _id: 1 }, indexInformation[0].key);
        test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple document insert using a Generator and the co module example, not using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },
    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A batch document insert using a Generator and the co module example, using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafeWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of inserting a document containing functions using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        yield collection.insertOne({ hello: 'world', func: function() {} }, o);

        // Fetch the document
        var item = yield collection.findOne({ hello: 'world' });
        test.ok('function() {}', item.code);
        client.close();
      });
      // END
    }
  });

  /**
   * Example of using keepGoing to allow batch insert using a Generator and the co module to complete even when there are illegal documents in the batch
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('Should correctly execute insert with keepGoing option on mongod >= 1.9.1 with Generators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>1.9.1', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example showing how to establish if it's a capped collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method isCapped
   * @ignore
   */
  it('shouldCorrectlyExecuteIsCappedWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example returning the options for a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method options
   * @ignore
   */
  it('shouldCorrectlyRetriveCollectionOptionsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A parallelCollectionScan example using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method parallelCollectionScan
   * @ignore
   */
  it('Should correctly execute parallelCollectionScan with multiple cursors with Generators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, mongodb: '>2.5.5 <=4.1.0', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_with_generators');
        // Insert 1000 documents in a batch
        yield collection.insertMany(docs);
        var results = [];
        var numCursors = 3;

        // Execute parallelCollectionScan command
        var cursors = yield collection.parallelCollectionScan({ numCursors: numCursors });
        test.ok(cursors != null);
        test.ok(cursors.length >= 0);

        for (i = 0; i < cursors.length; i++) {
          var items = yield cursors[i].toArray();
          // Add docs to results array
          results = results.concat(items);
        }

        test.equal(docs.length, results.length);
        client.close();
      });
      // END
    }
  });

  /**
   * An example showing how to force a reindex of a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method reIndex
   * @ignore
   */
  it('shouldCorrectlyIndexAndForceReindexOnCollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        var collection = db.collection('shouldCorrectlyForceReindexOnCollection_with_generators');
        // Insert a bunch of documents for the index
        yield collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }],
          { w: 1 }
        );

        // Create an index on the a field
        yield collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });

        // Force a reindex of the collection
        var result = yield collection.reIndex();
        test.equal(true, result);

        // Verify that the index is gone
        var indexInformation = yield collection.indexInformation();
        test.deepEqual([['_id', 1]], indexInformation._id_);
        test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

        client.close();
      });
      // END
    }
  });

  /**
   * An example removing all documents in a collection not using safe mode using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method remove
   * @ignore
   */
  it('shouldRemoveAllDocumentsNoSafeWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * An example removing a subset of documents using safe mode to ensure removal of documents using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method remove
   * @ignore
   */
  it('shouldRemoveSubsetOfDocumentsSafeModeWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        test.equal(1, r.result.n);
        client.close();
      });
      // END
    }
  });

  /**
   * An example of illegal and legal renaming of a collection using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method rename
   * @ignore
   */
  it('shouldCorrectlyRenameCollectionWithGenerators', {
    metadata: {
      requires: { generators: true, topology: ['single'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          // this will be succesful
          collection2 = yield collection1.rename('test_rename_collection3_with_generators');
          test.equal('test_rename_collection3_with_generators', collection2.collectionName);

          // Ensure that the collection is pointing to the new one
          var count = yield collection2.count();
          test.equal(2, count);
          client.close();
        }
      });
      // END
    }
  });

  /**
   * Example of a simple document save with safe set to false using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method save
   * @ignore
   */
  it('shouldCorrectlySaveASimpleDocumentWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Fetch the collection
        var collection = db.collection('save_a_simple_document_with_generators');
        // Save a document with no safe option
        yield collection.save({ hello: 'world' });

        // Find the saved document
        var item = yield collection.findOne({ hello: 'world' });
        test.equal('world', item && item.hello);
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple document save and then resave with safe set to true using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method save
   * @ignore
   */
  it('shouldCorrectlySaveASimpleDocumentModifyItAndResaveItWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Fetch the collection
        var collection = db.collection(
          'save_a_simple_document_modify_it_and_resave_it_with_generators'
        );

        // Save a document with no safe option
        yield collection.save({ hello: 'world' }, configuration.writeConcernMax());

        // Find the saved document
        var item = yield collection.findOne({ hello: 'world' });
        test.equal('world', item.hello);

        // Update the document
        item['hello2'] = 'world2';

        // Save the item with the additional field
        yield collection.save(item, configuration.writeConcernMax());

        // Find the changed document
        item = yield collection.findOne({ hello: 'world' });
        test.equal('world', item.hello);
        test.equal('world2', item.hello2);

        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple document update with safe set to false on an existing document using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method update
   * @ignore
   */
  it('shouldCorrectlyUpdateASimpleDocumentWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple document update using upsert (the document will be inserted if it does not exist) using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method update
   * @ignore
   */
  it('shouldCorrectlyUpsertASimpleDocumentWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of an update across multiple documents using the multi option and using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method update
   * @ignore
   */
  it('shouldCorrectlyUpdateMultipleDocumentsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 1, b: 2 }],
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections stats using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method stats
   * @ignore
   */
  it('shouldCorrectlyReturnACollectionsStatsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using Generators.
   *
   * @example-class Collection
   * @example-method dropIndexes
   * @ignore
   */
  it('shouldCorrectlyCreateAndDropAllIndexWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }],
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
        test.equal(undefined, indexInformation.a_1_b_1);
        test.equal(undefined, indexInformation.c_1);

        client.close();
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
   * An example that shows how to force close a db connection so it cannot be reused using a Generator and the co module..
   *
   * @example-class Db
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlyFailOnRetryDueToAppCloseOfDbWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Fetch a collection
        var collection = db.collection(
          'shouldCorrectlyFailOnRetryDueToAppCloseOfDb_with_generators'
        );

        // Insert a document
        yield collection.insertOne({ a: 1 }, configuration.writeConcernMax());

        // Force close the connection
        yield client.close(true);

        try {
          // Attemp to insert should fail now with correct message 'db closed by application'
          yield collection.insertOne({ a: 2 }, configuration.writeConcernMax());
        } catch (err) {
          client.close();
        }
      });
      // END
    }
  });

  /**
   * An example of retrieving the collections list for a database using a Generator and the co module.
   *
   * @example-class Db
   * @example-method listCollections
   * @ignore
   */
  it('shouldCorrectlyRetrievelistCollectionsWithGenerators', {
    metadata: {
      requires: { generators: true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example of retrieving all collections for a db as Collection objects using a Generator and the co module.
   *
   * @example-class Db
   * @example-method collections
   * @ignore
   */
  it('shouldCorrectlyRetrieveAllCollectionsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example of adding a user to the database using a Generator and the co module.
   *
   * @example-class Db
   * @example-method addUser
   * @ignore
   */
  it('shouldCorrectlyAddUserToDbWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * An example of removing a user using a Generator and the co module.
   *
   * @example-class Db
   * @example-method removeUser
   * @ignore
   */
  it('shouldCorrectlyAddAndRemoveUserWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          const client = configuration.newClient('mongodb://user:name@localhost:27017/admin');
          yield client.connect();
          test.ok(false);
        } catch (err) {} // eslint-disable-line

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the creation of a collection using a Generator and the co module.
   *
   * @example-class Db
   * @example-method createCollection
   * @ignore
   */
  it('shouldCorrectlyCreateACollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone using a Generator and the co module.
   *
   * @example-class Db
   * @example-method dropCollection
   * @ignore
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServerWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example executing a command against the server using a Generator and the co module.
   *
   * @example-class Db
   * @example-method command
   * @ignore
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone.
   *
   * @example-class Db
   * @example-method renameCollection
   * @ignore
   */
  it('shouldCorrectlyRenameACollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
   *
   * @example-class Db
   * @example-method createIndex
   * @ignore
   */
  it('shouldCreateOnDbComplexIndexOnTwoFieldsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
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

        client.close();
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Generator and the co module.
   *
   * @example-class Db
   * @example-method ensureIndex
   * @ignore
   */
  it('shouldCreateComplexEnsureIndexDbWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
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

        client.close();
      });
      // END
    }
  });

  /**
   * An examples showing the dropping of a database using a Generator and the co module.
   *
   * @example-class Db
   * @example-method dropDatabase
   * @ignore
   */
  it('shouldCorrectlyDropTheDatabaseWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          [{ a: 1, b: 1 }, { a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example showing how to retrieve the db statistics using a Generator and the co module.
   *
   * @example-class Db
   * @example-method stats
   * @ignore
   */
  it('shouldCorrectlyRetrieveDbStatsWithGeneratorsWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Simple example connecting to two different databases sharing the socket connections below using a Generator and the co module.
   *
   * @example-class Db
   * @example-method db
   * @ignore
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveBuildInfoWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Retrive the build information for the MongoDB instance
        yield adminDb.buildInfo();

        client.close();
      });
      // END
    }
  });

  /**
   * Retrieve the buildInfo using the command function using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method command
   * @ignore
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommandWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Retrive the build information using the admin command
        yield adminDb.command({ buildInfo: 1 });

        client.close();
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
   * @ignore
   */
  it('shouldCorrectlyChangeProfilingLevelWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Retrive the profiling level and verify that it's set to slow_only
        var level = yield db.profilingLevel();
        test.equal('slow_only', level);

        // Turn profiling off
        yield db.setProfilingLevel('off');

        // Retrive the profiling level and verify that it's set to off
        level = yield db.profilingLevel();
        test.equal('off', level);

        // Set the profiling level to log all queries
        yield db.setProfilingLevel('all');

        // Retrive the profiling level and verify that it's set to all
        level = yield db.profilingLevel();
        test.equal('all', level);

        try {
          // Attempt to set an illegal profiling level
          yield db.setProfilingLevel('medium');
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal('Error: illegal profiling level value medium', err.message);

          client.close();
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
   * @ignore
   */
  it('shouldCorrectlySetAndExtractProfilingInfoWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Retrive the profiling information
        var infos = yield db.profilingInfo();
        test.ok(infos.constructor === Array);
        test.ok(infos.length >= 1);
        test.ok(infos[0].ts.constructor === Date);
        test.ok(infos[0].millis.constructor === Number);

        client.close();
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
   * @ignore
   */
  it('shouldCorrectlyCallValidateCollectionWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
    }
  });

  /**
   * An example of how to add a user to the admin database using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method ping
   * @ignore
   */
  it('shouldCorrectlyPingTheMongoDbInstanceWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example of how to add a user to the admin database using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method addUser
   * @ignore
   */
  it('shouldCorrectlyAddAUserToAdminDbWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
    }
  });

  /**
   * An example of how to remove a user from the admin database using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method removeUser
   * @ignore
   */
  it('shouldCorrectlyAddAUserAndRemoveItFromAdminDbWithGenerators', {
    metadata: { requires: { generators: true, topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * An example of listing all available databases. using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method listDatabases
   * @ignore
   */
  it('shouldCorrectlyListAllAvailableDatabasesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Retrieve the current server Info using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method serverStatus
   * @ignore
   */
  it('shouldCorrectlyRetrieveServerInfoWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Retrive the server Info
        var info = yield adminDb.serverStatus();
        test.ok(info != null);

        client.close();
      });
      // END
    }
  });

  /**
   * Retrieve the current replicaset status if the server is running as part of a replicaset using a Generator and the co module.
   *
   * @example-class Admin
   * @example-method replSetGetStatus
   * @ignore
   */
  it('shouldCorrectlyRetrieveReplSetGetStatusWithGenerators', {
    metadata: { requires: { generators: true, topology: ['replicaset'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        // Retrive the server Info, returns error if we are not
        // running a replicaset
        yield adminDb.replSetGetStatus();

        client.close();
      });
      // END
    }
  });

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
  it('shouldCorrectlyExecuteToArrayWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the count function of the cursor using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method count
   * @ignore
   */
  it('shouldCorrectlyUseCursorCountFunctionWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the use of next and co module to iterate over cursor
   *
   * @example-class Cursor
   * @example-method next
   * @ignore
   */
  it('shouldCorrectlyPerformNextOnCursorWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor explain function using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method explain
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleExplainCursorWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor close function using a Generator and the co module.
   *
   * @example-class Cursor
   * @example-method close
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheCloseFunctionWithGenerators', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

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
  it('shouldCorrectlyExecuteGridStoreExistsByObjectIdWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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

        // Open a file for writing
        var gridStore = new GridStore(db, null, 'w');
        yield gridStore.open();
        // Writing some content to the file
        yield gridStore.write('hello world!');

        // Flush the file to GridFS
        var file = yield gridStore.close();

        // Check if the file exists using the id returned from the close function
        var result = yield GridStore.exist(db, file._id);
        test.equal(true, result);

        // Show that the file does not exist for a random ObjectID
        result = yield GridStore.exist(db, new ObjectID());
        test.equal(false, result);

        // Show that the file does not exist for a different file root
        result = yield GridStore.exist(db, file._id, 'another_root');
        test.equal(false, result);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the eof method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method GridStore.list
   * @ignore
   */
  it('shouldCorrectlyExecuteGridStoreListWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Our file id
        var fileId = new ObjectID();

        // Open a file for writing
        var gridStore = new GridStore(db, fileId, 'foobar2', 'w');
        yield gridStore.open();
        // Write some content to the file
        yield gridStore.write('hello world!');
        // Flush to GridFS
        yield gridStore.close();

        // List the existing files
        var items = yield GridStore.list(db);
        var found = false;

        items.forEach(function(filename) {
          if (filename === 'foobar2') found = true;
        });

        test.ok(items.length >= 1);
        test.ok(found);

        // List the existing files but return only the file ids
        items = yield GridStore.list(db, { id: true });
        found = false;
        items.forEach(function(id) {
          test.ok(typeof id === 'object');
        });

        test.ok(items.length >= 1);

        // List the existing files in a specific root collection
        items = yield GridStore.list(db, 'fs');
        found = false;
        items.forEach(function(filename) {
          if (filename === 'foobar2') found = true;
        });

        test.ok(items.length >= 1);
        test.ok(found);

        // List the existing files in a different root collection where the file is not located
        items = yield GridStore.list(db, 'my_fs');
        found = false;
        items.forEach(function(filename) {
          if (filename === 'foobar2') found = true;
        });

        test.ok(items.length >= 0);
        test.ok(!found);

        // Specify seperate id
        var fileId2 = new ObjectID();

        // Write another file to GridFS
        var gridStore2 = new GridStore(db, fileId2, 'foobar3', 'w');
        yield gridStore2.open();

        // Write the content
        yield gridStore2.write('my file');

        // Flush to GridFS
        yield gridStore2.close();

        // List all the available files and verify that our files are there
        items = yield GridStore.list(db);
        found = false;
        var found2 = false;

        items.forEach(function(filename) {
          if (filename === 'foobar2') found = true;
          if (filename === 'foobar3') found2 = true;
        });

        test.ok(items.length >= 2);
        test.ok(found);
        test.ok(found2);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the puts method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method puts
   * @ignore
   */
  it('shouldCorrectlyReadlinesAndPutLinesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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
        // Open a file for writing
        var gridStore = new GridStore(db, 'test_gs_puts_and_readlines', 'w');
        yield gridStore.open();

        // Write a line to the file using the puts method
        yield gridStore.puts('line one');

        // Flush the file to GridFS
        yield gridStore.close();

        // Read in the entire contents
        var data = yield GridStore.read(db, 'test_gs_puts_and_readlines');
        test.equal('line one\n', data.toString());

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the GridStore.unlink method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method GridStore.unlink
   * @ignore
   */
  it('shouldCorrectlyUnlinkWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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

        // Open a new file for writing
        var gridStore = new GridStore(db, 'test_gs_unlink', 'w');
        yield db.dropDatabase();

        yield gridStore.open();

        // Write some content
        yield gridStore.write('hello, world!');

        // Flush file to GridFS
        yield gridStore.close();

        // Verify the existance of the fs.files document
        var collection = db.collection('fs.files');
        var count = yield collection.count();
        test.equal(1, count);

        // Verify the existance of the fs.chunks chunk document
        collection = db.collection('fs.chunks');
        count = yield collection.count();
        test.equal(1, count);

        // Unlink the file (removing it)
        yield GridStore.unlink(db, 'test_gs_unlink');

        // Verify that fs.files document is gone
        collection = db.collection('fs.files');
        count = yield collection.count();
        test.equal(0, count);

        // Verify that fs.chunks chunk documents are gone
        collection = db.collection('fs.chunks');
        count = yield collection.count();
        test.equal(0, count);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the read method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method read
   * @ignore
   */
  it('shouldCorrectlyWriteAndReadJpgImageWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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
        // Read in the content of a file
        var data = fs.readFileSync('./test/functional/data/iya_logo_final_bw.jpg');
        // Create a new file
        var gs = new GridStore(db, 'test', 'w');
        // Open the file
        yield gs.open();
        // Write the file to GridFS
        yield gs.write(data);
        // Flush to the GridFS
        yield gs.close();

        // Define the file we wish to read
        var gs2 = new GridStore(db, 'test', 'r');
        // Open the file
        yield gs2.open();
        // Set the pointer of the read head to the start of the gridstored file
        yield gs2.seek(0);
        // Read the entire file
        var data2 = yield gs2.read();
        // Compare the file content against the orgiinal
        test.equal(data.toString('base64'), data2.toString('base64'));

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing opening a file using a filename, writing to it and saving it using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingFilenameWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing opening a file using an ObjectID, writing to it and saving it using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingObjectIDWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to write a file to Gridstore using file location path using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method writeFile
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        test.equal(data.toString('base64'), fileData.toString('base64'));
        test.equal(fileSize, fileData.length);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to write a file to Gridstore using a file handle using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method writeFile
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandleWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Read the filesize of file on disk (provide your own)
        var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
        // Read the buffered data for comparision reasons
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        // Open a file handle for reading the file
        var fd = fs.openSync(
          './test/functional/data/test_gs_weird_bug.png',
          'r',
          parseInt('0666', 8)
        );

        // Open the new file
        yield gridStore.open();

        // Write the file to gridFS using the file handle
        yield gridStore.writeFile(fd);

        // Read back all the written content and verify the correctness
        var fileData = yield GridStore.read(db, fileId);
        test.equal(data.toString('base64'), fileData.toString('base64'));
        test.equal(fileSize, fileData.length);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the write command with strings and Buffers using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method write
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffersWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        yield gridStore.open();

        // Write a text string
        yield gridStore.write('Hello world');

        // Write a buffer
        yield gridStore.write(Buffer.from('Buffer Hello world'));

        // Close the
        yield gridStore.close();

        // Read back all the written content and verify the correctness
        var fileData = yield GridStore.read(db, fileId);
        test.equal('Hello worldBuffer Hello world', fileData.toString());

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the write command with strings and Buffers using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingCloseWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the instance level unlink command to delete a gridstore item using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method unlink
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkItWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method GridStore.readlines
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlinesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        yield gridStore.open();

        // Write one line to gridStore
        yield gridStore.puts('line one');

        // Write second line to gridStore
        yield gridStore.puts('line two');

        // Write third line to gridStore
        yield gridStore.puts('line three');

        // Flush file to disk
        yield gridStore.close();

        // Read back all the lines
        var lines = yield GridStore.readlines(db, fileId);
        test.deepEqual(['line one\n', 'line two\n', 'line three\n'], lines);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method readlines
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlinesWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        yield gridStore.open();

        // Write one line to gridStore
        yield gridStore.puts('line one');

        // Write second line to gridStore
        yield gridStore.puts('line two');

        // Write third line to gridStore
        yield gridStore.puts('line three');

        // Flush file to disk
        yield gridStore.close();

        // Open file for reading
        gridStore = new GridStore(db, fileId, 'r');
        yield gridStore.open();

        // Read all the lines and verify correctness
        var lines = yield gridStore.readlines();
        test.deepEqual(['line one\n', 'line two\n', 'line three\n'], lines);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the read method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method GridStore.read
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreReadWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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
        // Create a new file
        var gridStore = new GridStore(db, null, 'w');
        // Read in the content from a file, replace with your own
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        // Open the file
        yield gridStore.open();
        // Write the binary file data to GridFS
        yield gridStore.write(data);
        // Flush the remaining data to GridFS
        var result = yield gridStore.close();
        // Read in the whole file and check that it's the same content
        var fileData = yield GridStore.read(db, result._id);
        test.equal(data.length, fileData.length);

        client.close();
      });
      // END
    }
  });

  /*
  * A simple example showing the usage of the seek method using a Generator and the co module.
  *
  * @example-class GridStore
  * @example-method seek
  * @ignore
  */
  it('shouldCorrectlySeekWithBufferWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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
        // Create a file and open it
        var gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'w');
        yield gridStore.open();
        // Write some content to the file
        yield gridStore.write(Buffer.from('hello, world!', 'utf8'));
        // Flush the file to GridFS
        yield gridStore.close();

        // Open the file in read mode
        gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
        yield gridStore.open();
        // Seek to start
        yield gridStore.seek(0);
        // Read first character and verify
        var chr = yield gridStore.getc();
        test.equal('h', chr.toString());

        // Open the file in read mode
        gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
        yield gridStore.open();
        // Seek to 7 characters from the beginning off the file and verify
        yield gridStore.seek(7);
        chr = yield gridStore.getc();
        test.equal('w', chr.toString());

        // Open the file in read mode
        gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
        yield gridStore.open();
        // Seek to -1 characters from the end off the file and verify
        yield gridStore.seek(-1, GridStore.IO_SEEK_END);
        chr = yield gridStore.getc();
        test.equal('!', chr.toString());

        // Open the file in read mode
        gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
        yield gridStore.open();
        // Seek to -6 characters from the end off the file and verify
        yield gridStore.seek(-6, GridStore.IO_SEEK_END);
        chr = yield gridStore.getc();
        test.equal('w', chr.toString());

        // Open the file in read mode
        gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
        yield gridStore.open();

        // Seek forward 7 characters from the current read position and verify
        yield gridStore.seek(7, GridStore.IO_SEEK_CUR);
        chr = yield gridStore.getc();
        test.equal('w', chr.toString());

        // Seek forward -1 characters from the current read position and verify
        yield gridStore.seek(-1, GridStore.IO_SEEK_CUR);
        chr = yield gridStore.getc();
        test.equal('w', chr.toString());

        // Seek forward -4 characters from the current read position and verify
        yield gridStore.seek(-4, GridStore.IO_SEEK_CUR);
        chr = yield gridStore.getc();
        test.equal('o', chr.toString());

        // Seek forward 3 characters from the current read position and verify
        yield gridStore.seek(3, GridStore.IO_SEEK_CUR);
        chr = yield gridStore.getc();
        test.equal('o', chr.toString());

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to rewind and overwrite the file using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method rewind
   * @ignore
   */
  it('shouldCorrectlyRewingAndTruncateOnWriteWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Our file ID
        var fileId = new ObjectID();

        // Create a new file
        var gridStore = new GridStore(db, fileId, 'w');
        // Open the file
        yield gridStore.open();
        // Write to the file
        yield gridStore.write('hello, world!');
        // Flush the file to disk
        yield gridStore.close();

        // Reopen the file
        gridStore = new GridStore(db, fileId, 'w');
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
        test.equal('abc', data.toString());

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the tell method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method tell
   * @ignore
   */
  it('shouldCorrectlyExecuteGridstoreTellWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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
        // Create a new file
        var gridStore = new GridStore(db, 'test_gs_tell', 'w');
        // Open the file
        yield gridStore.open();
        // Write a string to the file
        yield gridStore.write('hello, world!');
        // Flush the file to GridFS
        yield gridStore.close();

        // Open the file in read only mode
        gridStore = new GridStore(db, 'test_gs_tell', 'r');
        yield gridStore.open();

        // Read the first 5 characters
        var data = yield gridStore.read(5);
        test.equal('hello', data.toString());

        // Get the current position of the read head
        var position = yield gridStore.tell();
        test.equal(5, position);

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the seek method using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method getc
   * @ignore
   */
  it('shouldCorrectlyRetrieveSingleCharacterUsingGetCWithGenerators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore;

      return co(function*() {
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
        // Create a file and open it
        var gridStore = new GridStore(db, 'test_gs_getc_file', 'w');
        yield gridStore.open();
        // Write some content to the file
        yield gridStore.write(Buffer.from('hello, world!', 'utf8'));
        // Flush the file to GridFS
        yield gridStore.close();
        // Open the file in read mode
        gridStore = new GridStore(db, 'test_gs_getc_file', 'r');
        yield gridStore.open();

        // Read first character and verify
        var chr = yield gridStore.getc();
        test.equal('h', chr.toString());

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing how to save a file with a filename allowing for multiple files with the same name using a Generator and the co module.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlyRetrieveSingleCharacterUsingGetCWithGenerators2', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co'),
        GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      return co(function*() {
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
        // Create a file and open it
        var gridStore = new GridStore(db, new ObjectID(), 'test_gs_getc_file', 'w');
        yield gridStore.open();
        // Write some content to the file
        yield gridStore.write(Buffer.from('hello, world!', 'utf8'));
        // Flush the file to GridFS
        yield gridStore.close();

        // Create another file with same name and and save content to it
        gridStore = new GridStore(db, new ObjectID(), 'test_gs_getc_file', 'w');
        yield gridStore.open();
        // Write some content to the file
        yield gridStore.write(Buffer.from('hello, world!', 'utf8'));
        // Flush the file to GridFS
        var fileData = yield gridStore.close();

        // Open the file in read mode using the filename
        gridStore = new GridStore(db, 'test_gs_getc_file', 'r');
        yield gridStore.open();

        // Read first character and verify
        var chr = yield gridStore.getc();
        test.equal('h', chr.toString());

        // Open the file using an object id
        gridStore = new GridStore(db, fileData._id, 'r');
        yield gridStore.open();

        // Read first character and verify
        chr = yield gridStore.getc();
        test.equal('h', chr.toString());

        client.close();
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
   * @ignore
   */
  it('Should correctly execute ordered batch with no errors using write commands with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
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
   * @ignore
   */
  it('Should correctly execute unordered batch with no errors with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
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
   * @ignore
   */
  it('Should correctly execute insertOne operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple insertMany operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method insertMany
   * @ignore
   */
  it('Should correctly execute insertMany operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple updateOne operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method updateOne
   * @ignore
   */
  it('Should correctly execute updateOne operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple updateMany operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method updateMany
   * @ignore
   */
  it('Should correctly execute updateMany operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple removeOne operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method removeOne
   * @ignore
   */
  it('Should correctly execute removeOne operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple removeMany operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method removeMany
   * @ignore
   */
  it('Should correctly execute removeMany operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple bulkWrite operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method bulkWrite
   * @ignore
   */
  it('Should correctly execute bulkWrite operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndDelete operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOneAndDelete
   * @ignore
   */
  it('Should correctly execute findOneAndDelete operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndReplace operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOneAndReplace
   * @ignore
   */
  it('Should correctly execute findOneAndReplace operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndUpdate operation using a Generator and the co module.
   *
   * @example-class Collection
   * @example-method findOneAndUpdate
   * @ignore
   */
  it('Should correctly execute findOneAndUpdate operation with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        client.close();
      });
      // END
    }
  });

  /**
   * A simple example showing the listening to a capped collection using a Generator and the co module.
   *
   * @example-class Db
   * @example-method createCollection
   * @ignore
   */
  it('Should correctly add capped collection options to cursor with Generators', {
    metadata: { requires: { generators: true, topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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

        yield new Promise(resolve => {
          var total = 0;
          // Get the cursor
          var cursor = collection
            .find({})
            .addCursorFlag('tailable', true)
            .addCursorFlag('awaitData', true);

          cursor.on('data', function() {
            total = total + 1;

            if (total === 1000) {
              cursor.kill();
            }
          });

          cursor.on('end', function() {
            client.close();
            resolve();
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   *
   * @ignore
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

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var co = require('co');

      return co(function*() {
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
          .on('error', function() {
            client.close();
          })
          .on('data', function() {
            index = index + 1;
          })
          // `end` sometimes emits before any `data` events have been emitted,
          // depending on document size.
          .on('end', function() {
            test.equal(100, index);

            client.close();
          });
      });
    }
  });
});
