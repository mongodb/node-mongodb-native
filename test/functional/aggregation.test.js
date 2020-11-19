'use strict';

const { filterForCommands } = require('./shared');

var expect = require('chai').expect;

describe('Aggregation', function () {
  /**
   * Correctly call the aggregation framework using a pipeline in an Array.
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should correctly execute simple aggregation pipeline using array', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray');
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

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
            expect(result[0]._id.tags).to.equal('good');
            expect(result[0].authors).to.eql(['bob']);
            expect(result[1]._id.tags).to.equal('fun');
            expect(result[1].authors).to.eql(['bob']);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  it('should correctly execute db.aggregate() with $currentOp', {
    metadata: {
      requires: {
        mongodb: '>=4.0.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      const client = this.configuration.newClient({ w: 1 }, { poolSize: 1 });

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        const db = client.db('admin');
        const cursor = db.aggregate([{ $currentOp: { localOps: true } }]);

        cursor.toArray((err, result) => {
          expect(err).to.not.exist;

          const aggregateOperation = result.filter(op => op.command && op.command.aggregate)[0];
          expect(aggregateOperation.command.aggregate).to.equal(1);
          expect(aggregateOperation.command.pipeline).to.eql([{ $currentOp: { localOps: true } }]);
          expect(aggregateOperation.command.cursor).to.deep.equal({});
          expect(aggregateOperation.command['$db']).to.equal('admin');

          client.close(done);
        });
      });
    }
  });

  /**
   * Correctly call the aggregation framework using a pipeline expressed as an argument list.
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should fail when executing simple aggregation pipeline using arguments not an array', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection(
          'shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments'
        );
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

          // Execute aggregate, notice the pipeline is expressed as function call parameters
          // instead of an Array.
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
            expect(result[0]._id.tags).to.equal('good');
            expect(result[0].authors).to.eql(['bob']);
            expect(result[1]._id.tags).to.equal('fun');
            expect(result[1].authors).to.eql(['bob']);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework using a pipeline expressed as an argument list.
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should fail when executing simple aggregation pipeline using arguments using single object', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection(
          'shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments'
        );
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

          // Execute aggregate, notice the pipeline is expressed as function call parameters
          // instead of an Array.
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
            expect(result[0]._id.tags).to.equal('good');
            expect(result[0].authors).to.eql(['bob']);
            expect(result[1]._id.tags).to.equal('fun');
            expect(result[1].authors).to.eql(['bob']);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should correctly return and iterate over all the cursor results', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: 'single'
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(err).to.not.exist;
          expect(result).to.exist;

          // Execute aggregate, notice the pipeline is expressed as an Array
          var cursor = collection.aggregate([
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
          ]);

          // Iterate over all the items in the cursor
          cursor.toArray(function (err, result) {
            expect(err).to.not.exist;
            expect(result).to.exist;

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor and call explain
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should correctly return a cursor and call explain', {
    metadata: {
      requires: {
        mongodb: '>2.5.3',
        topology: 'single'
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
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
            {
              cursor: { batchSize: 100 }
            }
          );

          // Iterate over all the items in the cursor
          cursor.explain(function (err, result) {
            expect(err).to.not.exist;
            expect(result.stages).to.have.lengthOf.at.least(1);
            expect(result.stages[0]).to.have.property('$cursor');

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should correctly return a cursor with batchSize 1 and call next', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.3',
        topology: 'single'
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect((err, client) => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const db = client.db(databaseName);
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
        const collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
        // Insert the docs
        collection.insert(docs, { w: 1 }, (err, result) => {
          expect(result).to.exist;
          expect(err).to.not.exist;

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
              },
              { $sort: { _id: -1 } }
            ],
            {
              cursor: { batchSize: 1 }
            }
          );
          this.defer(() => cursor.close());

          // Iterate over all the items in the cursor
          cursor.next((err, result) => {
            expect(err).to.not.exist;
            expect(result._id.tags).to.equal('good');
            expect(result.authors).to.eql(['bob']);
            done();
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly call the aggregation framework and write the results to a new collection
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should correctly write the results out to a new collection', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

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
            {
              out: 'testingOutCollectionForAggregation'
            }
          );
          cursor.toArray(function (err, results) {
            expect(err).to.not.exist;
            expect(results).to.be.empty;

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly use allowDiskUse when performing an aggregation
   *
   * @example-class Collection
   * @example-method aggregate
   */
  it('should correctly use allowDiskUse when performing an aggregation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.5',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
        databaseName = this.configuration.db;

      // LINE var MongoClient = require('mongodb').MongoClient;
      // LINE const client = new MongoClient('mongodb://localhost:27017/test');
      // REPLACE this.configuration.writeConcernMax() WITH {w:1}
      // REMOVE-LINE test.
      // BEGIN
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

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
              },
              { $sort: { _id: -1 } }
            ],
            {
              allowDiskUse: true
            }
          );
          cursor.toArray(function (err, results) {
            expect(err).to.not.exist;
            expect(results[0]._id.tags).to.equal('good');
            expect(results[0].authors).to.eql(['bob']);
            expect(results[1]._id.tags).to.equal('fun');
            expect(results[1].authors).to.eql(['bob']);

            client.close(done);
          });
        });
      });
      // END
    }
  });

  /**
   * Correctly perform simple group
   */
  it('should perform a simple group aggregation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.5',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var databaseName = this.configuration.db;
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
        // Create a collection
        var col = db.collection('shouldPerformSimpleGroupAggregation');
        col.remove({}, function (err) {
          expect(err).to.not.exist;

          // Insert a single document
          col.insert([{ a: 1 }, { a: 1 }, { a: 1 }], function (err, r) {
            expect(err).to.not.exist;
            expect(r.result.n).to.equal(3);

            // Get first two documents that match the query
            col
              .aggregate([
                { $match: {} },
                {
                  $group: { _id: '$a', total: { $sum: '$a' } }
                }
              ])
              .toArray(function (err, docs) {
                expect(err).to.not.exist;
                expect(docs[0].total).to.equal(3);

                client.close(done);
              });
          });
        });
      });
    }
  });

  /**
   * Correctly perform simple group
   */
  it('should correctly perform an aggregation using a collection name with dot in it', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.5',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var databaseName = this.configuration.db;
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
        db.collection('te.st', function (err, col) {
          expect(err).to.not.exist;
          var count = 0;

          col.insert([{ a: 1 }, { a: 1 }, { a: 1 }], function (err, r) {
            expect(err).to.not.exist;
            expect(r.result.n).to.equal(3);

            const cursor = col.aggregate([{ $project: { a: 1 } }]);

            cursor.toArray(function (err, docs) {
              expect(err).to.not.exist;
              expect(docs.length).to.be.greaterThan(0);

              //Using cursor - KO
              col
                .aggregate([{ $project: { a: 1 } }], {
                  cursor: { batchSize: 10000 }
                })
                .forEach(
                  function () {
                    count = count + 1;
                  },
                  function (err) {
                    expect(err).to.not.exist;
                    expect(count).to.be.greaterThan(0);

                    client.close(done);
                  }
                );
            });
          });
        });
      });
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   */
  it('should fail aggregation due to illegal cursor option and streams', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>2.5.3',
        topology: 'single'
      }
    },

    test: function (done) {
      var databaseName = this.configuration.db;
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
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
        var collection = db.collection('shouldCorrectlyDoAggWithCursorGetStream');
        // Insert the docs
        collection.insert(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

          try {
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
              {
                cursor: 1
              }
            );
          } catch (err) {
            client.close(done);
            return;
          }

          // should never happen
          expect(true).to.be.false;
        });
      });
    }
  });

  it('should fail if you try to use explain flag with writeConcern', {
    metadata: {
      requires: {
        mongodb: '>3.6.0',
        topology: 'single'
      }
    },

    test: function (done) {
      var databaseName = this.configuration.db;
      var client = this.configuration.newClient({ poolSize: 1 });

      const testCases = [
        { writeConcern: { j: true } },
        { readConcern: { level: 'local' }, writeConcern: { j: true } }
      ];

      client.connect(function (err, client) {
        const wrapup = err => {
          client.close(err2 => done(err || err2));
        };

        const db = client.db(databaseName);

        Promise.all(
          testCases.map(testCase => {
            const stringifiedTestCase = JSON.stringify(testCase);
            const collection = db.collection('foo');
            Object.assign(collection.s, testCase);
            try {
              const promise = collection
                .aggregate([{ $project: { _id: 0 } }, { $out: 'bar' }], { explain: true })
                .toArray()
                .then(
                  () => {
                    throw new Error(
                      'Expected aggregation to not succeed for options ' + stringifiedTestCase
                    );
                  },
                  () => {
                    throw new Error(
                      'Expected aggregation to fail on client instead of server for options ' +
                        stringifiedTestCase
                    );
                  }
                );

              return promise;
            } catch (e) {
              expect(e).to.exist;
              return Promise.resolve();
            }
          })
        ).then(() => wrapup(), wrapup);
      });
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   */
  it(
    'should ensure MaxTimeMS is correctly passed down into command execution when using a cursor',
    {
      // Add a tag that our runner can trigger on
      // in this case we are setting that node needs to be higher than 0.10.X to run
      metadata: {
        requires: {
          mongodb: '>=2.6.0',
          topology: 'single'
        }
      },

      test: function (done) {
        const client = this.configuration.newClient({ w: 1 }, { poolSize: 1 }),
          databaseName = this.configuration.db;

        // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
        // DOC_START
        client.connect((err, client) => {
          expect(err).to.not.exist;
          this.defer(() => client.close());

          const db = client.db(databaseName);
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
          const collection = db.collection('shouldCorrectlyDoAggWithCursorMaxTimeMSSet');
          // Insert the docs
          collection.insert(docs, { w: 1 }, (err, result) => {
            expect(result).to.exist;
            expect(err).to.not.exist;

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
                },
                { $sort: { _id: -1 } }
              ],
              {
                cursor: { batchSize: 1 },
                maxTimeMS: 1000
              }
            );
            this.defer(() => cursor.close());

            // Override the db.command to validate the correct command
            // is executed
            const cmd = db.command;
            // Validate the command
            db.command = function (c) {
              expect(err).to.not.exist;
              expect(c.maxTimeMS).to.equal(1000);

              // Apply to existing command
              cmd.apply(db, Array.prototype.slice.call(arguments, 0));
            };

            // Iterate over all the items in the cursor
            cursor.next((err, result) => {
              expect(err).to.not.exist;
              expect(result._id.tags).to.equal('good');
              expect(result.authors).to.eql(['bob']);

              // Validate the command
              db.command = function (c) {
                expect(err).to.not.exist;
                expect(c.maxTimeMS).to.equal(1000);

                // Apply to existing command
                cmd.apply(db, Array.prototype.slice.call(arguments, 0));
              };

              // Execute aggregate, notice the pipeline is expressed as an Array
              const secondCursor = collection.aggregate(
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
                {
                  maxTimeMS: 1000
                }
              );
              this.defer(() => secondCursor.close());
              expect(secondCursor).to.exist;

              // Return the command
              db.command = cmd;
              done();
            });
          });
        });
        // DOC_END
      }
    }
  );

  it('should pass a comment down via the aggregation command', {
    metadata: {
      requires: {
        mongodb: '>=3.5.0',
        topology: 'single',
        node: '>=4.8.5'
      }
    },
    test: function (done) {
      const client = this.configuration.newClient({ w: 1 }, { poolSize: 1 });
      const databaseName = this.configuration.db;

      const comment = 'Darmok and Jalad at Tanagra';

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        const db = client.db(databaseName);
        const collection = db.collection('testingPassingDownTheAggregationCommand');

        const command = db.command;

        db.command = function (c) {
          expect(c).to.be.an('object');
          expect(c.comment).to.be.a('string').and.to.equal('comment');
          command.apply(db, Array.prototype.slice.call(arguments, 0));
        };

        const cursor = collection.aggregate([{ $project: { _id: 1 } }], { comment });

        expect(cursor).to.not.be.null;
        client.close(done);
      });
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   */
  it('should correctly handle ISODate date matches in aggregation framework', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: 'single'
      }
    },

    test: function (done) {
      var databaseName = this.configuration.db;
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
        var date1 = new Date();
        date1.setHours(date1.getHours() - 1);

        // Some docs for insertion
        var docs = [
          {
            a: date1,
            b: 1
          },
          {
            a: new Date(),
            b: 2
          }
        ];

        // Create a collection
        var collection = db.collection('shouldCorrectlyQueryUsingISODate');
        // Insert the docs
        collection.insertMany(docs, { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

          // Execute aggregate, notice the pipeline is expressed as an Array
          var cursor = collection.aggregate([
            {
              $match: {
                a: new Date(date1.toISOString())
              }
            }
          ]);

          // Iterate over all the items in the cursor
          cursor.next(function (err, result) {
            expect(err).to.not.exist;
            expect(result.b).to.equal(1);

            client.close(done);
          });
        });
      });
      // DOC_END
    }
  });

  /**
   * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
   */
  it('should correctly exercise hasNext function on aggregation cursor', {
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: 'single'
      }
    },

    test: function (done) {
      var databaseName = this.configuration.db;
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(databaseName);
        // Create a collection
        var collection = db.collection('shouldCorrectlyQueryUsingISODate3');
        // Insert the docs
        collection.insertMany([{ a: 1 }, { b: 1 }], { w: 1 }, function (err, result) {
          expect(result).to.exist;
          expect(err).to.not.exist;

          // Execute aggregate, notice the pipeline is expressed as an Array
          var cursor = collection.aggregate([
            {
              $match: {}
            }
          ]);

          // Iterate over all the items in the cursor
          cursor.hasNext(function (err, result) {
            expect(err).to.not.exist;
            expect(result).to.equal(true);

            client.close(done);
          });
        });
      });
      // DOC_END
    }
  });

  it('should not send a batchSize for aggregations with an out stage', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },
    test: function (done) {
      const databaseName = this.configuration.db;
      const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1,
        monitorCommands: true
      });

      let err;
      let coll1;
      let coll2;

      const events = [];
      client.on('commandStarted', filterForCommands(['aggregate'], events));

      client
        .connect()
        .then(() => {
          coll1 = client.db(databaseName).collection('coll1');
          coll2 = client.db(databaseName).collection('coll2');

          return Promise.all([coll1.deleteMany({}), coll2.deleteMany({})]);
        })
        .then(() => {
          const docs = Array.from({ length: 10 }).map(() => ({ a: 1 }));
          return Promise.all([
            coll1.insertMany(docs),
            client
              .db(databaseName)
              .createCollection('coll2')
              .catch(() => {})
          ]);
        })
        .then(() => {
          return Promise.all(
            [
              coll1.aggregate([{ $out: 'coll2' }]),
              coll1.aggregate([{ $out: 'coll2' }], { batchSize: 0 }),
              coll1.aggregate([{ $out: 'coll2' }], { batchSize: 1 }),
              coll1.aggregate([{ $out: 'coll2' }], { batchSize: 30 }),
              coll1.aggregate([{ $match: { a: 1 } }, { $out: 'coll2' }]),
              coll1.aggregate([{ $match: { a: 1 } }, { $out: 'coll2' }], { batchSize: 0 }),
              coll1.aggregate([{ $match: { a: 1 } }, { $out: 'coll2' }], { batchSize: 1 }),
              coll1.aggregate([{ $match: { a: 1 } }, { $out: 'coll2' }], { batchSize: 30 })
            ].map(cursor => cursor.toArray())
          );
        })
        .then(() => {
          expect(events).to.be.an('array').with.a.lengthOf(8);
          events.forEach(event => {
            expect(event).to.have.property('commandName', 'aggregate');
            expect(event)
              .to.have.property('command')
              .that.has.property('cursor')
              .that.does.not.have.property('batchSize');
          });
        })
        .catch(_err => {
          err = _err;
        })
        .then(() => client.close())
        .then(() => done(err));
    }
  });
});
