'use strict';
var fs = require('fs');
var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var Buffer = require('safe-buffer').Buffer;

var delay = function(ms) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve();
    }, ms);
  });
};

describe('Operation (Promises)', function() {
  before(function() {
    return setupDatabase(this.configuration, ['integration_tests_2']);
  });

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
  it('aggregationExample2WithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.1.0', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
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
        var collection = db.collection('aggregationExample2_with_promise');

        // Insert the docs
        return collection
          .insertMany(docs, { w: 1 })
          .then(function(result) {
            test.ok(result);

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
            return cursor.toArray();
          })
          .then(function(docs) {
            test.equal(2, docs.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Call next on an aggregation cursor using a Promise
   *
   * @example-class AggregationCursor
   * @example-method next
   * @ignore
   */
  it('Aggregation Cursor next Test With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.1.0', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
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
        var collection = db.collection('aggregation_next_example_with_promise');

        let cursor;
        // Insert the docs
        return collection
          .insertMany(docs, { w: 1 })
          .then(function(result) {
            test.ok(result);

            // Execute aggregate, notice the pipeline is expressed as an Array
            cursor = collection.aggregate(
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
            return cursor.next();
          })
          .then(function(docs) {
            test.ok(docs);

            // Need to close cursor to close implicit session,
            // since cursor is not exhausted
            cursor.close();
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of running simple count commands against a collection using a Promise.
   *
   * @example-class Collection
   * @example-method count
   * @ignore
   */
  it('shouldCorrectlyDoSimpleCountExamplesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Crete the collection for the distinct example
        var collection = db.collection('countExample1_with_promise');

        // Insert documents to perform distinct against
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4, b: 1 }], { w: 1 })
          .then(function(ids) {
            test.ok(ids);

            // Perform a total count command
            return collection.count();
          })
          .then(function(count) {
            test.equal(4, count);

            // Perform a partial account where b=1
            return collection.count({ b: 1 });
          })
          .then(function(count) {
            test.equal(1, count);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a Promise and a compound unique index in the background and dropping duplicated documents
   *
   * @example-class Collection
   * @example-method createIndex
   * @ignore
   */
  it('shouldCreateComplexIndexOnTwoFieldsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample1_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.createIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function(items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function(explanation) {
            test.ok(explanation != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of running the distinct command using a Promise against a collection
   *
   * @example-class Collection
   * @example-method distinct
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Crete the collection for the distinct example
        var collection = db.collection('distinctExample1_with_promise');

        // Insert documents to perform distinct against
        return collection
          .insertMany(
            [
              { a: 0, b: { c: 'a' } },
              { a: 1, b: { c: 'b' } },
              { a: 1, b: { c: 'c' } },
              { a: 2, b: { c: 'a' } },
              { a: 3 },
              { a: 3 }
            ],
            configuration.writeConcernMax()
          )
          .then(function(ids) {
            test.ok(ids);

            // Perform a distinct query against the a field
            return collection.distinct('a');
          })
          .then(function(docs) {
            test.deepEqual([0, 1, 2, 3], docs.sort());

            // Perform a distinct query against the sub-field b.c
            return collection.distinct('b.c');
          })
          .then(function(docs) {
            test.deepEqual(['a', 'b', 'c'], docs.sort());
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of running the distinct command against a collection using a Promise with a filter query
   *
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Crete the collection for the distinct example
        var collection = db.collection('distinctExample2_with_promise');

        // Insert documents to perform distinct against
        return collection
          .insertMany(
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
          )
          .then(function(ids) {
            test.ok(ids);

            // Perform a distinct query with a filter against the documents
            return collection.distinct('a', { c: 1 });
          })
          .then(function(docs) {
            test.deepEqual([5], docs.sort());
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of Collection.prototype.drop using a Promise
   *
   * @example-class Collection
   * @example-method drop
   * @ignore
   */
  it('shouldCorrectlyDropCollectionWithDropFunctionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        return db
          .createCollection('test_other_drop_with_promise')
          .then(function(collection) {
            // Drop the collection
            return collection.drop();
          })
          .then(function(reply) {
            test.ok(reply);

            // Ensure we don't have the collection in the set of names
            return db.listCollections().toArray();
          })
          .then(function(replies) {
            var found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function(document) {
              if (document.name === 'test_other_drop_with_promise') {
                found = true;
                return;
              }
            });

            // Ensure the collection is not found
            test.equal(false, found);

            // Let's close the db
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a how to drop all the indexes on a collection using dropAllIndexes with a Promise
   *
   * @example-class Collection
   * @example-method dropAllIndexes
   * @ignore
   */
  it('dropAllIndexesExample1WithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        return db
          .createCollection('dropExample1_with_promise')
          .then(function(r) {
            test.ok(r);

            // Drop the collection
            return db.collection('dropExample1_with_promise').dropAllIndexes();
          })
          .then(function(reply) {
            test.ok(reply);

            // Let's close the db
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using a Promise
   *
   * @example-class Collection
   * @example-method dropIndex
   * @ignore
   */
  it('shouldCorrectlyCreateAndDropIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        var collection = db.collection('dropIndexExample1_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }], { w: 1 })
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Drop the index
            return collection.dropIndex('a_1_b_1');
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function(indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.equal(undefined, indexInformation.a_1_b_1);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
   *
   * @example-class Collection
   * @example-method ensureIndex
   * @ignore
   */
  it('shouldCreateComplexEnsureIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        var collection = db.collection('ensureIndexExample1_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return db.ensureIndex(
              'ensureIndexExample1_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 }
            );
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function(items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function(explanation) {
            test.ok(explanation != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background using a Promise.
   *
   * @example-class Collection
   * @example-method ensureIndex
   * @ignore
   */
  it('ensureIndexExampleWithCompountIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        var collection = db.collection('ensureIndexExample2_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }], { w: 1 })
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function(items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function(explanation) {
            test.ok(explanation != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query using the find method and toArray method with a Promise.
   *
   * @example-class Collection
   * @example-method find
   * @ignore
   */
  it('shouldPerformASimpleQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_query_with_promise');

        // Insert a bunch of documents for the testing
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.find().toArray();
          })
          .then(function(docs) {
            test.equal(3, docs.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query showing the explain for a query using a Promise.
   *
   * @example-class Collection
   * @example-method find
   * @ignore
   */
  it('shouldPerformASimpleExplainQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_explain_query_with_promise');

        // Insert a bunch of documents for the testing
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.find({}).explain();
          })
          .then(function(docs) {
            test.ok(docs != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query showing skip and limit using a Promise.
   *
   * @example-class Collection
   * @example-method find
   * @ignore
   */
  it('shouldPerformASimpleLimitSkipQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_query_with_promise');

        // Insert a bunch of documents for the testing
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection
              .find({})
              .skip(1)
              .limit(1)
              .project({ b: 1 })
              .toArray();
          })
          .then(function(docs) {
            test.equal(1, docs.length);
            test.equal(undefined, docs[0].a);
            test.equal(2, docs[0].b);
            client.close();
          });
      });
      // END
    }
  });

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
  it('shouldPerformSimpleFindAndModifyOperationsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_with_promise');

        // Insert some test documentations
        return collection
          .insertMany([{ a: 1 }, { b: 1 }, { c: 1 }], configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            // Simple findAndModify command returning the new document
            return collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b1: 1 } },
              { new: true }
            );
          })
          .then(function(doc) {
            test.equal(1, doc.value.a);
            test.equal(1, doc.value.b1);

            // Simple findAndModify command returning the new document and
            // removing it at the same time
            return collection.findAndModify(
              { b: 1 },
              [['b', 1]],
              { $set: { b: 2 } },
              { remove: true }
            );
          })
          .then(function(doc) {
            test.ok(doc);

            // Verify that the document is gone
            return collection.findOne({ b: 1 });
          })
          .then(function(item) {
            test.equal(null, item);

            // Simple findAndModify command performing an upsert and returning the new document
            // executing the command safely
            return collection.findAndModify(
              { d: 1 },
              [['b', 1]],
              { d: 1, f: 1 },
              { new: true, upsert: true, w: 1 }
            );
          })
          .then(function(doc) {
            test.equal(1, doc.value.d);
            test.equal(1, doc.value.f);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of using findAndRemove using a Promise.
   *
   * @example-class Collection
   * @example-method findAndRemove
   * @ignore
   */
  it('shouldPerformSimpleFindAndRemoveWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_2_with_promise');

        // Insert some test documentations
        return collection
          .insertMany([{ a: 1 }, { b: 1, d: 1 }, { c: 1 }], configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            // Simple findAndModify command returning the old document and
            // removing it at the same time
            return collection.findAndRemove({ b: 1 }, [['b', 1]]);
          })
          .then(function(doc) {
            test.equal(1, doc.value.b);
            test.equal(1, doc.value.d);

            // Verify that the document is gone
            return collection.findOne({ b: 1 });
          })
          .then(function(item) {
            test.equal(null, item);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query using findOne with a Promise.
   *
   * @example-class Collection
   * @example-method findOne
   * @ignore
   */
  it('shouldPerformASimpleLimitSkipFindOneQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_find_one_query_with_promise');

        // Insert a bunch of documents for the testing
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.findOne({ a: 2 }, { fields: { b: 1 } });
          })
          .then(function(doc) {
            test.equal(undefined, doc.a);
            test.equal(2, doc.b);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple geoHaystackSearch query across some documents using a Promise.
   *
   * @example-class Collection
   * @example-method geoHaystackSearch
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleGeoHaystackSearchCommandWithPromises', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch the collection
        var collection = db.collection('simple_geo_haystack_command_with_promise');

        // Add a location based index
        return collection
          .ensureIndex({ loc: 'geoHaystack', type: 1 }, { bucketSize: 1 })
          .then(function(result) {
            test.ok(result);

            // Save a new location tagged document
            return collection.insertMany(
              [{ a: 1, loc: [50, 30] }, { a: 1, loc: [30, 50] }],
              configuration.writeConcernMax()
            );
          })
          .then(function(result) {
            test.ok(result);

            // Use geoHaystackSearch command to find document
            return collection.geoHaystackSearch(50, 50, {
              search: { a: 1 },
              limit: 1,
              maxDistance: 100
            });
          })
          .then(function(docs) {
            test.equal(1, docs.results.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A whole lot of different ways to execute the group command using a Promise.
   *
   * @example-class Collection
   * @example-method group
   * @ignore
   */
  it('shouldCorrectlyExecuteGroupFunctionWithPromises', {
    metadata: { requires: { topology: ['single'], mongodb: '<=4.1.0' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var Code = configuration.require.Code;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   Code = require('mongodb').Code,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_group_with_promise');

        // Perform a simple group by on an empty collection
        return collection
          .group([], {}, { count: 0 }, 'function (obj, prev) { prev.count++; }')
          .then(function(results) {
            test.deepEqual([], results);

            // Trigger some inserts on the collection
            return collection.insertMany([{ a: 2 }, { b: 5 }, { a: 1 }], { w: 1 });
          })
          .then(function(ids) {
            test.ok(ids);

            // Perform a group count
            return collection.group([], {}, { count: 0 }, 'function (obj, prev) { prev.count++; }');
          })
          .then(function(results) {
            test.equal(3, results[0].count);

            // Perform a group count using the eval method
            return collection.group(
              [],
              {},
              { count: 0 },
              'function (obj, prev) { prev.count++; }',
              false
            );
          })
          .then(function(results) {
            test.equal(3, results[0].count);

            // Group with a conditional
            return collection.group(
              [],
              { a: { $gt: 1 } },
              { count: 0 },
              'function (obj, prev) { prev.count++; }'
            );
          })
          .then(function(results) {
            // Results
            test.equal(1, results[0].count);

            // Group with a conditional using the EVAL method
            return collection.group(
              [],
              { a: { $gt: 1 } },
              { count: 0 },
              'function (obj, prev) { prev.count++; }',
              false
            );
          })
          .then(function(results) {
            // Results
            test.equal(1, results[0].count);
            // Insert some more test data
            return collection.insertMany([{ a: 2 }, { b: 3 }], { w: 1 });
          })
          .then(function(ids) {
            test.ok(ids);

            // Do a Group by field a
            return collection.group(
              ['a'],
              {},
              { count: 0 },
              'function (obj, prev) { prev.count++; }'
            );
          })
          .then(function(results) {
            // Results
            test.equal(2, results[0].a);
            test.equal(2, results[0].count);
            test.equal(null, results[1].a);
            test.equal(2, results[1].count);
            test.equal(1, results[2].a);
            test.equal(1, results[2].count);

            // Do a Group by field a
            return collection.group(
              { a: true },
              {},
              { count: 0 },
              function(obj, prev) {
                prev.count++;
              },
              true
            );
          })
          .then(function(results) {
            // Results
            test.equal(2, results[0].a);
            test.equal(2, results[0].count);
            test.equal(null, results[1].a);
            test.equal(2, results[1].count);
            test.equal(1, results[2].a);
            test.equal(1, results[2].count);

            // Correctly handle illegal function
            return collection.group([], {}, {}, '5 ++ 5');
          })
          .then(function(err, results) {
            test.ok(results);
          })
          .catch(function(err) {
            test.ok(err.message != null);

            // Use a function to select the keys used to group by
            var keyf = function(doc) {
              return { a: doc.a };
            };

            return collection.group(
              keyf,
              { a: { $gt: 0 } },
              { count: 0, value: 0 },
              function(obj, prev) {
                prev.count++;
                prev.value += obj.a;
              },
              true
            );
          })
          .then(function(results) {
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
            var keyf = new Code(function(doc) {
              return { a: doc.a };
            });

            return collection.group(
              keyf,
              { a: { $gt: 0 } },
              { count: 0, value: 0 },
              function(obj, prev) {
                prev.count++;
                prev.value += obj.a;
              },
              true
            );
          })
          .then(function(results) {
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

            // Correctly handle illegal function when using the EVAL method
            return collection.group([], {}, {}, '5 ++ 5', false);
          })
          .then(function(results) {
            test.ok(results);
          })
          .catch(function(err) {
            test.ok(err.message != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple map reduce example using a Promise.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformSimpleMapReduceFunctionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      /* eslint-disable */

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_with_promise');

        // Insert some documents to perform map reduce over
        return collection
          .insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 })
          .then(function() {
            // Map function
            var map = function() {
              emit(this.user_id, 1);
            };

            // Reduce function
            var reduce = function(k, vals) {
              return 1;
            };

            // Perform the map reduce
            return collection.mapReduce(map, reduce, { out: { replace: 'tempCollection' } });
          })
          .then(function(reducedCollection) {
            // Mapreduce returns the temporary collection with the results
            return reducedCollection.findOne({ _id: 1 }).then(function(result) {
              test.equal(1, result.value);
              return reducedCollection;
            });
          })
          .then(function(reducedCollection) {
            return reducedCollection.findOne({ _id: 2 });
          })
          .then(function(result) {
            test.equal(1, result.value);
            client.close();
          });
      });
      // END

      /* eslint-enable */
    }
  });

  /**
   * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics using a Promise.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformMapReduceFunctionInlineWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>1.7.6', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_inline_with_promise');

        /* eslint-disable */
        // Map function
        var map = function() {
          emit(this.user_id, 1);
        };

        // Reduce function
        var reduce = function(k, vals) {
          return 1;
        };
        /* eslint-enable */

        // Insert some test documents
        return collection
          .insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 })
          .then(function() {
            // Execute map reduce and return results inline
            return collection.mapReduce(map, reduce, { out: { inline: 1 }, verbose: true });
          })
          .then(function(result) {
            test.equal(2, result.results.length);
            test.ok(result.stats != null);

            return collection.mapReduce(map, reduce, {
              out: { replace: 'mapreduce_integration_test' },
              verbose: true
            });
          })
          .then(function(result) {
            test.ok(result.stats != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Mapreduce using a provided scope containing a javascript function executed using a Promise.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformMapReduceWithContextWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var Code = configuration.require.Code;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   Code = require('mongodb').Code,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_scope_with_promise');

        /* eslint-disable */
        // Map function
        var map = function() {
          emit(fn(this.timestamp.getYear()), 1);
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
        /* eslint-enable */

        // Insert some test documents
        return collection
          .insertMany(
            [{ user_id: 1, timestamp: new Date() }, { user_id: 2, timestamp: new Date() }],
            { w: 1 }
          )
          .then(function() {
            return collection.mapReduce(map, reduce, o);
          })
          .then(function(outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function(results) {
            test.equal(2, results[0].value);

            // mapReduce with scope containing plain function
            var o = {};
            o.scope = { fn: t };
            o.out = { replace: 'replacethiscollection' };

            return collection.mapReduce(map, reduce, o);
          })
          .then(function(outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function(results) {
            test.equal(2, results[0].value);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Mapreduce using a scope containing javascript objects with functions using a Promise.
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it.skip('shouldPerformMapReduceInContextObjectsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var Code = configuration.require.Code;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   Code = require('mongodb').Code,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_scope_objects_with_promise');

        /* eslint-disable */
        // Map function
        var map = function() {
          emit(obj.fn(this.timestamp.getYear()), 1);
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
        /* eslint-enable */

        // Insert some test documents
        return collection
          .insertMany(
            [{ user_id: 1, timestamp: new Date() }, { user_id: 2, timestamp: new Date() }],
            { w: 1 }
          )
          .then(function() {
            return collection.mapReduce(map, reduce, o);
          })
          .then(function(outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function(results) {
            test.equal(2, results[0].value);

            // mapReduce with scope containing plain function
            var o = {};
            o.scope = { obj: { fn: t } };
            o.out = { replace: 'replacethiscollection' };

            return collection.mapReduce(map, reduce, o);
          })
          .then(function(outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function(results) {
            test.equal(2, results[0].value);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections indexes using a Promise.
   *
   * @example-class Collection
   * @example-method indexes
   * @ignore
   */
  it('shouldCorrectlyRetriveACollectionsIndexesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Crete the collection for the distinct example
        var collection = db.collection('simple_key_based_distinct_with_promise');

        // Create a geo 2d index
        return collection
          .ensureIndex({ loc: '2d' }, configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            // Create a simple single field index
            return collection.ensureIndex({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function(result) {
            test.ok(result);

            return delay(1000);
          })
          .then(function() {
            // List all of the indexes on the collection
            return collection.indexes();
          })
          .then(function(indexes) {
            test.equal(3, indexes.length);
            client.close();
          });
      });
    }
    // END
  });

  /**
   * An example showing the use of the indexExists function using a Promise for a single index name and a list of index names.
   *
   * @example-class Collection
   * @example-method indexExists
   * @ignore
   */
  it('shouldCorrectlyExecuteIndexExistsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a test collection that we are getting the options back from
        var collection = db.collection(
          'test_collection_index_exists_with_promise',
          configuration.writeConcernMax()
        );

        // Create an index on the collection
        return collection
          .createIndex('a', configuration.writeConcernMax())
          .then(function(indexName) {
            test.ok(indexName);

            // Let's test to check if a single index exists
            return collection.indexExists('a_1');
          })
          .then(function(result) {
            test.equal(true, result);

            // Let's test to check if multiple indexes are available
            return collection.indexExists(['a_1', '_id_']);
          })
          .then(function(result) {
            test.equal(true, result);

            // Check if a non existing index exists
            return collection.indexExists('c_1');
          })
          .then(function(result) {
            test.equal(false, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example showing the information returned by indexInformation using a Promise.
   *
   * @example-class Collection
   * @example-method indexInformation
   * @ignore
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformationWithPromises', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 0, native_parser: false },
        { poolSize: 1, auto_reconnect: false }
      );

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_2_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Fetch basic indexInformation for collection
            return db.indexInformation('more_index_information_test_2_with_promise');
          })
          .then(function(indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

            // Fetch full index information
            return collection.indexInformation({ full: true });
          })
          .then(function(indexInformation) {
            test.deepEqual({ _id: 1 }, indexInformation[0].key);
            test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the information returned by indexInformation using a Promise.
   *
   * @example-class Collection
   * @example-method indexInformation
   * @ignore
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformationWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_3_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }], { w: 1 })
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Fetch basic indexInformation for collection
            return collection.indexInformation();
          })
          .then(function(indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

            // Fetch full index information
            return collection.indexInformation({ full: true });
          })
          .then(function(indexInformation) {
            test.deepEqual({ _id: 1 }, indexInformation[0].key);
            test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple document insert using a Promise example, not using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },
    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        var collection = db.collection('simple_document_insert_collection_no_safe_with_promise');

        // Insert a single document
        return collection
          .insertOne({ hello: 'world_no_safe' })
          .then(function() {
            // Fetch the document
            return collection.findOne({ hello: 'world_no_safe' });
          })
          .then(function(item) {
            test.equal('world_no_safe', item.hello);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A batch document insert using a Promise example, using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Fetch a collection to insert document into
        var collection = db.collection('batch_document_insert_collection_safe_with_promise');

        // Insert a single document
        return collection
          .insertMany(
            [{ hello: 'world_safe1' }, { hello: 'world_safe2' }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Fetch the document
            return collection.findOne({ hello: 'world_safe2' });
          })
          .then(function(item) {
            test.equal('world_safe2', item.hello);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of inserting a document containing functions using a Promise.
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Fetch a collection to insert document into
        var collection = db.collection('simple_document_insert_with_function_safe_with_promise');

        var o = configuration.writeConcernMax();
        o.serializeFunctions = true;

        // Insert a single document
        return collection
          .insertOne(
            {
              hello: 'world',
              func: function() {}
            },
            o
          )
          .then(function(result) {
            test.ok(result);

            // Fetch the document
            return collection.findOne({ hello: 'world' });
          })
          .then(function(item) {
            test.ok('function() {}', item.code);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of using keepGoing to allow batch insert using a Promise to complete even when there are illegal documents in the batch
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('Should correctly execute insert with keepGoing option on mongod >= 1.9.1 With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>1.9.1', topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection
        var collection = db.collection('keepGoingExample_with_promise');

        return collection
          .drop()
          .catch(function() {})
          .then(function() {
            // Add an unique index to title to force errors in the batch insert
            return collection.ensureIndex({ title: 1 }, { unique: true });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Insert some intial data into the collection
            return collection.insertMany(
              [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
              configuration.writeConcernMax()
            );
          })
          .then(function(result) {
            test.ok(result);

            // Force keep going flag, ignoring unique index issue
            return collection.insert(
              [
                { name: 'Jim' },
                { name: 'Sarah', title: 'Princess' },
                { name: 'Gump', title: 'Gump' }
              ],
              { w: 1, keepGoing: true }
            );
          })
          .catch(function() {
            // Count the number of documents left (should not include the duplicates)
            return collection.count();
          })
          .then(function(count) {
            test.equal(3, count);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example showing how to establish if it's a capped collection using a Promise.
   *
   * @example-class Collection
   * @example-method isCapped
   * @ignore
   */
  it('shouldCorrectlyExecuteIsCappedWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection that we are getting the options back from
        return db
          .createCollection('test_collection_is_capped_with_promise', { capped: true, size: 1024 })
          .then(function(collection) {
            test.equal('test_collection_is_capped_with_promise', collection.collectionName);

            // Let's fetch the collection options
            return collection.isCapped();
          })
          .then(function(capped) {
            test.equal(true, capped);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example returning the options for a collection using a Promise.
   *
   * @example-class Collection
   * @example-method options
   * @ignore
   */
  it('shouldCorrectlyRetriveCollectionOptionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a test collection that we are getting the options back from
        return db
          .createCollection('test_collection_options_with_promise', { capped: true, size: 1024 })
          .then(function(collection) {
            test.equal('test_collection_options_with_promise', collection.collectionName);

            // Let's fetch the collection options
            return collection.options();
          })
          .then(function(options) {
            test.equal(true, options.capped);
            test.ok(options.size >= 1024);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A parallelCollectionScan example using a Promise.
   *
   * @example-class Collection
   * @example-method parallelCollectionScan
   * @ignore
   */
  it('Should correctly execute parallelCollectionScan with multiple cursors With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { mongodb: '>2.5.5 <=4.1.0', topology: ['single', 'replicaset'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Insert some documents
        var docs = [];
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan_with_promise');

        // Insert 1000 documents in a batch
        return collection
          .insertMany(docs)
          .then(function(result) {
            test.ok(result);
            var numCursors = 3;

            // Execute parallelCollectionScan command
            return collection.parallelCollectionScan({ numCursors: numCursors });
          })
          .then(function(cursors) {
            test.ok(cursors != null);
            test.ok(cursors.length > 0);

            var results = [];
            var promises = [];
            for (var i = 0; i < cursors.length; i++) {
              var promise = cursors[i].toArray().then(function(items) {
                // Add docs to results array
                results = results.concat(items);
              });

              promises.push(promise);
            }

            return Promise.all(promises).then(function() {
              return results;
            });
          })
          .then(function(results) {
            test.equal(docs.length, results.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example showing how to force a reindex of a collection using a Promise.
   *
   * @example-class Collection
   * @example-method reIndex
   * @ignore
   */
  it('shouldCorrectlyIndexAndForceReindexOnCollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('shouldCorrectlyForceReindexOnCollection_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }], {
            w: 1
          })
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);

            // Force a reindex of the collection
            return collection.reIndex();
          })
          .then(function(result) {
            test.equal(true, result);

            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function(indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example removing all documents in a collection not using safe mode using a Promise.
   *
   * @example-class Collection
   * @example-method remove
   * @ignore
   */
  it('shouldRemoveAllDocumentsNoSafeWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch a collection to insert document into
        var collection = db.collection('remove_all_documents_no_safe_with_promise');

        // Insert a bunch of documents
        return collection
          .insertMany([{ a: 1 }, { b: 2 }], { w: 1 })
          .then(function(result) {
            test.ok(result);

            // Remove all the document
            return collection.removeMany();
          })
          .then(function() {
            // Fetch all results
            return collection.find().toArray();
          })
          .then(function(items) {
            test.equal(0, items.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example removing a subset of documents using safe mode to ensure removal of documents using a Promise.
   *
   * @example-class Collection
   * @example-method remove
   * @ignore
   */
  it('shouldRemoveSubsetOfDocumentsSafeModeWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch a collection to insert document into
        var collection = db.collection('remove_subset_of_documents_safe_with_promise');

        // Insert a bunch of documents
        return collection
          .insertMany([{ a: 1 }, { b: 2 }], { w: 1 })
          .then(function(result) {
            test.ok(result);

            // Remove all the document
            return collection.removeOne({ a: 1 }, { w: 1 });
          })
          .then(function(r) {
            test.equal(1, r.result.n);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of illegal and legal renaming of a collection using a Promise.
   *
   * @example-class Collection
   * @example-method rename
   * @ignore
   */
  it('shouldCorrectlyRenameCollectionWithPromises', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      /* eslint-disable */

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Open a couple of collections

        var collection1, collection2;

        return Promise.all([
          db.createCollection('test_rename_collection_with_promise'),
          db.createCollection('test_rename_collection2_with_promise')
        ])
          .then(function(collections) {
            collection1 = collections[0];
            collection2 = collections[1];

            test.ok(collection2);

            // Attemp to rename a collection to a number
            try {
              collection1.rename(5, function(err, collection) {});
            } catch (err) {
              test.ok(err instanceof Error);
              test.equal('collection name must be a String', err.message);
            }

            // Attemp to rename a collection to an empty string
            try {
              collection1.rename('', function(err, collection) {});
            } catch (err) {
              test.ok(err instanceof Error);
              test.equal('collection names cannot be empty', err.message);
            }

            // Attemp to rename a collection to an illegal name including the character $
            try {
              collection1.rename('te$t', function(err, collection) {});
            } catch (err) {
              test.ok(err instanceof Error);
              test.equal("collection names must not contain '$'", err.message);
            }

            // Attemp to rename a collection to an illegal name starting with the character .
            try {
              collection1.rename('.test', function(err, collection) {});
            } catch (err) {
              test.ok(err instanceof Error);
              test.equal("collection names must not start or end with '.'", err.message);
            }

            // Attemp to rename a collection to an illegal name ending with the character .
            try {
              collection1.rename('test.', function(err, collection) {});
            } catch (err) {
              test.ok(err instanceof Error);
              test.equal("collection names must not start or end with '.'", err.message);
            }

            // Attemp to rename a collection to an illegal name with an empty middle name
            try {
              collection1.rename('tes..t', function(err, collection) {});
            } catch (err) {
              test.equal('collection names cannot be empty', err.message);
            }

            // Insert a couple of documents
            return collection1.insertMany([{ x: 1 }, { x: 2 }], configuration.writeConcernMax());
          })
          .then(function(docs) {
            test.ok(docs);

            // Attemp to rename the first collection to the second one, this will fail
            return collection1.rename('test_rename_collection2_with_promise');
          })
          .catch(function(err) {
            test.ok(err instanceof Error);
            test.ok(err.message.length > 0);

            // Attemp to rename the first collection to a name that does not exist
            // this will be succesful
            return collection1.rename('test_rename_collection3_with_promise');
          })
          .then(function(collection2) {
            test.equal('test_rename_collection3_with_promise', collection2.collectionName);

            // Ensure that the collection is pointing to the new one
            return collection2.count();
          })
          .then(function(count) {
            test.equal(2, count);
          })
          .then(
            () => client.close(),
            e => {
              client.close();
              throw e;
            }
          );
      });
      // END
      /* eslint-enable */
    }
  });

  /**
   * Example of a simple document save with safe set to false using a Promise.
   *
   * @example-class Collection
   * @example-method save
   * @ignore
   */
  it('shouldCorrectlySaveASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch the collection
        var collection = db.collection('save_a_simple_document_with_promise');

        // Save a document with no safe option
        return collection
          .save({ hello: 'world' })
          .then(function() {
            // Find the saved document
            return collection.findOne({ hello: 'world' });
          })
          .then(function(item) {
            test.equal('world', item.hello);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple document save and then resave with safe set to true using a Promise.
   *
   * @example-class Collection
   * @example-method save
   * @ignore
   */
  it('shouldCorrectlySaveASimpleDocumentModifyItAndResaveItWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch the collection
        var collection = db.collection(
          'save_a_simple_document_modify_it_and_resave_it_with_promise'
        );

        // Save a document with no safe option
        return collection
          .save({ hello: 'world' }, configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            // Find the saved document
            return collection.findOne({ hello: 'world' });
          })
          .then(function(item) {
            test.equal('world', item.hello);

            // Update the document
            item['hello2'] = 'world2';

            // Save the item with the additional field
            return collection.save(item, configuration.writeConcernMax());
          })
          .then(function(result) {
            test.ok(result);

            // Find the changed document
            return collection.findOne({ hello: 'world' });
          })
          .then(function(item) {
            test.equal('world', item.hello);
            test.equal('world2', item.hello2);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple document update with safe set to false on an existing document using a Promise.
   *
   * @example-class Collection
   * @example-method update
   * @ignore
   */
  it('shouldCorrectlyUpdateASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Get a collection
        var collection = db.collection('update_a_simple_document_with_promise');

        // Insert a document, then update it
        return collection
          .insertOne({ a: 1 }, configuration.writeConcernMax())
          .then(function(doc) {
            test.ok(doc);
            // Update the document with an atomic operator
            return collection.updateOne({ a: 1 }, { $set: { b: 2 } });
          })
          .then(function() {
            // Fetch the document that we modified
            return collection.findOne({ a: 1 });
          })
          .then(function(item) {
            test.equal(1, item.a);
            test.equal(2, item.b);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple document update using upsert (the document will be inserted if it does not exist) using a Promise.
   *
   * @example-class Collection
   * @example-method update
   * @ignore
   */
  it('shouldCorrectlyUpsertASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Get a collection
        var collection = db.collection('update_a_simple_document_upsert_with_promise');

        // Update the document using an upsert operation, ensuring creation if it does not exist
        return collection
          .updateOne({ a: 1 }, { $set: { b: 2, a: 1 } }, { upsert: true, w: 1 })
          .then(function(result) {
            test.equal(1, result.result.n);

            // Fetch the document that we modified and check if it got inserted correctly
            return collection.findOne({ a: 1 });
          })
          .then(function(item) {
            test.equal(1, item.a);
            test.equal(2, item.b);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of an update across multiple documents using the multi option and using a Promise.
   *
   * @example-class Collection
   * @example-method update
   * @ignore
   */
  it('shouldCorrectlyUpdateMultipleDocumentsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Get a collection
        var collection = db.collection('update_a_simple_document_multi_with_promise');

        // Insert a couple of documentations
        return collection
          .insertMany([{ a: 1, b: 1 }, { a: 1, b: 2 }], configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);

            var o = configuration.writeConcernMax();
            return collection.updateMany({ a: 1 }, { $set: { b: 0 } }, o);
          })
          .then(function(r) {
            test.equal(2, r.result.n);

            // Fetch all the documents and verify that we have changed the b value
            return collection.find().toArray();
          })
          .then(function(items) {
            test.equal(1, items[0].a);
            test.equal(0, items[0].b);
            test.equal(1, items[1].a);
            test.equal(0, items[1].b);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections stats using a Promise.
   *
   * @example-class Collection
   * @example-method stats
   * @ignore
   */
  it('shouldCorrectlyReturnACollectionsStatsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Crete the collection for the distinct example
        var collection = db.collection('collection_stats_test_with_promise');

        // Insert some documents
        return collection
          .insertMany([{ a: 1 }, { hello: 'world' }], configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);
            // Retrieve the statistics for the collection
            return collection.stats();
          })
          .then(function(stats) {
            test.equal(2, stats.count);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using Promises.
   *
   * @example-class Collection
   * @example-method dropIndexes
   * @ignore
   */
  it('shouldCorrectlyCreateAndDropAllIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('shouldCorrectlyCreateAndDropAllIndex_with_promise');
        // Insert a bunch of documents for the index
        return collection
          .insertMany([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }], {
            w: 1
          })
          .then(function(result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function(indexName) {
            test.ok(indexName);
            // Create an additional index
            return collection.ensureIndex(
              { c: 1 },
              { unique: true, background: true, sparse: true, w: 1 }
            );
          })
          .then(function(indexName) {
            test.ok(indexName);
            // Drop the index
            return collection.dropAllIndexes();
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function(indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.equal(undefined, indexInformation.a_1_b_1);
            test.equal(undefined, indexInformation.c_1);
            client.close();
          });
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
   * An example that shows how to force close a db connection so it cannot be reused using a Promise..
   *
   * @example-class Db
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlyFailOnRetryDueToAppCloseOfDbWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch a collection
        var collection = db.collection('shouldCorrectlyFailOnRetryDueToAppCloseOfDb_with_promise');

        // Insert a document
        return collection
          .insertOne({ a: 1 }, configuration.writeConcernMax())
          .then(function(result) {
            test.ok(result);
            // Force close the connection
            return client.close(true);
          })
          .then(function() {
            // Attemp to insert should fail now with correct message 'db closed by application'
            return collection.insertOne({ a: 2 }, configuration.writeConcernMax());
          })
          .catch(function(err) {
            test.ok(err);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of a simple single server db connection and close function using a Promise.
   *
   * @example-class Db
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnectionAndCloseWithCallbackWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Close the connection with a callback that is optional
        return client.close();
      });
      // END
    }
  });

  /**
   * An example of retrieving the collections list for a database using a Promise.
   *
   * @example-class Db
   * @example-method listCollections
   * @ignore
   */
  it('shouldCorrectlyRetrievelistCollectionsWithPromises', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] }
    },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get an empty db
        var db1 = client.db('listCollectionTestDb2');

        // Create a collection
        var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');

        // Ensure the collection was created
        return collection
          .insertOne({ a: 1 })
          .then(function() {
            // Return the information of a single collection name
            return db1
              .listCollections({ name: 'shouldCorrectlyRetrievelistCollections_with_promise' })
              .toArray();
          })
          .then(function(items) {
            test.equal(1, items.length);

            // Return the information of a all collections, using the callback format
            return db1.listCollections().toArray();
          })
          .then(function(items) {
            test.ok(items.length >= 1);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyRetrievelistCollectionsWiredTigerWithPromises', {
    metadata: { requires: { topology: ['wiredtiger'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        // Get an empty db
        var db1 = client.db('listCollectionTestDb2');

        // Create a collection
        var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');

        // Ensure the collection was created
        return collection
          .insertOne({ a: 1 })
          .then(function() {
            // Return the information of a single collection name
            return db1
              .listCollections({ name: 'shouldCorrectlyRetrievelistCollections_with_promise' })
              .toArray();
          })
          .then(function(items) {
            test.equal(1, items.length);

            // Return the information of a all collections, using the callback format
            return db1.listCollections().toArray();
          })
          .then(function(items) {
            test.equal(1, items.length);
            client.close();
          });
      });
    }
  });

  /**
   * An example of retrieving a collection from a db using the collection function with a Promise.
   *
   * @example-class Db
   * @example-method collection
   * @ignore
   */
  it('shouldCorrectlyAccessACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Grab a collection with a callback but no safe operation
        db.collection('test_correctly_access_collections_with_promise', function(err) {
          test.equal(null, err);

          // Grab a collection with a callback in safe mode, ensuring it exists (should fail as it's not created)
          db.collection(
            'test_correctly_access_collections_with_promise',
            { strict: true },
            function(err) {
              test.ok(err);

              // Create the collection
              db
                .createCollection('test_correctly_access_collections_with_promise')
                .then(function() {
                  // Retry to get the collection, should work as it's now created
                  db.collection(
                    'test_correctly_access_collections_with_promise',
                    { strict: true },
                    function(err) {
                      test.equal(null, err);
                      client.close();
                      done();
                    }
                  );
                });
            }
          );
        });
      });
      // END
    }
  });

  /**
   * An example of retrieving all collections for a db as Collection objects using a Promise.
   *
   * @example-class Db
   * @example-method collections
   * @ignore
   */
  it('shouldCorrectlyRetrieveAllCollectionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Retry to get the collection, should work as it's now created
        return db.collections().then(function(collections) {
          test.ok(collections.length > 0);
          client.close();
        });
      });
      // END
    }
  });

  /**
   * An example of adding a user to the database using a Promise.
   *
   * @example-class Db
   * @example-method addUser
   * @ignore
   */
  it('shouldCorrectlyAddUserToDbWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Add a user to the database
        return db
          .addUser('user', 'name')
          .then(function(result) {
            test.ok(result);
            // Remove the user from the db
            return db.removeUser('user');
          })
          .then(function(result) {
            test.ok(result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of removing a user using a Promise.
   *
   * @example-class Db
   * @example-method removeUser
   * @ignore
   */
  it('shouldCorrectlyAddAndRemoveUserWithPromises', {
    metadata: { requires: { topology: 'single', mongodb: '<=3.4.x' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;

      const client = configuration.newClient();
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Add a user to the database

        return db
          .addUser('user3', 'name')
          .then(function(result) {
            test.ok(result);
            client.close();
            const secondClient = configuration.newClient(
              'mongodb://user3:name@localhost:27017/integration_tests'
            );

            return secondClient.connect();
          })
          .then(function(client) {
            // Logout the db
            return client.logout().then(function() {
              return client;
            });
          })
          .then(function(client) {
            // Remove the user
            var db = client.db(configuration.db);
            return db.removeUser('user3');
          })
          .then(function(result) {
            test.equal(true, result);

            // Should error out due to user no longer existing
            const thirdClient = configuration.newClient(
              'mongodb://user3:name@localhost:27017/integration_tests'
            );

            return thirdClient.connect();
          })
          .catch(function(err) {
            test.ok(err);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the creation of a collection using a Promise.
   *
   * @example-class Db
   * @example-method createCollection
   * @ignore
   */
  it('shouldCorrectlyCreateACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a capped collection with a maximum of 1000 documents
        return db
          .createCollection('a_simple_collection_with_promise', {
            capped: true,
            size: 10000,
            max: 1000,
            w: 1
          })
          .then(function(collection) {
            // Insert a document in the capped collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function(result) {
            test.ok(result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone using a Promise.
   *
   * @example-class Db
   * @example-method dropCollection
   * @ignore
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServerWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Execute ping against the server
        return db
          .command({ ping: 1 })
          .then(function(result) {
            test.ok(result);
            // Create a capped collection with a maximum of 1000 documents
            return db.createCollection('a_simple_create_drop_collection_with_promise', {
              capped: true,
              size: 10000,
              max: 1000,
              w: 1
            });
          })
          .then(function(collection) {
            // Insert a document in the capped collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function(result) {
            test.ok(result);
            // Drop the collection from this world
            return db.dropCollection('a_simple_create_drop_collection_with_promise');
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the collection is gone
            return db
              .listCollections({ name: 'a_simple_create_drop_collection_with_promise' })
              .toArray();
          })
          .then(function(names) {
            test.equal(0, names.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example executing a command against the server using a Promise.
   *
   * @example-class Db
   * @example-method command
   * @ignore
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Execute ping against the server
        return db.command({ ping: 1 }).then(function(result) {
          test.ok(result);
          client.close();
        });
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
  it('shouldCorrectlyRenameACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a collection

        return db
          .createCollection(
            'simple_rename_collection_with_promise',
            configuration.writeConcernMax()
          )
          .then(function(collection) {
            // Insert a document in the collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax()).then(function() {
              return collection;
            });
          })
          .then(function(collection) {
            // Retrieve the number of documents from the collection
            return collection.count();
          })
          .then(function(count) {
            test.equal(1, count);

            // Rename the collection
            return db.renameCollection(
              'simple_rename_collection_with_promise',
              'simple_rename_collection_2_with_promise'
            );
          })
          .then(function(collection2) {
            // Retrieve the number of documents from the collection
            return collection2.count();
          })
          .then(function(count) {
            test.equal(1, count);

            // Verify that the collection is gone
            return db.listCollections({ name: 'simple_rename_collection_with_promise' }).toArray();
          })
          .then(function(names) {
            test.equal(0, names.length);

            // Verify that the new collection exists
            return db
              .listCollections({ name: 'simple_rename_collection_2_with_promise' })
              .toArray();
          })
          .then(function(names) {
            test.equal(1, names.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
   *
   * @example-class Db
   * @example-method createIndex
   * @ignore
   */
  it('shouldCreateOnDbComplexIndexOnTwoFieldsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_complex_index_test_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);
            // Create an index on the a field
            return db.createIndex(
              'more_complex_index_test_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 }
            );
          })
          .then(function(indexName) {
            test.ok(indexName);
            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function(items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function(explanation) {
            test.ok(explanation != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
   *
   * @example-class Db
   * @example-method ensureIndex
   * @ignore
   */
  it('shouldCreateComplexEnsureIndexDbWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        var collection = db.collection('more_complex_ensure_index_db_test_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);
            // Create an index on the a field
            return db.ensureIndex(
              'more_complex_ensure_index_db_test_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 }
            );
          })
          .then(function(indexName) {
            test.ok(indexName);
            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function(items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function(explanation) {
            test.ok(explanation != null);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the dropping of a database using a Promise.
   *
   * @example-class Db
   * @example-method dropDatabase
   * @ignore
   */
  it('shouldCorrectlyDropTheDatabaseWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection
        var collection = db.collection('more_index_information_test_1_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [{ a: 1, b: 1 }, { a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
            configuration.writeConcernMax()
          )
          .then(function(result) {
            test.ok(result);

            // Let's drop the database
            return db.dropDatabase();
          })
          .then(function(result) {
            test.ok(result);

            // Get the admin database
            return db.admin().listDatabases();
          })
          .then(function(dbs) {
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
      });
      // END
    }
  });

  /**
   * An example showing how to retrieve the db statistics using a Promise.
   *
   * @example-class Db
   * @example-method stats
   * @ignore
   */
  it('shouldCorrectlyRetrieveDbStatsWithPromisesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        return db.stats().then(function(stats) {
          test.ok(stats != null);
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Simple example connecting to two different databases sharing the socket connections below using a Promise.
   *
   * @example-class Db
   * @example-method db
   * @ignore
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Reference a different database sharing the same connections
        // for the data transfer
        var secondDb = client.db('integration_tests_2');

        // Fetch the collections
        var multipleColl1 = db.collection('multiple_db_instances_with_promise');
        var multipleColl2 = secondDb.collection('multiple_db_instances_with_promise');

        // Write a record into each and then count the records stored
        return multipleColl1
          .insertOne({ a: 1 }, { w: 1 })
          .then(function(result) {
            test.ok(result);
            return multipleColl2.insertOne({ a: 1 }, { w: 1 });
          })
          .then(function(result) {
            test.ok(result);
            // Count over the results ensuring only on record in each collection
            return multipleColl1.count();
          })
          .then(function(count) {
            test.equal(1, count);

            return multipleColl2.count();
          })
          .then(function(count) {
            test.equal(1, count);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Simple replicaset connection setup, requires a running replicaset on the correct ports using a Promise.
   *
   * @example-class Db
   * @example-method open
   * @ignore
   */
  it('Should correctly connect with default replicasetNoOption With Promises', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // Replica configuration
      var replSet = new ReplSet(
        [
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ],
        { rs_name: configuration.replicasetName }
      );

      var client = new MongoClient(replSet, { w: 0 });
      return client.connect().then(function() {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN
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
   * Retrieve the buildInfo for the current MongoDB instance using a Promise.
   *
   * @example-class Admin
   * @example-method buildInfo
   * @ignore
   */
  it('shouldCorrectlyRetrieveBuildInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrive the build information for the MongoDB instance
        return adminDb.buildInfo().then(function(info) {
          test.ok(info);
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Retrieve the buildInfo using the command function using a Promise.
   *
   * @example-class Admin
   * @example-method command
   * @ignore
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommandWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrive the build information using the admin command
        return adminDb.command({ buildInfo: 1 }).then(function(info) {
          test.ok(info);
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current profiling level set for the MongoDB instance using a Promise.
   *
   * @example-class Db
   * @example-method profilingLevel
   * @ignore
   */
  it('shouldCorrectlySetDefaultProfilingLevelWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_promise');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { w: 1 })
          .then(function(doc) {
            test.ok(doc);
            // Use the admin database for the operation
            var adminDb = client.db('admin');

            // Retrive the profiling level
            return adminDb.profilingLevel();
          })
          .then(function(level) {
            test.ok(level);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of how to use the setProfilingInfo using a Promise.
   * Use this command to set the Profiling level on the MongoDB server
   *
   * @example-class Db
   * @example-method setProfilingLevel
   * @ignore
   */
  it('shouldCorrectlyChangeProfilingLevelWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_promise');
        var adminDb = client.db('admin');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { w: 1 })
          .then(function(doc) {
            test.ok(doc);
            // Set the profiling level to only profile slow queries
            return adminDb.setProfilingLevel('slow_only');
          })
          .then(function(level) {
            test.ok(level);
            // Retrive the profiling level and verify that it's set to slow_only
            return adminDb.profilingLevel();
          })
          .then(function(level) {
            test.equal('slow_only', level);

            // Turn profiling off
            return adminDb.setProfilingLevel('off');
          })
          .then(function(level) {
            test.ok(level);
            // Retrive the profiling level and verify that it's set to off
            return adminDb.profilingLevel();
          })
          .then(function(level) {
            test.equal('off', level);

            // Set the profiling level to log all queries
            return adminDb.setProfilingLevel('all');
          })
          .then(function(level) {
            test.ok(level);
            // Retrive the profiling level and verify that it's set to all
            return adminDb.profilingLevel();
          })
          .then(function(level) {
            test.equal('all', level);

            // Attempt to set an illegal profiling level
            return adminDb.setProfilingLevel('medium');
          })
          .catch(function(err) {
            test.ok(err instanceof Error);
            test.equal('Error: illegal profiling level value medium', err.message);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of how to use the profilingInfo using a Promise.
   * Use this command to pull back the profiling information currently set for Mongodb
   *
   * @example-class Admin
   * @example-method profilingInfo
   * @ignore
   */
  it('shouldCorrectlySetAndExtractProfilingInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_promise');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { w: 1 })
          .then(function(doc) {
            test.ok(doc);
            // Use the admin database for the operation
            // Set the profiling level to all
            return db.setProfilingLevel('all');
          })
          .then(function(level) {
            test.ok(level);
            // Execute a query command
            return collection.find().toArray();
          })
          .then(function(items) {
            test.ok(items.length > 0);

            // Turn off profiling
            return db.setProfilingLevel('off');
          })
          .then(function(level) {
            test.ok(level);
            // Retrive the profiling information
            return db.profilingInfo();
          })
          .then(function(infos) {
            test.ok(infos.constructor === Array);
            test.ok(infos.length >= 1);
            test.ok(infos[0].ts.constructor === Date);
            test.ok(infos[0].millis.constructor === Number);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of how to use the validateCollection command using a Promise.
   * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
   *
   * @example-class Admin
   * @example-method validateCollection
   * @ignore
   */
  it('shouldCorrectlyCallValidateCollectionWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_promise');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { w: 1 })
          .then(function(doc) {
            test.ok(doc);
            // Use the admin database for the operation
            var adminDb = db.admin();

            // Validate the 'test' collection
            return adminDb.validateCollection('test_with_promise');
          })
          .then(function(doc) {
            test.ok(doc);
            client.close();
          });
      });
    }
  });

  /**
   * An example of how to add a user to the admin database using a Promise.
   *
   * @example-class Admin
   * @example-method ping
   * @ignore
   */
  it('shouldCorrectlyPingTheMongoDbInstanceWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Ping the server
        return adminDb.ping().then(function(pingResult) {
          test.ok(pingResult);
          client.close();
        });
      });
      // END
    }
  });

  /**
   * An example of how to add a user to the admin database using a Promise.
   *
   * @example-class Admin
   * @example-method addUser
   * @ignore
   */
  it('shouldCorrectlyAddAUserToAdminDbWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        return adminDb
          .addUser('admin11', 'admin11')
          .then(function(result) {
            test.ok(result);

            return adminDb.removeUser('admin11');
          })
          .then(function(result) {
            test.ok(result);
            client.close();
          });
      });
    }
  });

  /**
   * An example of how to remove a user from the admin database using a Promise.
   *
   * @example-class Admin
   * @example-method removeUser
   * @ignore
   */
  it('shouldCorrectlyAddAUserAndRemoveItFromAdminDbWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        return adminDb
          .addUser('admin12', 'admin12')
          .then(function(result) {
            test.ok(result);

            // Remove the user
            return adminDb.removeUser('admin12');
          })
          .then(function(result) {
            test.equal(true, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of listing all available databases. using a Promise.
   *
   * @example-class Admin
   * @example-method listDatabases
   * @ignore
   */
  it('shouldCorrectlyListAllAvailableDatabasesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Use the admin database for the operation
        var adminDb = db.admin();

        // List all the available databases
        return adminDb.listDatabases().then(function(dbs) {
          test.ok(dbs.databases.length > 0);
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current server Info using a Promise.
   *
   * @example-class Admin
   * @example-method serverStatus
   * @ignore
   */
  it('shouldCorrectlyRetrieveServerInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Grab a collection object
        var collection = db.collection('test_with_promise');

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { w: 1 })
          .then(function(doc) {
            test.ok(doc);
            // Add the new user to the admin database
            return adminDb.addUser('admin13', 'admin13');
          })
          .then(function(result) {
            test.ok(result);
            // Retrive the server Info
            return adminDb.serverStatus();
          })
          .then(function(info) {
            test.ok(info != null);

            return adminDb.removeUser('admin13');
          })
          .then(function(result) {
            test.ok(result);
            client.close();
          });
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
   * An example showing the information returned by indexInformation using a Promise.
   *
   * @example-class Cursor
   * @example-method toArray
   * @ignore
   */
  it('shouldCorrectlyExecuteToArrayWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection to hold our documents
        var collection = db.collection('test_array_with_promise');

        // Insert a test document
        return collection
          .insertOne({ b: [1, 2, 3] }, configuration.writeConcernMax())
          .then(function(ids) {
            test.ok(ids);
            // Retrieve all the documents in the collection
            return collection.find().toArray();
          })
          .then(function(documents) {
            test.equal(1, documents.length);
            test.deepEqual([1, 2, 3], documents[0].b);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the count function of the cursor using a Promise.
   *
   * @example-class Cursor
   * @example-method count
   * @ignore
   */
  it('shouldCorrectlyUseCursorCountFunctionWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Creat collection
        var collection = db.collection('cursor_count_collection_with_promise');

        // Insert some docs
        return collection
          .insertMany([{ a: 1 }, { a: 2 }], configuration.writeConcernMax())
          .then(function(docs) {
            test.ok(docs);
            // Do a find and get the cursor count
            return collection.find().count();
          })
          .then(function(count) {
            test.equal(2, count);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of next using a Promise.
   *
   * @example-class Cursor
   * @example-method next
   * @ignore
   */
  it('shouldCorrectlyPerformNextOnCursorWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection
        var collection = db.collection('simple_next_object_collection_with_promise');

        // Insert some documents we can sort on
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function(docs) {
            test.ok(docs);
            // Do normal ascending sort
            return collection.find().next();
          })
          .then(function(item) {
            test.equal(1, item.a);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor explain function using a Promise.
   *
   * @example-class Cursor
   * @example-method explain
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleExplainCursorWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection
        var collection = db.collection('simple_explain_collection_with_promise');

        // Insert some documents we can sort on
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function(docs) {
            test.ok(docs);
            // Do normal ascending sort
            return collection.find().explain();
          })
          .then(function(explanation) {
            test.ok(explanation);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor close function using a Promise.
   *
   * @example-class Cursor
   * @example-method close
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheCloseFunctionWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN

        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_close_function_on_cursor_with_promise');

        // Perform a find to get a cursor
        var cursor = collection.find();

        // Insert documents into collection
        return collection
          .insertMany(docs, configuration.writeConcernMax())
          .then(function(ids) {
            test.ok(ids);
            // Fetch the first object
            return cursor.next();
          })
          .then(function(object) {
            test.ok(object);
            // Close the cursor, this is the same as reseting the query
            return cursor.close();
          })
          .then(function() {
            client.close();
          });
      });
      // END
    }
  });

  /**************************************************************************
   *
   * MONGOCLIENT TESTS
   *
   *************************************************************************/

  /**
   * Example of a simple url connection string to a replicaset, with acknowledgement of writes using a Promise.
   *
   * @example-class MongoClient
   * @ignore
   */
  it('Should correctly connect to a replicaset With Promises', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var url = f(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        f('%s:%s', configuration.host, configuration.port),
        f('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      const client = configuration.newClient(url);
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN
        test.ok(db != null);

        return db
          .collection('replicaset_mongo_client_collection_with_promise')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function(result) {
            test.equal(1, result.result.n);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string to a shard, with acknowledgement of writes using a Promise.
   *
   * @example-class MongoClient
   * @ignore
   */
  it('Should connect to mongos proxies using connectiong string With Promises', {
    metadata: { requires: { topology: 'mongos' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url);
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN
        test.ok(db != null);

        return db
          .collection('replicaset_mongo_client_collection_with_promise')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function(result) {
            test.equal(1, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string for a single server connection
   *
   * @example-class MongoClient
   * @ignore
   */
  it('Should correctly connect using MongoClient to a single server using connect With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27017/integration_tests', {
        native_parser: true
      });

      // DOC_START
      // Connect using the connection string
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN
        return db
          .collection('mongoclient_test_with_promise')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function(result) {
            test.equal(1, result.result.n);
            client.close();
          });
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
   * A simple example showing the usage of the Gridstore.exist method using a Promise.
   *
   * @example-class GridStore
   * @example-method GridStore.exist
   * @ignore
   */
  it('shouldCorrectlyExecuteGridStoreExistsByObjectIdWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Open a file for writing
        var gridStore = new GridStore(db, null, 'w');
        return gridStore
          .open()
          .then(function(gridStore) {
            // Writing some content to the file
            return gridStore.write('hello world!');
          })
          .then(function(gridStore) {
            // Flush the file to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            // Check if the file exists using the id returned from the close function
            return GridStore.exist(db, result._id);
          })
          .then(function(result) {
            test.equal(true, result);

            // Show that the file does not exist for a random ObjectID
            return GridStore.exist(db, new ObjectID());
          })
          .then(function(result) {
            test.equal(false, result);

            // Show that the file does not exist for a different file root
            return GridStore.exist(db, result._id, 'another_root');
          })
          .then(function(result) {
            test.equal(false, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the eof method using a Promise.
   *
   * @example-class GridStore
   * @example-method GridStore.list
   * @ignore
   */
  it('shouldCorrectlyExecuteGridStoreListWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Our file ids
        var fileId = new ObjectID();
        var fileId2 = new ObjectID();

        // Open two files for writing
        var gridStore = new GridStore(db, fileId, 'foobar2', 'w');
        var gridStore2 = new GridStore(db, fileId2, 'foobar3', 'w');

        return gridStore
          .open()
          .then(function(gridStore) {
            // Write some content to the file
            return gridStore.write('hello world!');
          })
          .then(function(gridStore) {
            // Flush to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // List the existing files
            return GridStore.list(db);
          })
          .then(function(items) {
            var found = false;
            items.forEach(function(filename) {
              if (filename === 'foobar2') found = true;
            });

            test.ok(items.length >= 1);
            test.ok(found);

            // List the existing files but return only the file ids
            return GridStore.list(db, { id: true });
          })
          .then(function(items) {
            items.forEach(function(id) {
              test.ok(typeof id === 'object');
            });

            test.ok(items.length >= 1);

            // List the existing files in a specific root collection
            return GridStore.list(db, 'fs');
          })
          .then(function(items) {
            var found = false;
            items.forEach(function(filename) {
              if (filename === 'foobar2') found = true;
            });

            test.ok(items.length >= 1);
            test.ok(found);

            // List the existing files in a different root collection where the file is not located
            return GridStore.list(db, 'my_fs');
          })
          .then(function(items) {
            var found = false;
            items.forEach(function(filename) {
              if (filename === 'foobar2') found = true;
            });

            test.ok(items.length >= 0);
            test.ok(!found);

            return gridStore2.open();
          })
          .then(function(gridStore) {
            test.ok(gridStore);
            // Write the content
            return gridStore2.write('my file');
          })
          .then(function(gridStore) {
            // Flush to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // List all the available files and verify that our files are there
            return GridStore.list(db);
          })
          .then(function(items) {
            var found = false;
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
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the puts method using a Promise.
   *
   * @example-class GridStore
   * @example-method puts
   * @ignore
   */
  it('shouldCorrectlyReadlinesAndPutLinesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Open a file for writing
        var gridStore = new GridStore(db, 'test_gs_puts_and_readlines', 'w');
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write a line to the file using the puts method
            return gridStore.puts('line one');
          })
          .then(function(gridStore) {
            // Flush the file to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Read in the entire contents
            return GridStore.read(db, 'test_gs_puts_and_readlines');
          })
          .then(function(data) {
            test.equal('line one\n', data.toString());
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the GridStore.unlink method using a Promise.
   *
   * @example-class GridStore
   * @example-method GridStore.unlink
   * @ignore
   */
  it('shouldCorrectlyUnlinkWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Define some collections
        var fsFilesCollection = db.collection('fs.files');
        var fsChunksCollection = db.collection('fs.chunks');

        // Open a new file for writing
        var gridStore = new GridStore(db, 'test_gs_unlink', 'w');

        return db
          .dropDatabase()
          .then(function() {
            return gridStore.open();
          })
          .then(function(gridStore) {
            // Write some content
            return gridStore.write('hello, world!');
          })
          .then(function(gridStore) {
            // Flush file to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);

            // Verify the existance of the fs.files document
            return fsFilesCollection.count();
          })
          .then(function(count) {
            test.equal(1, count);

            // Verify the existance of the fs.chunks chunk document
            return fsChunksCollection.count();
          })
          .then(function(count) {
            test.equal(1, count);

            // Unlink the file (removing it)
            return GridStore.unlink(db, 'test_gs_unlink');
          })
          .then(function(gridStore) {
            test.ok(gridStore);

            // Verify that fs.files document is gone
            return fsFilesCollection.count();
          })
          .then(function(count) {
            test.equal(0, count);

            // Verify that fs.chunks chunk documents are gone
            return fsChunksCollection.count();
          })
          .then(function(count) {
            test.equal(0, count);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the read method using a Promise.
   *
   * @example-class GridStore
   * @example-method read
   * @ignore
   */
  it('shouldCorrectlyWriteAndReadJpgImageWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Read in the content of a file
        var data = fs.readFileSync('./test/functional/data/iya_logo_final_bw.jpg');

        // Create two new files
        var gs = new GridStore(db, 'test', 'w');
        var gs2 = new GridStore(db, 'test', 'r');

        // Open the file
        return gs
          .open()
          .then(function(gs) {
            // Write the file to GridFS
            return gs.write(data);
          })
          .then(function(gs) {
            // Flush to the GridFS
            return gs.close();
          })
          .then(function(gs) {
            test.ok(gs);
            // Open the file
            return gs2.open();
          })
          .then(function(gs) {
            test.ok(gs);
            // Set the pointer of the read head to the start of the gridstored file
            return gs2.seek(0);
          })
          .then(function() {
            // Read the entire file
            return gs2.read();
          })
          .then(function(data2) {
            // Compare the file content against the orgiinal
            test.equal(data.toString('base64'), data2.toString('base64'));
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing opening a file using a filename, writing to it and saving it using a Promise.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingFilenameWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a new instance of the gridstore
        var gridStore = new GridStore(db, 'ourexamplefiletowrite.txt', 'w');

        // Open the file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write some data to the file
            return gridStore.write('bar');
          })
          .then(function(gridStore) {
            // Close (Flushes the data to MongoDB)
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the file exists
            return GridStore.exist(db, 'ourexamplefiletowrite.txt');
          })
          .then(function(result) {
            test.equal(true, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing opening a file using an ObjectID, writing to it and saving it using a Promise.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingObjectIDWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Create a new instance of the gridstore
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write some data to the file
            return gridStore.write('bar');
          })
          .then(function(gridStore) {
            // Close (Flushes the data to MongoDB)
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the file exists
            return GridStore.exist(db, fileId);
          })
          .then(function(result) {
            test.equal(true, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing how to write a file to Gridstore using file location path using a Promise.
   *
   * @example-class GridStore
   * @example-method writeFile
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
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
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write the file to gridFS
            return gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png');
          })
          .then(function(doc) {
            test.ok(doc);
            // Read back all the written content and verify the correctness
            return GridStore.read(db, fileId);
          })
          .then(function(fileData) {
            test.equal(data.toString('base64'), fileData.toString('base64'));
            test.equal(fileSize, fileData.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing how to write a file to Gridstore using a file handle using a Promise.
   *
   * @example-class GridStore
   * @example-method writeFile
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandleWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
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
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write the file to gridFS using the file handle
            return gridStore.writeFile(fd);
          })
          .then(function(doc) {
            test.ok(doc);
            // Read back all the written content and verify the correctness
            return GridStore.read(db, fileId);
          })
          .then(function(fileData) {
            test.equal(data.toString('base64'), fileData.toString('base64'));
            test.equal(fileSize, fileData.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the write command with strings and Buffers using a Promise.
   *
   * @example-class GridStore
   * @example-method write
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffersWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write a text string
            return gridStore.write('Hello world');
          })
          .then(function(gridStore) {
            // Write a buffer
            return gridStore.write(Buffer.from('Buffer Hello world'));
          })
          .then(function(gridStore) {
            // Close the
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Read back all the written content and verify the correctness
            return GridStore.read(db, fileId);
          })
          .then(function(fileData) {
            test.equal('Hello worldBuffer Hello world', fileData.toString());
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the write command with strings and Buffers using a Promise.
   *
   * @example-class GridStore
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingCloseWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write a text string
            return gridStore.write('Hello world');
          })
          .then(function(gridStore) {
            // Close the
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the instance level unlink command to delete a gridstore item using a Promise.
   *
   * @example-class GridStore
   * @example-method unlink
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkItWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');
        var gridStore2 = new GridStore(db, fileId, 'r');

        // Open the new file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write a text string
            return gridStore.write('Hello world');
          })
          .then(function(gridStore) {
            // Close the
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Open the file again and unlin it
            return gridStore2.open();
          })
          .then(function(gridStore) {
            test.ok(gridStore);
            // Unlink the file
            return gridStore2.unlink();
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the file no longer exists
            return GridStore.exist(db, fileId);
          })
          .then(function(result) {
            test.equal(false, result);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Promise.
   *
   * @example-class GridStore
   * @example-method GridStore.readlines
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlinesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write one line to gridStore
            return gridStore.puts('line one');
          })
          .then(function(gridStore) {
            // Write second line to gridStore
            return gridStore.puts('line two');
          })
          .then(function(gridStore) {
            // Write third line to gridStore
            return gridStore.puts('line three');
          })
          .then(function(gridStore) {
            // Flush file to disk
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Read back all the lines
            return GridStore.readlines(db, fileId);
          })
          .then(function(lines) {
            test.deepEqual(['line one\n', 'line two\n', 'line three\n'], lines);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing reading back using readlines to split the text into lines by the separator provided using a Promise.
   *
   * @example-class GridStore
   * @example-method readlines
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlinesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write one line to gridStore
            return gridStore.puts('line one');
          })
          .then(function(gridStore) {
            // Write second line to gridStore
            return gridStore.puts('line two');
          })
          .then(function(gridStore) {
            // Write third line to gridStore
            return gridStore.puts('line three');
          })
          .then(function(gridStore) {
            // Flush file to disk
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);

            // Open file for reading
            gridStore = new GridStore(db, fileId, 'r');
            return gridStore.open();
          })
          .then(function(gridStore) {
            // Read all the lines and verify correctness
            return gridStore.readlines();
          })
          .then(function(lines) {
            test.deepEqual(['line one\n', 'line two\n', 'line three\n'], lines);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the read method using a Promise.
   *
   * @example-class GridStore
   * @example-method GridStore.read
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreReadWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a new file
        var gridStore = new GridStore(db, null, 'w');
        // Read in the content from a file, replace with your own
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        // Open the file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write the binary file data to GridFS
            return gridStore.write(data);
          })
          .then(function(gridStore) {
            // Flush the remaining data to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            // Read in the whole file and check that it's the same content
            return GridStore.read(db, result._id);
          })
          .then(function(fileData) {
            test.equal(data.length, fileData.length);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the seek method using a Promise.
   *
   * @example-class GridStore
   * @example-method seek
   * @ignore
   */
  it('shouldCorrectlySeekWithBufferWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a file and open it
        var gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'w');
        gridStore
          .open()
          .then(function(gridStore) {
            // Write some content to the file
            return gridStore.write(Buffer.from('hello, world!', 'utf8'));
          })
          .then(function(gridStore) {
            // Flush the file to GridFS
            return gridStore.close();
          })
          .then(function() {
            // Open the file in read mode
            var gridStore2 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
            gridStore2.open().then(function(gridStore) {
              // Seek to start
              gridStore.seek(0).then(function(gridStore) {
                // Read first character and verify
                gridStore.getc().then(function(chr) {
                  test.equal('h', chr.toString());
                });
              });
            });

            // Open the file in read mode
            var gridStore3 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
            gridStore3.open().then(function(gridStore) {
              // Seek to 7 characters from the beginning off the file and verify
              gridStore.seek(7).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('w', chr.toString());
                });
              });
            });

            // Open the file in read mode
            var gridStore5 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
            gridStore5.open().then(function(gridStore) {
              // Seek to -1 characters from the end off the file and verify
              gridStore.seek(-1, GridStore.IO_SEEK_END).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('!', chr.toString());
                });
              });
            });

            // Open the file in read mode
            var gridStore6 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
            gridStore6.open().then(function(gridStore) {
              // Seek to -6 characters from the end off the file and verify
              gridStore.seek(-6, GridStore.IO_SEEK_END).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('w', chr.toString());
                });
              });
            });

            // Open the file in read mode
            var gridStore7 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
            gridStore7.open().then(function(gridStore) {
              // Seek forward 7 characters from the current read position and verify
              gridStore.seek(7, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                gridStore.getc().then(function(chr) {
                  test.equal('w', chr.toString());

                  // Seek forward -1 characters from the current read position and verify
                  gridStore.seek(-1, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                    gridStore.getc().then(function(chr) {
                      test.equal('w', chr.toString());

                      // Seek forward -4 characters from the current read position and verify
                      gridStore.seek(-4, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                        gridStore.getc().then(function(chr) {
                          test.equal('o', chr.toString());

                          // Seek forward 3 characters from the current read position and verify
                          gridStore.seek(3, GridStore.IO_SEEK_CUR).then(function(gridStore) {
                            gridStore.getc().then(function(chr) {
                              test.equal('o', chr.toString());

                              client.close();
                              done();
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
  });

  /**
   * A simple example showing how to rewind and overwrite the file using a Promise.
   *
   * @example-class GridStore
   * @example-method rewind
   * @ignore
   */
  it('shouldCorrectlyRewingAndTruncateOnWriteWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Our file ID
        var fileId = new ObjectID();

        // Create a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the file
        return gridStore
          .open()
          .then(function(gridStore) {
            // Write to the file
            return gridStore.write('hello, world!');
          })
          .then(function(gridStore) {
            // Flush the file to disk
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Reopen the file
            gridStore = new GridStore(db, fileId, 'w');
            return gridStore.open();
          })
          .then(function(gridStore) {
            // Write some more text to the file
            return gridStore.write('some text is inserted here');
          })
          .then(function(gridStore) {
            // Let's rewind to truncate the file
            return gridStore.rewind();
          })
          .then(function(gridStore) {
            // Write something from the start
            return gridStore.write('abc');
          })
          .then(function(gridStore) {
            // Flush the data to mongodb
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Verify that the new data was written
            return GridStore.read(db, fileId);
          })
          .then(function(data) {
            test.equal('abc', data.toString());
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the tell method using a Promise.
   *
   * @example-class GridStore
   * @example-method tell
   * @ignore
   */
  it('shouldCorrectlyExecuteGridstoreTellWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create two new files
        var gridStore = new GridStore(db, 'test_gs_tell', 'w');
        var gridStore2 = new GridStore(db, 'test_gs_tell', 'r');

        // Open the file
        return gridStore
          .open()
          .then(function() {
            // Write a string to the file
            return gridStore.write('hello, world!');
          })
          .then(function() {
            // Flush the file to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Open the file in read only mode
            return gridStore2.open();
          })
          .then(function() {
            // Read the first 5 characters
            return gridStore2.read(5);
          })
          .then(function(data) {
            test.equal('hello', data.toString());

            // Get the current position of the read head
            return gridStore2.tell();
          })
          .then(function(position) {
            test.equal(5, position);
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the seek method using a Promise.
   *
   * @example-class GridStore
   * @example-method getc
   * @ignore
   */
  it('shouldCorrectlyRetrieveSingleCharacterUsingGetCWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        var gridStore = new GridStore(db, 'test_gs_getc_file', 'w');
        var gridStore2 = new GridStore(db, 'test_gs_getc_file', 'r');

        return gridStore
          .open()
          .then(function(gridStore) {
            // Write some content to the file
            return gridStore.write(Buffer.from('hello, world!', 'utf8'));
          })
          .then(function(gridStore) {
            // Flush the file to GridFS
            return gridStore.close();
          })
          .then(function(result) {
            test.ok(result);
            // Open the file in read mode
            return gridStore2.open();
          })
          .then(function(gridStore) {
            // Read first character and verify
            return gridStore.getc();
          })
          .then(function(chr) {
            test.equal('h', chr.toString());
            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing how to save a file with a filename allowing for multiple files with the same name using a Promise.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlyRetrieveSingleCharacterUsingGetCWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   GridStore = require('mongodb').GridStore,
        // LINE   ObjectID = require('mongodb').ObjectID,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        var gridStore = new GridStore(db, new ObjectID(), 'test_gs_getc_file', 'w');
        var gridStoreDupe = new GridStore(db, new ObjectID(), 'test_gs_getc_file', 'w');
        var gridStore2 = new GridStore(db, 'test_gs_getc_file', 'r');
        var fileData;

        return gridStore
          .open()
          .then(function(gridStore) {
            // Write some content to the file
            return gridStore.write(Buffer.from('hello, world!', 'utf8'));
          })
          .then(function(gridStore) {
            // Flush the file to GridFS
            return gridStore.close();
          })
          .then(function(fileData) {
            test.ok(fileData);
            // Create another file with same name and and save content to it
            return gridStoreDupe.open();
          })
          .then(function(gridStore) {
            test.ok(gridStore);
            // Write some content to the file
            return gridStoreDupe.write(Buffer.from('hello, world!', 'utf8'));
          })
          .then(function(gridStore) {
            test.ok(gridStore);
            // Flush the file to GridFS
            return gridStoreDupe.close();
          })
          .then(function(_fileData) {
            fileData = _fileData;
            // Open the file in read mode using the filename
            return gridStore2.open();
          })
          .then(function() {
            // Read first character and verify
            return gridStore2.getc();
          })
          .then(function(chr) {
            test.equal('h', chr.toString());

            // Open the file using an object id
            gridStore2 = new GridStore(db, fileData._id, 'r');
            return gridStore2.open();
          })
          .then(function() {
            // Read first character and verify
            return gridStore2.getc();
          })
          .then(function(chr) {
            test.equal('h', chr.toString());
            client.close();
          });
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
   * Example of a simple ordered insert/update/upsert/remove ordered collection using a Promise.
   *
   * @example-class Collection
   * @example-method initializeOrderedBulkOp
   * @ignore
   */
  it('Should correctly execute ordered batch with no errors using write commands With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('batch_write_ordered_ops_0_with_promise');
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
        return batch.execute().then(function(result) {
          // Check state of result
          test.equal(2, result.nInserted);
          test.equal(1, result.nUpserted);
          test.equal(1, result.nMatched);
          test.ok(1 === result.nModified || result.nModified === 0 || result.nModified == null);
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
      });
      // END
    }
  });

  /**
   * Example of a simple ordered insert/update/upsert/remove ordered collection using a Promise.
   *
   *
   * @example-class Collection
   * @example-method initializeUnorderedBulkOp
   * @ignore
   */
  it('Should correctly execute unordered batch with no errors With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('batch_write_unordered_ops_legacy_0_with_promise');
        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp();

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
        return batch.execute().then(function(result) {
          // Check state of result
          test.equal(2, result.nInserted);
          test.equal(1, result.nUpserted);
          test.equal(1, result.nMatched);
          test.ok(1 === result.nModified || result.nModified === 0 || result.nModified == null);
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
   * Example of a simple insertOne operation using a Promise.
   *
   * @example-class Collection
   * @example-method insertOne
   * @ignore
   */
  it('Should correctly execute insertOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('insert_one_with_promise');
        return col.insertOne({ a: 1 }).then(function(r) {
          test.equal(1, r.insertedCount);
          // Finish up test
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Example of a simple insertMany operation using a Promise.
   *
   * @example-class Collection
   * @example-method insertMany
   * @ignore
   */
  it('Should correctly execute insertMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('insert_many_with_promise');
        return col.insertMany([{ a: 1 }, { a: 2 }]).then(function(r) {
          test.equal(2, r.insertedCount);
          // Finish up test
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Example of a simple updateOne operation using a Promise.
   *
   * @example-class Collection
   * @example-method updateOne
   * @ignore
   */
  it('Should correctly execute updateOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('update_one_with_promise');
        return col.updateOne({ a: 1 }, { $set: { a: 2 } }, { upsert: true }).then(function(r) {
          test.equal(0, r.matchedCount);
          test.equal(1, r.upsertedCount);
          // Finish up test
          client.close();
        });
      });
      // END
    }
  });

  /**
   * Example of a simple updateMany operation using a Promise.
   *
   * @example-class Collection
   * @example-method updateMany
   * @ignore
   */
  it('Should correctly execute updateMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('update_many_with_promise');
        return col
          .insertMany([{ a: 1 }, { a: 1 }])
          .then(function(r) {
            test.equal(2, r.insertedCount);

            // Update all documents
            return col.updateMany({ a: 1 }, { $set: { b: 1 } });
          })
          .then(function(r) {
            if (r.n) {
              test.equal(2, r.n);
            } else {
              test.equal(2, r.matchedCount);
              test.equal(2, r.modifiedCount);
            }

            // Finish up test
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple removeOne operation using a Promise.
   *
   * @example-class Collection
   * @example-method removeOne
   * @ignore
   */
  it('Should correctly execute removeOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('remove_one_with_promise');
        return col
          .insertMany([{ a: 1 }, { a: 1 }])
          .then(function(r) {
            test.equal(2, r.insertedCount);

            return col.removeOne({ a: 1 });
          })
          .then(function(r) {
            test.equal(1, r.deletedCount);
            // Finish up test
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple removeMany operation using a Promise.
   *
   * @example-class Collection
   * @example-method removeMany
   * @ignore
   */
  it('Should correctly execute removeMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('remove_many_with_promise');
        return col
          .insertMany([{ a: 1 }, { a: 1 }])
          .then(function(r) {
            test.equal(2, r.insertedCount);

            // Update all documents
            return col.removeMany({ a: 1 });
          })
          .then(function(r) {
            test.equal(2, r.deletedCount);

            // Finish up test
            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple bulkWrite operation using a Promise.
   *
   * @example-class Collection
   * @example-method bulkWrite
   * @ignore
   */
  it('Should correctly execute bulkWrite operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('bulk_write_with_promise');
        return col
          .bulkWrite(
            [
              { insertOne: { document: { a: 1 } } },
              { updateOne: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
              { updateMany: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
              { deleteOne: { filter: { c: 1 } } },
              { deleteMany: { filter: { c: 1 } } },
              { replaceOne: { filter: { c: 3 }, replacement: { c: 4 }, upsert: true } }
            ],
            { ordered: true, w: 1 }
          )
          .then(function(r) {
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
      });
      // END
    }
  });

  /**
   * Duplicate key error
   */
  it('Should correctly handle duplicate key error with bulkWrite', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('bulk_write_with_promise_write_error');
        return col
          .bulkWrite(
            [{ insertOne: { document: { _id: 1 } } }, { insertOne: { document: { _id: 1 } } }],
            { ordered: true, w: 1 }
          )
          .catch(function(err) {
            test.equal(true, err.result.hasWriteErrors());
            // Ordered bulk operation
            client.close();
          });
      });
    }
  });

  /**
   * Example of a simple findOneAndDelete operation using a Promise.
   *
   * @example-class Collection
   * @example-method findOneAndDelete
   * @ignore
   */
  it('Should correctly execute findOneAndDelete operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_delete_with_promise');
        return col
          .insertMany([{ a: 1, b: 1 }], { w: 1 })
          .then(function(r) {
            test.equal(1, r.result.n);

            return col.findOneAndDelete({ a: 1 }, { projection: { b: 1 }, sort: { a: 1 } });
          })
          .then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndReplace operation using a Promise.
   *
   * @example-class Collection
   * @example-method findOneAndReplace
   * @ignore
   */
  it('Should correctly execute findOneAndReplace operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_replace_with_promise');
        return col.insertMany([{ a: 1, b: 1 }], { w: 1 }).then(function(r) {
          test.equal(1, r.result.n);

          return col
            .findOneAndReplace(
              { a: 1 },
              { c: 1, b: 1 },
              {
                projection: { b: 1, c: 1 },
                sort: { a: 1 },
                returnOriginal: false,
                upsert: true
              }
            )
            .then(function(r) {
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.c);

              client.close();
            });
        });
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndUpdate operation using a Promise.
   *
   * @example-class Collection
   * @example-method findOneAndUpdate
   * @ignore
   */
  it('Should correctly execute findOneAndUpdate operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function() {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_update_with_promise');
        return col
          .insertMany([{ a: 1, b: 1 }], { w: 1 })
          .then(function(r) {
            test.equal(1, r.result.n);

            return col.findOneAndUpdate(
              { a: 1 },
              { $set: { d: 1 } },
              {
                projection: { b: 1, d: 1 },
                sort: { a: 1 },
                returnOriginal: false,
                upsert: true
              }
            );
          })
          .then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);
            test.equal(1, r.value.d);

            client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the listening to a capped collection using a Promise.
   *
   * @example-class Db
   * @example-method createCollection
   * @ignore
   */
  it('Should correctly add capped collection options to cursor With Promises', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      client.connect().then(function(client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a capped collection with a maximum of 1000 documents
        var collection;

        db
          .createCollection('a_simple_collection_2_with_promise', {
            capped: true,
            size: 100000,
            max: 10000,
            w: 1
          })
          .then(function(_collection) {
            collection = _collection;

            var docs = [];
            for (var i = 0; i < 1000; i++) docs.push({ a: i });

            // Insert a document in the capped collection
            return collection.insertMany(docs, configuration.writeConcernMax());
          })
          .then(function(result) {
            test.ok(result);

            // Start date
            var s = new Date();
            var total = 0;

            // Get the cursor
            var cursor = collection
              .find({ a: { $gte: 0 } })
              .addCursorFlag('tailable', true)
              .addCursorFlag('awaitData', true);

            cursor.on('data', function(d) {
              test.ok(d);
              total = total + 1;

              if (total === 1000) {
                cursor.kill();
              }
            });

            cursor.on('end', function() {
              test.ok(new Date().getTime() - s.getTime() > 1000);

              client.close();
              done();
            });
          });
      });
      // END
    }
  });

  describe('Transaction Examples', function() {
    before(function() {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax());

      return client
        .connect()
        .then(() => client.db('hr').createCollection('employees'))
        .then(() => client.db('reporting').createCollection('events'));
    });

    // Start Transactions Intro Example 1
    it('should be able to run transactions example 1', {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
      test: function() {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax());

        // BEGIN
        function updateEmployeeInfo(client) {
          return client.withSession(session => {
            function commit() {
              return session.commitTransaction().catch(e => {
                if (e.errorLabels && e.errorLabels.indexOf('UnknownTransactionCommitResult') < 0) {
                  // LINE console.log('Transaction aborted. Caught exception during transaction.');
                  return commit();
                }

                // LINE console.log('Error during commit ...');
                throw e;
              });
            }

            const employeesCollection = client.db('hr').collection('employees');
            const eventsCollection = client.db('reporting').collection('events');

            session.startTransaction({
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' }
            });

            return employeesCollection
              .updateOne({ employee: 3 }, { $set: { status: 'Inactive' } }, { session })
              .then(() => {
                return eventsCollection.insertOne(
                  {
                    employee: 3,
                    status: { new: 'Inactive', old: 'Active' }
                  },
                  { session }
                );
              })
              .catch(e => {
                // LINE console.log('caugh exception during transaction, aborting')
                return session.abortTransaction().then(() => Promise.reject(e));
              })
              .then(() => commit())
              .then(() => {
                // LINE console.log('Transaction committed');
              });
          });
          // END
        }
        client
          .connect()
          .then(() => updateEmployeeInfo(client))
          .then(() => client.close());
      }
    });
    // End Transactions Intro Example 1

    // Start Transactions Retry Example 1
    it('should be able to run transactions retry example 1', {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
      test: function() {
        // BEGIN
        function runTransactionWithRetry(txnFunc, client, session) {
          return txnFunc(client, session).catch(error => {
            // LINE console.log('Transaction aborted. Caught exception during transaction.');

            // If transient error, retry the whole transaction
            if (error.errorLabels && error.errorLabels.indexOf('TransientTransactionError') < 0) {
              // LINE console.log('TransientTransactionError, retrying transaction ...');
              return runTransactionWithRetry(txnFunc, client, session);
            }

            throw error;
          });
        }
        // END

        function updateEmployeeInfo(client, session) {
          session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
          });

          const employeesCollection = client.db('hr').collection('employees');
          const eventsCollection = client.db('reporting').collection('events');

          return employeesCollection
            .updateOne({ employee: 3 }, { $set: { status: 'Inactive' } }, { session })
            .then(() => {
              return eventsCollection.insertOne(
                {
                  employee: 3,
                  status: { new: 'Inactive', old: 'Active' }
                },
                { session }
              );
            })
            .then(() => session.commitTransaction())
            .catch(e => {
              return session.abortTransaction().then(() => Promise.reject(e));
            });
        }
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax());

        return client
          .connect()
          .then(() =>
            client.withSession(session =>
              runTransactionWithRetry(updateEmployeeInfo, client, session)
            )
          )
          .then(() => client.close());
      }
    });

    // End Transactions Retry Example 1

    // Start Transactions Retry Example 2
    it('should be able to run transactions retry example 2', {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
      test: function() {
        // BEGIN
        function commitWithRetry(session) {
          return (
            session
              .commitTransaction()
              // LINE .then(() => console.log('Transaction committed.'))
              .catch(error => {
                if (
                  error.errorLabels &&
                  error.errorLabels.indexOf('UnknownTransactionCommitResult') < 0
                ) {
                  // LINE console.log('UnknownTransactionCommitResult, retrying commit operation ...');
                  return commitWithRetry(session);
                }
                // LINE console.log('Error during commit ...');
                throw error;
              })
          );
        }
        // END

        function updateEmployeeInfo(client, session) {
          session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
          });

          const employeesCollection = client.db('hr').collection('employees');
          const eventsCollection = client.db('reporting').collection('events');

          return employeesCollection
            .updateOne({ employee: 3 }, { $set: { status: 'Inactive' } }, { session })
            .then(() => {
              return eventsCollection.insertOne(
                {
                  employee: 3,
                  status: { new: 'Inactive', old: 'Active' }
                },
                { session }
              );
            })
            .then(() => commitWithRetry(session))
            .catch(e => {
              return session.abortTransaction().then(() => Promise.reject(e));
            });
        }
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax());

        return client
          .connect()
          .then(() => client.withSession(session => updateEmployeeInfo(client, session)))
          .then(() => client.close());
      }
    });
    // End Transactions Retry Example 2

    // Start Transactions Retry Example 3
    it('should be able to run transactions retry example 3', {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
      test: function() {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax());

        // BEGIN
        function commitWithRetry(session) {
          return (
            session
              .commitTransaction()
              // LINE .then(() => console.log('Transaction committed.'))
              .catch(error => {
                if (
                  error.errorLabels &&
                  error.errorLabels.indexOf('UnknownTransactionCommitResult') < 0
                ) {
                  // LINE console.log('UnknownTransactionCommitResult, retrying commit operation ...');
                  return commitWithRetry(session);
                }
                // LINE console.log('Error during commit ...');
                throw error;
              })
          );
        }

        function runTransactionWithRetry(txnFunc, client, session) {
          return txnFunc(client, session).catch(error => {
            // LINE console.log('Transaction aborted. Caught exception during transaction.');

            // If transient error, retry the whole transaction
            if (error.errorLabels && error.errorLabels.indexOf('TransientTransactionError') < 0) {
              // LINE console.log('TransientTransactionError, retrying transaction ...');
              return runTransactionWithRetry(txnFunc, client, session);
            }

            throw error;
          });
        }

        function updateEmployeeInfo(client, session) {
          const employeesCollection = client.db('hr').collection('employees');
          const eventsCollection = client.db('reporting').collection('events');

          session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
          });

          return employeesCollection
            .updateOne({ employee: 3 }, { $set: { status: 'Inactive' } }, { session })
            .then(() => {
              return eventsCollection.insertOne(
                {
                  employee: 3,
                  status: { new: 'Inactive', old: 'Active' }
                },
                { session }
              );
            })
            .catch(e => {
              // LINE console.log('caugh exception during transaction, aborting')
              return session.abortTransaction().then(() => Promise.reject(e));
            })
            .then(() => commitWithRetry(session));
        }

        // LINE const { MongoClient } = require('mongodb'),
        // LINE const client = new MongoClient('myRepl/mongodb0.example.net:27017,mongodb1.example.net:27017,mongodb2.example.net:27017');
        return client
          .connect()
          .then(() =>
            client.withSession(session =>
              runTransactionWithRetry(updateEmployeeInfo, client, session)
            )
          )
          .then(() => client.close());
        // END
      }
    });
    // End Transactions Retry Example 3
  });
});
