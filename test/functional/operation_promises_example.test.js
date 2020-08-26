'use strict';
var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { Code } = require('../../src');
const { expect } = require('chai');

var delay = function (ms) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve();
    }, ms);
  });
};

describe('Operation (Promises)', function () {
  before(function () {
    return setupDatabase(this.configuration, ['integration_tests_2', 'hr', 'reporting']);
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
   */
  it('aggregationExample2WithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.1.0', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
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
          .then(function (docs) {
            test.equal(2, docs.length);
            return client.close();
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
   */
  it('Aggregation Cursor next Test With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.1.0', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
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
          .then(function (docs) {
            test.ok(docs);

            // Need to close cursor to close implicit session,
            // since cursor is not exhausted
            cursor.close();
            return client.close();
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
   */
  it('shouldCorrectlyDoSimpleCountExamplesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (ids) {
            test.ok(ids);

            // Perform a total count command
            return collection.count();
          })
          .then(function (count) {
            test.equal(4, count);

            // Perform a partial account where b=1
            return collection.count({ b: 1 });
          })
          .then(function (count) {
            test.equal(1, count);
            return client.close();
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
   */
  it('shouldCreateComplexIndexOnTwoFieldsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return collection.createIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            test.ok(explanation != null);
            return client.close();
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
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (ids) {
            test.ok(ids);

            // Perform a distinct query against the a field
            return collection.distinct('a');
          })
          .then(function (docs) {
            test.deepEqual([0, 1, 2, 3], docs.sort());

            // Perform a distinct query against the sub-field b.c
            return collection.distinct('b.c');
          })
          .then(function (docs) {
            test.deepEqual(['a', 'b', 'c'], docs.sort());
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of running the distinct command against a collection using a Promise with a filter query
   */
  it('shouldCorrectlyHandleDistinctIndexesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (ids) {
            test.ok(ids);

            // Perform a distinct query with a filter against the documents
            return collection.distinct('a', { c: 1 });
          })
          .then(function (docs) {
            test.deepEqual([5], docs.sort());
            return client.close();
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
   */
  it('shouldCorrectlyDropCollectionWithDropFunctionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (collection) {
            // Drop the collection
            return collection.drop();
          })
          .then(function (reply) {
            test.ok(reply);

            // Ensure we don't have the collection in the set of names
            return db.listCollections().toArray();
          })
          .then(function (replies) {
            var found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function (document) {
              if (document.name === 'test_other_drop_with_promise') {
                found = true;
                return;
              }
            });

            // Ensure the collection is not found
            test.equal(false, found);

            // Let's close the db
            return client.close();
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
   */
  it('dropAllIndexesExample1WithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (r) {
            test.ok(r);

            // Drop the collection
            return db.collection('dropExample1_with_promise').dropAllIndexes();
          })
          .then(function (reply) {
            test.ok(reply);

            // Let's close the db
            return client.close();
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
   */
  it('shouldCorrectlyCreateAndDropIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function (client) {
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
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            { w: 1 }
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Drop the index
            return collection.dropIndex('a_1_b_1');
          })
          .then(function (result) {
            test.ok(result);
            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function (indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            expect(indexInformation.a_1_b_1).to.not.exist;
            return client.close();
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
   */
  it('shouldCreateComplexEnsureIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return db.ensureIndex(
              'ensureIndexExample1_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 }
            );
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            test.ok(explanation != null);
            return client.close();
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
   */
  it('ensureIndexExampleWithCompountIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function (client) {
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
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            { w: 1 }
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            test.ok(explanation != null);
            return client.close();
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
   */
  it('shouldPerformASimpleQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.find().toArray();
          })
          .then(function (docs) {
            test.equal(3, docs.length);
            return client.close();
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
   */
  it('shouldPerformASimpleExplainQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.find({}).explain();
          })
          .then(function (docs) {
            test.ok(docs != null);
            return client.close();
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
   */
  it('shouldPerformASimpleLimitSkipQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.find({}).skip(1).limit(1).project({ b: 1 }).toArray();
          })
          .then(function (docs) {
            test.equal(1, docs.length);
            expect(docs[0].a).to.not.exist;
            test.equal(2, docs[0].b);
            return client.close();
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
   */
  it('shouldPerformSimpleFindAndModifyOperationsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Simple findAndModify command returning the new document
            return collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b1: 1 } },
              { new: true }
            );
          })
          .then(function (doc) {
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
          .then(function (doc) {
            test.ok(doc);

            // Verify that the document is gone
            return collection.findOne({ b: 1 });
          })
          .then(function (item) {
            expect(item).to.not.exist;

            // Simple findAndModify command performing an upsert and returning the new document
            // executing the command safely
            return collection.findAndModify(
              { d: 1 },
              [['b', 1]],
              { d: 1, f: 1 },
              { new: true, upsert: true, w: 1 }
            );
          })
          .then(function (doc) {
            test.equal(1, doc.value.d);
            test.equal(1, doc.value.f);
            return client.close();
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
   */
  it('shouldPerformSimpleFindAndRemoveWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Simple findAndModify command returning the old document and
            // removing it at the same time
            return collection.findAndRemove({ b: 1 }, [['b', 1]]);
          })
          .then(function (doc) {
            test.equal(1, doc.value.b);
            test.equal(1, doc.value.d);

            // Verify that the document is gone
            return collection.findOne({ b: 1 });
          })
          .then(function (item) {
            expect(item).to.not.exist;
            return client.close();
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
   */
  it('shouldPerformASimpleLimitSkipFindOneQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            // Perform a simple find and return all the documents
            return collection.findOne({ a: 2 }, { fields: { b: 1 } });
          })
          .then(function (doc) {
            expect(doc.a).to.not.exist;
            test.equal(2, doc.b);
            return client.close();
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
   */
  it('shouldPerformSimpleMapReduceFunctionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
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
            return client.close();
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
   */
  it('shouldPerformMapReduceFunctionInlineWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>1.7.6', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function () {
            // Execute map reduce and return results inline
            return collection.mapReduce(map, reduce, { out: { inline: 1 }, verbose: true });
          })
          .then(function (result) {
            test.equal(2, result.results.length);
            test.ok(result.stats != null);

            return collection.mapReduce(map, reduce, {
              out: { replace: 'mapreduce_integration_test' },
              verbose: true
            });
          })
          .then(function (result) {
            test.ok(result.stats != null);
            return client.close();
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
   */
  it('shouldPerformMapReduceWithContextWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
            [
              { user_id: 1, timestamp: new Date() },
              { user_id: 2, timestamp: new Date() }
            ],
            { w: 1 }
          )
          .then(function () {
            return collection.mapReduce(map, reduce, o);
          })
          .then(function (outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function (results) {
            test.equal(2, results[0].value);

            // mapReduce with scope containing plain function
            var o = {};
            o.scope = { fn: t };
            o.out = { replace: 'replacethiscollection' };

            return collection.mapReduce(map, reduce, o);
          })
          .then(function (outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function (results) {
            test.equal(2, results[0].value);
            return client.close();
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
   */
  it.skip('shouldPerformMapReduceInContextObjectsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
            [
              { user_id: 1, timestamp: new Date() },
              { user_id: 2, timestamp: new Date() }
            ],
            { w: 1 }
          )
          .then(function () {
            return collection.mapReduce(map, reduce, o);
          })
          .then(function (outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function (results) {
            test.equal(2, results[0].value);

            // mapReduce with scope containing plain function
            var o = {};
            o.scope = { obj: { fn: t } };
            o.out = { replace: 'replacethiscollection' };

            return collection.mapReduce(map, reduce, o);
          })
          .then(function (outCollection) {
            // Find all entries in the map-reduce collection
            return outCollection.find().toArray();
          })
          .then(function (results) {
            test.equal(2, results[0].value);
            return client.close();
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
   */
  it('shouldCorrectlyRetrieveACollectionsIndexesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Create a simple single field index
            return collection.ensureIndex({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function (result) {
            test.ok(result);

            return delay(1000);
          })
          .then(function () {
            // List all of the indexes on the collection
            return collection.indexes();
          })
          .then(function (indexes) {
            test.equal(3, indexes.length);
            return client.close();
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
   */
  it('shouldCorrectlyExecuteIndexExistsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (indexName) {
            test.ok(indexName);

            // Let's test to check if a single index exists
            return collection.indexExists('a_1');
          })
          .then(function (result) {
            test.equal(true, result);

            // Let's test to check if multiple indexes are available
            return collection.indexExists(['a_1', '_id_']);
          })
          .then(function (result) {
            test.equal(true, result);

            // Check if a non existing index exists
            return collection.indexExists('c_1');
          })
          .then(function (result) {
            test.equal(false, result);
            return client.close();
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
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformationWithPromises', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 0, native_parser: false },
        { poolSize: 1, auto_reconnect: false }
      );

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Fetch basic indexInformation for collection
            return db.indexInformation('more_index_information_test_2_with_promise');
          })
          .then(function (indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.deepEqual(
              [
                ['a', 1],
                ['b', 1]
              ],
              indexInformation.a_1_b_1
            );

            // Fetch full index information
            return collection.indexInformation({ full: true });
          })
          .then(function (indexInformation) {
            test.deepEqual({ _id: 1 }, indexInformation[0].key);
            test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);
            return client.close();
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
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformationWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function (client) {
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
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            { w: 1 }
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Fetch basic indexInformation for collection
            return collection.indexInformation();
          })
          .then(function (indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            test.deepEqual(
              [
                ['a', 1],
                ['b', 1]
              ],
              indexInformation.a_1_b_1
            );

            // Fetch full index information
            return collection.indexInformation({ full: true });
          })
          .then(function (indexInformation) {
            test.deepEqual({ _id: 1 }, indexInformation[0].key);
            test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);
            return client.close();
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
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },
    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function (client) {
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
          .then(function () {
            // Fetch the document
            return collection.findOne({ hello: 'world_no_safe' });
          })
          .then(function (item) {
            test.equal('world_no_safe', item.hello);
            return client.close();
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
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Fetch the document
            return collection.findOne({ hello: 'world_safe2' });
          })
          .then(function (item) {
            test.equal('world_safe2', item.hello);
            return client.close();
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
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      return client.connect().then(function (client) {
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
              func: function () {}
            },
            o
          )
          .then(function (result) {
            test.ok(result);

            // Fetch the document
            return collection.findOne({ hello: 'world' });
          })
          .then(function (item) {
            test.ok('function() {}', item.code);
            return client.close();
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
   */
  it('Should correctly execute insert with keepGoing option on mongod >= 1.9.1 With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>1.9.1', topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .catch(function () {})
          .then(function () {
            // Add an unique index to title to force errors in the batch insert
            return collection.ensureIndex({ title: 1 }, { unique: true });
          })
          .then(function (indexName) {
            test.ok(indexName);

            // Insert some intial data into the collection
            return collection.insertMany(
              [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
              configuration.writeConcernMax()
            );
          })
          .then(function (result) {
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
          .catch(function () {
            // Count the number of documents left (should not include the duplicates)
            return collection.count();
          })
          .then(function (count) {
            test.equal(3, count);
            return client.close();
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
   */
  it('shouldCorrectlyExecuteIsCappedWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (collection) {
            test.equal('test_collection_is_capped_with_promise', collection.collectionName);

            // Let's fetch the collection options
            return collection.isCapped();
          })
          .then(function (capped) {
            test.equal(true, capped);
            return client.close();
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
   */
  it('shouldCorrectlyRetrieveCollectionOptionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (collection) {
            test.equal('test_collection_options_with_promise', collection.collectionName);

            // Let's fetch the collection options
            return collection.options();
          })
          .then(function (options) {
            test.equal(true, options.capped);
            test.ok(options.size >= 1024);
            return client.close();
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
   */
  it('shouldRemoveAllDocumentsNoSafeWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Remove all the document
            return collection.removeMany();
          })
          .then(function () {
            // Fetch all results
            return collection.find().toArray();
          })
          .then(function (items) {
            test.equal(0, items.length);
            return client.close();
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
   */
  it('shouldRemoveSubsetOfDocumentsSafeModeWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Remove all the document
            return collection.removeOne({ a: 1 }, { w: 1 });
          })
          .then(function (r) {
            expect(r).property('deletedCount').to.equal(1);
            return client.close();
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
   */
  it('shouldCorrectlyRenameCollectionWithPromises', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function () {
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
            // this will be successful
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
   * Example of a simple document update with safe set to false on an existing document using a Promise.
   *
   * @example-class Collection
   * @example-method update
   */
  it('shouldCorrectlyUpdateASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (doc) {
            test.ok(doc);
            // Update the document with an atomic operator
            return collection.updateOne({ a: 1 }, { $set: { b: 2 } });
          })
          .then(function () {
            // Fetch the document that we modified
            return collection.findOne({ a: 1 });
          })
          .then(function (item) {
            test.equal(1, item.a);
            test.equal(2, item.b);
            return client.close();
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
   */
  it('shouldCorrectlyUpsertASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.equal(1, result.result.n);

            // Fetch the document that we modified and check if it got inserted correctly
            return collection.findOne({ a: 1 });
          })
          .then(function (item) {
            test.equal(1, item.a);
            test.equal(2, item.b);
            return client.close();
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
   */
  it('shouldCorrectlyUpdateMultipleDocumentsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 1, b: 2 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            var o = configuration.writeConcernMax();
            return collection.updateMany({ a: 1 }, { $set: { b: 0 } }, o);
          })
          .then(function (r) {
            test.equal(2, r.result.n);

            // Fetch all the documents and verify that we have changed the b value
            return collection.find().toArray();
          })
          .then(function (items) {
            test.equal(1, items[0].a);
            test.equal(0, items[0].b);
            test.equal(1, items[1].a);
            test.equal(0, items[1].b);
            return client.close();
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
   */
  it('shouldCorrectlyReturnACollectionsStatsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);
            // Retrieve the statistics for the collection
            return collection.stats();
          })
          .then(function (stats) {
            test.equal(2, stats.count);
            return client.close();
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
   */
  it('shouldCorrectlyCreateAndDropAllIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 0 }, { poolSize: 1, auto_reconnect: true });

      return client.connect().then(function (client) {
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
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4, c: 4 }
            ],
            {
              w: 1
            }
          )
          .then(function (result) {
            test.ok(result);

            // Create an index on the a field
            return collection.ensureIndex({ a: 1, b: 1 }, { unique: true, background: true, w: 1 });
          })
          .then(function (indexName) {
            test.ok(indexName);
            // Create an additional index
            return collection.ensureIndex(
              { c: 1 },
              { unique: true, background: true, sparse: true, w: 1 }
            );
          })
          .then(function (indexName) {
            test.ok(indexName);
            // Drop the index
            return collection.dropAllIndexes();
          })
          .then(function (result) {
            test.ok(result);
            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function (indexInformation) {
            test.deepEqual([['_id', 1]], indexInformation._id_);
            expect(indexInformation.a_1_b_1).to.not.exist;
            expect(indexInformation.c_1).to.not.exist;
            return client.close();
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
   * An example of a simple single server db connection and close function using a Promise.
   *
   * @example-class Db
   * @example-method close
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnectionAndCloseWithCallbackWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
   */
  it('shouldCorrectlyRetrievelistCollectionsWithPromises', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] }
    },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function () {
            // Return the information of a single collection name
            return db1
              .listCollections({ name: 'shouldCorrectlyRetrievelistCollections_with_promise' })
              .toArray();
          })
          .then(function (items) {
            test.equal(1, items.length);

            // Return the information of a all collections, using the callback format
            return db1.listCollections().toArray();
          })
          .then(function (items) {
            test.ok(items.length >= 1);
            return client.close();
          });
      });
      // END
    }
  });

  it('shouldCorrectlyRetrievelistCollectionsWiredTigerWithPromises', {
    metadata: { requires: { topology: ['wiredtiger'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
        // Get an empty db
        var db1 = client.db('listCollectionTestDb2');

        // Create a collection
        var collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');

        // Ensure the collection was created
        return collection
          .insertOne({ a: 1 })
          .then(function () {
            // Return the information of a single collection name
            return db1
              .listCollections({ name: 'shouldCorrectlyRetrievelistCollections_with_promise' })
              .toArray();
          })
          .then(function (items) {
            test.equal(1, items.length);

            // Return the information of a all collections, using the callback format
            return db1.listCollections().toArray();
          })
          .then(function (items) {
            test.equal(1, items.length);
            return client.close();
          });
      });
    }
  });

  /**
   * An example of retrieving a collection from a db using the collection function with a Promise.
   *
   * @example-class Db
   * @example-method collection
   */
  it('shouldCorrectlyAccessACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      client.connect().then(function (client) {
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
        db.collection('test_correctly_access_collections_with_promise', function (err) {
          expect(err).to.not.exist;

          // Grab a collection with a callback in safe mode, ensuring it exists (should fail as it's not created)
          db.collection(
            'test_correctly_access_collections_with_promise',
            { strict: true },
            function (err) {
              test.ok(err);

              // Create the collection
              db.createCollection('test_correctly_access_collections_with_promise').then(
                function () {
                  // Retry to get the collection, should work as it's now created
                  db.collection(
                    'test_correctly_access_collections_with_promise',
                    { strict: true },
                    function (err) {
                      expect(err).to.not.exist;
                      client.close(done);
                    }
                  );
                }
              );
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
   */
  it('shouldCorrectlyRetrieveAllCollectionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return db.collections().then(function (collections) {
          test.ok(collections.length > 0);
          return client.close();
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
   */
  it('shouldCorrectlyAddUserToDbWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);
            // Remove the user from the db
            return db.removeUser('user');
          })
          .then(function (result) {
            test.ok(result);
            return client.close();
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
   */
  it.skip('shouldCorrectlyAddAndRemoveUserWithPromises', {
    metadata: { requires: { topology: 'single', mongodb: '<=3.4.x' } },

    test: function () {
      var configuration = this.configuration;

      const client = configuration.newClient();
      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);
            return client.close();
          })
          .then(() => {
            const secondClient = configuration.newClient(
              'mongodb://user3:name@localhost:27017/integration_tests'
            );

            return secondClient.connect();
          })
          .then(function (client) {
            // Logout the db
            return client.logout().then(function () {
              return client;
            });
          })
          .then(function (client) {
            // Remove the user
            var db = client.db(configuration.db);
            return db.removeUser('user3');
          })
          .then(function (result) {
            test.equal(true, result);

            // Should error out due to user no longer existing
            const thirdClient = configuration.newClient(
              'mongodb://user3:name@localhost:27017/integration_tests',
              { serverSelectionTimeoutMS: 10 }
            );

            return thirdClient.connect();
          })
          .catch(function (err) {
            test.ok(err);
            return client.close();
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
   */
  it('shouldCorrectlyCreateACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (collection) {
            // Insert a document in the capped collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function (result) {
            test.ok(result);
            return client.close();
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
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServerWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);
            // Create a capped collection with a maximum of 1000 documents
            return db.createCollection('a_simple_create_drop_collection_with_promise', {
              capped: true,
              size: 10000,
              max: 1000,
              w: 1
            });
          })
          .then(function (collection) {
            // Insert a document in the capped collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function (result) {
            test.ok(result);
            // Drop the collection from this world
            return db.dropCollection('a_simple_create_drop_collection_with_promise');
          })
          .then(function (result) {
            test.ok(result);
            // Verify that the collection is gone
            return db
              .listCollections({ name: 'a_simple_create_drop_collection_with_promise' })
              .toArray();
          })
          .then(function (names) {
            test.equal(0, names.length);
            return client.close();
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
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return db.command({ ping: 1 }).then(function (result) {
          test.ok(result);
          return client.close();
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
   */
  it('shouldCorrectlyRenameACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (collection) {
            // Insert a document in the collection
            return collection
              .insertOne({ a: 1 }, configuration.writeConcernMax())
              .then(function () {
                return collection;
              });
          })
          .then(function (collection) {
            // Retrieve the number of documents from the collection
            return collection.count();
          })
          .then(function (count) {
            test.equal(1, count);

            // Rename the collection
            return db.renameCollection(
              'simple_rename_collection_with_promise',
              'simple_rename_collection_2_with_promise'
            );
          })
          .then(function (collection2) {
            // Retrieve the number of documents from the collection
            return collection2.count();
          })
          .then(function (count) {
            test.equal(1, count);

            // Verify that the collection is gone
            return db.listCollections({ name: 'simple_rename_collection_with_promise' }).toArray();
          })
          .then(function (names) {
            test.equal(0, names.length);

            // Verify that the new collection exists
            return db
              .listCollections({ name: 'simple_rename_collection_2_with_promise' })
              .toArray();
          })
          .then(function (names) {
            test.equal(1, names.length);
            return client.close();
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
   */
  it('shouldCreateOnDbComplexIndexOnTwoFieldsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);
            // Create an index on the a field
            return db.createIndex(
              'more_complex_index_test_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 }
            );
          })
          .then(function (indexName) {
            test.ok(indexName);
            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            test.ok(explanation != null);
            return client.close();
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
   */
  it('shouldCreateComplexEnsureIndexDbWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);
            // Create an index on the a field
            return db.ensureIndex(
              'more_complex_ensure_index_db_test_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 }
            );
          })
          .then(function (indexName) {
            test.ok(indexName);
            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            test.equal(4, items.length);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            test.ok(explanation != null);
            return client.close();
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
   */
  it('shouldCorrectlyDropTheDatabaseWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
            [
              { a: 1, b: 1 },
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            test.ok(result);

            // Let's drop the database
            return db.dropDatabase();
          })
          .then(function (result) {
            test.ok(result);

            // Get the admin database
            return db.admin().listDatabases();
          })
          .then(function (dbs) {
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

            return client.close();
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
   */
  it('shouldCorrectlyRetrieveDbStatsWithPromisesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        return db.stats().then(function (stats) {
          test.ok(stats != null);
          return client.close();
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
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);
            return multipleColl2.insertOne({ a: 1 }, { w: 1 });
          })
          .then(function (result) {
            test.ok(result);
            // Count over the results ensuring only on record in each collection
            return multipleColl1.count();
          })
          .then(function (count) {
            test.equal(1, count);

            return multipleColl2.count();
          })
          .then(function (count) {
            test.equal(1, count);
            return client.close();
          });
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
   */
  it('shouldCorrectlyRetrieveBuildInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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

        // Retrieve the build information for the MongoDB instance
        return adminDb.buildInfo().then(function (info) {
          test.ok(info);
          return client.close();
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
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommandWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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

        // Retrieve the build information using the admin command
        return adminDb.command({ buildInfo: 1 }).then(function (info) {
          test.ok(info);
          return client.close();
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
   */
  it('shouldCorrectlySetDefaultProfilingLevelWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (doc) {
            test.ok(doc);
            // Use the admin database for the operation
            var adminDb = client.db('admin');

            // Retrieve the profiling level
            return adminDb.profilingLevel();
          })
          .then(function (level) {
            test.ok(level);
            return client.close();
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
   */
  it('shouldCorrectlyChangeProfilingLevelWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (doc) {
            test.ok(doc);
            // Set the profiling level to only profile slow queries
            return adminDb.setProfilingLevel('slow_only');
          })
          .then(function (level) {
            test.ok(level);
            // Retrieve the profiling level and verify that it's set to slow_only
            return adminDb.profilingLevel();
          })
          .then(function (level) {
            test.equal('slow_only', level);

            // Turn profiling off
            return adminDb.setProfilingLevel('off');
          })
          .then(function (level) {
            test.ok(level);
            // Retrieve the profiling level and verify that it's set to off
            return adminDb.profilingLevel();
          })
          .then(function (level) {
            test.equal('off', level);

            // Set the profiling level to log all queries
            return adminDb.setProfilingLevel('all');
          })
          .then(function (level) {
            test.ok(level);
            // Retrieve the profiling level and verify that it's set to all
            return adminDb.profilingLevel();
          })
          .then(function (level) {
            test.equal('all', level);

            // Attempt to set an illegal profiling level
            return adminDb.setProfilingLevel('medium');
          })
          .catch(function (err) {
            test.ok(err instanceof Error);
            test.equal('Error: illegal profiling level value medium', err.message);
            return client.close();
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
   */
  it('shouldCorrectlySetAndExtractProfilingInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (doc) {
            test.ok(doc);
            // Use the admin database for the operation
            // Set the profiling level to all
            return db.setProfilingLevel('all');
          })
          .then(function (level) {
            test.ok(level);
            // Execute a query command
            return collection.find().toArray();
          })
          .then(function (items) {
            test.ok(items.length > 0);

            // Turn off profiling
            return db.setProfilingLevel('off');
          })
          .then(function (level) {
            test.ok(level);
            // Retrieve the profiling information
            return db.profilingInfo();
          })
          .then(function (infos) {
            test.ok(infos.constructor === Array);
            test.ok(infos.length >= 1);
            test.ok(infos[0].ts.constructor === Date);
            test.ok(infos[0].millis.constructor === Number);
            return client.close();
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
   */
  it('shouldCorrectlyCallValidateCollectionWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (doc) {
            test.ok(doc);
            // Use the admin database for the operation
            var adminDb = db.admin();

            // Validate the 'test' collection
            return adminDb.validateCollection('test_with_promise');
          })
          .then(function (doc) {
            test.ok(doc);
            return client.close();
          });
      });
    }
  });

  /**
   * An example of how to add a user to the admin database using a Promise.
   *
   * @example-class Admin
   * @example-method ping
   */
  it('shouldCorrectlyPingTheMongoDbInstanceWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
        return adminDb.ping().then(function (pingResult) {
          test.ok(pingResult);
          return client.close();
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
   */
  it('shouldCorrectlyAddAUserToAdminDbWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            return adminDb.removeUser('admin11');
          })
          .then(function (result) {
            test.ok(result);
            return client.close();
          });
      });
    }
  });

  /**
   * An example of how to remove a user from the admin database using a Promise.
   *
   * @example-class Admin
   * @example-method removeUser
   */
  it('shouldCorrectlyAddAUserAndRemoveItFromAdminDbWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.ok(result);

            // Remove the user
            return adminDb.removeUser('admin12');
          })
          .then(function (result) {
            test.equal(true, result);
            return client.close();
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
   */
  it('shouldCorrectlyListAllAvailableDatabasesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
        return adminDb.listDatabases().then(function (dbs) {
          test.ok(dbs.databases.length > 0);
          return client.close();
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
   */
  it('shouldCorrectlyRetrieveServerInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      return client.connect().then(function (client) {
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
          .then(function (doc) {
            test.ok(doc);
            // Add the new user to the admin database
            return adminDb.addUser('admin13', 'admin13');
          })
          .then(function (result) {
            test.ok(result);
            // Retrieve the server Info
            return adminDb.serverStatus();
          })
          .then(function (info) {
            test.ok(info != null);

            return adminDb.removeUser('admin13');
          })
          .then(function (result) {
            test.ok(result);
            return client.close();
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
   */
  it('shouldCorrectlyExecuteToArrayWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (ids) {
            test.ok(ids);
            // Retrieve all the documents in the collection
            return collection.find().toArray();
          })
          .then(function (documents) {
            test.equal(1, documents.length);
            test.deepEqual([1, 2, 3], documents[0].b);
            return client.close();
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
   */
  it('shouldCorrectlyUseCursorCountFunctionWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (docs) {
            test.ok(docs);
            // Do a find and get the cursor count
            return collection.find().count();
          })
          .then(function (count) {
            test.equal(2, count);
            return client.close();
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
   */
  it('shouldCorrectlyPerformNextOnCursorWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (docs) {
            test.ok(docs);
            // Do normal ascending sort
            return collection.find().next();
          })
          .then(function (item) {
            test.equal(1, item.a);
            return client.close();
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
   */
  it('shouldCorrectlyPerformSimpleExplainCursorWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (docs) {
            test.ok(docs);
            // Do normal ascending sort
            return collection.find().explain();
          })
          .then(function (explanation) {
            test.ok(explanation);
            return client.close();
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
   */
  it('shouldStreamDocumentsUsingTheCloseFunctionWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (ids) {
            test.ok(ids);
            // Fetch the first object
            return cursor.next();
          })
          .then(function (object) {
            test.ok(object);
            // Close the cursor, this is the same as reseting the query
            return cursor.close();
          })
          .then(function () {
            return client.close();
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
   */
  it('Should correctly connect to a replicaset With Promises', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function () {
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
      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.equal(1, result.result.n);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string to a shard, with acknowledgement of writes using a Promise.
   *
   * @example-class MongoClient
   */
  it('Should connect to mongos proxies using connectiong string With Promises', {
    metadata: { requires: { topology: 'sharded' } },

    test: function () {
      var configuration = this.configuration;
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url);
      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.equal(1, result.upsertedCount);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string for a single server connection
   *
   * @example-class MongoClient
   */
  it('Should correctly connect using MongoClient to a single server using connect With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function () {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27017/integration_tests', {
        native_parser: true
      });

      // DOC_START
      // Connect using the connection string
      return client.connect().then(function (client) {
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
          .then(function (result) {
            test.equal(1, result.result.n);
            return client.close();
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
   */
  it('Should correctly execute ordered batch with no errors using write commands With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return batch.execute().then(function (result) {
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
          return client.close();
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
   */
  it('Should correctly execute unordered batch with no errors With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return batch.execute().then(function (result) {
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
          return client.close();
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
   */
  it('Should correctly execute insertOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return col.insertOne({ a: 1 }).then(function (r) {
          test.equal(1, r.insertedCount);
          // Finish up test
          return client.close();
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
   */
  it('Should correctly execute insertMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return col.insertMany([{ a: 1 }, { a: 2 }]).then(function (r) {
          test.equal(2, r.insertedCount);
          // Finish up test
          return client.close();
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
   */
  it('Should correctly execute updateOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return col.updateOne({ a: 1 }, { $set: { a: 2 } }, { upsert: true }).then(function (r) {
          test.equal(0, r.matchedCount);
          test.equal(1, r.upsertedCount);
          // Finish up test
          return client.close();
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
   */
  it('Should correctly execute updateMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (r) {
            test.equal(2, r.insertedCount);

            // Update all documents
            return col.updateMany({ a: 1 }, { $set: { b: 1 } });
          })
          .then(function (r) {
            if (r.n) {
              test.equal(2, r.n);
            } else {
              test.equal(2, r.matchedCount);
              test.equal(2, r.modifiedCount);
            }

            // Finish up test
            return client.close();
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
   */
  it('Should correctly execute removeOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (r) {
            test.equal(2, r.insertedCount);

            return col.removeOne({ a: 1 });
          })
          .then(function (r) {
            test.equal(1, r.deletedCount);
            // Finish up test
            return client.close();
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
   */
  it('Should correctly execute removeMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (r) {
            test.equal(2, r.insertedCount);

            // Update all documents
            return col.removeMany({ a: 1 });
          })
          .then(function (r) {
            test.equal(2, r.deletedCount);

            // Finish up test
            return client.close();
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
   */
  it('Should correctly execute bulkWrite operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (r) {
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
            return client.close();
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

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('bulk_write_with_promise_write_error');
        return col
          .bulkWrite(
            [{ insertOne: { document: { _id: 1 } } }, { insertOne: { document: { _id: 1 } } }],
            { ordered: true, w: 1 }
          )
          .catch(function (err) {
            test.equal(true, err.result.hasWriteErrors());
            // Ordered bulk operation
            return client.close();
          });
      });
    }
  });

  /**
   * Example of a simple findOneAndDelete operation using a Promise.
   *
   * @example-class Collection
   * @example-method findOneAndDelete
   */
  it('Should correctly execute findOneAndDelete operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (r) {
            test.equal(1, r.result.n);

            return col.findOneAndDelete({ a: 1 }, { projection: { b: 1 }, sort: { a: 1 } });
          })
          .then(function (r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            return client.close();
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
   */
  it('Should correctly execute findOneAndReplace operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
        return col.insertMany([{ a: 1, b: 1 }], { w: 1 }).then(function (r) {
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
            .then(function (r) {
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.c);

              return client.close();
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
   */
  it('Should correctly execute findOneAndUpdate operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      return client.connect().then(function (client) {
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
          .then(function (r) {
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
          .then(function (r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);
            test.equal(1, r.value.d);

            return client.close();
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
   */
  it('Should correctly add capped collection options to cursor With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        auto_reconnect: false
      });

      client.connect().then(function (client) {
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

        db.createCollection('a_simple_collection_2_with_promise', {
          capped: true,
          size: 100000,
          max: 10000,
          w: 1
        })
          .then(function (_collection) {
            collection = _collection;

            var docs = [];
            for (var i = 0; i < 1000; i++) docs.push({ a: i });

            // Insert a document in the capped collection
            return collection.insertMany(docs, configuration.writeConcernMax());
          })
          .then(function (result) {
            test.ok(result);

            var total = 0;

            // Get the cursor
            var cursor = collection
              .find({ a: { $gte: 0 } })
              .addCursorFlag('tailable', true)
              .addCursorFlag('awaitData', true);

            cursor.on('data', function (d) {
              test.ok(d);
              total = total + 1;

              if (total === 1000) {
                cursor.kill();
              }
            });

            cursor.on('end', function () {
              // TODO: forced because the cursor is still open/active
              client.close(true, done);
            });
          });
      });
      // END
    }
  });

  describe('Transaction Examples', function () {
    before(function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax());

      return client
        .connect()
        .then(() => client.db('hr').createCollection('employees'))
        .then(() => client.db('reporting').createCollection('events'))
        .then(() => client.close());
    });

    // Start Transactions Intro Example 1
    it('should be able to run transactions example 1', {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
      test: function () {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax());

        // BEGIN
        function updateEmployeeInfo(client) {
          return client.withSession(session => {
            function commit() {
              return session.commitTransaction().catch(e => {
                if (e.hasErrorLabel('UnknownTransactionCommitResult')) {
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

        return client
          .connect()
          .then(() => updateEmployeeInfo(client))
          .then(() => client.close());
      }
    });
    // End Transactions Intro Example 1

    // Start Transactions Retry Example 1
    it('should be able to run transactions retry example 1', {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
      test: function () {
        // BEGIN
        function runTransactionWithRetry(txnFunc, client, session) {
          return txnFunc(client, session).catch(error => {
            // LINE console.log('Transaction aborted. Caught exception during transaction.');

            // If transient error, retry the whole transaction
            if (error.hasErrorLabel('TransientTransactionError')) {
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
      test: function () {
        // BEGIN
        function commitWithRetry(session) {
          return (
            session
              .commitTransaction()
              // LINE .then(() => console.log('Transaction committed.'))
              .catch(error => {
                if (error.hasErrorLabel('UnknownTransactionCommitResult')) {
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
      test: function () {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax());

        // BEGIN
        function commitWithRetry(session) {
          return (
            session
              .commitTransaction()
              // LINE .then(() => console.log('Transaction committed.'))
              .catch(error => {
                if (error.hasErrorLabel('UnknownTransactionCommitResult')) {
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
            if (error.hasErrorLabel('TransientTransactionError')) {
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
