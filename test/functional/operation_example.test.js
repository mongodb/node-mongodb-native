'use strict';
const { assert: test } = require('./shared');
const { setupDatabase } = require('./shared');
const { format: f } = require('util');
const { Topology } = require('../../src/sdam/topology');
const { Code, ObjectId } = require('../../src');

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

describe('Operation Examples', function () {
  before(function () {
    return setupDatabase(this.configuration, ['integration_tests_2']);
  });

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
   */
  it('aggregationExample1', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregationExample1');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          expect(err).to.not.exist;
          test.ok(result);

          // Execute aggregate, notice the pipeline is expressed as an Array
          const cursor = collection.aggregate([
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
            },
            { $sort: { _id: -1 } }
          ]);
          cursor.toArray(function (err, result) {
            expect(err).to.not.exist;
            test.equal('good', result[0]._id.tags);
            test.deepEqual(['bob'], result[0].authors);
            test.equal('fun', result[1]._id.tags);
            test.deepEqual(['bob'], result[1].authors);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation using a cursor
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('aggregationExample2', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregationExample2');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          expect(err).to.not.exist;
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
          cursor.toArray(function (err, docs) {
            expect(err).to.not.exist;
            test.equal(2, docs.length);
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation using a cursor and toArray
   *
   * @example-class AggregationCursor
   * @example-method toArray
   */
  it('Aggregation Cursor toArray Test', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregation_toArray_example');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          expect(err).to.not.exist;
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
          cursor.toArray(function (err, docs) {
            expect(err).to.not.exist;
            test.equal(2, docs.length);
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation using a cursor and next
   *
   * @example-class AggregationCursor
   * @example-method next
   */
  it('Aggregation Cursor toArray Test', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregation_next_example');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

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
          cursor.next(function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Need to close cursor since cursor is not
            // exhausted, and implicit session is still open
            cursor.close();
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation using a cursor and each
   *
   * @example-class AggregationCursor
   * @example-method each
   */
  it('Aggregation Cursor each Test', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregation_each_example');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

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
          cursor.each(function (err, docs) {
            expect(err).to.not.exist;

            if (docs == null) {
              client.close(done);
            }
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation using a cursor and forEach
   *
   * @example-class AggregationCursor
   * @example-method forEach
   */
  it('Aggregation Cursor forEach Test', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregation_forEach_example');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

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

          var count = 0;
          // Get all the aggregation results
          cursor.forEach(
            function (doc) {
              test.ok(doc != null);
              count = count + 1;
            },
            function (err) {
              expect(err).to.not.exist;
              test.equal(2, count);

              client.close(done);
            }
          );
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation using a read stream
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('aggregationExample3', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
        var collection = db.collection('aggregationExample3');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

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

          var count = 0;
          // Get all the aggregation results
          cursor.on('data', function () {
            count = count + 1;
          });

          cursor.once('end', function () {
            test.equal(2, count);
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of running simple count commands against a collection.
   *
   * @example-class Collection
   * @example-method count
   */
  it('shouldCorrectlyDoSimpleCountExamples', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Crete the collection for the distinct example
        var collection = db.collection('countExample1');
        // Insert documents to perform distinct against
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4, b: 1 }], { w: 1 }, function (
          err,
          ids
        ) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Perform a total count command
          collection.count(function (err, count) {
            expect(err).to.not.exist;
            test.equal(4, count);

            // Perform a partial account where b=1
            collection.count({ b: 1 }, function (err, count) {
              expect(err).to.not.exist;
              test.equal(1, count);

              client.close(done);
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background and dropping duplicated documents
   *
   * @example-class Collection
   * @example-method createIndex
   */
  it('shouldCreateComplexIndexOnTwoFields', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Show that duplicate records got dropped
                collection.find({}).toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function (err, explanation) {
                    expect(err).to.not.exist;
                    test.ok(explanation != null);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * A simple createIndex using a simple single field index
   *
   * @example-class Collection
   * @example-method createIndex
   */
  it('shouldCreateASimpleIndexOnASingleField', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample2');
        // Insert a bunch of documents for the index
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }], { w: 1 }, function (
          err,
          result
        ) {
          test.ok(result);
          expect(err).to.not.exist;

          // Create an index on the a field
          collection.createIndex('a', { w: 1 }, function (err, indexName) {
            test.equal('a_1', indexName);

            // Perform a query, with explain to show we hit the query
            collection.find({ a: 2 }).explain(function (err, explanation) {
              expect(err).to.not.exist;
              test.ok(explanation != null);

              client.close(done);
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background
   *
   * @example-class Collection
   * @example-method createIndex
   */
  it('createIndexExample3', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample3');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 },
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            var options = { unique: true, background: true, w: 1 };
            // Create an index on the a field
            collection.createIndex({ a: 1, b: 1 }, options, function (err, indexName) {
              test.ok(indexName);
              expect(err).to.not.exist;

              test.ok(!options.readPreference);
              // Show that duplicate records got dropped
              collection.find({}).toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal(4, items.length);

                // Perform a query, with explain to show we hit the query
                collection.find({ a: 2 }).explain(function (err, explanation) {
                  expect(err).to.not.exist;
                  test.ok(explanation != null);

                  client.close(done);
                });
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of running the distinct command against a collection
   *
   * @example-class Collection
   * @example-method distinct
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilter', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Crete the collection for the distinct example
        var collection = db.collection('distinctExample1');

        // Insert documents to perform distinct against
        collection.insertMany(
          [
            { a: 0, b: { c: 'a' } },
            { a: 1, b: { c: 'b' } },
            { a: 1, b: { c: 'c' } },
            { a: 2, b: { c: 'a' } },
            { a: 3 },
            { a: 3 }
          ],
          configuration.writeConcernMax(),
          function (err, ids) {
            test.ok(ids);
            expect(err).to.not.exist;

            // Perform a distinct query against the a field
            collection.distinct('a', function (err, docs) {
              test.deepEqual([0, 1, 2, 3], docs.sort());

              // Perform a distinct query against the sub-field b.c
              collection.distinct('b.c', function (err, docs) {
                test.deepEqual(['a', 'b', 'c'], docs.sort());

                client.close(done);
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of running the distinct command against a collection with a filter query
   *
   * @example-class Collection
   * @example-method distinct
   */
  it('shouldCorrectlyHandleDistinctIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Crete the collection for the distinct example
        var collection = db.collection('distinctExample2');

        // Insert documents to perform distinct against
        collection.insertMany(
          [
            { a: 0, b: { c: 'a' } },
            { a: 1, b: { c: 'b' } },
            { a: 1, b: { c: 'c' } },
            { a: 2, b: { c: 'a' } },
            { a: 3 },
            { a: 3 },
            { a: 5, c: 1 }
          ],
          configuration.writeConcernMax(),
          function (err, ids) {
            test.ok(ids);
            expect(err).to.not.exist;

            // Perform a distinct query with a filter against the documents
            collection.distinct('a', { c: 1 }, function (err, docs) {
              test.deepEqual([5], docs.sort());

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of a simple collection drop.
   *
   * @example-class Collection
   * @example-method drop
   */
  it('shouldCorrectlyDropCollectionWithDropFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('test_other_drop');

        // Drop the collection
        collection.drop(function (/*err, reply*/) {
          // TODO: reenable once SERVER-36317 is resolved
          // expect(err).to.exist;
          // expect(reply).to.not.exist;

          // Ensure we don't have the collection in the set of names
          db.listCollections().toArray(function (err, replies) {
            var found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function (document) {
              if (document.name === 'test_other_drop') {
                found = true;
                return;
              }
            });

            // Ensure the collection is not found
            test.equal(false, found);

            // Let's close the db
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of a how to drop all the indexes on a collection using dropAllIndexes
   *
   * @example-class Collection
   * @example-method dropAllIndexes
   */
  it('dropAllIndexesExample1', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        db.createCollection('dropExample1', function (err, r) {
          test.ok(r);
          expect(err).to.not.exist;

          // Drop the collection
          db.collection('dropExample1').dropAllIndexes(function (err, reply) {
            test.ok(reply);
            expect(err).to.not.exist;

            // Let's close the db
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index
   *
   * @example-class Collection
   * @example-method dropIndex
   */
  it('shouldCorrectlyCreateAndDropIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var collection = db.collection('dropIndexExample1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 },
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Drop the index
                collection.dropIndex('a_1_b_1', function (err, result) {
                  test.ok(result);
                  expect(err).to.not.exist;

                  // Verify that the index is gone
                  collection.indexInformation(function (err, indexInformation) {
                    test.deepEqual([['_id', 1]], indexInformation._id_);
                    expect(indexInformation.a_1_b_1).to.not.exist;

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents.
   *
   * @example-class Collection
   * @example-method ensureIndex
   */
  it('shouldCreateComplexEnsureIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var collection = db.collection('ensureIndexExample1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            db.ensureIndex(
              'ensureIndexExample1',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Show that duplicate records got dropped
                collection.find({}).toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function (err, explanation) {
                    expect(err).to.not.exist;
                    test.ok(explanation != null);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background.
   *
   * @example-class Collection
   * @example-method ensureIndex
   */
  it('ensureIndexExampleWithCompountIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var collection = db.collection('ensureIndexExample2');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 },
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Show that duplicate records got dropped
                collection.find({}).toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function (err, explanation) {
                    expect(err).to.not.exist;
                    test.ok(explanation != null);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * A simple query using the find method on the collection.
   *
   * @example-class Collection
   * @example-method find
   */
  it('shouldPerformASimpleQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('simple_query');

        // Insert a bunch of documents for the testing
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Perform a simple find and return all the documents
            collection.find().toArray(function (err, docs) {
              expect(err).to.not.exist;
              test.equal(3, docs.length);

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple query showing the explain for a query
   *
   * @example-class Collection
   * @example-method find
   */
  it('shouldPerformASimpleExplainQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('simple_explain_query');
        // Insert a bunch of documents for the testing
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Perform a simple find and return all the documents
            collection.find({}).explain(function (err, explain) {
              expect(err).to.not.exist;
              test.ok(explain != null);

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple query showing skip and limit
   *
   * @example-class Collection
   * @example-method find
   */
  it('shouldPerformASimpleLimitSkipQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_query');
        // Insert a bunch of documents for the testing
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Perform a simple find and return all the documents
            collection
              .find({})
              .skip(1)
              .limit(1)
              .project({ b: 1 })
              .toArray(function (err, docs) {
                expect(err).to.not.exist;
                test.equal(1, docs.length);
                expect(docs[0].a).to.not.exist;
                test.equal(2, docs[0].b);

                client.close(done);
              });
          }
        );
      });
      // END
    }
  });

  /**
   * A whole set of different ways to use the findAndModify command.
   *
   * The first findAndModify command modifies a document and returns the modified document back.
   * The second findAndModify command removes the document.
   * The second findAndModify command upserts a document and returns the new document.
   *
   * @example-class Collection
   * @example-method findAndModify
   */
  it('shouldPerformSimpleFindAndModifyOperations', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_');

        // Insert some test documentations
        collection.insertMany(
          [{ a: 1 }, { b: 1 }, { c: 1 }],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Simple findAndModify command returning the new document
            collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b1: 1 } },
              { new: true },
              function (err, doc) {
                expect(err).to.not.exist;
                test.equal(1, doc.value.a);
                test.equal(1, doc.value.b1);

                // Simple findAndModify command returning the new document and
                // removing it at the same time
                collection.findAndModify(
                  { b: 1 },
                  [['b', 1]],
                  { $set: { b: 2 } },
                  { remove: true },
                  function (err, doc) {
                    test.ok(doc);
                    expect(err).to.not.exist;

                    // Verify that the document is gone
                    collection.findOne({ b: 1 }, function (err, item) {
                      expect(err).to.not.exist;
                      expect(item).to.not.exist;

                      // Simple findAndModify command performing an upsert and returning the new document
                      // executing the command safely
                      collection.findAndModify(
                        { d: 1 },
                        [['b', 1]],
                        { d: 1, f: 1 },
                        { new: true, upsert: true, w: 1 },
                        function (err, doc) {
                          expect(err).to.not.exist;
                          test.equal(1, doc.value.d);
                          test.equal(1, doc.value.f);

                          client.close(done);
                        }
                      );
                    });
                  }
                );
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * An example of using findAndRemove
   *
   * @example-class Collection
   * @example-method findAndRemove
   */
  it('shouldPerformSimpleFindAndRemove', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_2');
        // Insert some test documentations
        collection.insertMany(
          [{ a: 1 }, { b: 1, d: 1 }, { c: 1 }],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Simple findAndModify command returning the old document and
            // removing it at the same time
            collection.findAndRemove({ b: 1 }, [['b', 1]], function (err, doc) {
              expect(err).to.not.exist;
              test.equal(1, doc.value.b);
              test.equal(1, doc.value.d);

              // Verify that the document is gone
              collection.findOne({ b: 1 }, function (err, item) {
                expect(err).to.not.exist;
                expect(item).to.not.exist;

                client.close(done);
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple query using findOne
   *
   * @example-class Collection
   * @example-method findOne
   */
  it('shouldPerformASimpleLimitSkipFindOneQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_find_one_query');
        // Insert a bunch of documents for the testing
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Perform a simple find and return all the documents
            collection.findOne({ a: 2 }, { fields: { b: 1 } }, function (err, doc) {
              expect(err).to.not.exist;
              expect(doc.a).to.not.exist;
              test.equal(2, doc.b);

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple map reduce example
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it('shouldPerformSimpleMapReduceFunctions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      /* eslint-disable */
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection
        var collection = db.collection('test_map_reduce_functions');

        // Insert some documents to perform map reduce over
        collection.insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 }, function(err, r) {
          test.ok(r);
          expect(err).to.not.exist;

          // Map function
          var map = function() {
            emit(this.user_id, 1);
          };
          // Reduce function
          var reduce = function(k, vals) {
            return 1;
          };

          // Perform the map reduce
          collection.mapReduce(map, reduce, { out: { replace: 'tempCollection' } }, function(
            err,
            collection
          ) {
            expect(err).to.not.exist;

            // Mapreduce returns the temporary collection with the results
            collection.findOne({ _id: 1 }, function(err, result) {
              test.equal(1, result.value);

              collection.findOne({ _id: 2 }, function(err, result) {
                test.equal(1, result.value);

                client.close(done);
              });
            });
          });
        });
      });
      // END
      /* eslint-enable */
    }
  });

  /**
   * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it('shouldPerformMapReduceFunctionInline', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>1.7.6',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_inline');

        // Insert some test documents
        collection.insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 }, function (err, r) {
          test.ok(r);
          expect(err).to.not.exist;

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
          collection.mapReduce(map, reduce, { out: { inline: 1 }, verbose: true }, function (
            err,
            result
          ) {
            test.equal(2, result.results.length);
            test.ok(result.stats != null);

            collection.mapReduce(
              map,
              reduce,
              { out: { replace: 'mapreduce_integration_test' }, verbose: true },
              function (err, result) {
                test.ok(result.stats != null);
                client.close(done);
              }
            );
          });
        });
      });
      // END
    }
  });

  /**
   * Mapreduce different test with a provided scope containing a javascript function.
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it('shouldPerformMapReduceWithContext', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_scope');

        // Insert some test documents
        collection.insertMany(
          [
            { user_id: 1, timestamp: new Date() },
            { user_id: 2, timestamp: new Date() }
          ],
          { w: 1 },
          function (err, r) {
            test.ok(r);
            expect(err).to.not.exist;

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

            collection.mapReduce(map, reduce, o, function (err, outCollection) {
              expect(err).to.not.exist;

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function (err, results) {
                expect(err).to.not.exist;
                test.equal(2, results[0].value);

                // mapReduce with scope containing plain function
                var o = {};
                o.scope = { fn: t };
                o.out = { replace: 'replacethiscollection' };

                collection.mapReduce(map, reduce, o, function (err, outCollection) {
                  expect(err).to.not.exist;

                  // Find all entries in the map-reduce collection
                  outCollection.find().toArray(function (err, results) {
                    expect(err).to.not.exist;
                    test.equal(2, results[0].value);

                    client.close(done);
                  });
                });
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Mapreduce different test with a provided scope containing javascript objects with functions.
   *
   * @example-class Collection
   * @example-method mapReduce
   */
  it.skip('shouldPerformMapReduceInContextObjects', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection
        var collection = db.collection('test_map_reduce_functions_scope_objects');

        // Insert some test documents
        collection.insertMany(
          [
            { user_id: 1, timestamp: new Date() },
            { user_id: 2, timestamp: new Date() }
          ],
          { w: 1 },
          function (err, r) {
            test.ok(r);
            expect(err).to.not.exist;

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

            collection.mapReduce(map, reduce, o, function (err, outCollection) {
              expect(err).to.not.exist;

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function (err, results) {
                expect(err).to.not.exist;
                test.equal(2, results[0].value);

                // mapReduce with scope containing plain function
                var o = {};
                o.scope = { obj: { fn: t } };
                o.out = { replace: 'replacethiscollection' };

                collection.mapReduce(map, reduce, o, function (err, outCollection) {
                  expect(err).to.not.exist;

                  // Find all entries in the map-reduce collection
                  outCollection.find().toArray(function (err, results) {
                    test.equal(2, results[0].value);
                    client.close(done);
                  });
                });
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections indexes
   *
   * @example-class Collection
   * @example-method indexes
   */
  it('shouldCorrectlyRetrieveACollectionsIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Crete the collection for the distinct example
        var collection = db.collection('simple_key_based_distinct');
        // Create a geo 2d index
        collection.ensureIndex({ loc: '2d' }, configuration.writeConcernMax(), function (
          err,
          result
        ) {
          test.ok(result);
          expect(err).to.not.exist;

          // Create a simple single field index
          collection.ensureIndex({ a: 1 }, configuration.writeConcernMax(), function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            setTimeout(function () {
              // List all of the indexes on the collection
              collection.indexes(function (err, indexes) {
                test.equal(3, indexes.length);

                client.close(done);
              });
            }, 1000);
          });
        });
      });
      // END
    }
  });

  /**
   * An example showing the use of the indexExists function for a single index name and a list of index names.
   *
   * @example-class Collection
   * @example-method indexExists
   */
  it('shouldCorrectlyExecuteIndexExists', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection that we are getting the options back from
        var collection = db.collection(
          'test_collection_index_exists',
          configuration.writeConcernMax()
        );
        expect(err).to.not.exist;

        // Create an index on the collection
        collection.createIndex('a', configuration.writeConcernMax(), function (err, indexName) {
          test.ok(indexName);
          expect(err).to.not.exist;

          // Let's test to check if a single index exists
          collection.indexExists('a_1', function (err, result) {
            test.equal(true, result);

            // Let's test to check if multiple indexes are available
            collection.indexExists(['a_1', '_id_'], function (err, result) {
              test.equal(true, result);

              // Check if a non existing index exists
              collection.indexExists('c_1', function (err, result) {
                test.equal(false, result);

                client.close(done);
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * An example showing the information returned by indexInformation
   *
   * @example-class Collection
   * @example-method indexInformation
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformation', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_2');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Fetch basic indexInformation for collection
                db.indexInformation('more_index_information_test_2', function (
                  err,
                  indexInformation
                ) {
                  test.deepEqual([['_id', 1]], indexInformation._id_);
                  test.deepEqual(
                    [
                      ['a', 1],
                      ['b', 1]
                    ],
                    indexInformation.a_1_b_1
                  );

                  // Fetch full index information
                  collection.indexInformation({ full: true }, function (err, indexInformation) {
                    test.deepEqual({ _id: 1 }, indexInformation[0].key);
                    test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * An examples showing the information returned by indexInformation
   *
   * @example-class Collection
   * @example-method indexInformation
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_3');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          { w: 1 },
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Fetch basic indexInformation for collection
                collection.indexInformation(function (err, indexInformation) {
                  test.deepEqual([['_id', 1]], indexInformation._id_);
                  test.deepEqual(
                    [
                      ['a', 1],
                      ['b', 1]
                    ],
                    indexInformation.a_1_b_1
                  );

                  // Fetch full index information
                  collection.indexInformation({ full: true }, function (err, indexInformation) {
                    test.deepEqual({ _id: 1 }, indexInformation[0].key);
                    test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * A simple document insert example, not using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var collection = db.collection('simple_document_insert_collection_no_safe');
        // Insert a single document
        collection.insertOne({ hello: 'world_no_safe' }, err => {
          expect(err).to.not.exist;
          // Wait for a second before finishing up, to ensure we have written the item to disk
          setTimeout(function () {
            // Fetch the document
            collection.findOne({ hello: 'world_no_safe' }, function (err, item) {
              expect(err).to.not.exist;
              test.equal('world_no_safe', item.hello);
              client.close(done);
            });
          }, 100);
        });
      });
      // END
    }
  });

  /**
   * A batch document insert example, using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Fetch a collection to insert document into
        var collection = db.collection('batch_document_insert_collection_safe');
        // Insert a single document
        collection.insertMany(
          [{ hello: 'world_safe1' }, { hello: 'world_safe2' }],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Fetch the document
            collection.findOne({ hello: 'world_safe2' }, function (err, item) {
              expect(err).to.not.exist;
              test.equal('world_safe2', item.hello);
              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of inserting a document containing functions
   *
   * @example-class Collection
   * @example-method insert
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Fetch a collection to insert document into
        var collection = db.collection('simple_document_insert_with_function_safe');

        var o = configuration.writeConcernMax();
        o.serializeFunctions = true;
        // Insert a single document
        collection.insertOne(
          {
            hello: 'world',
            func: function () {}
          },
          o,
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Fetch the document
            collection.findOne({ hello: 'world' }, function (err, item) {
              expect(err).to.not.exist;
              test.ok('function() {}', item.code);
              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of using keepGoing to allow batch insert to complete even when there are illegal documents in the batch
   *
   * @example-class Collection
   * @example-method insert
   */
  it('Should correctly execute insert with keepGoing option on mongod >= 1.9.1', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>1.9.1',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('keepGoingExample');

        // Add an unique index to title to force errors in the batch insert
        collection.ensureIndex({ title: 1 }, { unique: true }, function (err, indexName) {
          test.ok(indexName);
          expect(err).to.not.exist;

          // Insert some intial data into the collection
          collection.insertMany(
            [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
            configuration.writeConcernMax(),
            function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;

              // Force keep going flag, ignoring unique index issue
              collection.insert(
                [
                  { name: 'Jim' },
                  { name: 'Sarah', title: 'Princess' },
                  { name: 'Gump', title: 'Gump' }
                ],
                { w: 1, keepGoing: true },
                function (err, result) {
                  expect(result).to.not.exist;
                  test.ok(err);
                  test.ok(err.result);

                  // Count the number of documents left (should not include the duplicates)
                  collection.count(function (err, count) {
                    test.equal(3, count);
                    client.close(done);
                  });
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
   * An example showing how to establish if it's a capped collection
   *
   * @example-class Collection
   * @example-method isCapped
   */
  it('shouldCorrectlyExecuteIsCapped', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection that we are getting the options back from
        db.createCollection('test_collection_is_capped', { capped: true, size: 1024 }, function (
          err,
          collection
        ) {
          test.equal('test_collection_is_capped', collection.collectionName);

          // Let's fetch the collection options
          collection.isCapped(function (err, capped) {
            test.equal(true, capped);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An example returning the options for a collection.
   *
   * @example-class Collection
   * @example-method options
   */
  it('shouldCorrectlyRetrieveCollectionOptions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a test collection that we are getting the options back from
        db.createCollection('test_collection_options', { capped: true, size: 1024 }, function (
          err,
          collection
        ) {
          test.equal('test_collection_options', collection.collectionName);

          // Let's fetch the collection options
          collection.options(function (err, options) {
            test.equal(true, options.capped);
            test.ok(options.size >= 1024);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An example removing all documents in a collection not using safe mode
   *
   * @example-class Collection
   * @example-method remove
   */
  it('shouldRemoveAllDocumentsNoSafe', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        const db = client.db(configuration.db);
        const collection = db.collection('remove_all_documents_no_safe');

        // Insert a bunch of documents
        collection.insertMany([{ a: 1 }, { b: 2 }], { w: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;

          // Remove all the document
          collection.deleteMany((err, result) => {
            expect(err).to.not.exist;
            expect(result).to.exist;

            // Fetch all results
            collection.find().toArray((err, docs) => {
              expect(err).to.not.exist;
              expect(docs).to.have.lengthOf(0);

              client.close(done);
            });
          });
        });
      });
      // END
    }
  });

  /**
   * An example removing a subset of documents using safe mode to ensure removal of documents
   *
   * @example-class Collection
   * @example-method remove
   */
  it('shouldRemoveSubsetOfDocumentsSafeMode', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Fetch a collection to insert document into
        var collection = db.collection('remove_subset_of_documents_safe');
        // Insert a bunch of documents
        collection.insertMany([{ a: 1 }, { b: 2 }], { w: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

          // Remove all the document
          collection.removeOne({ a: 1 }, { w: 1 }, function (err, r) {
            expect(err).to.not.exist;
            expect(r).property('deletedCount').to.equal(1);
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An example of illegal and legal renaming of a collection
   *
   * @example-class Collection
   * @example-method rename
   */
  it('shouldCorrectlyRenameCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Open a couple of collections
        db.createCollection('test_rename_collection', function (err, collection1) {
          db.createCollection('test_rename_collection2', function (err, collection2) {
            test.ok(collection2);
            expect(err).to.not.exist;

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
            collection1.insertMany([{ x: 1 }, { x: 2 }], configuration.writeConcernMax(), function (
              err,
              docs
            ) {
              test.ok(docs);
              expect(err).to.not.exist;

              // Attemp to rename the first collection to the second one, this will fail
              collection1.rename('test_rename_collection2', function (err, collection) {
                expect(collection).to.not.exist;
                test.ok(err instanceof Error);
                test.ok(err.message.length > 0);

                // Attemp to rename the first collection to a name that does not exist
                // this will be successful
                collection1.rename('test_rename_collection3', function (err, collection2) {
                  test.equal('test_rename_collection3', collection2.collectionName);

                  // Ensure that the collection is pointing to the new one
                  collection2.count(function (err, count) {
                    test.equal(2, count);
                    client.close(done);
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
   * Example of a simple document update with safe set to false on an existing document
   *
   * @example-class Collection
   * @example-method updateOne
   */
  it('shouldCorrectlyUpdateASimpleDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get a collection
        var collection = db.collection('update_a_simple_document');

        // Insert a document, then update it
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function (err, doc) {
          test.ok(doc);
          expect(err).to.not.exist;

          // Update the document with an atomic operator
          collection.updateOne({ a: 1 }, { $set: { b: 2 } });

          // Wait for a second then fetch the document
          setTimeout(function () {
            // Fetch the document that we modified
            collection.findOne({ a: 1 }, function (err, item) {
              expect(err).to.not.exist;
              test.equal(1, item.a);
              test.equal(2, item.b);
              client.close(done);
            });
          }, 1000);
        });
      });
      // END
    }
  });

  /**
   * Example of a simple document update using upsert (the document will be inserted if it does not exist)
   *
   * @example-class Collection
   * @example-method updateOne
   */
  it('shouldCorrectlyUpsertASimpleDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get a collection
        var collection = db.collection('update_a_simple_document_upsert');
        // Update the document using an upsert operation, ensuring creation if it does not exist
        collection.updateOne({ a: 1 }, { $set: { b: 2, a: 1 } }, { upsert: true, w: 1 }, function (
          err,
          result
        ) {
          expect(err).to.not.exist;
          test.equal(1, result.result.n);

          // Fetch the document that we modified and check if it got inserted correctly
          collection.findOne({ a: 1 }, function (err, item) {
            expect(err).to.not.exist;
            test.equal(1, item.a);
            test.equal(2, item.b);
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of an update across multiple documents using the multi option.
   *
   * @example-class Collection
   * @example-method updateMany
   */
  it('shouldCorrectlyUpdateMultipleDocuments', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get a collection
        var collection = db.collection('update_a_simple_document_multi');

        // Insert a couple of documentations
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 1, b: 2 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            var o = configuration.writeConcernMax();
            collection.updateMany({ a: 1 }, { $set: { b: 0 } }, o, function (err, r) {
              expect(err).to.not.exist;
              test.equal(2, r.result.n);

              // Fetch all the documents and verify that we have changed the b value
              collection.find().toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal(1, items[0].a);
                test.equal(0, items[0].b);
                test.equal(1, items[1].a);
                test.equal(0, items[1].b);

                client.close(done);
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of retrieving a collections stats
   *
   * @example-class Collection
   * @example-method stats
   */
  it('shouldCorrectlyReturnACollectionsStats', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Crete the collection for the distinct example
        var collection = db.collection('collection_stats_test');

        // Insert some documents
        collection.insertMany(
          [{ a: 1 }, { hello: 'world' }],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Retrieve the statistics for the collection
            collection.stats(function (err, stats) {
              test.equal(2, stats.count);

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * An examples showing the creation and dropping of an index
   *
   * @example-class Collection
   * @example-method dropIndexes
   */
  it('shouldCorrectlyCreateAndDropAllIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('shouldCorrectlyCreateAndDropAllIndex');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4, c: 4 }
          ],
          { w: 1 },
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Create an additional index
                collection.ensureIndex(
                  { c: 1 },
                  { unique: true, background: true, w: 1 },
                  function () {
                    // Drop the index
                    collection.dropAllIndexes(function (err, result) {
                      test.ok(result);
                      expect(err).to.not.exist;

                      // Verify that the index is gone
                      collection.indexInformation(function (err, indexInformation) {
                        test.deepEqual([['_id', 1]], indexInformation._id_);
                        expect(indexInformation.a_1_b_1).to.not.exist;
                        expect(indexInformation.c_1).to.not.exist;

                        client.close(done);
                      });
                    });
                  }
                );
              }
            );
          }
        );
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
   * Example showing how to access the Admin database for admin level operations.
   *
   * @example-class Db
   * @example-method admin
   */
  it('accessAdminLevelOperations', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Use the admin database for the operation
        var adminDb = db.admin();
        test.ok(adminDb != null);

        client.close(done);
      });
      // END
    }
  });

  /**
   * An example of a simple single server db connection
   *
   * @example-class Db
   * @example-method open
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      // NODE-2484: investigate double close event in Unified Topology environment
      // client.on('close', function() {
      //   done();
      // });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        expect(err).to.not.exist;

        client.close(done);
      });
      // END
    }
  });

  /**
   * An example of a simple single server db connection and close function
   *
   * @example-class Db
   * @example-method close
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnectionAndCloseWithCallback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        // Close the connection with a callback that is optional
        client.close(function (err) {
          expect(err).to.not.exist;
          done();
        });
      });
      // END
    }
  });

  /**
   * An example of retrieving the collections list for a database.
   *
   * @example-class Db
   * @example-method listCollections
   */
  it('shouldCorrectlyRetrievelistCollections', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN

        // Get an empty db
        var db1 = client.db('listCollectionTestDb');
        // Create a collection
        var collection = db1.collection('shouldCorrectlyRetrievelistCollections');
        // Ensure the collection was created
        collection.insertOne({ a: 1 }, function (err, r) {
          test.ok(r);
          expect(err).to.not.exist;

          // Return the information of a single collection name
          db1
            .listCollections({ name: 'shouldCorrectlyRetrievelistCollections' })
            .toArray(function (err, items) {
              expect(err).to.not.exist;
              test.equal(1, items.length);

              // Return the information of a all collections, using the callback format
              db1.listCollections().toArray(function (err, items) {
                expect(err).to.not.exist;
                test.ok(items.length >= 1);

                client.close(done);
              });
            });
        });
      });
      // END
    }
  });

  it('shouldCorrectlyRetrievelistCollectionsWiredTiger', {
    metadata: { requires: { topology: ['wiredtiger'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        // Get an empty db
        var db1 = client.db('listCollectionTestDb2');
        // Create a collection
        var collection = db1.collection('shouldCorrectlyRetrievelistCollections');
        // Ensure the collection was created
        collection.insertOne({ a: 1 }, function (err, r) {
          test.ok(r);
          expect(err).to.not.exist;

          // Return the information of a single collection name
          db1
            .listCollections({ name: 'shouldCorrectlyRetrievelistCollections' })
            .toArray(function (err, items) {
              test.equal(1, items.length);

              // Return the information of a all collections, using the callback format
              db1.listCollections().toArray(function (err, items) {
                test.equal(1, items.length);

                client.close(done);
              });
            });
        });
      });
    }
  });

  /**
   * An example of retrieving a collection from a db using the collection function.
   *
   * @example-class Db
   * @example-method collection
   */
  it('shouldCorrectlyAccessACollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Grab a collection with a callback but no safe operation
        db.collection('test_correctly_access_collections', function (err, col2) {
          test.ok(col2);
          expect(err).to.not.exist;

          // Grab a collection with a callback in safe mode, ensuring it exists (should fail as it's not created)
          db.collection('test_correctly_access_collections', { strict: true }, function (
            err,
            col3
          ) {
            expect(col3).to.not.exist;
            test.ok(err != null);

            // Create the collection
            db.createCollection('test_correctly_access_collections', function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;

              // Retry to get the collection, should work as it's now created
              db.collection('test_correctly_access_collections', { strict: true }, function (
                err,
                col3
              ) {
                test.ok(col3);
                expect(err).to.not.exist;

                client.close(done);
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * An example of retrieving all collections for a db as Collection objects
   *
   * @example-class Db
   * @example-method collections
   */
  it('shouldCorrectlyRetrieveAllCollections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Retry to get the collection, should work as it's now created
        db.collections(function (err, collections) {
          expect(err).to.not.exist;
          test.ok(collections.length > 0);

          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * An example of adding a user to the database.
   *
   * @example-class Db
   * @example-method addUser
   */
  it('shouldCorrectlyAddUserToDb', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Add a user to the database
        db.addUser('user', 'name', function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

          // Remove the user from the db
          db.removeUser('user', function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An example of removing a user.
   *
   * @example-class Db
   * @example-method removeUser
   */
  it('shouldCorrectlyAddAndRemoveUser', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Add a user to the database
        db.addUser('user', 'name', function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;
          client.close();

          const secondClient = configuration.newClient(
            'mongodb://user:name@localhost:27017/integration_tests'
          );

          secondClient.connect(function (err) {
            expect(err).to.not.exist;
            var db = secondClient.db(configuration.db);

            // Logout the db
            secondClient.logout(function (err, result) {
              test.equal(true, result);

              // Remove the user from the db
              db.removeUser('user', function (err, result) {
                test.ok(result);
                expect(err).to.not.exist;

                const oldClient = secondClient;
                const thirdClient = configuration.newClient(
                  'mongodb://user:name@localhost:27017/integration_tests',
                  { serverSelectionTimeoutMS: 10 }
                );

                // Authenticate
                thirdClient.connect(function (err) {
                  expect(err).to.exist;
                  oldClient.close();
                  done();
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
   * A simple example showing the creation of a collection.
   *
   * @example-class Db
   * @example-method createCollection
   */
  it('shouldCorrectlyCreateACollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Create a capped collection with a maximum of 1000 documents
        db.createCollection(
          'a_simple_collection',
          { capped: true, size: 10000, max: 1000, w: 1 },
          function (err, collection) {
            expect(err).to.not.exist;

            // Insert a document in the capped collection
            collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example creating, dropping a collection and then verifying that the collection is gone.
   *
   * @example-class Db
   * @example-method dropCollection
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServer', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Execute ping against the server
        db.command({ ping: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

          // Create a capped collection with a maximum of 1000 documents
          db.createCollection(
            'a_simple_create_drop_collection',
            { capped: true, size: 10000, max: 1000, w: 1 },
            function (err, collection) {
              expect(err).to.not.exist;

              // Insert a document in the capped collection
              collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function (
                err,
                result
              ) {
                test.ok(result);
                expect(err).to.not.exist;

                // Drop the collection from this world
                db.dropCollection('a_simple_create_drop_collection', function (err, result) {
                  test.ok(result);
                  expect(err).to.not.exist;

                  // Verify that the collection is gone
                  db.listCollections({ name: 'a_simple_create_drop_collection' }).toArray(function (
                    err,
                    names
                  ) {
                    test.equal(0, names.length);

                    client.close(done);
                  });
                });
              });
            }
          );
        });
      });
      // END
    }
  });

  /**
   * A simple example executing a command against the server.
   *
   * @example-class Db
   * @example-method command
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGone', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Execute ping against the server
        db.command({ ping: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

          client.close(done);
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
  it('shouldCorrectlyRenameACollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Create a collection
        db.createCollection('simple_rename_collection', configuration.writeConcernMax(), function (
          err,
          collection
        ) {
          expect(err).to.not.exist;

          // Insert a document in the collection
          collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Retrieve the number of documents from the collection
            collection.count(function (err, count) {
              test.equal(1, count);

              // Rename the collection
              db.renameCollection(
                'simple_rename_collection',
                'simple_rename_collection_2',
                function (err, collection2) {
                  expect(err).to.not.exist;

                  // Retrieve the number of documents from the collection
                  collection2.count(function (err, count) {
                    test.equal(1, count);

                    // Verify that the collection is gone
                    db.listCollections({ name: 'simple_rename_collection' }).toArray(function (
                      err,
                      names
                    ) {
                      test.equal(0, names.length);

                      // Verify that the new collection exists
                      db.listCollections({ name: 'simple_rename_collection_2' }).toArray(function (
                        err,
                        names
                      ) {
                        test.equal(1, names.length);

                        client.close(done);
                      });
                    });
                  });
                }
              );
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A more complex createIndex using a compound unique index in the background and dropping duplicated documents
   *
   * @example-class Db
   * @example-method createIndex
   */
  it('shouldCreateOnDbComplexIndexOnTwoFields', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('more_complex_index_test');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            db.createIndex(
              'more_complex_index_test',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Show that duplicate records got dropped
                collection.find({}).toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function (err, explanation) {
                    expect(err).to.not.exist;
                    test.ok(explanation != null);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * A more complex ensureIndex using a compound unique index in the background and dropping duplicated documents.
   *
   * @example-class Db
   * @example-method ensureIndex
   */
  it('shouldCreateComplexEnsureIndexDb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection we want to drop later
        var collection = db.collection('more_complex_ensure_index_db_test');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Create an index on the a field
            db.ensureIndex(
              'more_complex_ensure_index_db_test',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function (err, indexName) {
                test.ok(indexName);
                expect(err).to.not.exist;

                // Show that duplicate records got dropped
                collection.find({}).toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function (err, explanation) {
                    expect(err).to.not.exist;
                    test.ok(explanation != null);

                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
      // END
    }
  });

  /**
   * An examples showing the dropping of a database
   *
   * @example-class Db
   * @example-method dropDatabase
   */
  it('should correctly drop the database', {
    metadata: { requires: { topology: ['single'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('more_index_information_test_1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [
            { a: 1, b: 1 },
            { a: 1, b: 1 },
            { a: 2, b: 2 },
            { a: 3, b: 3 },
            { a: 4, b: 4 }
          ],
          configuration.writeConcernMax(),
          function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Let's drop the database
            db.dropDatabase(function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;

              // Wait two seconds to let it replicate across
              setTimeout(function () {
                // Get the admin database
                db.admin().listDatabases(function (err, dbs) {
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

                  client.close(done);
                });
              }, 2000);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * An example showing how to retrieve the db statistics
   *
   * @example-class Db
   * @example-method stats
   */
  it('shouldCorrectlyRetrieveDbStats', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        db.stats(function (err, stats) {
          expect(err).to.not.exist;
          test.ok(stats != null);

          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Simple example connecting to two different databases sharing the socket connections below.
   *
   * @example-class Db
   * @example-method db
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstances', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Reference a different database sharing the same connections
        // for the data transfer
        var secondDb = client.db('integration_tests_2');

        // Fetch the collections
        var multipleColl1 = db.collection('multiple_db_instances');
        var multipleColl2 = secondDb.collection('multiple_db_instances');

        // Write a record into each and then count the records stored
        multipleColl1.insertOne({ a: 1 }, { w: 1 }, function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

          multipleColl2.insertOne({ a: 1 }, { w: 1 }, function (err, result) {
            test.ok(result);
            expect(err).to.not.exist;

            // Count over the results ensuring only on record in each collection
            multipleColl1.count(function (err, count) {
              test.equal(1, count);

              multipleColl2.count(function (err, count) {
                test.equal(1, count);

                client.close(done);
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * Simple replicaset connection setup, requires a running replicaset on the correct ports
   *
   * @example-class Db
   * @example-method open
   */
  it('Should correctly connect with default replicasetNoOption', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function (done) {
      var configuration = this.configuration;

      // Replica configuration
      var client = new Topology(
        [
          { host: configuration.host, port: configuration.port },
          { host: configuration.host, port: configuration.port + 1 },
          { host: configuration.host, port: configuration.port + 2 }
        ],
        { replicaSet: configuration.replicasetName }
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        client.close(done);
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
   * Retrieve the buildInfo for the current MongoDB instance
   *
   * @example-class Admin
   * @example-method buildInfo
   */
  it('shouldCorrectlyRetrieveBuildInfo', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrieve the build information for the MongoDB instance
        adminDb.buildInfo(function (err, info) {
          test.ok(info);
          expect(err).to.not.exist;

          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Retrieve the buildInfo using the command function
   *
   * @example-class Admin
   * @example-method command
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommand', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);

        // Use the admin database for the operation
        var adminDb = db.admin();
        // Retrieve the build information using the admin command
        adminDb.command({ buildInfo: 1 }, function (err, info) {
          test.ok(info);
          expect(err).to.not.exist;

          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current profiling level set for the MongoDB instance
   *
   * @example-class Db
   * @example-method profilingLevel
   */
  it('shouldCorrectlySetDefaultProfilingLevel', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);

        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function (err, doc) {
          test.ok(doc);
          expect(err).to.not.exist;

          // Use the admin database for the operation
          var adminDb = client.db('admin');

          // Retrieve the profiling level
          adminDb.profilingLevel(function (err, level) {
            test.ok(level);
            expect(err).to.not.exist;

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An example of how to use the profilingInfo
   * Use this command to pull back the profiling information currently set for Mongodb
   *
   * @example-class Db
   * @example-method profilingInfo
   */
  it('shouldCorrectlySetAndExtractProfilingInfo', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);

        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function (err, doc) {
          test.ok(doc);
          expect(err).to.not.exist;

          // Use the admin database for the operation
          // Set the profiling level to all
          db.setProfilingLevel('all', function (err, level) {
            test.ok(level);
            expect(err).to.not.exist;

            // Execute a query command
            collection.find().toArray(function (err, items) {
              expect(err).to.not.exist;
              test.ok(items.length > 0);

              // Turn off profiling
              db.setProfilingLevel('off', function (err, level) {
                test.ok(level);
                expect(err).to.not.exist;

                // Retrieve the profiling information
                db.profilingInfo(function (err, infos) {
                  expect(err).to.not.exist;
                  test.ok(infos.constructor === Array);
                  test.ok(infos.length >= 1);
                  test.ok(infos[0].ts.constructor === Date);
                  test.ok(infos[0].millis.constructor === Number);

                  client.close(done);
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
   * An example of how to use the validateCollection command
   * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
   *
   * @example-class Admin
   * @example-method validateCollection
   */
  it('shouldCorrectlyCallValidateCollection', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function (err, doc) {
          test.ok(doc);
          expect(err).to.not.exist;

          // Use the admin database for the operation
          var adminDb = db.admin();

          // Validate the 'test' collection
          adminDb.validateCollection('test', function (err, doc) {
            test.ok(doc);
            expect(err).to.not.exist;

            client.close(done);
          });
        });
      });
    }
  });

  /**
   * An example of how to add a user to the admin database
   *
   * @example-class Admin
   * @example-method ping
   */
  it('shouldCorrectlyPingTheMongoDbInstance', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Ping the server
        adminDb.ping(function (err, pingResult) {
          test.ok(pingResult);
          expect(err).to.not.exist;

          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * An example of how to add a user to the admin database
   *
   * @example-class Admin
   * @example-method addUser
   */
  it('shouldCorrectlyAddAUserToAdminDb', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin11', 'admin11', function (err, result) {
          expect(err).to.not.exist;
          test.ok(result);

          adminDb.removeUser('admin11', function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);

            client.close(done);
          });
        });
      });
    }
  });

  /**
   * An example of how to remove a user from the admin database
   *
   * @example-class Admin
   * @example-method removeUser
   */
  it('shouldCorrectlyAddAUserAndRemoveItFromAdminDb', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin12', 'admin12', function (err, result) {
          test.ok(result);

          // Remove the user
          adminDb.removeUser('admin12', function (err, result) {
            expect(err).to.not.exist;
            test.equal(true, result);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * An example of listing all available databases.
   *
   * @example-class Admin
   * @example-method listDatabases
   */
  it('should correctly list all available databases', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Use the admin database for the operation
        var adminDb = db.admin();

        // List all the available databases
        adminDb.listDatabases(function (err, dbs) {
          expect(err).to.not.exist;
          test.ok(dbs.databases.length > 0);

          client.close(done);
        });
      });
      // END
    }
  });

  it('should correctly list all available databases names and no database sizes', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=3.2.13'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Use the admin database for the operation
        var adminDb = db.admin();

        // List all the available databases
        adminDb.listDatabases({ nameOnly: 1 }, function (err, dbs) {
          expect(err).to.not.exist;
          expect(dbs.databases).to.containSubset([{ name: 'admin' }]);

          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current server Info
   *
   * @example-class Admin
   * @example-method serverStatus
   */
  it('shouldCorrectlyRetrieveServerInfo', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function (err, doc) {
          test.ok(doc);
          expect(err).to.not.exist;

          // Use the admin database for the operation
          var adminDb = db.admin();

          // Retrieve the server Info
          adminDb.serverStatus(function (err, info) {
            expect(err).to.not.exist;
            test.ok(info != null);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Retrieve the current replicaset status if the server is running as part of a replicaset
   *
   * @example-class Admin
   * @example-method replSetGetStatus
   */
  it('shouldCorrectlyRetrieveReplSetGetStatus', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function (err, doc) {
          test.ok(doc);
          expect(err).to.not.exist;

          // Use the admin database for the operation
          var adminDb = db.admin();

          // Retrieve the server Info, returns error if we are not
          // running a replicaset
          adminDb.replSetGetStatus(function (err, info) {
            test.ok(info);
            expect(err).to.not.exist;

            client.close(done);
          });
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
   * An example showing the information returned by indexInformation
   *
   * @example-class Cursor
   * @example-method toArray
   */
  it('shouldCorrectlyExecuteToArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection to hold our documents
        var collection = db.collection('test_array');

        // Insert a test document
        collection.insertOne({ b: [1, 2, 3] }, configuration.writeConcernMax(), function (
          err,
          ids
        ) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Retrieve all the documents in the collection
          collection.find().toArray(function (err, documents) {
            test.equal(1, documents.length);
            test.deepEqual([1, 2, 3], documents[0].b);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example iterating over a query using the each function of the cursor.
   *
   * @example-class Cursor
   * @example-method each
   */
  it('shouldCorrectlyFailToArrayDueToFinishedEachOperation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('test_to_a_after_each');

        // Insert a document in the collection
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Grab a cursor
          var cursor = collection.find();
          // Execute the each command, triggers for each document
          cursor.each(function (err, item) {
            // If the item is null then the cursor is exhausted/empty and closed
            if (item == null) {
              // Show that the cursor is closed
              cursor.toArray(function (err, items) {
                test.ok(items);
                expect(err).to.not.exist;

                // Let's close the db
                client.close(done);
              });
            }
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example iterating over a query using the forEach function of the cursor.
   *
   * @example-class Cursor
   * @example-method forEach
   */
  it('Should correctly iterate over cursor using forEach', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('test_to_a_after_for_each');

        // Insert a document in the collection
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Count of documents returned
          var count = 0;
          // Grab a cursor
          var cursor = collection.find();
          // Execute the each command, triggers for each document
          cursor.forEach(
            function (doc) {
              test.ok(doc != null);
              count = count + 1;
            },
            function (err) {
              expect(err).to.not.exist;
              test.equal(1, count);
              client.close(done);
            }
          );
        });
      });
      // END
    }
  });

  /**
   * An example showing the information returned by indexInformation
   *
   * @example-class Cursor
   * @example-method rewind
   */
  it('Should correctly rewind and restart cursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var docs = [];

        // Insert 100 documents with some data
        for (var i = 0; i < 100; i++) {
          var d = new Date().getTime() + i * 1000;
          docs[i] = { a: i, createdAt: new Date(d) };
        }

        // Create collection
        var collection = db.collection('Should_correctly_rewind_and_restart_cursor');

        // insert all docs
        collection.insertMany(docs, configuration.writeConcernMax(), function (err, result) {
          test.ok(result);
          expect(err).to.not.exist;

          // Grab a cursor using the find
          var cursor = collection.find({});
          // Fetch the first object off the cursor
          cursor.next(function (err, item) {
            test.equal(0, item.a);
            // Rewind the cursor, resetting it to point to the start of the query
            cursor.rewind();

            // Grab the first object again
            cursor.next(function (err, item) {
              test.equal(0, item.a);

              client.close(done);
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the count function of the cursor.
   *
   * @example-class Cursor
   * @example-method count
   */
  it('shouldCorrectlyUseCursorCountFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Creat collection
        var collection = db.collection('cursor_count_collection');

        // Insert some docs
        collection.insertMany([{ a: 1 }, { a: 2 }], configuration.writeConcernMax(), function (
          err,
          docs
        ) {
          test.ok(docs);
          expect(err).to.not.exist;

          // Do a find and get the cursor count
          collection.find().count(function (err, count) {
            expect(err).to.not.exist;
            test.equal(2, count);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of sort on the cursor.
   *
   * @example-class Cursor
   * @example-method sort
   */
  it('shouldCorrectlyPerformSimpleSorts', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('simple_sort_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Do normal ascending sort
            collection
              .find()
              .sort({ a: 1 })
              .next(function (err, item) {
                expect(err).to.not.exist;
                test.equal(1, item.a);

                // Do normal descending sort, with new syntax that enforces ordering of sort keys
                collection
                  .find()
                  .sort([['a', -1]])
                  .next(function (err, item) {
                    expect(err).to.not.exist;
                    test.equal(3, item.a);

                    client.close(done);
                  });
              });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example showing the use of limit on the cursor
   *
   * @example-class Cursor
   * @example-method limit
   */
  it('shouldCorrectlyPerformLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('simple_limit_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Limit to only one document returned
            collection
              .find()
              .limit(1)
              .toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal(1, items.length);

                client.close(done);
              });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example showing the use of skip on the cursor
   *
   * @example-class Cursor
   * @example-method skip
   */
  it('shouldCorrectlyPerformSkipOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('simple_skip_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Skip one document
            collection
              .find()
              .skip(1)
              .next(function (err, item) {
                expect(err).to.not.exist;
                test.equal(2, item.a);

                client.close(done);
              });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example showing the use of batchSize on the cursor, batchSize only regulates how many
   * documents are returned for each batch using the getMoreCommand against the MongoDB server
   *
   * @example-class Cursor
   * @example-method batchSize
   */
  it('shouldCorrectlyPerformBatchSizeOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('simple_batch_size_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Do normal ascending sort
            const cursor = collection.find().batchSize(1);
            cursor.next(function (err, item) {
              expect(err).to.not.exist;
              test.equal(1, item.a);

              // Need to close cursor, since it was not exhausted,
              // and implicit session is still open
              cursor.close();
              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example showing the use of next.
   *
   * @example-class Cursor
   * @example-method next
   */
  it('shouldCorrectlyPerformNextOnCursorWithCallbacks', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('simple_next_object_collection_with_next');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Do normal ascending sort
            var cursor = collection.find();
            // Perform hasNext check
            cursor.hasNext(function (err, r) {
              expect(err).to.not.exist;
              test.ok(r);

              cursor.next(function (err, r) {
                expect(err).to.not.exist;
                test.equal(1, r.a);

                cursor.hasNext(function (err, r) {
                  expect(err).to.not.exist;
                  test.ok(r);

                  cursor.next(function (err, r) {
                    expect(err).to.not.exist;
                    test.equal(2, r.a);

                    cursor.hasNext(function (err, r) {
                      expect(err).to.not.exist;
                      test.ok(r);

                      cursor.next(function (err, r) {
                        expect(err).to.not.exist;
                        test.equal(3, r.a);

                        cursor.hasNext(function (err, r) {
                          expect(err).to.not.exist;
                          test.ok(!r);

                          client.close(done);
                        });
                      });
                    });
                  });
                });
              });
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor explain function.
   *
   * @example-class Cursor
   * @example-method explain
   */
  it('shouldCorrectlyPerformSimpleExplainCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a collection
        var collection = db.collection('simple_explain_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function (err, docs) {
            test.ok(docs);
            expect(err).to.not.exist;

            // Do normal ascending sort
            collection.find().explain(function (err, explanation) {
              test.ok(explanation);
              expect(err).to.not.exist;

              client.close(done);
            });
          }
        );
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor stream function.
   *
   * @example-class Cursor
   * @example-method stream
   */
  it('shouldStreamDocumentsUsingTheStreamFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_stream_function');

        // Insert documents into collection
        collection.insertMany(docs, configuration.writeConcernMax(), function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Perform a find to get a cursor
          var stream = collection.find().stream();

          // Execute find on all the documents
          stream.on('end', function () {
            client.close(done);
          });

          stream.on('data', function (data) {
            test.ok(data != null);
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor close function.
   *
   * @example-class Cursor
   * @example-method isClosed
   */
  it('shouldStreamDocumentsUsingTheIsCloseFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_is_close_function_on_cursor');

        // Insert documents into collection
        collection.insertMany(docs, configuration.writeConcernMax(), function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Perform a find to get a cursor
          var cursor = collection.find();

          // Fetch the first object
          cursor.next(function (err, object) {
            test.ok(object);
            expect(err).to.not.exist;

            // Close the cursor, this is the same as reseting the query
            cursor.close(function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;
              test.equal(true, cursor.isClosed());

              client.close(done);
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursor close function.
   *
   * @example-class Cursor
   * @example-method close
   */
  it('shouldStreamDocumentsUsingTheCloseFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_close_function_on_cursor');

        // Insert documents into collection
        collection.insertMany(docs, configuration.writeConcernMax(), function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Perform a find to get a cursor
          var cursor = collection.find();

          // Fetch the first object
          cursor.next(function (err, object) {
            test.ok(object);
            expect(err).to.not.exist;

            // Close the cursor, this is the same as reseting the query
            cursor.close(function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;

              client.close(done);
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursorstream pause function.
   *
   * @example-class Cursor
   * @example-method stream
   */
  it('shouldStreamDocumentsUsingTheCursorStreamPauseFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a lot of documents to insert
        var docs = [];
        var fetchedDocs = [];
        for (var i = 0; i < 2; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_cursorstream_pause');

        // Insert documents into collection
        collection.insertMany(docs, { w: 1 }, function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Perform a find to get a cursor
          var stream = collection.find().stream();

          // For each data item
          stream.on('data', function (item) {
            fetchedDocs.push(item);
            // Pause stream
            stream.pause();

            // Restart the stream after 1 miliscecond
            setTimeout(function () {
              fetchedDocs.push(null);
              stream.resume();
            }, 1);
          });

          // When the stream is done
          stream.on('end', function () {
            expect(fetchedDocs[1]).to.not.exist;
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the cursorstream resume function.
   *
   * @example-class Cursor
   * @example-method destroy
   */
  it('shouldStreamDocumentsUsingTheCursorStreamDestroyFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 1; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_cursorstream_destroy');

        // Insert documents into collection
        collection.insertMany(docs, { w: 1 }, function (err, ids) {
          test.ok(ids);
          expect(err).to.not.exist;

          // Perform a find to get a cursor
          var stream = collection.find().stream();

          // For each data item
          stream.on('data', function () {
            // Destroy stream
            stream.destroy();
          });

          // When the stream is done
          stream.on('close', function () {
            client.close(done);
          });
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
   * Example of a simple url connection string to a replicaset, with acknowledgement of writes.
   *
   * @example-class MongoClient
   */
  it('Should correctly connect to a replicaset', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function (done) {
      var configuration = this.configuration;

      // Create url
      var url = f(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        f('%s:%s', configuration.host, configuration.port),
        f('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      const client = configuration.newClient(url);
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        test.ok(db != null);

        db.collection('replicaset_mongo_client_collection').updateOne(
          { a: 1 },
          { $set: { b: 1 } },
          { upsert: true },
          function (err, result) {
            expect(err).to.not.exist;
            test.equal(1, result.result.n);

            client.close(done);
          }
        );
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string to a shard, with acknowledgement of writes.
   *
   * @example-class MongoClient
   */
  it('Should connect to mongos proxies using connectiong string', {
    metadata: { requires: { topology: 'sharded' } },

    test: function (done) {
      var configuration = this.configuration;
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url);
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        test.ok(db != null);

        db.collection('replicaset_mongo_client_collection').updateOne(
          { a: 1 },
          { $set: { b: 1 } },
          { upsert: true },
          function (err, result) {
            expect(err).to.not.exist;
            test.equal(1, result.upsertedCount);

            client.close(done);
          }
        );
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string for a single server connection
   *
   * @example-class MongoClient
   */
  it('Should correctly connect using MongoClient to a single server using connect', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27017/integration_tests', {
        native_parser: true
      });

      // DOC_START
      // Connect using the connection string
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        db.collection('mongoclient_test').updateOne(
          { a: 1 },
          { $set: { b: 1 } },
          { upsert: true },
          function (err, result) {
            expect(err).to.not.exist;
            test.equal(1, result.result.n);

            client.close(done);
          }
        );
      });
      // END
    }
  });

  /**************************************************************************
   *
   * OBJECTID TESTS
   *
   *************************************************************************/

  /**
   * Generate 12 byte binary string representation using a second based timestamp or
   * default value
   *
   * @example-class ObjectId
   * @example-method getTimestamp
   */
  it('shouldCorrectlyGenerate12ByteStringFromTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // LINE var ObjectId = require('mongodb').ObjectId,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Get a timestamp in seconds
      var timestamp = Math.floor(new Date().getTime() / 1000);
      // Create a date with the timestamp
      var timestampDate = new Date(timestamp * 1000);

      // Create a new ObjectId with a specific timestamp
      var objectId = new ObjectId(timestamp);

      // Get the timestamp and validate correctness
      test.equal(timestampDate.toString(), objectId.getTimestamp().toString());
      done();
      // END
    }
  });

  /**
   * Generate a 24 character hex string representation of the ObjectId
   *
   * @example-class ObjectId
   * @example-method toHexString
   */
  it('shouldCorrectlyRetrieve24CharacterHexStringFromToHexString', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // LINE var ObjectId = require('mongodb').ObjectId,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toHexString().length);
      done();
      // END
    }
  });

  /**
   * Get and set the generation time for an ObjectId
   *
   * @example-class ObjectId
   * @example-method generationTime
   */
  it('shouldCorrectlyGetAndSetObjectIdUsingGenerationTimeProperty', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // LINE var ObjectId = require('mongodb').ObjectId,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Get the generation time
      var generationTime = objectId.generationTime;
      // Add 1000 milliseconds to the generation time
      objectId.generationTime = generationTime + 1000;

      // Create a timestamp
      var timestampDate = new Date();
      timestampDate.setTime((generationTime + 1000) * 1000);

      // Get the timestamp and validate correctness
      test.equal(timestampDate.toString(), objectId.getTimestamp().toString());
      done();
      // END
    }
  });

  /**
   * Convert a ObjectId into a hex string representation and then back to an ObjectId
   *
   * @example-class ObjectId
   * @example-method createFromHexString
   */
  it('shouldCorrectlyTransformObjectIdToHexAndObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // LINE var ObjectId = require('mongodb').ObjectId,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Convert the object id to a hex string
      var originalHex = objectId.toHexString();
      // Create a new ObjectId using the createFromHexString function
      var newObjectId = ObjectId.createFromHexString(originalHex);
      // Convert the new ObjectId back into a hex string using the toHexString function
      var newHex = newObjectId.toHexString();
      // Compare the two hex strings
      test.equal(originalHex, newHex);
      done();
      // END
    }
  });

  /**
   * Compare two different ObjectId's using the equals method
   *
   * @example-class ObjectId
   * @example-method equals
   */
  it('shouldCorrectlyDifferentiateBetweenObjectIdInstances', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // LINE var ObjectId = require('mongodb').ObjectId,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Create a new ObjectId Based on the first ObjectId
      var objectId2 = new ObjectId(objectId.id);
      // Create another ObjectId
      var objectId3 = new ObjectId();
      // objectId and objectId2 should be the same
      test.ok(objectId.equals(objectId2));
      // objectId and objectId2 should be different
      test.ok(!objectId.equals(objectId3));
      done();
      // END
    }
  });

  /**
   * Show the usage of the Objectid createFromTime function
   *
   * @example-class ObjectId
   * @example-method ObjectId.createFromTime
   */
  it('shouldCorrectlyUseCreateFromTime', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // LINE var ObjectId = require('mongodb').ObjectId,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      var objectId = ObjectId.createFromTime(1);
      test.equal('000000010000000000000000', objectId.toHexString());
      done();
      // END
    }
  });

  /**************************************************************************
   *
   * BULK TESTS
   *
   *************************************************************************/

  /**
   * Example of a simple ordered insert/update/upsert/remove ordered collection
   *
   * @example-class Collection
   * @example-method initializeOrderedBulkOp
   */
  it('Should correctly execute ordered batch with no errors using write commands', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('batch_write_ordered_ops_0');
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
        batch.execute(function (err, result) {
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
          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Example of a simple ordered insert/update/upsert/remove ordered collection
   *
   *
   * @example-class Collection
   * @example-method initializeUnorderedBulkOp
   */
  it('Should correctly execute unordered batch with no errors', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('batch_write_unordered_ops_legacy_0');
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
        batch.execute(function (err, result) {
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
          client.close(done);
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
   * Example of a simple insertOne operation
   *
   * @example-class Collection
   * @example-method insertOne
   */
  it('Should correctly execute insertOne operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('insert_one');
        col.insertOne({ a: 1 }, function (err, r) {
          expect(err).to.not.exist;
          test.equal(1, r.insertedCount);
          // Finish up test
          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Example of a simple insertMany operation
   *
   * @example-class Collection
   * @example-method insertMany
   */
  it('Should correctly execute insertMany operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('insert_many');
        col.insertMany([{ a: 1 }, { a: 2 }], function (err, r) {
          expect(err).to.not.exist;
          test.equal(2, r.insertedCount);
          // Finish up test
          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Example of a simple updateOne operation
   *
   * @example-class Collection
   * @example-method updateOne
   */
  it('Should correctly execute updateOne operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('update_one');
        col.updateOne({ a: 1 }, { $set: { a: 2 } }, { upsert: true }, function (err, r) {
          expect(err).to.not.exist;
          test.equal(0, r.matchedCount);
          test.equal(1, r.upsertedCount);
          // Finish up test
          client.close(done);
        });
      });
      // END
    }
  });

  /**
   * Example of a simple updateMany operation
   *
   * @example-class Collection
   * @example-method updateMany
   */
  it('Should correctly execute updateMany operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('update_many');
        col.insertMany([{ a: 1 }, { a: 1 }], function (err, r) {
          expect(err).to.not.exist;
          test.equal(2, r.insertedCount);

          // Update all documents
          col.updateMany({ a: 1 }, { $set: { b: 1 } }, function (err, r) {
            expect(err).to.not.exist;
            test.equal(2, r.matchedCount);
            test.equal(2, r.modifiedCount);

            // Finish up test
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of a simple removeOne operation
   *
   * @example-class Collection
   * @example-method removeOne
   */
  it('Should correctly execute removeOne operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('remove_one');
        col.insertMany([{ a: 1 }, { a: 1 }], function (err, r) {
          expect(err).to.not.exist;
          test.equal(2, r.insertedCount);

          col.removeOne({ a: 1 }, function (err, r) {
            expect(err).to.not.exist;
            test.equal(1, r.deletedCount);
            // Finish up test
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of a simple removeMany operation
   *
   * @example-class Collection
   * @example-method removeMany
   */
  it('Should correctly execute removeMany operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('remove_many');
        col.insertMany([{ a: 1 }, { a: 1 }], function (err, r) {
          expect(err).to.not.exist;
          test.equal(2, r.insertedCount);

          // Update all documents
          col.removeMany({ a: 1 }, function (err, r) {
            expect(err).to.not.exist;
            test.equal(2, r.deletedCount);

            // Finish up test
            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of a simple bulkWrite operation
   *
   * @example-class Collection
   * @example-method bulkWrite
   */
  it('Should correctly execute bulkWrite operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('bulk_write');
        col.bulkWrite(
          [
            { insertOne: { document: { a: 1 } } },
            { updateOne: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { updateMany: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { deleteOne: { filter: { c: 1 } } },
            { deleteMany: { filter: { c: 1 } } },
            { replaceOne: { filter: { c: 3 }, replacement: { c: 4 }, upsert: true } }
          ],
          { ordered: true, w: 1 },
          function (err, r) {
            expect(err).to.not.exist;
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
            client.close(done);
          }
        );
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndDelete operation
   *
   * @example-class Collection
   * @example-method findOneAndDelete
   */
  it('Should correctly execute findOneAndDelete operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('find_one_and_delete');
        col.insertMany([{ a: 1, b: 1 }], { w: 1 }, function (err, r) {
          expect(err).to.not.exist;
          test.equal(1, r.result.n);

          col.findOneAndDelete({ a: 1 }, { projection: { b: 1 }, sort: { a: 1 } }, function (
            err,
            r
          ) {
            expect(err).to.not.exist;
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndReplace operation
   *
   * @example-class Collection
   * @example-method findOneAndReplace
   */
  it('Should correctly execute findOneAndReplace operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('find_one_and_replace');
        col.insertMany([{ a: 1, b: 1 }], { w: 1 }, function (err, r) {
          expect(err).to.not.exist;
          test.equal(1, r.result.n);

          col.findOneAndReplace(
            { a: 1 },
            { c: 1, b: 1 },
            {
              projection: { b: 1, c: 1 },
              sort: { a: 1 },
              returnOriginal: false,
              upsert: true
            },
            function (err, r) {
              expect(err).to.not.exist;
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.c);

              client.close(done);
            }
          );
        });
      });
      // END
    }
  });

  /**
   * Example of a simple findOneAndUpdate operation
   *
   * @example-class Collection
   * @example-method findOneAndUpdate
   */
  it('Should correctly execute findOneAndUpdate operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        // Get the collection
        var col = db.collection('find_one_and_update');
        col.insertMany([{ a: 1, b: 1 }], { w: 1 }, function (err, r) {
          expect(err).to.not.exist;
          test.equal(1, r.result.n);

          col.findOneAndUpdate(
            { a: 1 },
            { $set: { d: 1 } },
            {
              projection: { b: 1, d: 1 },
              sort: { a: 1 },
              returnOriginal: false,
              upsert: true
            },
            function (err, r) {
              expect(err).to.not.exist;
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.d);

              client.close(done);
            }
          );
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the listening to a capped collection
   *
   * @example-class Db
   * @example-method createCollection
   */
  it('Should correctly add capped collection options to cursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function (err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect(function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        // Create a capped collection with a maximum of 1000 documents
        db.createCollection(
          'a_simple_collection_2',
          { capped: true, size: 100000, max: 10000, w: 1 },
          function (err, collection) {
            expect(err).to.not.exist;

            var docs = [];
            for (var i = 0; i < 1000; i++) docs.push({ a: i });

            // Insert a document in the capped collection
            collection.insertMany(docs, configuration.writeConcernMax(), function (err, result) {
              test.ok(result);
              expect(err).to.not.exist;

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
                client.close(true, done);
              });
            });
          }
        );
      });
      // END
    }
  });
});
