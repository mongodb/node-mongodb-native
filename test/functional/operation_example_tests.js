'use strict';
const test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  f = require('util').format,
  expect = require('chai').expect,
  Buffer = require('safe-buffer').Buffer;

describe('Operation Examples', function() {
  before(function() {
    return setupDatabase(this.configuration);
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.equal(null, err);
          test.ok(result);

          // Execute aggregate, notice the pipeline is expressed as an Array
          collection.aggregate(
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
            function(err, cursor) {
              test.equal(null, err);

              cursor.toArray(function(err, result) {
                test.equal(null, err);
                test.equal('good', result[0]._id.tags);
                test.deepEqual(['bob'], result[0].authors);
                test.equal('fun', result[1]._id.tags);
                test.deepEqual(['bob'], result[1].authors);

                client.close();
                done();
              });
            }
          );
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.equal(null, err);
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
          cursor.toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(2, docs.length);
            done();
            client.close();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.equal(null, err);
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
          cursor.toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(2, docs.length);
            client.close();
            done();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

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
          cursor.next(function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Need to close cursor since cursor is not
            // exhausted, and implicit session is still open
            cursor.close();
            client.close();
            done();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

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
          cursor.each(function(err, docs) {
            test.equal(null, err);

            if (docs == null) {
              done();
              client.close();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

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
            function(doc) {
              test.ok(doc != null);
              count = count + 1;
            },
            function(err) {
              test.equal(null, err);
              test.equal(2, count);

              done();
              client.close();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        collection.insertMany(docs, { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

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
          cursor.on('data', function() {
            count = count + 1;
          });

          cursor.once('end', function() {
            test.equal(2, count);
            done();
            client.close();
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
   * @ignore
   */
  it('shouldCorrectlyDoSimpleCountExamples', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Crete the collection for the distinct example
        var collection = db.collection('countExample1');
        // Insert documents to perform distinct against
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4, b: 1 }], { w: 1 }, function(
          err,
          ids
        ) {
          test.ok(ids);
          test.equal(null, err);

          // Perform a total count command
          collection.count(function(err, count) {
            test.equal(null, err);
            test.equal(4, count);

            // Perform a partial account where b=1
            collection.count({ b: 1 }, function(err, count) {
              test.equal(null, err);
              test.equal(1, count);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldCreateComplexIndexOnTwoFields', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.createIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Show that duplicate records got dropped
                collection.find({}).toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function(err, explanation) {
                    test.equal(null, err);
                    test.ok(explanation != null);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCreateASimpleIndexOnASingleField', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample2');
        // Insert a bunch of documents for the index
        collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }], { w: 1 }, function(
          err,
          result
        ) {
          test.ok(result);
          test.equal(null, err);

          // Create an index on the a field
          collection.createIndex('a', { w: 1 }, function(err, indexName) {
            test.equal('a_1', indexName);

            // Perform a query, with explain to show we hit the query
            collection.find({ a: 2 }).explain(function(err, explanation) {
              test.equal(null, err);
              test.ok(explanation != null);

              client.close();
              done();
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
   * @ignore
   */
  it('createIndexExample3', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('createIndexExample3');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          { w: 1 },
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            var options = { unique: true, background: true, w: 1 };
            // Create an index on the a field
            collection.createIndex({ a: 1, b: 1 }, options, function(err, indexName) {
              test.ok(indexName);
              test.equal(null, err);

              test.ok(!options.readPreference);
              // Show that duplicate records got dropped
              collection.find({}).toArray(function(err, items) {
                test.equal(null, err);
                test.equal(4, items.length);

                // Perform a query, with explain to show we hit the query
                collection.find({ a: 2 }).explain(function(err, explanation) {
                  test.equal(null, err);
                  test.ok(explanation != null);

                  client.close();
                  done();
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
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexesWithSubQueryFilter', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
          function(err, ids) {
            test.ok(ids);
            test.equal(null, err);

            // Perform a distinct query against the a field
            collection.distinct('a', function(err, docs) {
              test.deepEqual([0, 1, 2, 3], docs.sort());

              // Perform a distinct query against the sub-field b.c
              collection.distinct('b.c', function(err, docs) {
                test.deepEqual(['a', 'b', 'c'], docs.sort());

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyHandleDistinctIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
          function(err, ids) {
            test.ok(ids);
            test.equal(null, err);

            // Perform a distinct query with a filter against the documents
            collection.distinct('a', { c: 1 }, function(err, docs) {
              test.deepEqual([5], docs.sort());

              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyDropCollectionWithDropFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('test_other_drop');

        // Drop the collection
        collection.drop(function(err, reply) {
          expect(err).to.exist;
          expect(reply).to.not.exist;

          // Ensure we don't have the collection in the set of names
          db.listCollections().toArray(function(err, replies) {
            var found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function(document) {
              if (document.name === 'test_other_drop') {
                found = true;
                return;
              }
            });

            // Ensure the collection is not found
            test.equal(false, found);

            // Let's close the db
            client.close();
            done();
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
   * @ignore
   */
  it('dropAllIndexesExample1', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        db.createCollection('dropExample1', function(err, r) {
          test.ok(r);
          test.equal(null, err);

          // Drop the collection
          db.collection('dropExample1').dropAllIndexes(function(err, reply) {
            test.ok(reply);
            test.equal(null, err);

            // Let's close the db
            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyCreateAndDropIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('dropIndexExample1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          { w: 1 },
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Drop the index
                collection.dropIndex('a_1_b_1', function(err, result) {
                  test.ok(result);
                  test.equal(null, err);

                  // Verify that the index is gone
                  collection.indexInformation(function(err, indexInformation) {
                    test.deepEqual([['_id', 1]], indexInformation._id_);
                    test.equal(undefined, indexInformation.a_1_b_1);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCreateComplexEnsureIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('ensureIndexExample1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            db.ensureIndex(
              'ensureIndexExample1',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Show that duplicate records got dropped
                collection.find({}).toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function(err, explanation) {
                    test.equal(null, err);
                    test.ok(explanation != null);

                    client.close();
                    done();
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
   * @ignore
   */
  it('ensureIndexExampleWithCompountIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('ensureIndexExample2');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          { w: 1 },
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Show that duplicate records got dropped
                collection.find({}).toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function(err, explanation) {
                    test.equal(null, err);
                    test.ok(explanation != null);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldPerformASimpleQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('simple_query');

        // Insert a bunch of documents for the testing
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Perform a simple find and return all the documents
            collection.find().toArray(function(err, docs) {
              test.equal(null, err);
              test.equal(3, docs.length);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldPerformASimpleExplainQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('simple_explain_query');
        // Insert a bunch of documents for the testing
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Perform a simple find and return all the documents
            collection.find({}).explain(function(err, explain) {
              test.equal(null, err);
              test.ok(explain != null);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldPerformASimpleLimitSkipQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_query');
        // Insert a bunch of documents for the testing
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Perform a simple find and return all the documents
            collection
              .find({})
              .skip(1)
              .limit(1)
              .project({ b: 1 })
              .toArray(function(err, docs) {
                test.equal(null, err);
                test.equal(1, docs.length);
                test.equal(undefined, docs[0].a);
                test.equal(2, docs[0].b);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldPerformSimpleFindAndModifyOperations', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_');

        // Insert some test documentations
        collection.insertMany(
          [{ a: 1 }, { b: 1 }, { c: 1 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Simple findAndModify command returning the new document
            collection.findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b1: 1 } },
              { new: true },
              function(err, doc) {
                test.equal(null, err);
                test.equal(1, doc.value.a);
                test.equal(1, doc.value.b1);

                // Simple findAndModify command returning the new document and
                // removing it at the same time
                collection.findAndModify(
                  { b: 1 },
                  [['b', 1]],
                  { $set: { b: 2 } },
                  { remove: true },
                  function(err, doc) {
                    test.ok(doc);
                    test.equal(null, err);

                    // Verify that the document is gone
                    collection.findOne({ b: 1 }, function(err, item) {
                      test.equal(null, err);
                      test.equal(null, item);

                      // Simple findAndModify command performing an upsert and returning the new document
                      // executing the command safely
                      collection.findAndModify(
                        { d: 1 },
                        [['b', 1]],
                        { d: 1, f: 1 },
                        { new: true, upsert: true, w: 1 },
                        function(err, doc) {
                          test.equal(null, err);
                          test.equal(1, doc.value.d);
                          test.equal(1, doc.value.f);

                          client.close();
                          done();
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
   * @ignore
   */
  it('shouldPerformSimpleFindAndRemove', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('simple_find_and_modify_operations_2');
        // Insert some test documentations
        collection.insertMany(
          [{ a: 1 }, { b: 1, d: 1 }, { c: 1 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Simple findAndModify command returning the old document and
            // removing it at the same time
            collection.findAndRemove({ b: 1 }, [['b', 1]], function(err, doc) {
              test.equal(null, err);
              test.equal(1, doc.value.b);
              test.equal(1, doc.value.d);

              // Verify that the document is gone
              collection.findOne({ b: 1 }, function(err, item) {
                test.equal(null, err);
                test.equal(null, item);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldPerformASimpleLimitSkipFindOneQuery', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('simple_limit_skip_find_one_query');
        // Insert a bunch of documents for the testing
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Perform a simple find and return all the documents
            collection.findOne({ a: 2 }, { fields: { b: 1 } }, function(err, doc) {
              test.equal(null, err);
              test.equal(undefined, doc.a);
              test.equal(2, doc.b);

              client.close();
              done();
            });
          }
        );
      });
      // END
    }
  });

  /**
   * Example of a simple geoHaystackSearch query across some documents
   *
   * @example-class Collection
   * @example-method geoHaystackSearch
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleGeoHaystackSearchCommand', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch the collection
        var collection = db.collection('simple_geo_haystack_command');

        // Add a location based index
        collection.ensureIndex({ loc: 'geoHaystack', type: 1 }, { bucketSize: 1 }, function(
          err,
          result
        ) {
          test.ok(result);
          test.equal(null, err);

          // Save a new location tagged document
          collection.insertMany(
            [{ a: 1, loc: [50, 30] }, { a: 1, loc: [30, 50] }],
            configuration.writeConcernMax(),
            function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Use geoHaystackSearch command to find document
              collection.geoHaystackSearch(
                50,
                50,
                { search: { a: 1 }, limit: 1, maxDistance: 100 },
                function(err, docs) {
                  test.equal(1, docs.results.length);
                  client.close();
                  done();
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
   * A whole lot of different ways to execute the group command
   *
   * @example-class Collection
   * @example-method group
   * @ignore
   */
  it('shouldCorrectlyExecuteGroupFunction', {
    metadata: {
      requires: {
        mongodb: '<=4.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Code = configuration.require.Code;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('test_group');

        // Perform a simple group by on an empty collection
        collection.group([], {}, { count: 0 }, 'function (obj, prev) { prev.count++; }', function(
          err,
          results
        ) {
          test.deepEqual([], results);

          // Trigger some inserts on the collection
          collection.insertMany([{ a: 2 }, { b: 5 }, { a: 1 }], { w: 1 }, function(err, ids) {
            test.ok(ids);
            test.equal(null, err);

            // Perform a group count
            collection.group(
              [],
              {},
              { count: 0 },
              'function (obj, prev) { prev.count++; }',
              function(err, results) {
                test.equal(3, results[0].count);

                // Perform a group count using the eval method
                collection.group(
                  [],
                  {},
                  { count: 0 },
                  'function (obj, prev) { prev.count++; }',
                  false,
                  function(err, results) {
                    test.equal(3, results[0].count);

                    // Group with a conditional
                    collection.group(
                      [],
                      { a: { $gt: 1 } },
                      { count: 0 },
                      'function (obj, prev) { prev.count++; }',
                      function(err, results) {
                        // Results
                        test.equal(1, results[0].count);

                        // Group with a conditional using the EVAL method
                        collection.group(
                          [],
                          { a: { $gt: 1 } },
                          { count: 0 },
                          'function (obj, prev) { prev.count++; }',
                          false,
                          function(err, results) {
                            // Results
                            test.equal(1, results[0].count);

                            // Insert some more test data
                            collection.insertMany([{ a: 2 }, { b: 3 }], { w: 1 }, function(
                              err,
                              ids
                            ) {
                              test.ok(ids);
                              test.equal(null, err);

                              // Do a Group by field a
                              collection.group(
                                ['a'],
                                {},
                                { count: 0 },
                                'function (obj, prev) { prev.count++; }',
                                function(err, results) {
                                  // Results
                                  test.equal(2, results[0].a);
                                  test.equal(2, results[0].count);
                                  test.equal(null, results[1].a);
                                  test.equal(2, results[1].count);
                                  test.equal(1, results[2].a);
                                  test.equal(1, results[2].count);

                                  // Do a Group by field a
                                  collection.group(
                                    { a: true },
                                    {},
                                    { count: 0 },
                                    function(obj, prev) {
                                      prev.count++;
                                    },
                                    true,
                                    function(err, results) {
                                      // Results
                                      test.equal(2, results[0].a);
                                      test.equal(2, results[0].count);
                                      test.equal(null, results[1].a);
                                      test.equal(2, results[1].count);
                                      test.equal(1, results[2].a);
                                      test.equal(1, results[2].count);

                                      // Correctly handle illegal function
                                      collection.group([], {}, {}, '5 ++ 5', function(
                                        err,
                                        results
                                      ) {
                                        test.equal(null, results);
                                        test.ok(err.message != null);

                                        // Use a function to select the keys used to group by
                                        var keyf = function(doc) {
                                          return { a: doc.a };
                                        };
                                        collection.group(
                                          keyf,
                                          { a: { $gt: 0 } },
                                          { count: 0, value: 0 },
                                          function(obj, prev) {
                                            prev.count++;
                                            prev.value += obj.a;
                                          },
                                          true,
                                          function(err, results) {
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
                                            collection.group(
                                              keyf,
                                              { a: { $gt: 0 } },
                                              { count: 0, value: 0 },
                                              function(obj, prev) {
                                                prev.count++;
                                                prev.value += obj.a;
                                              },
                                              true,
                                              function(err, results) {
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
                                                collection.group(
                                                  [],
                                                  {},
                                                  {},
                                                  '5 ++ 5',
                                                  false,
                                                  function(err, results) {
                                                    test.equal(null, results);
                                                    test.ok(err.message != null);

                                                    client.close();
                                                    done();
                                                  }
                                                );
                                              }
                                            );
                                          }
                                        );
                                      });
                                    }
                                  );
                                }
                              );
                            });
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          });
        });
      });
      // END
    }
  });

  /**
   * A simple map reduce example
   *
   * @example-class Collection
   * @example-method mapReduce
   * @ignore
   */
  it('shouldPerformSimpleMapReduceFunctions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
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
          test.equal(null, err);

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
            test.equal(null, err);

            // Mapreduce returns the temporary collection with the results
            collection.findOne({ _id: 1 }, function(err, result) {
              test.equal(1, result.value);

              collection.findOne({ _id: 2 }, function(err, result) {
                test.equal(1, result.value);

                client.close();
                done();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('test_map_reduce_functions_inline');

        // Insert some test documents
        collection.insertMany([{ user_id: 1 }, { user_id: 2 }], { w: 1 }, function(err, r) {
          test.ok(r);
          test.equal(null, err);

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
          collection.mapReduce(map, reduce, { out: { inline: 1 }, verbose: true }, function(
            err,
            result
          ) {
            test.equal(2, result.results.length);
            test.ok(result.stats != null);

            collection.mapReduce(
              map,
              reduce,
              { out: { replace: 'mapreduce_integration_test' }, verbose: true },
              function(err, result) {
                test.ok(result.stats != null);
                client.close();
                done();
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
   * @ignore
   */
  it('shouldPerformMapReduceWithContext', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Code = configuration.require.Code;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('test_map_reduce_functions_scope');

        // Insert some test documents
        collection.insertMany(
          [{ user_id: 1, timestamp: new Date() }, { user_id: 2, timestamp: new Date() }],
          { w: 1 },
          function(err, r) {
            test.ok(r);
            test.equal(null, err);

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

            collection.mapReduce(map, reduce, o, function(err, outCollection) {
              test.equal(null, err);

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function(err, results) {
                test.equal(null, err);
                test.equal(2, results[0].value);

                // mapReduce with scope containing plain function
                var o = {};
                o.scope = { fn: t };
                o.out = { replace: 'replacethiscollection' };

                collection.mapReduce(map, reduce, o, function(err, outCollection) {
                  test.equal(null, err);

                  // Find all entries in the map-reduce collection
                  outCollection.find().toArray(function(err, results) {
                    test.equal(2, results[0].value);

                    client.close();
                    done();
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
   * @ignore
   */
  it.skip('shouldPerformMapReduceInContextObjects', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Code = configuration.require.Code;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('test_map_reduce_functions_scope_objects');

        // Insert some test documents
        collection.insertMany(
          [{ user_id: 1, timestamp: new Date() }, { user_id: 2, timestamp: new Date() }],
          { w: 1 },
          function(err, r) {
            test.ok(r);
            test.equal(null, err);

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

            collection.mapReduce(map, reduce, o, function(err, outCollection) {
              test.equal(null, err);

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function(err, results) {
                test.equal(null, err);
                test.equal(2, results[0].value);

                // mapReduce with scope containing plain function
                var o = {};
                o.scope = { obj: { fn: t } };
                o.out = { replace: 'replacethiscollection' };

                collection.mapReduce(map, reduce, o, function(err, outCollection) {
                  test.equal(null, err);

                  // Find all entries in the map-reduce collection
                  outCollection.find().toArray(function(err, results) {
                    test.equal(2, results[0].value);
                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyRetriveACollectionsIndexes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Crete the collection for the distinct example
        var collection = db.collection('simple_key_based_distinct');
        // Create a geo 2d index
        collection.ensureIndex({ loc: '2d' }, configuration.writeConcernMax(), function(
          err,
          result
        ) {
          test.ok(result);
          test.equal(null, err);

          // Create a simple single field index
          collection.ensureIndex({ a: 1 }, configuration.writeConcernMax(), function(err, result) {
            test.ok(result);
            test.equal(null, err);

            setTimeout(function() {
              // List all of the indexes on the collection
              collection.indexes(function(err, indexes) {
                test.equal(3, indexes.length);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyExecuteIndexExists', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a test collection that we are getting the options back from
        var collection = db.collection(
          'test_collection_index_exists',
          configuration.writeConcernMax()
        );
        test.equal(null, err);

        // Create an index on the collection
        collection.createIndex('a', configuration.writeConcernMax(), function(err, indexName) {
          test.ok(indexName);
          test.equal(null, err);

          // Let's test to check if a single index exists
          collection.indexExists('a_1', function(err, result) {
            test.equal(true, result);

            // Let's test to check if multiple indexes are available
            collection.indexExists(['a_1', '_id_'], function(err, result) {
              test.equal(true, result);

              // Check if a non existing index exists
              collection.indexExists('c_1', function(err, result) {
                test.equal(false, result);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyShowTheResultsFromIndexInformation', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_2');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Fetch basic indexInformation for collection
                db.indexInformation('more_index_information_test_2', function(
                  err,
                  indexInformation
                ) {
                  test.deepEqual([['_id', 1]], indexInformation._id_);
                  test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

                  // Fetch full index information
                  collection.indexInformation({ full: true }, function(err, indexInformation) {
                    test.deepEqual({ _id: 1 }, indexInformation[0].key);
                    test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyShowAllTheResultsFromIndexInformation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('more_index_information_test_3');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          { w: 1 },
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Fetch basic indexInformation for collection
                collection.indexInformation(function(err, indexInformation) {
                  test.deepEqual([['_id', 1]], indexInformation._id_);
                  test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

                  // Fetch full index information
                  collection.indexInformation({ full: true }, function(err, indexInformation) {
                    test.deepEqual({ _id: 1 }, indexInformation[0].key);
                    test.deepEqual({ a: 1, b: 1 }, indexInformation[1].key);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var collection = db.collection('simple_document_insert_collection_no_safe');
        // Insert a single document
        collection.insertOne({ hello: 'world_no_safe' });

        // Wait for a second before finishing up, to ensure we have written the item to disk
        setTimeout(function() {
          // Fetch the document
          collection.findOne({ hello: 'world_no_safe' }, function(err, item) {
            test.equal(null, err);
            test.equal('world_no_safe', item.hello);
            client.close();
            done();
          });
        }, 100);
      });
      // END
    }
  });

  /**
   * A batch document insert example, using safe mode to ensure document persistance on MongoDB
   *
   * @example-class Collection
   * @example-method insert
   * @ignore
   */
  it('shouldCorrectlyPerformABatchDocumentInsertSafe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch a collection to insert document into
        var collection = db.collection('batch_document_insert_collection_safe');
        // Insert a single document
        collection.insertMany(
          [{ hello: 'world_safe1' }, { hello: 'world_safe2' }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Fetch the document
            collection.findOne({ hello: 'world_safe2' }, function(err, item) {
              test.equal(null, err);
              test.equal('world_safe2', item.hello);
              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafe', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch a collection to insert document into
        var collection = db.collection('simple_document_insert_with_function_safe');

        var o = configuration.writeConcernMax();
        o.serializeFunctions = true;
        // Insert a single document
        collection.insertOne(
          {
            hello: 'world',
            func: function() {}
          },
          o,
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Fetch the document
            collection.findOne({ hello: 'world' }, function(err, item) {
              test.equal(null, err);
              test.ok('function() {}', item.code);
              client.close();
              done();
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
   * @ignore
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('keepGoingExample');

        // Add an unique index to title to force errors in the batch insert
        collection.ensureIndex({ title: 1 }, { unique: true }, function(err, indexName) {
          test.ok(indexName);
          test.equal(null, err);

          // Insert some intial data into the collection
          collection.insertMany(
            [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
            configuration.writeConcernMax(),
            function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Force keep going flag, ignoring unique index issue
              collection.insert(
                [
                  { name: 'Jim' },
                  { name: 'Sarah', title: 'Princess' },
                  { name: 'Gump', title: 'Gump' }
                ],
                { w: 1, keepGoing: true },
                function(err, result) {
                  test.equal(result, null);
                  test.ok(err);
                  test.ok(err.result);

                  // Count the number of documents left (should not include the duplicates)
                  collection.count(function(err, count) {
                    test.equal(3, count);
                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyExecuteIsCapped', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a test collection that we are getting the options back from
        db.createCollection('test_collection_is_capped', { capped: true, size: 1024 }, function(
          err,
          collection
        ) {
          test.equal('test_collection_is_capped', collection.collectionName);

          // Let's fetch the collection options
          collection.isCapped(function(err, capped) {
            test.equal(true, capped);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyRetriveCollectionOptions', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a test collection that we are getting the options back from
        db.createCollection('test_collection_options', { capped: true, size: 1024 }, function(
          err,
          collection
        ) {
          test.equal('test_collection_options', collection.collectionName);

          // Let's fetch the collection options
          collection.options(function(err, options) {
            test.equal(true, options.capped);
            test.ok(options.size >= 1024);

            client.close();
            done();
          });
        });
      });
      // END
    }
  });

  /**
   * A parallelCollectionScan example
   *
   * @example-class Collection
   * @example-method parallelCollectionScan
   * @ignore
   */
  it('Should correctly execute parallelCollectionScan with multiple cursors using toArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { mongodb: '>2.5.5 <=4.1.0', topology: ['single', 'replicaset'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var docs = [];

        // Insert some documents
        for (var i = 0; i < 1000; i++) {
          docs.push({ a: i });
        }

        // Get the collection
        var collection = db.collection('parallelCollectionScan');
        // Insert 1000 documents in a batch
        collection.insertMany(docs, function(err, result) {
          test.ok(result);
          test.equal(null, err);

          var results = [];
          var numCursors = 3;

          // Execute parallelCollectionScan command
          collection.parallelCollectionScan({ numCursors: numCursors }, function(err, cursors) {
            test.equal(null, err);
            test.ok(cursors != null);
            test.ok(cursors.length > 0);
            var left = cursors.length;

            for (var i = 0; i < cursors.length; i++) {
              cursors[i].toArray(function(err, items) {
                test.equal(err, null);

                // Add docs to results array
                results = results.concat(items);
                left = left - 1;

                // No more cursors let's ensure we got all results
                if (left === 0) {
                  test.equal(docs.length, results.length);

                  client.close();
                  done();
                }
              });
            }
          });
        });
      });
      // END
    }
  });

  /**
   * An example showing how to force a reindex of a collection.
   *
   * @example-class Collection
   * @example-method reIndex
   * @ignore
   */
  it('shouldCorrectlyIndexAndForceReindexOnCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('shouldCorrectlyForceReindexOnCollection');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }],
          { w: 1 },
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Force a reindex of the collection
                collection.reIndex(function(err, result) {
                  test.equal(null, err);
                  test.equal(true, result);

                  // Verify that the index is gone
                  collection.indexInformation(function(err, indexInformation) {
                    test.deepEqual([['_id', 1]], indexInformation._id_);
                    test.deepEqual([['a', 1], ['b', 1]], indexInformation.a_1_b_1);

                    client.close();
                    done();
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
   * An example removing all documents in a collection not using safe mode
   *
   * @example-class Collection
   * @example-method remove
   * @ignore
   */
  it('shouldRemoveAllDocumentsNoSafe', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch a collection to insert document into
        var collection = db.collection('remove_all_documents_no_safe');
        // Insert a bunch of documents
        collection.insertMany([{ a: 1 }, { b: 2 }], { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Remove all the document
          collection.removeMany();

          // Fetch all results
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(0, items.length);
            client.close();
            done();
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
   * @ignore
   */
  it('shouldRemoveSubsetOfDocumentsSafeMode', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Fetch a collection to insert document into
        var collection = db.collection('remove_subset_of_documents_safe');
        // Insert a bunch of documents
        collection.insertMany([{ a: 1 }, { b: 2 }], { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Remove all the document
          collection.removeOne({ a: 1 }, { w: 1 }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);
            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyRenameCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open a couple of collections
        db.createCollection('test_rename_collection', function(err, collection1) {
          db.createCollection('test_rename_collection2', function(err, collection2) {
            test.ok(collection2);
            test.equal(null, err);

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
            collection1.insertMany([{ x: 1 }, { x: 2 }], configuration.writeConcernMax(), function(
              err,
              docs
            ) {
              test.ok(docs);
              test.equal(null, err);

              // Attemp to rename the first collection to the second one, this will fail
              collection1.rename('test_rename_collection2', function(err, collection) {
                test.equal(null, collection);
                test.ok(err instanceof Error);
                test.ok(err.message.length > 0);

                // Attemp to rename the first collection to a name that does not exist
                // this will be succesful
                collection1.rename('test_rename_collection3', function(err, collection2) {
                  test.equal('test_rename_collection3', collection2.collectionName);

                  // Ensure that the collection is pointing to the new one
                  collection2.count(function(err, count) {
                    test.equal(2, count);
                    client.close();
                    done();
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
   * Example of a simple document save with safe set to false
   *
   * @example-class Collection
   * @example-method save
   * @ignore
   */
  it('shouldCorrectlySaveASimpleDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch the collection
        var collection = db.collection('save_a_simple_document');
        // Save a document with no safe option
        collection.save({ hello: 'world' });

        // Wait for a second
        setTimeout(function() {
          // Find the saved document
          collection.findOne({ hello: 'world' }, function(err, item) {
            test.equal(null, err);
            test.equal('world', item.hello);
            client.close();
            done();
          });
        }, 2000);
      });
      // END
    }
  });

  /**
   * Example of a simple document save and then resave with safe set to true
   *
   * @example-class Collection
   * @example-method save
   * @ignore
   */
  it('shouldCorrectlySaveASimpleDocumentModifyItAndResaveIt', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch the collection
        var collection = db.collection('save_a_simple_document_modify_it_and_resave_it');

        // Save a document with no safe option
        collection.save({ hello: 'world' }, configuration.writeConcernMax(), function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Find the saved document
          collection.findOne({ hello: 'world' }, function(err, item) {
            test.equal(null, err);
            test.equal('world', item.hello);

            // Update the document
            item['hello2'] = 'world2';

            // Save the item with the additional field
            collection.save(item, configuration.writeConcernMax(), function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Find the changed document
              collection.findOne({ hello: 'world' }, function(err, item) {
                test.equal(null, err);
                test.equal('world', item.hello);
                test.equal('world2', item.hello2);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyUpdateASimpleDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get a collection
        var collection = db.collection('update_a_simple_document');

        // Insert a document, then update it
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(err, doc) {
          test.ok(doc);
          test.equal(null, err);

          // Update the document with an atomic operator
          collection.updateOne({ a: 1 }, { $set: { b: 2 } });

          // Wait for a second then fetch the document
          setTimeout(function() {
            // Fetch the document that we modified
            collection.findOne({ a: 1 }, function(err, item) {
              test.equal(null, err);
              test.equal(1, item.a);
              test.equal(2, item.b);
              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyUpsertASimpleDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get a collection
        var collection = db.collection('update_a_simple_document_upsert');
        // Update the document using an upsert operation, ensuring creation if it does not exist
        collection.updateOne({ a: 1 }, { $set: { b: 2, a: 1 } }, { upsert: true, w: 1 }, function(
          err,
          result
        ) {
          test.equal(null, err);
          test.equal(1, result.result.n);

          // Fetch the document that we modified and check if it got inserted correctly
          collection.findOne({ a: 1 }, function(err, item) {
            test.equal(null, err);
            test.equal(1, item.a);
            test.equal(2, item.b);
            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyUpdateMultipleDocuments', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get a collection
        var collection = db.collection('update_a_simple_document_multi');

        // Insert a couple of documentations
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 1, b: 2 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            var o = configuration.writeConcernMax();
            collection.updateMany({ a: 1 }, { $set: { b: 0 } }, o, function(err, r) {
              test.equal(null, err);
              test.equal(2, r.result.n);

              // Fetch all the documents and verify that we have changed the b value
              collection.find().toArray(function(err, items) {
                test.equal(null, err);
                test.equal(1, items[0].a);
                test.equal(0, items[0].b);
                test.equal(1, items[1].a);
                test.equal(0, items[1].b);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyReturnACollectionsStats', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Crete the collection for the distinct example
        var collection = db.collection('collection_stats_test');

        // Insert some documents
        collection.insertMany(
          [{ a: 1 }, { hello: 'world' }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Retrieve the statistics for the collection
            collection.stats(function(err, stats) {
              test.equal(2, stats.count);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyCreateAndDropAllIndex', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('shouldCorrectlyCreateAndDropAllIndex');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4, c: 4 }],
          { w: 1 },
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            collection.ensureIndex(
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Create an additional index
                collection.ensureIndex(
                  { c: 1 },
                  { unique: true, background: true, w: 1 },
                  function() {
                    // Drop the index
                    collection.dropAllIndexes(function(err, result) {
                      test.ok(result);
                      test.equal(null, err);

                      // Verify that the index is gone
                      collection.indexInformation(function(err, indexInformation) {
                        test.deepEqual([['_id', 1]], indexInformation._id_);
                        test.equal(undefined, indexInformation.a_1_b_1);
                        test.equal(undefined, indexInformation.c_1);

                        client.close();
                        done();
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
   * @ignore
   */
  it('accessAdminLevelOperations', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Use the admin database for the operation
        var adminDb = db.admin();
        test.ok(adminDb != null);

        client.close();
        done();
      });
      // END
    }
  });

  /**
   * An example that shows how to force close a db connection so it cannot be reused.
   *
   * @example-class Db
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlyFailOnRetryDueToAppCloseOfDb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Fetch a collection
        var collection = db.collection('shouldCorrectlyFailOnRetryDueToAppCloseOfDb');

        // Insert a document
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Force close the connection
          client.close(true, function(err) {
            test.equal(null, err);

            // Attemp to insert should fail now with correct message 'db closed by application'
            collection.insertOne({ a: 2 }, configuration.writeConcernMax(), function(err, result) {
              expect(err).to.exist;
              expect(result).to.not.exist;

              client.close();
              done();
            });
          });
        });
      });
      // END
    }
  });

  /**
   * An example of a simple single server db connection
   *
   * @example-class Db
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        db.on('close', function() {
          done();
        });

        client.close();
      });
      // END
    }
  });

  /**
   * An example of a simple single server db connection and close function
   *
   * @example-class Db
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlyOpenASimpleDbSingleServerConnectionAndCloseWithCallback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

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
        client.close(function(err) {
          test.equal(null, err);

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
   * @ignore
   */
  it('shouldCorrectlyRetrievelistCollections', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
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
        collection.insertOne({ a: 1 }, function(err, r) {
          test.ok(r);
          test.equal(null, err);

          // Return the information of a single collection name
          db1
            .listCollections({ name: 'shouldCorrectlyRetrievelistCollections' })
            .toArray(function(err, items) {
              test.equal(null, err);
              test.equal(1, items.length);

              // Return the information of a all collections, using the callback format
              db1.listCollections().toArray(function(err, items) {
                test.equal(null, err);
                test.ok(items.length >= 1);

                client.close();
                done();
              });
            });
        });
      });
      // END
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyRetrievelistCollectionsWiredTiger', {
    metadata: { requires: { topology: ['wiredtiger'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
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
        collection.insertOne({ a: 1 }, function(err, r) {
          test.ok(r);
          test.equal(null, err);

          // Return the information of a single collection name
          db1
            .listCollections({ name: 'shouldCorrectlyRetrievelistCollections' })
            .toArray(function(err, items) {
              test.equal(1, items.length);

              // Return the information of a all collections, using the callback format
              db1.listCollections().toArray(function(err, items) {
                test.equal(1, items.length);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyAccessACollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Grab a collection with a callback but no safe operation
        db.collection('test_correctly_access_collections', function(err, col2) {
          test.ok(col2);
          test.equal(null, err);

          // Grab a collection with a callback in safe mode, ensuring it exists (should fail as it's not created)
          db.collection('test_correctly_access_collections', { strict: true }, function(err, col3) {
            test.equal(null, col3);
            test.ok(err != null);

            // Create the collection
            db.createCollection('test_correctly_access_collections', function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Retry to get the collection, should work as it's now created
              db.collection('test_correctly_access_collections', { strict: true }, function(
                err,
                col3
              ) {
                test.ok(col3);
                test.equal(null, err);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveAllCollections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Retry to get the collection, should work as it's now created
        db.collections(function(err, collections) {
          test.equal(null, err);
          test.ok(collections.length > 0);

          client.close();
          done();
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
   * @ignore
   */
  it('shouldCorrectlyAddUserToDb', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Add a user to the database
        db.addUser('user', 'name', function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Remove the user from the db
          db.removeUser('user', function(err, result) {
            test.ok(result);
            test.equal(null, err);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyAddAndRemoveUser', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Add a user to the database
        db.addUser('user', 'name', function(err, result) {
          test.ok(result);
          test.equal(null, err);
          client.close();

          const secondClient = configuration.newClient(
            'mongodb://user:name@localhost:27017/integration_tests'
          );

          secondClient.connect(function(err) {
            test.equal(null, err);
            var db = secondClient.db(configuration.db);

            // Logout the db
            secondClient.logout(function(err, result) {
              test.equal(true, result);

              // Remove the user from the db
              db.removeUser('user', function(err, result) {
                test.ok(result);
                test.equal(null, err);

                const oldClient = secondClient;
                const thirdClient = configuration.newClient(
                  'mongodb://user:name@localhost:27017/integration_tests'
                );

                // Authenticate
                thirdClient.connect(function(err) {
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
   * @ignore
   */
  it('shouldCorrectlyCreateACollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Create a capped collection with a maximum of 1000 documents
        db.createCollection(
          'a_simple_collection',
          { capped: true, size: 10000, max: 1000, w: 1 },
          function(err, collection) {
            test.equal(null, err);

            // Insert a document in the capped collection
            collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(err, result) {
              test.ok(result);
              test.equal(null, err);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyExecuteACommandAgainstTheServer', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Execute ping against the server
        db.command({ ping: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Create a capped collection with a maximum of 1000 documents
          db.createCollection(
            'a_simple_create_drop_collection',
            { capped: true, size: 10000, max: 1000, w: 1 },
            function(err, collection) {
              test.equal(null, err);

              // Insert a document in the capped collection
              collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(
                err,
                result
              ) {
                test.ok(result);
                test.equal(null, err);

                // Drop the collection from this world
                db.dropCollection('a_simple_create_drop_collection', function(err, result) {
                  test.ok(result);
                  test.equal(null, err);

                  // Verify that the collection is gone
                  db
                    .listCollections({ name: 'a_simple_create_drop_collection' })
                    .toArray(function(err, names) {
                      test.equal(0, names.length);

                      client.close();
                      done();
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
   * @ignore
   */
  it('shouldCorrectlyCreateDropAndVerifyThatCollectionIsGone', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Execute ping against the server
        db.command({ ping: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

          client.close();
          done();
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
  it('shouldCorrectlyRenameACollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Create a collection
        db.createCollection('simple_rename_collection', configuration.writeConcernMax(), function(
          err,
          collection
        ) {
          test.equal(null, err);

          // Insert a document in the collection
          collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Retrieve the number of documents from the collection
            collection.count(function(err, count) {
              test.equal(1, count);

              // Rename the collection
              db.renameCollection(
                'simple_rename_collection',
                'simple_rename_collection_2',
                function(err, collection2) {
                  test.equal(null, err);

                  // Retrieve the number of documents from the collection
                  collection2.count(function(err, count) {
                    test.equal(1, count);

                    // Verify that the collection is gone
                    db
                      .listCollections({ name: 'simple_rename_collection' })
                      .toArray(function(err, names) {
                        test.equal(0, names.length);

                        // Verify that the new collection exists
                        db
                          .listCollections({ name: 'simple_rename_collection_2' })
                          .toArray(function(err, names) {
                            test.equal(1, names.length);

                            client.close();
                            done();
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
   * @ignore
   */
  it('shouldCreateOnDbComplexIndexOnTwoFields', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('more_complex_index_test');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            db.createIndex(
              'more_complex_index_test',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Show that duplicate records got dropped
                collection.find({}).toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function(err, explanation) {
                    test.equal(null, err);
                    test.ok(explanation != null);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCreateComplexEnsureIndexDb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection we want to drop later
        var collection = db.collection('more_complex_ensure_index_db_test');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Create an index on the a field
            db.ensureIndex(
              'more_complex_ensure_index_db_test',
              { a: 1, b: 1 },
              { unique: true, background: true, w: 1 },
              function(err, indexName) {
                test.ok(indexName);
                test.equal(null, err);

                // Show that duplicate records got dropped
                collection.find({}).toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(4, items.length);

                  // Perform a query, with explain to show we hit the query
                  collection.find({ a: 2 }).explain(function(err, explanation) {
                    test.equal(null, err);
                    test.ok(explanation != null);

                    client.close();
                    done();
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
   * @ignore
   */
  it('should correctly drop the database', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('more_index_information_test_1');
        // Insert a bunch of documents for the index
        collection.insertMany(
          [{ a: 1, b: 1 }, { a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 4, b: 4 }],
          configuration.writeConcernMax(),
          function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Let's drop the database
            db.dropDatabase(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Wait two seconds to let it replicate across
              setTimeout(function() {
                // Get the admin database
                db.admin().listDatabases(function(err, dbs) {
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
                  done();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveDbStats', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        db.stats(function(err, stats) {
          test.equal(null, err);
          test.ok(stats != null);

          client.close();
          done();
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
   * @ignore
   */
  it('shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstances', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Reference a different database sharing the same connections
        // for the data transfer
        var secondDb = client.db('integration_tests_2');

        // Fetch the collections
        var multipleColl1 = db.collection('multiple_db_instances');
        var multipleColl2 = secondDb.collection('multiple_db_instances');

        // Write a record into each and then count the records stored
        multipleColl1.insertOne({ a: 1 }, { w: 1 }, function(err, result) {
          test.ok(result);
          test.equal(null, err);

          multipleColl2.insertOne({ a: 1 }, { w: 1 }, function(err, result) {
            test.ok(result);
            test.equal(null, err);

            // Count over the results ensuring only on record in each collection
            multipleColl1.count(function(err, count) {
              test.equal(1, count);

              multipleColl2.count(function(err, count) {
                test.equal(1, count);

                client.close();
                done();
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
   * @ignore
   */
  it('Should correctly connect with default replicasetNoOption', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
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
      client.connect(function(err, client) {
        test.equal(null, err);
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
        client.close();
        done();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveBuildInfo', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Retrive the build information for the MongoDB instance
        adminDb.buildInfo(function(err, info) {
          test.ok(info);
          test.equal(null, err);

          client.close();
          done();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveBuildInfoUsingCommand', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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

        // Use the admin database for the operation
        var adminDb = db.admin();
        // Retrive the build information using the admin command
        adminDb.command({ buildInfo: 1 }, function(err, info) {
          test.ok(info);
          test.equal(null, err);

          client.close();
          done();
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
   * @ignore
   */
  it('shouldCorrectlySetDefaultProfilingLevel', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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

        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function(err, doc) {
          test.ok(doc);
          test.equal(null, err);

          // Use the admin database for the operation
          var adminDb = client.db('admin');

          // Retrive the profiling level
          adminDb.profilingLevel(function(err, level) {
            test.ok(level);
            test.equal(null, err);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlySetAndExtractProfilingInfo', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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

        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function(err, doc) {
          test.ok(doc);
          test.equal(null, err);

          // Use the admin database for the operation
          // Set the profiling level to all
          db.setProfilingLevel('all', function(err, level) {
            test.ok(level);
            test.equal(null, err);

            // Execute a query command
            collection.find().toArray(function(err, items) {
              test.equal(null, err);
              test.ok(items.length > 0);

              // Turn off profiling
              db.setProfilingLevel('off', function(err, level) {
                test.ok(level);
                test.equal(null, err);

                // Retrive the profiling information
                db.profilingInfo(function(err, infos) {
                  test.equal(null, err);
                  test.ok(infos.constructor === Array);
                  test.ok(infos.length >= 1);
                  test.ok(infos[0].ts.constructor === Date);
                  test.ok(infos[0].millis.constructor === Number);

                  client.close();
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
   * An example of how to use the validateCollection command
   * Use this command to check that a collection is valid (not corrupt) and to get various statistics.
   *
   * @example-class Admin
   * @example-method validateCollection
   * @ignore
   */
  it('shouldCorrectlyCallValidateCollection', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function(err, doc) {
          test.ok(doc);
          test.equal(null, err);

          // Use the admin database for the operation
          var adminDb = db.admin();

          // Validate the 'test' collection
          adminDb.validateCollection('test', function(err, doc) {
            test.ok(doc);
            test.equal(null, err);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyPingTheMongoDbInstance', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Ping the server
        adminDb.ping(function(err, pingResult) {
          test.ok(pingResult);
          test.equal(null, err);

          client.close();
          done();
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
   * @ignore
   */
  it('shouldCorrectlyAddAUserToAdminDb', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin11', 'admin11', function(err, result) {
          test.ok(result);

          adminDb.removeUser('admin11', function(err, result) {
            test.ok(result);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyAddAUserAndRemoveItFromAdminDb', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin12', 'admin12', function(err, result) {
          test.ok(result);

          // Remove the user
          adminDb.removeUser('admin12', function(err, result) {
            test.equal(null, err);
            test.equal(true, result);

            client.close();
            done();
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
   * @ignore
   */
  it('should correctly list all available databases', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Use the admin database for the operation
        var adminDb = db.admin();

        // List all the available databases
        adminDb.listDatabases(function(err, dbs) {
          test.equal(null, err);
          test.ok(dbs.databases.length > 0);

          client.close();
          done();
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

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Use the admin database for the operation
        var adminDb = db.admin();

        // List all the available databases
        adminDb.listDatabases({ nameOnly: 1 }, function(err, dbs) {
          expect(err).to.not.exist;
          expect(dbs.databases).to.include.deep.members([
            {
              name: 'admin'
            },
            {
              name: 'local'
            }
          ]);

          client.close();
          done();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveServerInfo', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insertOne({ a: 1 }, { w: 1 }, function(err, doc) {
          test.ok(doc);
          test.equal(null, err);

          // Use the admin database for the operation
          var adminDb = db.admin();

          // Retrive the server Info
          adminDb.serverStatus(function(err, info) {
            test.equal(null, err);
            test.ok(info != null);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyRetrieveReplSetGetStatus', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
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
        collection.insertOne({ a: 1 }, { w: 1 }, function(err, doc) {
          test.ok(doc);
          test.equal(null, err);

          // Use the admin database for the operation
          var adminDb = db.admin();

          // Retrive the server Info, returns error if we are not
          // running a replicaset
          adminDb.replSetGetStatus(function(err, info) {
            test.ok(info);
            test.equal(null, err);

            client.close();
            done();
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
  var fs = require('fs');

  /**
   * An example showing the information returned by indexInformation
   *
   * @example-class Cursor
   * @example-method toArray
   * @ignore
   */
  it('shouldCorrectlyExecuteToArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection to hold our documents
        var collection = db.collection('test_array');

        // Insert a test document
        collection.insertOne({ b: [1, 2, 3] }, configuration.writeConcernMax(), function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Retrieve all the documents in the collection
          collection.find().toArray(function(err, documents) {
            test.equal(1, documents.length);
            test.deepEqual([1, 2, 3], documents[0].b);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyFailToArrayDueToFinishedEachOperation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('test_to_a_after_each');

        // Insert a document in the collection
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Grab a cursor
          var cursor = collection.find();
          // Execute the each command, triggers for each document
          cursor.each(function(err, item) {
            // If the item is null then the cursor is exhausted/empty and closed
            if (item == null) {
              // Show that the cursor is closed
              cursor.toArray(function(err, items) {
                test.ok(items);
                test.equal(null, err);

                // Let's close the db
                client.close();
                done();
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
   * @ignore
   */
  it('Should correctly iterate over cursor using forEach', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('test_to_a_after_for_each');

        // Insert a document in the collection
        collection.insertOne({ a: 1 }, configuration.writeConcernMax(), function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Count of documents returned
          var count = 0;
          // Grab a cursor
          var cursor = collection.find();
          // Execute the each command, triggers for each document
          cursor.forEach(
            function(doc) {
              test.ok(doc != null);
              count = count + 1;
            },
            function(err) {
              test.equal(null, err);
              test.equal(1, count);
              client.close();
              done();
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
   * @ignore
   */
  it('Should correctly rewind and restart cursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        var docs = [];

        // Insert 100 documents with some data
        for (var i = 0; i < 100; i++) {
          var d = new Date().getTime() + i * 1000;
          docs[i] = { a: i, createdAt: new Date(d) };
        }

        // Create collection
        var collection = db.collection('Should_correctly_rewind_and_restart_cursor');

        // insert all docs
        collection.insertMany(docs, configuration.writeConcernMax(), function(err, result) {
          test.ok(result);
          test.equal(null, err);

          // Grab a cursor using the find
          var cursor = collection.find({});
          // Fetch the first object off the cursor
          cursor.next(function(err, item) {
            test.equal(0, item.a);
            // Rewind the cursor, resetting it to point to the start of the query
            cursor.rewind();

            // Grab the first object again
            cursor.next(function(err, item) {
              test.equal(0, item.a);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyUseCursorCountFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Creat collection
        var collection = db.collection('cursor_count_collection');

        // Insert some docs
        collection.insertMany([{ a: 1 }, { a: 2 }], configuration.writeConcernMax(), function(
          err,
          docs
        ) {
          test.ok(docs);
          test.equal(null, err);

          // Do a find and get the cursor count
          collection.find().count(function(err, count) {
            test.equal(null, err);
            test.equal(2, count);

            client.close();
            done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleSorts', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('simple_sort_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Do normal ascending sort
            collection
              .find()
              .sort({ a: 1 })
              .next(function(err, item) {
                test.equal(null, err);
                test.equal(1, item.a);

                // Do normal descending sort, with new syntax that enforces ordering of sort keys
                collection
                  .find()
                  .sort([['a', -1]])
                  .next(function(err, item) {
                    test.equal(null, err);
                    test.equal(3, item.a);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('simple_limit_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Limit to only one document returned
            collection
              .find()
              .limit(1)
              .toArray(function(err, items) {
                test.equal(null, err);
                test.equal(1, items.length);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformSkipOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('simple_skip_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Skip one document
            collection
              .find()
              .skip(1)
              .next(function(err, item) {
                test.equal(null, err);
                test.equal(2, item.a);

                client.close();
                done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformBatchSizeOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('simple_batch_size_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Do normal ascending sort
            const cursor = collection.find().batchSize(1);
            cursor.next(function(err, item) {
              test.equal(null, err);
              test.equal(1, item.a);

              // Need to close cursor, since it was not exhausted,
              // and implicit session is still open
              cursor.close();
              client.close();
              done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformNextOnCursorWithCallbacks', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('simple_next_object_collection_with_next');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Do normal ascending sort
            var cursor = collection.find();
            // Perform hasNext check
            cursor.hasNext(function(err, r) {
              test.equal(null, err);
              test.ok(r);

              cursor.next(function(err, r) {
                test.equal(null, err);
                test.equal(1, r.a);

                cursor.hasNext(function(err, r) {
                  test.equal(null, err);
                  test.ok(r);

                  cursor.next(function(err, r) {
                    test.equal(null, err);
                    test.equal(2, r.a);

                    cursor.hasNext(function(err, r) {
                      test.equal(null, err);
                      test.ok(r);

                      cursor.next(function(err, r) {
                        test.equal(null, err);
                        test.equal(3, r.a);

                        cursor.hasNext(function(err, r) {
                          test.equal(null, err);
                          test.ok(!r);

                          client.close();
                          done();
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
   * @ignore
   */
  it('shouldCorrectlyPerformSimpleExplainCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a collection
        var collection = db.collection('simple_explain_collection');

        // Insert some documents we can sort on
        collection.insertMany(
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          configuration.writeConcernMax(),
          function(err, docs) {
            test.ok(docs);
            test.equal(null, err);

            // Do normal ascending sort
            collection.find().explain(function(err, explanation) {
              test.ok(explanation);
              test.equal(null, err);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheStreamFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_stream_function');

        // Insert documents into collection
        collection.insertMany(docs, configuration.writeConcernMax(), function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Perform a find to get a cursor
          var stream = collection.find().stream();

          // Execute find on all the documents
          stream.on('end', function() {
            client.close();
            done();
          });

          stream.on('data', function(data) {
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
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheIsCloseFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_is_close_function_on_cursor');

        // Insert documents into collection
        collection.insertMany(docs, configuration.writeConcernMax(), function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Perform a find to get a cursor
          var cursor = collection.find();

          // Fetch the first object
          cursor.next(function(err, object) {
            test.ok(object);
            test.equal(null, err);

            // Close the cursor, this is the same as reseting the query
            cursor.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);
              test.equal(true, cursor.isClosed());

              client.close();
              done();
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
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheCloseFunction', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 100; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_close_function_on_cursor');

        // Insert documents into collection
        collection.insertMany(docs, configuration.writeConcernMax(), function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Perform a find to get a cursor
          var cursor = collection.find();

          // Fetch the first object
          cursor.next(function(err, object) {
            test.ok(object);
            test.equal(null, err);

            // Close the cursor, this is the same as reseting the query
            cursor.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              client.close();
              done();
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
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheCursorStreamPauseFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a lot of documents to insert
        var docs = [];
        var fetchedDocs = [];
        for (var i = 0; i < 2; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_cursorstream_pause');

        // Insert documents into collection
        collection.insertMany(docs, { w: 1 }, function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Perform a find to get a cursor
          var stream = collection.find().stream();

          // For each data item
          stream.on('data', function(item) {
            fetchedDocs.push(item);
            // Pause stream
            stream.pause();

            // Restart the stream after 1 miliscecond
            setTimeout(function() {
              fetchedDocs.push(null);
              stream.resume();
            }, 1);
          });

          // When the stream is done
          stream.on('end', function() {
            test.equal(null, fetchedDocs[1]);
            client.close();
            done();
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
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheCursorStreamDestroyFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a lot of documents to insert
        var docs = [];
        for (var i = 0; i < 1; i++) {
          docs.push({ a: i });
        }

        // Create a collection
        var collection = db.collection('test_cursorstream_destroy');

        // Insert documents into collection
        collection.insertMany(docs, { w: 1 }, function(err, ids) {
          test.ok(ids);
          test.equal(null, err);

          // Perform a find to get a cursor
          var stream = collection.find().stream();

          // For each data item
          stream.on('data', function() {
            // Destroy stream
            stream.destroy();
          });

          // When the stream is done
          stream.on('close', function() {
            client.close();
            done();
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
   * @ignore
   */
  it('Should correctly connect to a replicaset', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
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
      client.connect(function(err, client) {
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
        test.equal(null, err);
        test.ok(db != null);

        db
          .collection('replicaset_mongo_client_collection')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true }, function(err, result) {
            test.equal(null, err);
            test.equal(1, result.result.n);

            client.close();
            done();
          });
      });
      // END
    }
  });

  /**
   * Example of a simple url connection string to a shard, with acknowledgement of writes.
   *
   * @example-class MongoClient
   * @ignore
   */
  it('Should connect to mongos proxies using connectiong string', {
    metadata: { requires: { topology: 'mongos' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url);
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
        test.equal(null, err);
        test.ok(db != null);

        db
          .collection('replicaset_mongo_client_collection')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true }, function(err, result) {
            test.equal(null, err);
            test.equal(1, result);

            client.close();
            done();
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
  it('Should correctly connect using MongoClient to a single server using connect', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27017/integration_tests', {
        native_parser: true
      });

      // DOC_START
      // Connect using the connection string
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
        test.equal(null, err);

        db
          .collection('mongoclient_test')
          .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true }, function(err, result) {
            test.equal(null, err);
            test.equal(1, result.result.n);

            client.close();
            done();
          });
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
   * @example-class ObjectID
   * @example-method getTimestamp
   * @ignore
   */
  it('shouldCorrectlyGenerate12ByteStringFromTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      // LINE var ObjectID = require('mongodb').ObjectID,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Get a timestamp in seconds
      var timestamp = Math.floor(new Date().getTime() / 1000);
      // Create a date with the timestamp
      var timestampDate = new Date(timestamp * 1000);

      // Create a new ObjectID with a specific timestamp
      var objectId = new ObjectID(timestamp);

      // Get the timestamp and validate correctness
      test.equal(timestampDate.toString(), objectId.getTimestamp().toString());
      done();
      // END
    }
  });

  /**
   * Generate a 24 character hex string representation of the ObjectID
   *
   * @example-class ObjectID
   * @example-method toHexString
   * @ignore
   */
  it('shouldCorrectlyRetrieve24CharacterHexStringFromToHexString', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      // LINE var ObjectID = require('mongodb').ObjectID,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectID
      var objectId = new ObjectID();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toHexString().length);
      done();
      // END
    }
  });

  /**
   * Get and set the generation time for an ObjectID
   *
   * @example-class ObjectID
   * @example-method generationTime
   * @ignore
   */
  it('shouldCorrectlyGetAndSetObjectIDUsingGenerationTimeProperty', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      // LINE var ObjectID = require('mongodb').ObjectID,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectID
      var objectId = new ObjectID();
      // Get the generation time
      var generationTime = objectId.generationTime;
      // Add 1000 miliseconds to the generation time
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
   * Convert a ObjectID into a hex string representation and then back to an ObjectID
   *
   * @example-class ObjectID
   * @example-method createFromHexString
   * @ignore
   */
  it('shouldCorrectlyTransformObjectIDToHexAndObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      // LINE var ObjectID = require('mongodb').ObjectID,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectID
      var objectId = new ObjectID();
      // Convert the object id to a hex string
      var originalHex = objectId.toHexString();
      // Create a new ObjectID using the createFromHexString function
      var newObjectId = ObjectID.createFromHexString(originalHex);
      // Convert the new ObjectID back into a hex string using the toHexString function
      var newHex = newObjectId.toHexString();
      // Compare the two hex strings
      test.equal(originalHex, newHex);
      done();
      // END
    }
  });

  /**
   * Compare two different ObjectID's using the equals method
   *
   * @example-class ObjectID
   * @example-method equals
   * @ignore
   */
  it('shouldCorrectlyDifferentiateBetweenObjectIdInstances', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      // LINE var ObjectID = require('mongodb').ObjectID,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      // Create a new ObjectID
      var objectId = new ObjectID();
      // Create a new ObjectID Based on the first ObjectID
      var objectId2 = new ObjectID(objectId.id);
      // Create another ObjectID
      var objectId3 = new ObjectID();
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
   * @example-class ObjectID
   * @example-method ObjectID.createFromTime
   * @ignore
   */
  it('shouldCorrectlyUseCreateFromTime', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;
      // LINE var ObjectID = require('mongodb').ObjectID,
      // LINE   test = require('assert');
      // REPLACE configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE done();
      // BEGIN
      var objectId = ObjectID.createFromTime(1);
      test.equal('000000010000000000000000', objectId.toHexString());
      done();
      // END
    }
  });

  /**************************************************************************
   *
   * GRIDSTORE TESTS
   *
   *************************************************************************/

  /**
   * A simple example showing the usage of the Gridstore.exist method.
   *
   * @example-class GridStore
   * @example-method GridStore.exist
   * @ignore
   */
  it('shouldCorrectlyExecuteGridStoreExistsByObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open a file for writing
        var gridStore = new GridStore(db, null, 'w');
        gridStore.open(function(err, gridStore) {
          test.equal(null, err);

          // Writing some content to the file
          gridStore.write('hello world!', function(err, gridStore) {
            test.equal(null, err);

            // Flush the file to GridFS
            gridStore.close(function(err, result) {
              test.equal(null, err);

              // Check if the file exists using the id returned from the close function
              GridStore.exist(db, result._id, function(err, result) {
                test.equal(null, err);
                test.equal(true, result);
              });

              // Show that the file does not exist for a random ObjectID
              GridStore.exist(db, new ObjectID(), function(err, result) {
                test.equal(null, err);
                test.equal(false, result);
              });

              // Show that the file does not exist for a different file root
              GridStore.exist(db, result._id, 'another_root', function(err, result) {
                test.equal(null, err);
                test.equal(false, result);

                client.close();
                done();
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the eof method.
   *
   * @example-class GridStore
   * @example-method GridStore.list
   * @ignore
   */
  it('shouldCorrectlyExecuteGridStoreList', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file id
        var fileId = new ObjectID();

        // Open a file for writing
        var gridStore = new GridStore(db, fileId, 'foobar2', 'w');
        gridStore.open(function(err, gridStore) {
          test.equal(null, err);

          gridStore.chunkCollection().deleteMany({}, function() {
            gridStore.collection().deleteMany({}, function() {
              // Write some content to the file
              gridStore.write('hello world!', function(err, gridStore) {
                // Flush to GridFS
                gridStore.close(function(err, result) {
                  test.ok(result);
                  test.equal(null, err);

                  // List the existing files
                  GridStore.list(db, function(err, items) {
                    var found = false;
                    items.forEach(function(filename) {
                      if (filename === 'foobar2') found = true;
                    });

                    test.ok(items.length >= 1);
                    test.ok(found);
                  });

                  // List the existing files but return only the file ids
                  GridStore.list(db, { id: true }, function(err, items) {
                    items.forEach(function(id) {
                      test.ok(typeof id === 'object');
                    });

                    test.ok(items.length >= 1);
                  });

                  // List the existing files in a specific root collection
                  GridStore.list(db, 'fs', function(err, items) {
                    var found = false;
                    items.forEach(function(filename) {
                      if (filename === 'foobar2') found = true;
                    });

                    test.ok(items.length >= 1);
                    test.ok(found);
                  });

                  // List the existing files in a different root collection where the file is not located
                  GridStore.list(db, 'my_fs', function(err, items) {
                    var found = false;
                    items.forEach(function(filename) {
                      if (filename === 'foobar2') found = true;
                    });

                    test.ok(items.length >= 0);
                    test.ok(!found);

                    // Specify seperate id
                    var fileId2 = new ObjectID();
                    // Write another file to GridFS
                    var gridStore2 = new GridStore(db, fileId2, 'foobar3', 'w');
                    gridStore2.open(function(err, gridStore) {
                      test.ok(gridStore);
                      test.equal(null, err);

                      // Write the content
                      gridStore2.write('my file', function(err, gridStore) {
                        test.ok(gridStore);
                        test.equal(null, err);

                        // Flush to GridFS
                        gridStore.close(function(err, result) {
                          test.ok(result);
                          test.equal(null, err);

                          // List all the available files and verify that our files are there
                          GridStore.list(db, function(err, items) {
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
   * A simple example showing the usage of the puts method.
   *
   * @example-class GridStore
   * @example-method puts
   * @ignore
   */
  it('shouldCorrectlyReadlinesAndPutLines', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open a file for writing
        var gridStore = new GridStore(db, 'test_gs_puts_and_readlines', 'w');
        gridStore.open(function(err, gridStore) {
          // Write a line to the file using the puts method
          gridStore.puts('line one', function(err, gridStore) {
            // Flush the file to GridFS
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Read in the entire contents
              GridStore.read(db, 'test_gs_puts_and_readlines', function(err, data) {
                test.equal('line one\n', data.toString());

                client.close();
                done();
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the GridStore.unlink method.
   *
   * @example-class GridStore
   * @example-method GridStore.unlink
   * @ignore
   */
  it('shouldCorrectlyUnlink', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open a new file for writing
        var gridStore = new GridStore(db, 'test_gs_unlink', 'w');
        db.dropDatabase(function(err, r) {
          test.ok(r);
          test.equal(null, err);

          gridStore.open(function(err, gridStore) {
            // Write some content
            gridStore.write('hello, world!', function(err, gridStore) {
              // Flush file to GridFS
              gridStore.close(function(err, result) {
                test.ok(result);
                test.equal(null, err);

                // Verify the existance of the fs.files document
                db.collection('fs.files', function(err, collection) {
                  collection.count(function(err, count) {
                    test.equal(1, count);
                  });
                });

                // Verify the existance of the fs.chunks chunk document
                db.collection('fs.chunks', function(err, collection) {
                  collection.count(function(err, count) {
                    test.equal(1, count);

                    // Unlink the file (removing it)
                    GridStore.unlink(db, 'test_gs_unlink', function(err, gridStore) {
                      test.ok(gridStore);
                      test.equal(null, err);

                      // Verify that fs.files document is gone
                      db.collection('fs.files', function(err, collection) {
                        collection.count(function(err, count) {
                          test.equal(0, count);
                        });
                      });

                      // Verify that fs.chunks chunk documents are gone
                      db.collection('fs.chunks', function(err, collection) {
                        collection.count(function(err, count) {
                          test.equal(0, count);

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
      // END
    }
  });

  /**
   * A simple example showing the usage of the read method.
   *
   * @example-class GridStore
   * @example-method read
   * @ignore
   */
  it('shouldCorrectlyWriteAndReadJpgImage', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Read in the content of a file
        var data = fs.readFileSync('./test/functional/data/iya_logo_final_bw.jpg');
        // Create a new file
        var gs = new GridStore(db, 'test', 'w');
        // Open the file
        gs.open(function(err, gs) {
          // Write the file to GridFS
          gs.write(data, function(err, gs) {
            // Flush to the GridFS
            gs.close(function(err, gs) {
              test.ok(gs);
              test.equal(null, err);

              // Define the file we wish to read
              var gs2 = new GridStore(db, 'test', 'r');
              // Open the file
              gs2.open(function(err, gs) {
                test.ok(gs);
                test.equal(null, err);

                // Set the pointer of the read head to the start of the gridstored file
                gs2.seek(0, function() {
                  // Read the entire file
                  gs2.read(function(err, data2) {
                    // Compare the file content against the orgiinal
                    test.equal(data.toString('base64'), data2.toString('base64'));

                    client.close();
                    done();
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
   * A simple example showing opening a file using a filename, writing to it and saving it.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingFilename', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a new instance of the gridstore
        var gridStore = new GridStore(db, 'ourexamplefiletowrite.txt', 'w');

        // Open the file
        gridStore.open(function(err, gridStore) {
          // Write some data to the file
          gridStore.write('bar', function(err, gridStore) {
            test.equal(null, err);

            // Close (Flushes the data to MongoDB)
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Verify that the file exists
              GridStore.exist(db, 'ourexamplefiletowrite.txt', function(err, result) {
                test.equal(null, err);
                test.equal(true, result);

                client.close();
                done();
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing opening a file using an ObjectID, writing to it and saving it.
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingObjectID', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Create a new instance of the gridstore
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the file
        gridStore.open(function(err, gridStore) {
          // Write some data to the file
          gridStore.write('bar', function(err, gridStore) {
            test.equal(null, err);

            // Close (Flushes the data to MongoDB)
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Verify that the file exists
              GridStore.exist(db, fileId, function(err, result) {
                test.equal(null, err);
                test.equal(true, result);

                client.close();
                done();
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing how to write a file to Gridstore using file location path.
   *
   * @example-class GridStore
   * @example-method writeFile
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFile', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Read the filesize of file on disk (provide your own)
        var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
        // Read the buffered data for comparision reasons
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Write the file to gridFS
          gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png', function(err, doc) {
            test.ok(doc);
            test.equal(null, err);

            // Read back all the written content and verify the correctness
            GridStore.read(db, fileId, function(err, fileData) {
              test.equal(data.toString('base64'), fileData.toString('base64'));
              test.equal(fileSize, fileData.length);

              client.close();
              done();
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing how to write a file to Gridstore using a file handle.
   *
   * @example-class GridStore
   * @example-method writeFile
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandle', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        gridStore.open(function(err, gridStore) {
          // Write the file to gridFS using the file handle
          gridStore.writeFile(fd, function(err, doc) {
            test.ok(doc);
            test.equal(null, err);

            // Read back all the written content and verify the correctness
            GridStore.read(db, fileId, function(err, fileData) {
              test.equal(data.toString('base64'), fileData.toString('base64'));
              test.equal(fileSize, fileData.length);

              client.close();
              done();
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the write command with strings and Buffers.
   *
   * @example-class GridStore
   * @example-method write
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffers', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Write a text string
          gridStore.write('Hello world', function(err, gridStore) {
            // Write a buffer
            gridStore.write(Buffer.from('Buffer Hello world'), function(err, gridStore) {
              // Close the
              gridStore.close(function(err, result) {
                test.ok(result);
                test.equal(null, err);

                // Read back all the written content and verify the correctness
                GridStore.read(db, fileId, function(err, fileData) {
                  test.equal('Hello worldBuffer Hello world', fileData.toString());

                  client.close();
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
   * A simple example showing how to use the write command with strings and Buffers.
   *
   * @example-class GridStore
   * @example-method close
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingClose', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Write a text string
          gridStore.write('Hello world', function(err, gridStore) {
            // Close the
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              client.close();
              done();
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing how to access the chunks collection object.
   *
   * @example-class GridStore
   * @example-method chunkCollection
   * @ignore
   */
  it('shouldCorrectlyAccessChunkCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Access the Chunk collection
          gridStore.chunkCollection(function(err, collection) {
            test.ok(collection);
            test.equal(null, err);

            client.close();
            done();
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing how to use the instance level unlink command to delete a gridstore item.
   *
   * @example-class GridStore
   * @example-method unlink
   * @ignore
   */
  it('shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkIt', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Write a text string
          gridStore.write('Hello world', function(err, gridStore) {
            // Close the
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Open the file again and unlin it
              new GridStore(db, fileId, 'r').open(function(err, gridStore) {
                // Unlink the file
                gridStore.unlink(function(err, result) {
                  test.ok(result);
                  test.equal(null, err);

                  // Verify that the file no longer exists
                  GridStore.exist(db, fileId, function(err, result) {
                    test.equal(null, err);
                    test.equal(false, result);

                    client.close();
                    done();
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
   * A simple example showing how to access the files collection object.
   *
   * @example-class GridStore
   * @example-method collection
   * @ignore
   */
  it('shouldCorrectlyAccessFilesCollection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Access the Chunk collection
          gridStore.collection(function(err, collection) {
            test.ok(collection);
            test.equal(null, err);

            client.close();
            done();
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
   *
   * @example-class GridStore
   * @example-method GridStore.readlines
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlines', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Write one line to gridStore
          gridStore.puts('line one', function(err, gridStore) {
            // Write second line to gridStore
            gridStore.puts('line two', function(err, gridStore) {
              // Write third line to gridStore
              gridStore.puts('line three', function(err, gridStore) {
                // Flush file to disk
                gridStore.close(function(err, result) {
                  test.ok(result);
                  test.equal(null, err);

                  // Read back all the lines
                  GridStore.readlines(db, fileId, function(err, lines) {
                    test.deepEqual(['line one\n', 'line two\n', 'line three\n'], lines);

                    client.close();
                    done();
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
   * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
   *
   * @example-class GridStore
   * @example-method readlines
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlines', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w');

        // Open the new file
        gridStore.open(function(err, gridStore) {
          // Write one line to gridStore
          gridStore.puts('line one', function(err, gridStore) {
            // Write second line to gridStore
            gridStore.puts('line two', function(err, gridStore) {
              // Write third line to gridStore
              gridStore.puts('line three', function(err, gridStore) {
                // Flush file to disk
                gridStore.close(function(err, result) {
                  test.ok(result);
                  test.equal(null, err);

                  // Open file for reading
                  gridStore = new GridStore(db, fileId, 'r');
                  gridStore.open(function(err, gridStore) {
                    // Read all the lines and verify correctness
                    gridStore.readlines(function(err, lines) {
                      test.deepEqual(['line one\n', 'line two\n', 'line three\n'], lines);

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
      // END
    }
  });

  /**
   * A simple example showing the usage of the read method.
   *
   * @example-class GridStore
   * @example-method GridStore.read
   * @ignore
   */
  it('shouldCorrectlyPutACoupleOfLinesInGridStoreRead', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a new file
        var gridStore = new GridStore(db, null, 'w');
        // Read in the content from a file, replace with your own
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        // Open the file
        gridStore.open(function(err, gridStore) {
          // Write the binary file data to GridFS
          gridStore.write(data, function(err, gridStore) {
            // Flush the remaining data to GridFS
            gridStore.close(function(err, result) {
              // Read in the whole file and check that it's the same content
              GridStore.read(db, result._id, function(err, fileData) {
                test.equal(data.length, fileData.length);

                client.close();
                done();
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the stream method.
   *
   * @example-class GridStore
   * @example-method stream
   * @ignore
   */
  it('shouldCorrectlyReadFileUsingStream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open a file for reading
        var gridStoreR = new GridStore(db, 'test_gs_read_stream', 'r');
        // Open a file for writing
        var gridStoreW = new GridStore(db, 'test_gs_read_stream', 'w');
        // Read in the data of a file
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        var readLen = 0;

        // Open the file we are writting to
        gridStoreW.open(function(err, gs) {
          // Write the file content
          gs.write(data, function(err, gs) {
            // Flush the file to GridFS
            gs.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Open the read file
              gridStoreR.open(function(err, gs) {
                // Create a stream to the file
                var stream = gs.stream();

                // Register events
                stream.on('data', function(chunk) {
                  // Record the length of the file
                  readLen += chunk.length;
                });

                stream.on('end', function() {
                  // Verify the correctness of the read data
                  test.equal(data.length, readLen);
                  client.close();
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
   * A simple example showing how to pipe a to a gridstore object
   *
   * @example-class GridStore
   * @example-method stream
   * @ignore
   */
  it('shouldCorrectlyStreamWriteToGridStoreObject', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Set up gridStore
        var gridStore = new GridStore(db, 'test_stream_write', 'w');
        var stream = gridStore.stream();
        // Create a file reader stream to an object
        var fileStream = fs.createReadStream(
          './test/functional/data/test_gs_working_field_read.pdf'
        );
        stream.on('end', function() {
          // Just read the content and compare to the raw binary
          GridStore.read(db, 'test_stream_write', function(err, gridData) {
            var fileData = fs.readFileSync('./test/functional/data/test_gs_working_field_read.pdf');
            test.equal(fileData.toString('hex'), gridData.toString('hex'));
            client.close();
            done();
          });
        });

        // Pipe it through to the gridStore
        fileStream.pipe(stream);
      });
      // END
    }
  });

  /**
   * A simple example showing how to pipe a file stream through from gridfs to a file
   *
   * @example-class GridStore
   * @example-method stream
   * @ignore
   */
  it('shouldCorrectlyPipeAGridFsToAfile', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open a file for writing
        var gridStoreWrite = new GridStore(db, 'test_gs_read_stream_pipe', 'w', {
          chunkSize: 1024
        });
        gridStoreWrite.writeFile('./test/functional/data/test_gs_weird_bug.png', function(
          err,
          result
        ) {
          test.equal(null, err);
          test.ok(result != null);
          // Open the gridStore for reading and pipe to a file
          var gridStore = new GridStore(db, 'test_gs_read_stream_pipe', 'r');
          gridStore.open(function(err, gridStore) {
            // Create a file write stream
            var fileStream = fs.createWriteStream('./test_gs_weird_bug_streamed.tmp');
            // Grab the read stream
            var stream = gridStore.stream();
            // When the stream is finished close the database
            fileStream.on('close', function() {
              // Read the original content
              var originalData = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');
              // Ensure we are doing writing before attempting to open the file
              fs.readFile('./test_gs_weird_bug_streamed.tmp', function(err, streamedData) {
                // Compare the data
                for (var i = 0; i < originalData.length; i++) {
                  test.equal(originalData[i], streamedData[i]);
                }

                // Close the database
                client.close();
                done();
              });
            });

            // Pipe out the data
            stream.pipe(fileStream);
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the seek method.
   *
   * @example-class GridStore
   * @example-method seek
   * @ignore
   */
  it('shouldCorrectlySeekWithBuffer', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a file and open it
        var gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'w');
        gridStore.open(function(err, gridStore) {
          // Write some content to the file
          gridStore.write(Buffer.from('hello, world!', 'utf8'), function(err, gridStore) {
            // Flush the file to GridFS
            gridStore.close(function() {
              // Open the file in read mode
              var gridStore2 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore2.open(function(err, gridStore) {
                // Seek to start
                gridStore.seek(0, function(err, gridStore) {
                  // Read first character and verify
                  gridStore.getc(function(err, chr) {
                    test.equal('h', chr.toString());
                  });
                });
              });

              // Open the file in read mode
              var gridStore3 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore3.open(function(err, gridStore) {
                // Seek to 7 characters from the beginning off the file and verify
                gridStore.seek(7, function(err, gridStore) {
                  gridStore.getc(function(err, chr) {
                    test.equal('w', chr.toString());
                  });
                });
              });

              // Open the file in read mode
              var gridStore5 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore5.open(function(err, gridStore) {
                // Seek to -1 characters from the end off the file and verify
                gridStore.seek(-1, GridStore.IO_SEEK_END, function(err, gridStore) {
                  gridStore.getc(function(err, chr) {
                    test.equal('!', chr.toString());
                  });
                });
              });

              // Open the file in read mode
              var gridStore6 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore6.open(function(err, gridStore) {
                // Seek to -6 characters from the end off the file and verify
                gridStore.seek(-6, GridStore.IO_SEEK_END, function(err, gridStore) {
                  gridStore.getc(function(err, chr) {
                    test.equal('w', chr.toString());
                  });
                });
              });

              // Open the file in read mode
              var gridStore7 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore7.open(function(err, gridStore) {
                // Seek forward 7 characters from the current read position and verify
                gridStore.seek(7, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                  gridStore.getc(function(err, chr) {
                    test.equal('w', chr.toString());

                    // Seek forward -1 characters from the current read position and verify
                    gridStore.seek(-1, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                      gridStore.getc(function(err, chr) {
                        test.equal('w', chr.toString());

                        // Seek forward -4 characters from the current read position and verify
                        gridStore.seek(-4, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                          gridStore.getc(function(err, chr) {
                            test.equal('o', chr.toString());

                            // Seek forward 3 characters from the current read position and verify
                            gridStore.seek(3, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                              gridStore.getc(function(err, chr) {
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
        });
      });
      // END
    }
  });

  /**
   * A simple example showing how to rewind and overwrite the file.
   *
   * @example-class GridStore
   * @example-method rewind
   * @ignore
   */
  it('shouldCorrectlyRewingAndTruncateOnWrite', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Our file ID
        var fileId = new ObjectID();

        // Create a new file
        var gridStore = new GridStore(db, fileId, 'w');
        // Open the file
        gridStore.open(function(err, gridStore) {
          // Write to the file
          gridStore.write('hello, world!', function(err, gridStore) {
            // Flush the file to disk
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Reopen the file
              gridStore = new GridStore(db, fileId, 'w');
              gridStore.open(function(err, gridStore) {
                // Write some more text to the file
                gridStore.write('some text is inserted here', function(err, gridStore) {
                  // Let's rewind to truncate the file
                  gridStore.rewind(function(err, gridStore) {
                    // Write something from the start
                    gridStore.write('abc', function(err, gridStore) {
                      // Flush the data to mongodb
                      gridStore.close(function(err, result) {
                        test.ok(result);
                        test.equal(null, err);

                        // Verify that the new data was written
                        GridStore.read(db, fileId, function(err, data) {
                          test.equal('abc', data.toString());

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
      // END
    }
  });

  /**
   * A simple example showing the usage of the eof method.
   *
   * @example-class GridStore
   * @example-method eof
   * @ignore
   */
  it('shouldCorrectlyDetectEOF', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Open the file in write mode
        var gridStore = new GridStore(db, 'test_gs_empty_file_eof', 'w');
        gridStore.open(function(err, gridStore) {
          // Flush the empty file to GridFS
          gridStore.close(function(err, gridStore) {
            test.ok(gridStore);
            test.equal(null, err);

            // Open the file in read mode
            var gridStore2 = new GridStore(db, 'test_gs_empty_file_eof', 'r');
            gridStore2.open(function(err, gridStore) {
              // Verify that we are at the end of the file
              test.equal(true, gridStore.eof());

              client.close();
              done();
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the usage of the tell method.
   *
   * @example-class GridStore
   * @example-method tell
   * @ignore
   */
  it('shouldCorrectlyExecuteGridstoreTell', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a new file
        var gridStore = new GridStore(db, 'test_gs_tell', 'w');
        // Open the file
        gridStore.open(function(err, gridStore) {
          // Write a string to the file
          gridStore.write('hello, world!', function(err, gridStore) {
            // Flush the file to GridFS
            gridStore.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Open the file in read only mode
              var gridStore2 = new GridStore(db, 'test_gs_tell', 'r');
              gridStore2.open(function(err, gridStore) {
                // Read the first 5 characters
                gridStore.read(5, function(err, data) {
                  test.equal('hello', data.toString());

                  // Get the current position of the read head
                  gridStore.tell(function(err, position) {
                    test.equal(5, position);

                    client.close();
                    done();
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
   * A simple example showing the usage of the seek method.
   *
   * @example-class GridStore
   * @example-method getc
   * @ignore
   */
  it('shouldCorrectlyRetrieveSingleCharacterUsingGetC', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a file and open it
        var gridStore = new GridStore(db, 'test_gs_getc_file', 'w');
        gridStore.open(function(err, gridStore) {
          // Write some content to the file
          gridStore.write(Buffer.from('hello, world!', 'utf8'), function(err, gridStore) {
            // Flush the file to GridFS
            gridStore.close(function() {
              // Open the file in read mode
              var gridStore2 = new GridStore(db, 'test_gs_getc_file', 'r');
              gridStore2.open(function(err, gridStore) {
                // Read first character and verify
                gridStore.getc(function(err, chr) {
                  test.equal('h', chr.toString());

                  client.close();
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
   * A simple example showing how to save a file with a filename allowing for multiple files with the same name
   *
   * @example-class GridStore
   * @example-method open
   * @ignore
   */
  it('shouldCorrectlyRetrieveSingleCharacterUsingGetC', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Create a file and open it
        var gridStore = new GridStore(db, new ObjectID(), 'test_gs_getc_file', 'w');
        gridStore.open(function(err, gridStore) {
          // Write some content to the file
          gridStore.write(Buffer.from('hello, world!', 'utf8'), function(err, gridStore) {
            // Flush the file to GridFS
            gridStore.close(function(err, fileData) {
              test.ok(fileData);
              test.equal(null, err);

              // Create another file with same name and and save content to it
              gridStore = new GridStore(db, new ObjectID(), 'test_gs_getc_file', 'w');
              gridStore.open(function(err, gridStore) {
                // Write some content to the file
                gridStore.write(Buffer.from('hello, world!', 'utf8'), function(err, gridStore) {
                  // Flush the file to GridFS
                  gridStore.close(function(err, fileData) {
                    test.equal(null, err);

                    // Open the file in read mode using the filename
                    var gridStore2 = new GridStore(db, 'test_gs_getc_file', 'r');
                    gridStore2.open(function(err, gridStore) {
                      // Read first character and verify
                      gridStore.getc(function(err, chr) {
                        test.equal('h', chr.toString());

                        // Open the file using an object id
                        gridStore2 = new GridStore(db, fileData._id, 'r');
                        gridStore2.open(function(err, gridStore) {
                          // Read first character and verify
                          gridStore.getc(function(err, chr) {
                            test.equal('h', chr.toString());

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
   * A simple example showing the use of the readstream pause function.
   *
   * @example-class GridStoreStream
   * @example-method pause
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheReadStreamPauseFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // File id
        var fileId = new ObjectID();
        // Create a file
        var file = new GridStore(db, fileId, 'w', { chunk_size: 5 });
        file.open(function(err, file) {
          // Write some content and flush to disk
          file.write('Hello world', function(err, file) {
            file.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Let's create a read file
              file = new GridStore(db, fileId, 'r');
              // Open the file
              file.open(function(err, file) {
                // Perform a find to get a cursor
                var stream = file.stream();

                // For each data item
                stream.on('data', function() {
                  // Pause stream
                  stream.pause();
                  // Restart the stream after 1 miliscecond
                  setTimeout(function() {
                    stream.resume();
                  }, 100);
                });

                // For each data item
                stream.on('end', function() {
                  client.close();
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
   * A simple example showing the use of the readstream resume function.
   *
   * @example-class GridStoreStream
   * @example-method resume
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheReadStreamResumeFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // File id
        var fileId = new ObjectID();
        // Create a file
        var file = new GridStore(db, fileId, 'w', { chunk_size: 5 });
        file.open(function(err, file) {
          // Write some content and flush to disk
          var fileBody = 'Hello world';
          file.write(fileBody, function(err, file) {
            file.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Let's create a read file
              file = new GridStore(db, fileId, 'r');

              // Open the file
              file.open(function(err, file) {
                // Perform a find to get a cursor
                var stream = file.stream(true);

                // Pause the stream initially
                stream.pause();

                // Save read content here
                var fileBuffer = '';

                // For each data item
                stream.on('data', function(item) {
                  // Pause stream
                  stream.pause();

                  fileBuffer += item.toString('utf8');

                  // Restart the stream after 1 miliscecond
                  setTimeout(function() {
                    stream.resume();
                  }, 100);
                });

                // For each data item
                stream.on('end', function() {
                  // Have we received the same file back?
                  test.equal(fileBuffer, fileBody);
                  client.close();
                  done();
                });

                // Resume the stream
                stream.resume();
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * A simple example showing the use of the readstream destroy function.
   *
   * @example-class GridStoreStream
   * @example-method destroy
   * @ignore
   */
  it('shouldStreamDocumentsUsingTheReadStreamDestroyFunction', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // File id
        var fileId = new ObjectID();
        // Create a file
        var file = new GridStore(db, fileId, 'w');
        file.open(function(err, file) {
          // Write some content and flush to disk
          file.write('Hello world', function(err, file) {
            file.close(function(err, result) {
              test.ok(result);
              test.equal(null, err);

              // Let's create a read file
              file = new GridStore(db, fileId, 'r');
              // Open the file
              file.open(function(err, file) {
                // Perform a find to get a cursor
                var stream = file.stream();

                // For each data item
                stream.on('data', function() {
                  // Destroy the stream
                  stream.destroy();
                });

                // When the stream is done
                stream.on('end', function() {
                  setTimeout(() => {
                    client.close();
                    done();
                  }, 1000);
                });
              });
            });
          });
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
   * Example of a simple ordered insert/update/upsert/remove ordered collection
   *
   * @example-class Collection
   * @example-method initializeOrderedBulkOp
   * @ignore
   */
  it('Should correctly execute ordered batch with no errors using write commands', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        batch.execute(function(err, result) {
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
          done();
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
   * @ignore
   */
  it('Should correctly execute unordered batch with no errors', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        batch.execute(function(err, result) {
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
          done();
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
   * @ignore
   */
  it('Should correctly execute insertOne operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('insert_one');
        col.insertOne({ a: 1 }, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.insertedCount);
          // Finish up test
          client.close();
          done();
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
   * @ignore
   */
  it('Should correctly execute insertMany operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('insert_many');
        col.insertMany([{ a: 1 }, { a: 2 }], function(err, r) {
          test.equal(null, err);
          test.equal(2, r.insertedCount);
          // Finish up test
          client.close();
          done();
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
   * @ignore
   */
  it('Should correctly execute updateOne operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('update_one');
        col.updateOne({ a: 1 }, { $set: { a: 2 } }, { upsert: true }, function(err, r) {
          test.equal(null, err);
          test.equal(0, r.matchedCount);
          test.equal(1, r.upsertedCount);
          // Finish up test
          client.close();
          done();
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
   * @ignore
   */
  it('Should correctly execute updateMany operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('update_many');
        col.insertMany([{ a: 1 }, { a: 1 }], function(err, r) {
          test.equal(null, err);
          test.equal(2, r.insertedCount);

          // Update all documents
          col.updateMany({ a: 1 }, { $set: { b: 1 } }, function(err, r) {
            test.equal(null, err);
            test.equal(2, r.matchedCount);
            test.equal(2, r.modifiedCount);

            // Finish up test
            client.close();
            done();
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
   * @ignore
   */
  it('Should correctly execute removeOne operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('remove_one');
        col.insertMany([{ a: 1 }, { a: 1 }], function(err, r) {
          test.equal(null, err);
          test.equal(2, r.insertedCount);

          col.removeOne({ a: 1 }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.deletedCount);
            // Finish up test
            client.close();
            done();
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
   * @ignore
   */
  it('Should correctly execute removeMany operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('remove_many');
        col.insertMany([{ a: 1 }, { a: 1 }], function(err, r) {
          test.equal(null, err);
          test.equal(2, r.insertedCount);

          // Update all documents
          col.removeMany({ a: 1 }, function(err, r) {
            test.equal(null, err);
            test.equal(2, r.deletedCount);

            // Finish up test
            client.close();
            done();
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
   * @ignore
   */
  it('Should correctly execute bulkWrite operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
          function(err, r) {
            test.equal(null, err);
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
            done();
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
   * @ignore
   */
  it('Should correctly execute findOneAndDelete operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('find_one_and_delete');
        col.insertMany([{ a: 1, b: 1 }], { w: 1 }, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          col.findOneAndDelete({ a: 1 }, { projection: { b: 1 }, sort: { a: 1 } }, function(
            err,
            r
          ) {
            test.equal(null, err);
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            client.close();
            done();
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
   * @ignore
   */
  it('Should correctly execute findOneAndReplace operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('find_one_and_replace');
        col.insertMany([{ a: 1, b: 1 }], { w: 1 }, function(err, r) {
          test.equal(null, err);
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
            function(err, r) {
              test.equal(null, err);
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.c);

              client.close();
              done();
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
   * @ignore
   */
  it('Should correctly execute findOneAndUpdate operation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        // Get the collection
        var col = db.collection('find_one_and_update');
        col.insertMany([{ a: 1, b: 1 }], { w: 1 }, function(err, r) {
          test.equal(null, err);
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
            function(err, r) {
              test.equal(null, err);
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.d);

              client.close();
              done();
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
   * @ignore
   */
  it('Should correctly add capped collection options to cursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
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
        test.equal(null, err);

        // Create a capped collection with a maximum of 1000 documents
        db.createCollection(
          'a_simple_collection_2',
          { capped: true, size: 100000, max: 10000, w: 1 },
          function(err, collection) {
            test.equal(null, err);

            var docs = [];
            for (var i = 0; i < 1000; i++) docs.push({ a: i });

            // Insert a document in the capped collection
            collection.insertMany(docs, configuration.writeConcernMax(), function(err, result) {
              test.ok(result);
              test.equal(null, err);

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
                done();
              });
            });
          }
        );
      });
      // END
    }
  });
});
