import { expect } from 'chai';
import * as process from 'process';

import {
  Code,
  enumToString,
  type MongoClient,
  ProfilingLevel,
  ReturnDocument
} from '../../mongodb';
import { sleep as delay } from '../../tools/utils';
import { setupDatabase } from '../shared';

describe('Operations', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

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
   * example-class Collection
   * example-method aggregate
   */
  it('aggregationExample2WithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.1.0', topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Some docs for insertion
        const docs = [
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
        const collection = db.collection('aggregationExample2_with_promise');

        // Insert the docs
        return collection
          .insertMany(docs, { writeConcern: { w: 1 } })
          .then(function (result) {
            expect(result).to.exist;

            // Execute aggregate, notice the pipeline is expressed as an Array
            const cursor = collection.aggregate(
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
            expect(docs.length).to.equal(2);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Call next on an aggregation cursor using a Promise
   *
   * example-class AggregationCursor
   * example-method next
   */
  it('Aggregation Cursor next Test With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.1.0', topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Some docs for insertion
        const docs = [
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
        const collection = db.collection('aggregation_next_example_with_promise');

        let cursor;
        // Insert the docs
        return collection
          .insertMany(docs, { writeConcern: { w: 1 } })
          .then(function (result) {
            expect(result).to.exist;

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
            expect(docs).to.exist;

            // Need to close cursor to close implicit session,
            // since cursor is not exhausted
            return cursor.close();
          })
          .then(() => client.close());
      });
      // END
    }
  });

  /**
   * Example of running simple count commands against a collection using a Promise.
   *
   * example-class Collection
   * example-method count
   */
  it('shouldCorrectlyDoSimpleCountExamplesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 0 }, { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Crete the collection for the distinct example
        const collection = db.collection('countExample1_with_promise');

        // Insert documents to perform distinct against
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4, b: 1 }], { writeConcern: { w: 1 } })
          .then(function (ids) {
            expect(ids).to.exist;

            // Perform a total count command
            return collection.count();
          })
          .then(function (count) {
            expect(count).to.equal(4);

            // Perform a partial account where b=1
            return collection.count({ b: 1 });
          })
          .then(function (count) {
            expect(count).to.equal(1);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a Promise and a compound unique index in the background and dropping duplicated documents
   *
   * example-class Collection
   * example-method createIndex
   */
  it('shouldCreateComplexIndexOnTwoFieldsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a collection we want to drop later
        const collection = db.collection('createIndexExample1_with_promise');

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
            expect(result).to.exist;

            // Create an index on the a field
            return collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            expect(items.length).to.equal(4);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            expect(explanation != null).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of running the distinct command using a Promise against a collection
   *
   * example-class Collection
   * example-method distinct
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilterWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Crete the collection for the distinct example
        const collection = db.collection('distinctExample1_with_promise');

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
            expect(ids).to.exist;

            // Perform a distinct query against the a field
            return collection.distinct('a');
          })
          .then(function (docs) {
            expect(docs.sort()).to.deep.equal([0, 1, 2, 3]);

            // Perform a distinct query against the sub-field b.c
            return collection.distinct('b.c');
          })
          .then(function (docs) {
            expect(docs.sort()).to.deep.equal(['a', 'b', 'c']);
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
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Crete the collection for the distinct example
        const collection = db.collection('distinctExample2_with_promise');

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
            expect(ids).to.exist;

            // Perform a distinct query with a filter against the documents
            return collection.distinct('a', { c: 1 });
          })
          .then(function (docs) {
            expect(docs.sort()).to.deep.equal([5]);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of Collection.prototype.drop using a Promise
   *
   * example-class Collection
   * example-method drop
   */
  it('shouldCorrectlyDropCollectionWithDropFunctionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(reply).to.exist;

            // Ensure we don't have the collection in the set of names
            return db.listCollections().toArray();
          })
          .then(function (replies) {
            let found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function (document) {
              if (document.name === 'test_other_drop_with_promise') {
                found = true;
                return;
              }
            });

            // Ensure the collection is not found
            expect(found).to.equal(false);

            // Let's close the db
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a how to drop all the indexes on a collection using dropIndexes with a Promise
   *
   * example-class Collection
   * example-method dropIndexes
   */
  it('dropIndexesExample1WithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(r).to.exist;

            // Drop the collection
            return db.collection('dropExample1_with_promise').dropIndexes();
          })
          .then(function (reply) {
            expect(reply).to.exist;

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
   * example-class Collection
   * example-method dropIndex
   */
  it('shouldCorrectlyCreateAndDropIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        const collection = db.collection('dropIndexExample1_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            { writeConcern: { w: 1 } }
          )
          .then(function (result) {
            expect(result).to.exist;

            // Create an index on the a field
            return collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Drop the index
            return collection.dropIndex('a_1_b_1');
          })
          .then(function (result) {
            expect(result).to.exist;
            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function (indexInformation) {
            expect(indexInformation._id_).to.deep.equal([['_id', 1]]);
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
   * example-class Collection
   * example-method ensureIndex
   */
  it('shouldCreateComplexEnsureIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        const collection = db.collection('ensureIndexExample1_with_promise');

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
            expect(result).to.exist;

            // Create an index on the a field
            return db.createIndex(
              'ensureIndexExample1_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            expect(items.length).to.equal(4);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            expect(explanation != null).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background using a Promise.
   *
   * example-class Collection
   * example-method ensureIndex
   */
  it('ensureIndexExampleWithCompountIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        const collection = db.collection('ensureIndexExample2_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            { writeConcern: { w: 1 } }
          )
          .then(function (result) {
            expect(result).to.exist;

            // Create an index on the a field
            return collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            expect(items.length).to.equal(4);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            expect(explanation != null).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query using the find method and toArray method with a Promise.
   *
   * example-class Collection
   * example-method find
   */
  it('shouldPerformASimpleQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('simple_query_with_promise');

        // Insert a bunch of documents for the testing
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function (result) {
            expect(result).to.exist;

            // Perform a simple find and return all the documents
            return collection.find().toArray();
          })
          .then(function (docs) {
            expect(docs.length).to.equal(3);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query showing the explain for a query using a Promise.
   *
   * example-class Collection
   * example-method find
   */
  it('shouldPerformASimpleExplainQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('simple_explain_query_with_promise');

        // Insert a bunch of documents for the testing
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function (result) {
            expect(result).to.exist;

            // Perform a simple find and return all the documents
            return collection.find({}).explain();
          })
          .then(function (docs) {
            expect(docs != null).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple query showing skip and limit using a Promise.
   *
   * example-class Collection
   * example-method find
   */
  it('shouldPerformASimpleLimitSkipQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('simple_limit_skip_query_with_promise');

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
            expect(result).to.exist;

            // Perform a simple find and return all the documents
            return collection.find({}).skip(1).limit(1).project({ b: 1 }).toArray();
          })
          .then(function (docs) {
            expect(docs.length).to.equal(1);
            expect(docs[0].a).to.not.exist;
            expect(docs[0].b).to.equal(2);
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
   * example-class Collection
   * example-method findAndModify
   */
  it('shouldPerformSimpleFindAndModifyOperationsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a collection we want to drop later
        const collection = db.collection('simple_find_and_modify_operations_with_promise');

        // Insert some test documentations
        return collection
          .insertMany([{ a: 1 }, { b: 1 }, { c: 1 }], configuration.writeConcernMax())
          .then(function (result) {
            expect(result).to.exist;

            // Simple findAndModify command returning the new document
            return collection.findOneAndUpdate(
              { a: 1 },
              { $set: { b1: 1 } },
              { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true }
            );
          })
          .then(function (doc) {
            expect(doc.value.a).to.equal(1);
            expect(doc.value.b1).to.equal(1);

            // Simple findAndModify command returning the new document and
            // removing it at the same time
            return collection.findOneAndUpdate(
              { b: 1 },
              { $set: { b: 2 } },
              { remove: true, includeResultMetadata: true }
            );
          })
          .then(function (doc) {
            expect(doc).to.exist;

            // Verify that the document is gone
            return collection.findOne({ b: 1 });
          })
          .then(function (item) {
            expect(item).to.not.exist;

            // Simple findAndModify command performing an upsert and returning the new document
            // executing the command safely
            return collection.findOneAndUpdate(
              { d: 1 },
              { $set: { d: 1, f: 1 } },
              {
                returnDocument: ReturnDocument.AFTER,
                upsert: true,
                writeConcern: { w: 1 },
                includeResultMetadata: true
              }
            );
          })
          .then(function (doc) {
            expect(doc.value.d).to.equal(1);
            expect(doc.value.f).to.equal(1);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An example of using findOneAndDelete using a Promise.
   *
   * example-class Collection
   * example-method findOneAndDelete
   */
  it('shouldPerformSimplefindOneAndDeleteWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('simple_find_and_modify_operations_2_with_promise');

        // Insert some test documentations
        return collection
          .insertMany([{ a: 1 }, { b: 1, d: 1 }, { c: 1 }], configuration.writeConcernMax())
          .then(function (result) {
            expect(result).to.exist;

            // Simple findAndModify command returning the old document and
            // removing it at the same time
            return collection.findOneAndDelete(
              { b: 1 },
              {
                includeResultMetadata: true
              }
            );
          })
          .then(function (doc) {
            expect(doc.value.b).to.equal(1);
            expect(doc.value.d).to.equal(1);

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
   * example-class Collection
   * example-method findOne
   */
  it('shouldPerformASimpleLimitSkipFindOneQueryWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('simple_limit_skip_find_one_query_with_promise');

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
            expect(result).to.exist;

            // Perform a simple find and return all the documents
            return collection.findOne({ a: 2 }, { projection: { b: 1 } });
          })
          .then(function (doc) {
            expect(doc.a).to.not.exist;
            expect(doc.b).to.equal(2);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections indexes using a Promise.
   *
   * example-class Collection
   * example-method indexes
   */
  it('shouldCorrectlyRetrieveACollectionsIndexesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Crete the collection for the distinct example
        const collection = db.collection('simple_key_based_distinct_with_promise');

        // Create a geo 2d index
        return collection
          .createIndex({ loc: '2d' }, configuration.writeConcernMax())
          .then(function (result) {
            expect(result).to.exist;

            // Create a simple single field index
            return collection.createIndex({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function (result) {
            expect(result).to.exist;

            return delay(1000);
          })
          .then(function () {
            // List all of the indexes on the collection
            return collection.indexes();
          })
          .then(function (indexes) {
            expect(indexes.length).to.equal(3);
            return client.close();
          });
      });
    }
    // END
  });

  /**
   * An example showing the use of the indexExists function using a Promise for a single index name and a list of index names.
   *
   * example-class Collection
   * example-method indexExists
   */
  it('shouldCorrectlyExecuteIndexExistsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Create a test collection that we are getting the options back from
        const collection = db.collection(
          'test_collection_index_exists_with_promise',
          configuration.writeConcernMax()
        );

        // Create an index on the collection
        return collection
          .createIndex('a', configuration.writeConcernMax())
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Let's test to check if a single index exists
            return collection.indexExists('a_1');
          })
          .then(function (result) {
            expect(result).to.equal(true);

            // Let's test to check if multiple indexes are available
            return collection.indexExists(['a_1', '_id_']);
          })
          .then(function (result) {
            expect(result).to.equal(true);

            // Check if a non existing index exists
            return collection.indexExists('c_1');
          })
          .then(function (result) {
            expect(result).to.equal(false);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An example showing the information returned by indexInformation using a Promise.
   *
   * example-class Collection
   * example-method indexInformation
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformationWithPromises', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('more_index_information_test_2_with_promise');

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
            expect(result).to.exist;

            // Create an index on the a field
            return collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Fetch basic indexInformation for collection
            return db.indexInformation('more_index_information_test_2_with_promise');
          })
          .then(function (indexInformation) {
            expect(indexInformation._id_).to.deep.equal([['_id', 1]]);
            expect(indexInformation.a_1_b_1).to.deep.equal([
              ['a', 1],
              ['b', 1]
            ]);

            // Fetch full index information
            return collection.indexInformation({ full: true });
          })
          .then(function (indexInformation) {
            expect(indexInformation[0].key).to.deep.equal({ _id: 1 });
            expect(indexInformation[1].key).to.deep.equal({ a: 1, b: 1 });
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the information returned by indexInformation using a Promise.
   *
   * example-class Collection
   * example-method indexInformation
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformationWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('more_index_information_test_3_with_promise');

        // Insert a bunch of documents for the index
        return collection
          .insertMany(
            [
              { a: 1, b: 1 },
              { a: 2, b: 2 },
              { a: 3, b: 3 },
              { a: 4, b: 4 }
            ],
            { writeConcern: { w: 1 } }
          )
          .then(function (result) {
            expect(result).to.exist;

            // Create an index on the a field
            return collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;

            // Fetch basic indexInformation for collection
            return collection.indexInformation();
          })
          .then(function (indexInformation) {
            expect(indexInformation._id_).to.deep.equal([['_id', 1]]);
            expect(indexInformation.a_1_b_1).to.deep.equal([
              ['a', 1],
              ['b', 1]
            ]);

            // Fetch full index information
            return collection.indexInformation({ full: true });
          })
          .then(function (indexInformation) {
            expect(indexInformation[0].key).to.deep.equal({ _id: 1 });
            expect(indexInformation[1].key).to.deep.equal({ a: 1, b: 1 });
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple document insert using a Promise example, not using safe mode to ensure document persistance on MongoDB
   *
   * example-class Collection
   * example-method insert
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        const collection = db.collection('simple_document_insert_collection_no_safe_with_promise');

        // Insert a single document
        return collection
          .insertOne({ hello: 'world_no_safe' })
          .then(function () {
            // Fetch the document
            return collection.findOne({ hello: 'world_no_safe' });
          })
          .then(function (item) {
            expect(item.hello).to.equal('world_no_safe');
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A batch document insert using a Promise example, using safe mode to ensure document persistance on MongoDB
   *
   * example-class Collection
   * example-method insert
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Fetch a collection to insert document into
        const collection = db.collection('batch_document_insert_collection_safe_with_promise');

        // Insert a single document
        return collection
          .insertMany(
            [{ hello: 'world_safe1' }, { hello: 'world_safe2' }],
            configuration.writeConcernMax()
          )
          .then(function (result) {
            expect(result).to.exist;

            // Fetch the document
            return collection.findOne({ hello: 'world_safe2' });
          })
          .then(function (item) {
            expect(item.hello).to.equal('world_safe2');
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of inserting a document containing functions using a Promise.
   *
   * example-class Collection
   * example-method insert
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafeWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Fetch a collection to insert document into
        const collection = db.collection('simple_document_insert_with_function_safe_with_promise');

        const o = configuration.writeConcernMax();
        o.serializeFunctions = true;

        // Insert a single document
        return collection
          .insertOne(
            {
              hello: 'world',
              func: new Code('function () {}')
            },
            o
          )
          .then(function (result) {
            expect(result).to.exist;

            // Fetch the document
            return collection.findOne({ hello: 'world' });
          })
          .then(function (item) {
            expect('function() {}', item.code).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An example showing how to establish if it's a capped collection using a Promise.
   *
   * example-class Collection
   * example-method isCapped
   */
  it('shouldCorrectlyExecuteIsCappedWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(collection.collectionName).to.equal('test_collection_is_capped_with_promise');

            // Let's fetch the collection options
            return collection.isCapped();
          })
          .then(function (capped) {
            expect(capped).to.equal(true);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An example returning the options for a collection using a Promise.
   *
   * example-class Collection
   * example-method options
   */
  it('shouldCorrectlyRetrieveCollectionOptionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(collection.collectionName).to.equal('test_collection_options_with_promise');

            // Let's fetch the collection options
            return collection.options();
          })
          .then(function (options) {
            expect(options.capped).to.equal(true);
            expect(options.size >= 1024).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An example removing all documents in a collection not using safe mode using a Promise.
   *
   * example-class Collection
   * example-method remove
   */
  it('deleteMany() deletes all documents in collection', async function () {
    const db = client.db();
    // Fetch a collection to insert document into
    const collection = db.collection('remove_all_documents_no_safe_with_promise');

    // Insert a bunch of documents
    const result = await collection.insertMany([{ a: 1 }, { b: 2 }], { writeConcern: { w: 1 } });
    expect(result).to.exist;
    await collection.deleteMany();
    const items = await collection.find().toArray();
    expect(items).to.have.lengthOf(0);
  });

  /**
   * An example removing a subset of documents using safe mode to ensure removal of documents using a Promise.
   *
   * example-class Collection
   * example-method remove
   */
  it('shouldRemoveSubsetOfDocumentsSafeModeWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 0 }, { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Fetch a collection to insert document into
        const collection = db.collection('remove_subset_of_documents_safe_with_promise');

        // Insert a bunch of documents
        return collection
          .insertMany([{ a: 1 }, { b: 2 }], { writeConcern: { w: 1 } })
          .then(function (result) {
            expect(result).to.exist;

            // Remove all the document
            return collection.deleteOne({ a: 1 }, { writeConcern: { w: 1 } });
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
   * Example of a simple document update with safe set to false on an existing document using a Promise.
   *
   * example-class Collection
   * example-method update
   */
  it('shouldCorrectlyUpdateASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 0 }, { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Get a collection
        const collection = db.collection('update_a_simple_document_with_promise');

        // Insert a document, then update it
        return collection
          .insertOne({ a: 1 }, configuration.writeConcernMax())
          .then(function (doc) {
            expect(doc).to.exist;
            // Update the document with an atomic operator
            return collection.updateOne({ a: 1 }, { $set: { b: 2 } });
          })
          .then(function () {
            // Fetch the document that we modified
            return collection.findOne({ a: 1 });
          })
          .then(function (item) {
            expect(item.a).to.equal(1);
            expect(item.b).to.equal(2);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple document update using upsert (the document will be inserted if it does not exist) using a Promise.
   *
   * example-class Collection
   * example-method update
   */
  it('shouldCorrectlyUpsertASimpleDocumentWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Get a collection
        const collection = db.collection('update_a_simple_document_upsert_with_promise');

        // Update the document using an upsert operation, ensuring creation if it does not exist
        return collection
          .updateOne({ a: 1 }, { $set: { b: 2, a: 1 } }, { upsert: true, writeConcern: { w: 1 } })
          .then(function (result) {
            expect(result).property('upsertedCount').to.equal(1);

            // Fetch the document that we modified and check if it got inserted correctly
            return collection.findOne({ a: 1 });
          })
          .then(function (item) {
            expect(item.a).to.equal(1);
            expect(item.b).to.equal(2);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of an update across multiple documents using the multi option and using a Promise.
   *
   * example-class Collection
   * example-method update
   */
  it('shouldCorrectlyUpdateMultipleDocumentsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Get a collection
        const collection = db.collection('update_a_simple_document_multi_with_promise');

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
            expect(result).to.exist;

            const o = configuration.writeConcernMax();
            return collection.updateMany({ a: 1 }, { $set: { b: 0 } }, o);
          })
          .then(function (r) {
            expect(r).property('matchedCount').to.equal(2);

            // Fetch all the documents and verify that we have changed the b value
            return collection.find().toArray();
          })
          .then(function (items) {
            expect(items[0].a).to.equal(1);
            expect(items[0].b).to.equal(0);
            expect(items[1].a).to.equal(1);
            expect(items[1].b).to.equal(0);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index using Promises.
   *
   * example-class Collection
   * example-method dropIndexes
   */
  it('shouldCorrectlyCreateAndDropAllIndexWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('shouldCorrectlyCreateAndDropAllIndex_with_promise');
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
              writeConcern: { w: 1 }
            }
          )
          .then(function (result) {
            expect(result).to.exist;

            // Create an index on the a field
            return collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;
            // Create an additional index
            return collection.createIndex(
              { c: 1 },
              { unique: true, background: true, sparse: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;
            // Drop the index
            return collection.dropIndexes();
          })
          .then(function (result) {
            expect(result).to.exist;
            // Verify that the index is gone
            return collection.indexInformation();
          })
          .then(function (indexInformation) {
            expect(indexInformation._id_).to.deep.equal([['_id', 1]]);
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
   * example-class Db
   * example-method close
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnectionAndCloseWithCallbackWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
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
   * example-class Db
   * example-method listCollections
   */
  it('shouldCorrectlyRetrievelistCollectionsWithPromises', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] }
    },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
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
        const db1 = client.db('listCollectionTestDb2');

        // Create a collection
        const collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');

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
            expect(items.length).to.equal(1);

            // Return the information of a all collections, using the callback format
            return db1.listCollections().toArray();
          })
          .then(function (items) {
            expect(items.length >= 1).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  it('shouldCorrectlyRetrievelistCollectionsWiredTigerWithPromises', {
    metadata: { requires: { topology: ['wiredtiger'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        // Get an empty db
        const db1 = client.db('listCollectionTestDb2');

        // Create a collection
        const collection = db1.collection('shouldCorrectlyRetrievelistCollections_with_promise');

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
            expect(items.length).to.equal(1);

            // Return the information of a all collections, using the callback format
            return db1.listCollections().toArray();
          })
          .then(function (items) {
            expect(items.length).to.equal(1);
            return client.close();
          });
      });
    }
  });

  /**
   * An example of retrieving all collections for a db as Collection objects using a Promise.
   *
   * example-class Db
   * example-method collections
   */
  it('shouldCorrectlyRetrieveAllCollectionsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
          expect(collections.length > 0).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the creation of a collection using a Promise.
   *
   * example-class Db
   * example-method createCollection
   */
  it('shouldCorrectlyCreateACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            writeConcern: { w: 1 }
          })
          .then(function (collection) {
            // Insert a document in the capped collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function (result) {
            expect(result).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone using a Promise.
   *
   * example-class Db
   * example-method dropCollection
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServerWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(result).to.exist;
            // Create a capped collection with a maximum of 1000 documents
            return db.createCollection('a_simple_create_drop_collection_with_promise', {
              capped: true,
              size: 10000,
              max: 1000,
              writeConcern: { w: 1 }
            });
          })
          .then(function (collection) {
            // Insert a document in the capped collection
            return collection.insertOne({ a: 1 }, configuration.writeConcernMax());
          })
          .then(function (result) {
            expect(result).to.exist;
            // Drop the collection from this world
            return db.dropCollection('a_simple_create_drop_collection_with_promise');
          })
          .then(function (result) {
            expect(result).to.exist;
            // Verify that the collection is gone
            return db
              .listCollections({ name: 'a_simple_create_drop_collection_with_promise' })
              .toArray();
          })
          .then(function (names) {
            expect(names.length).to.equal(0);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example executing a command against the server using a Promise.
   *
   * example-class Db
   * example-method command
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGoneWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
          expect(result).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone.
   *
   * example-class Db
   * example-method renameCollection
   */
  it('shouldCorrectlyRenameACollectionWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(count).to.equal(1);

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
            expect(count).to.equal(1);

            // Verify that the collection is gone
            return db.listCollections({ name: 'simple_rename_collection_with_promise' }).toArray();
          })
          .then(function (names) {
            expect(names.length).to.equal(0);

            // Verify that the new collection exists
            return db
              .listCollections({ name: 'simple_rename_collection_2_with_promise' })
              .toArray();
          })
          .then(function (names) {
            expect(names.length).to.equal(1);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
   *
   * example-class Db
   * example-method createIndex
   */
  it('shouldCreateOnDbComplexIndexOnTwoFieldsWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('more_complex_index_test_with_promise');

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
            expect(result).to.exist;
            // Create an index on the a field
            return db.createIndex(
              'more_complex_index_test_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;
            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            expect(items.length).to.equal(4);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            expect(explanation != null).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents using a Promise.
   *
   * example-class Db
   * example-method ensureIndex
   */
  it('shouldCreateComplexEnsureIndexDbWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection we want to drop later
        const collection = db.collection('more_complex_ensure_index_db_test_with_promise');

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
            expect(result).to.exist;
            // Create an index on the a field
            return db.createIndex(
              'more_complex_ensure_index_db_test_with_promise',
              { a: 1, b: 1 },
              { unique: true, background: true, writeConcern: { w: 1 } }
            );
          })
          .then(function (indexName) {
            expect(indexName).to.exist;
            // Show that duplicate records got dropped
            return collection.find({}).toArray();
          })
          .then(function (items) {
            expect(items.length).to.equal(4);

            // Perform a query, with explain to show we hit the query
            return collection.find({ a: 2 }).explain();
          })
          .then(function (explanation) {
            expect(explanation != null).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An examples showing the dropping of a database using a Promise.
   *
   * example-class Db
   * example-method dropDatabase
   */
  it('shouldCorrectlyDropTheDatabaseWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN

        // Create a collection
        const collection = db.collection('more_index_information_test_1_with_promise');

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
            expect(result).to.exist;

            // Let's drop the database
            return db.dropDatabase();
          })
          .then(function (result) {
            expect(result).to.exist;

            // Get the admin database
            return db.admin().listDatabases();
          })
          .then(function (dbs) {
            // Grab the databases
            dbs = dbs.databases;
            // Did we find the db
            let found = false;

            // Check if we have the db in the list
            for (let i = 0; i < dbs.length; i++) {
              if (dbs[i].name === 'integration_tests_to_drop') found = true;
            }

            // We should not find the databases
            if (process.env['JENKINS'] == null) expect(found).to.equal(false);

            return client.close();
          });
      });
      // END
    }
  });

  /**
   * An example showing how to retrieve the db statistics using a Promise.
   *
   * example-class Db
   * example-method stats
   */
  it('shouldCorrectlyRetrieveDbStatsWithPromisesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        return db.stats().then(function (stats) {
          expect(stats != null).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * Simple example connecting to two different databases sharing the socket connections below using a Promise.
   *
   * example-class Db
   * example-method db
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstancesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const secondDb = client.db('integration_tests_2');

        // Fetch the collections
        const multipleColl1 = db.collection('multiple_db_instances_with_promise');
        const multipleColl2 = secondDb.collection('multiple_db_instances_with_promise');

        // Write a record into each and then count the records stored
        return multipleColl1
          .insertOne({ a: 1 }, { writeConcern: { w: 1 } })
          .then(function (result) {
            expect(result).to.exist;
            return multipleColl2.insertOne({ a: 1 }, { writeConcern: { w: 1 } });
          })
          .then(function (result) {
            expect(result).to.exist;
            // Count over the results ensuring only on record in each collection
            return multipleColl1.count();
          })
          .then(function (count) {
            expect(count).to.equal(1);

            return multipleColl2.count();
          })
          .then(function (count) {
            expect(count).to.equal(1);
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
   * example-class Admin
   * example-method buildInfo
   */
  it('shouldCorrectlyRetrieveBuildInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const adminDb = db.admin();

        // Retrieve the build information for the MongoDB instance
        return adminDb.buildInfo().then(function (info) {
          expect(info).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * Retrieve the buildInfo using the command function using a Promise.
   *
   * example-class Admin
   * example-method command
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommandWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const adminDb = db.admin();

        // Retrieve the build information using the admin command
        return adminDb.command({ buildInfo: 1 }).then(function (info) {
          expect(info).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current profiling level set for the MongoDB instance using a Promise.
   *
   * example-class Db
   * example-method profilingLevel
   */
  it('shouldCorrectlySetDefaultProfilingLevelWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('test_with_promise');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { writeConcern: { w: 1 } })
          .then(function (doc) {
            expect(doc).to.exist;
            // Use the admin database for the operation
            const adminDb = client.db('admin');

            // Retrieve the profiling level
            return adminDb.profilingLevel();
          })
          .then(function (level) {
            expect(level).to.exist;
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
   * example-class Db
   * example-method setProfilingLevel
   */
  it(
    'setProfilingLevel changes profiling level',
    { requires: { topology: 'single' } },
    async function () {
      const configuration = this.configuration;

      const db = client.db(configuration.db);
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
      const collection = db.collection('test_with_promise');
      const adminDb = client.db('admin');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      await collection
        .insertOne({ a: 1 }, { writeConcern: { w: 1 } })
        .then(function (doc) {
          expect(doc).to.exist;
          // Set the profiling level to only profile slow queries
          return adminDb.setProfilingLevel('slow_only');
        })
        .then(function (level) {
          expect(level).to.exist;
          // Retrieve the profiling level and verify that it's set to slow_only
          return adminDb.profilingLevel();
        })
        .then(function (level) {
          expect(level).to.equal('slow_only');

          // Turn profiling off
          return adminDb.setProfilingLevel('off');
        })
        .then(function (level) {
          expect(level).to.exist;
          // Retrieve the profiling level and verify that it's set to off
          return adminDb.profilingLevel();
        })
        .then(function (level) {
          expect(level).to.equal('off');

          // Set the profiling level to log all queries
          return adminDb.setProfilingLevel('all');
        })
        .then(function (level) {
          expect(level).to.exist;
          // Retrieve the profiling level and verify that it's set to all
          return adminDb.profilingLevel();
        })
        .then(function (level) {
          expect(level).to.equal('all');

          // Attempt to set an illegal profiling level
          return adminDb.setProfilingLevel('medium');
        })
        .catch(function (err) {
          expect(err).to.be.instanceOf(Error);
          expect(`Profiling level must be one of "${enumToString(ProfilingLevel)}"`).to.equal(
            err.message
          );
        });
      // END
    }
  );

  /**
   * An example of how to use the validateCollection command using a Promise.
   * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
   *
   * example-class Admin
   * example-method validateCollection
   */
  it('shouldCorrectlyCallValidateCollectionWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('test_with_promise');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { writeConcern: { w: 1 } })
          .then(function (doc) {
            expect(doc).to.exist;
            // Use the admin database for the operation
            const adminDb = db.admin();

            // Validate the 'test' collection
            return adminDb.validateCollection('test_with_promise');
          })
          .then(function (doc) {
            expect(doc).to.exist;
            return client.close();
          });
      });
    }
  });

  /**
   * An example of how to add a user to the admin database using a Promise.
   *
   * example-class Admin
   * example-method ping
   */
  it('shouldCorrectlyPingTheMongoDbInstanceWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const adminDb = db.admin();

        // Ping the server
        return adminDb.ping().then(function (pingResult) {
          expect(pingResult).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * An example of listing all available databases. using a Promise.
   *
   * example-class Admin
   * example-method listDatabases
   */
  it('shouldCorrectlyListAllAvailableDatabasesWithPromises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const adminDb = db.admin();

        // List all the available databases
        return adminDb.listDatabases().then(function (dbs) {
          expect(dbs.databases.length > 0).to.exist;
          return client.close();
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current server Info using a Promise.
   *
   * example-class Admin
   * example-method serverStatus
   */
  it('shouldCorrectlyRetrieveServerInfoWithPromises', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('test_with_promise');

        // Use the admin database for the operation
        const adminDb = db.admin();

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        return collection
          .insertOne({ a: 1 }, { writeConcern: { w: 1 } })
          .then(function (result) {
            expect(result).to.exist;
            // Retrieve the server Info
            return adminDb.serverStatus();
          })
          .then(function (result) {
            expect(result).to.exist;
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
   * example-class Cursor
   * example-method toArray
   */
  it('shouldCorrectlyExecuteToArrayWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('test_array_with_promise');

        // Insert a test document
        return collection
          .insertOne({ b: [1, 2, 3] }, configuration.writeConcernMax())
          .then(function (ids) {
            expect(ids).to.exist;
            // Retrieve all the documents in the collection
            return collection.find().toArray();
          })
          .then(function (documents) {
            expect(documents.length).to.equal(1);
            expect(documents[0].b).to.deep.equal([1, 2, 3]);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the count function of the cursor using a Promise.
   *
   * example-class Cursor
   * example-method count
   */
  it('shouldCorrectlyUseCursorCountFunctionWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('cursor_count_collection_with_promise');

        // Insert some docs
        return collection
          .insertMany([{ a: 1 }, { a: 2 }], configuration.writeConcernMax())
          .then(function (docs) {
            expect(docs).to.exist;
            // Do a find and get the cursor count
            return collection.find().count();
          })
          .then(function (count) {
            expect(count).to.equal(2);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of next using a Promise.
   *
   * example-class Cursor
   * example-method next
   */
  it('shouldCorrectlyPerformNextOnCursorWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('simple_next_object_collection_with_promise');

        // Insert some documents we can sort on
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function (docs) {
            expect(docs).to.exist;
            // Do normal ascending sort
            return collection.find().next();
          })
          .then(function (item) {
            expect(item.a).to.equal(1);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor explain function using a Promise.
   *
   * example-class Cursor
   * example-method explain
   */
  it('shouldCorrectlyPerformSimpleExplainCursorWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const collection = db.collection('simple_explain_collection_with_promise');

        // Insert some documents we can sort on
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], configuration.writeConcernMax())
          .then(function (docs) {
            expect(docs).to.exist;
            // Do normal ascending sort
            return collection.find().explain();
          })
          .then(function (explanation) {
            expect(explanation).to.exist;
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor close function using a Promise.
   *
   * example-class Cursor
   * example-method close
   */
  it('shouldStreamDocumentsUsingTheCloseFunctionWithPromises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
        const docs = [];
        for (let i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        const collection = db.collection('test_close_function_on_cursor_with_promise');

        // Perform a find to get a cursor
        const cursor = collection.find();

        // Insert documents into collection
        return collection
          .insertMany(docs, configuration.writeConcernMax())
          .then(function (ids) {
            expect(ids).to.exist;
            // Fetch the first object
            return cursor.next();
          })
          .then(function (object) {
            expect(object).to.exist;
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
   * example-class MongoClient
   */
  it('Should correctly connect to a replicaset With Promises', {
    metadata: {
      requires: { topology: 'replicaset' }
    },

    test: function () {
      const configuration = this.configuration;
      const url = configuration.url();

      const client = configuration.newClient(url);
      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN
        expect(db != null).to.exist;

        return db
          .collection('replicaset_mongo_client_collection_with_promise')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function (result) {
            expect(result).property('upsertedCount').to.equal(1);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string to a shard, with acknowledgement of writes using a Promise.
   *
   * example-class MongoClient
   */
  it('Should connect to mongos proxies using connectiong string With Promises', {
    metadata: {
      requires: { topology: 'sharded' }
    },

    test: function () {
      const configuration = this.configuration;
      const url = configuration.url();

      const client = configuration.newClient(url);
      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // BEGIN
        expect(db != null).to.exist;

        return db
          .collection('replicaset_mongo_client_collection_with_promise')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
          .then(function (result) {
            expect(result.upsertedCount).to.equal(1);
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string for a single server connection
   *
   * example-class MongoClient
   */
  it('Should correctly connect using MongoClient to a single server using connect With Promises', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      // DOC_START
      // Connect using the connection string
      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
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
            expect(result).property('upsertedCount').to.equal(1);
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
   * example-class Collection
   * example-method initializeOrderedBulkOp
   */
  it('Should correctly execute ordered batch with no errors using write commands With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('batch_write_ordered_ops_0_with_promise');
        // Initialize the Ordered Batch
        const batch = col.initializeOrderedBulkOp();
        // Add some operations to be executed in order
        batch.insert({ a: 1 });
        batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
        batch
          .find({ a: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });
        batch.insert({ a: 3 });
        batch.find({ a: 3 }).delete({ a: 3 });

        // Execute the operations
        return batch.execute().then(function (result) {
          // Check state of result
          expect(result.insertedCount).to.equal(2);
          expect(result.upsertedCount).to.equal(1);
          expect(result.matchedCount).to.equal(1);
          expect(
            1 === result.modifiedCount || result.modifiedCount === 0 || result.modifiedCount == null
          ).to.exist;
          expect(result.deletedCount).to.equal(1);

          const upserts = result.result.upserted;
          expect(upserts.length).to.equal(1);
          expect(upserts[0].index).to.equal(2);
          expect(upserts[0]._id != null).to.exist;

          const upsert = result.getUpsertedIdAt(0);
          expect(upsert.index).to.equal(2);
          expect(upsert._id != null).to.exist;

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
   * example-class Collection
   * example-method initializeUnorderedBulkOp
   */
  it('Should correctly execute unordered batch with no errors With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('batch_write_unordered_ops_legacy_0_with_promise');
        // Initialize the unordered Batch
        const batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({ a: 1 });
        batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
        batch
          .find({ a: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });
        batch.insert({ a: 3 });
        batch.find({ a: 3 }).delete({ a: 3 });

        // Execute the operations
        return batch.execute().then(function (result) {
          // Check state of result
          expect(result.insertedCount).to.equal(2);
          expect(result.upsertedCount).to.equal(1);
          expect(result.matchedCount).to.equal(1);
          expect(
            1 === result.modifiedCount || result.modifiedCount === 0 || result.modifiedCount == null
          ).to.exist;
          expect(result.deletedCount).to.equal(1);

          const upserts = result.result.upserted;
          expect(upserts.length).to.equal(1);
          expect(upserts[0].index).to.equal(2);
          expect(upserts[0]._id != null).to.exist;

          const upsert = result.getUpsertedIdAt(0);
          expect(upsert.index).to.equal(2);
          expect(upsert._id != null).to.exist;

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
   * example-class Collection
   * example-method insertOne
   */
  it('Should correctly execute insertOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('insert_one_with_promise');
        return col.insertOne({ a: 1 }).then(function (r) {
          expect(r).property('insertedId').to.exist;
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
   * example-class Collection
   * example-method insertMany
   */
  it('Should correctly execute insertMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('insert_many_with_promise');
        return col.insertMany([{ a: 1 }, { a: 2 }]).then(function (r) {
          expect(r.insertedCount).to.equal(2);
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
   * example-class Collection
   * example-method updateOne
   */
  it('Should correctly execute updateOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('update_one_with_promise');
        return col.updateOne({ a: 1 }, { $set: { a: 2 } }, { upsert: true }).then(function (r) {
          expect(r.matchedCount).to.equal(0);
          expect(r.upsertedCount).to.equal(1);
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
   * example-class Collection
   * example-method updateMany
   */
  it('Should correctly execute updateMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('update_many_with_promise');
        return col
          .insertMany([{ a: 1 }, { a: 1 }])
          .then(function (r) {
            expect(r.insertedCount).to.equal(2);

            // Update all documents
            return col.updateMany({ a: 1 }, { $set: { b: 1 } });
          })
          .then(function (r) {
            if (r.n) {
              expect(r.n).to.equal(2);
            } else {
              expect(r.matchedCount).to.equal(2);
              expect(r.modifiedCount).to.equal(2);
            }

            // Finish up test
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple deleteOne operation using a Promise.
   *
   * example-class Collection
   * example-method deleteOne
   */
  it('Should correctly execute deleteOne operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('remove_one_with_promise');
        return col
          .insertMany([{ a: 1 }, { a: 1 }])
          .then(function (r) {
            expect(r.insertedCount).to.equal(2);

            return col.deleteOne({ a: 1 });
          })
          .then(function (r) {
            expect(r.deletedCount).to.equal(1);
            // Finish up test
            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple deleteMany operation using a Promise.
   *
   * example-class Collection
   * example-method deleteMany
   */
  it('Should correctly execute deleteMany operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('remove_many_with_promise');
        return col
          .insertMany([{ a: 1 }, { a: 1 }])
          .then(function (r) {
            expect(r.insertedCount).to.equal(2);

            // Update all documents
            return col.deleteMany({ a: 1 });
          })
          .then(function (r) {
            expect(r.deletedCount).to.equal(2);

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
   * example-class Collection
   * example-method bulkWrite
   */
  it('Should correctly execute bulkWrite operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('bulk_write_with_promise');
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
            { ordered: true, writeConcern: { w: 1 } }
          )
          .then(function (r) {
            expect(r.insertedCount).to.equal(1);
            expect(r.upsertedCount).to.equal(2);
            expect(r.deletedCount).to.equal(0);
            // Crud fields
            expect(r.insertedCount).to.equal(1);
            expect(Object.keys(r.insertedIds).length).to.equal(1);
            expect(r.matchedCount).to.equal(1);
            expect(r.modifiedCount === 0 || r.modifiedCount === 1).to.exist;
            expect(r.deletedCount).to.equal(0);
            expect(r.upsertedCount).to.equal(2);
            expect(Object.keys(r.upsertedIds).length).to.equal(2);

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
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // Get the collection
        const col = db.collection('bulk_write_with_promise_write_error');
        return col
          .bulkWrite(
            [{ insertOne: { document: { _id: 1 } } }, { insertOne: { document: { _id: 1 } } }],
            { ordered: true, writeConcern: { w: 1 } }
          )
          .catch(function (err) {
            expect(err.result.hasWriteErrors()).to.equal(true);
            // Ordered bulk operation
            return client.close();
          });
      });
    }
  });

  /**
   * Example of a simple findOneAndDelete operation using a Promise.
   *
   * example-class Collection
   * example-method findOneAndDelete
   */
  it('Should correctly execute findOneAndDelete operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('find_one_and_delete_with_promise');
        return col
          .insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } })
          .then(function (r) {
            expect(r).property('insertedCount').to.equal(1);
            return col.findOneAndDelete(
              { a: 1 },
              { projection: { b: 1 }, sort: { a: 1 }, includeResultMetadata: true }
            );
          })
          .then(function (r) {
            expect(r.lastErrorObject.n).to.equal(1);
            expect(r.value.b).to.equal(1);

            return client.close();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndReplace operation using a Promise.
   *
   * example-class Collection
   * example-method findOneAndReplace
   */
  it('Should correctly execute findOneAndReplace operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('find_one_and_replace_with_promise');
        return col.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } }).then(function (r) {
          expect(r).property('insertedCount').to.equal(1);

          return col
            .findOneAndReplace(
              { a: 1 },
              { c: 1, b: 1 },
              {
                projection: { b: 1, c: 1 },
                sort: { a: 1 },
                returnDocument: ReturnDocument.AFTER,
                upsert: true,
                includeResultMetadata: true
              }
            )
            .then(function (r) {
              expect(r.lastErrorObject.n).to.equal(1);
              expect(r.value.b).to.equal(1);
              expect(r.value.c).to.equal(1);

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
   * example-class Collection
   * example-method findOneAndUpdate
   */
  it('Should correctly execute findOneAndUpdate operation With Promises', {
    metadata: { requires: { topology: ['single'] } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      return client.connect().then(function (client) {
        const db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        const col = db.collection('find_one_and_update_with_promise');
        return col
          .insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } })
          .then(function (r) {
            expect(r).property('insertedCount').to.equal(1);

            return col.findOneAndUpdate(
              { a: 1 },
              { $set: { d: 1 } },
              {
                projection: { b: 1, d: 1 },
                sort: { a: 1 },
                returnDocument: ReturnDocument.AFTER,
                upsert: true,
                includeResultMetadata: true
              }
            );
          })
          .then(function (r) {
            expect(r.lastErrorObject.n).to.equal(1);
            expect(r.value.b).to.equal(1);
            expect(r.value.d).to.equal(1);

            return client.close();
          });
      });
      // END
    }
  });

  /**
   * A simple example showing the listening to a capped collection.
   *
   * example-class Db
   * example-method createCollection
   */
  it('Should correctly add capped collection options to cursor', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1
    });

    await client.connect();
    const db = client.db(configuration.db);

    const collection = await db.createCollection('a_simple_collection_2_with_promise', {
      capped: true,
      size: 100000,
      max: 1000,
      writeConcern: { w: 1 }
    });
    const docs: Array<{ a: number }> = [];
    for (let i = 0; i < 10000; i++) docs.push({ a: i });

    // Insert a document in the capped collection
    await collection.insertMany(docs, configuration.writeConcernMax());
    let total = 0;

    // Get the cursor
    const cursor = collection
      .find({ a: { $gte: 0 } })
      .addCursorFlag('tailable', true)
      .addCursorFlag('awaitData', true);

    const stream = cursor.stream();

    for await (const d of stream) {
      expect(d).to.have.property('_id');
      total = total + 1;
      if (total === 1000) await cursor.close();
    }
    await client.close();
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
