import { expect } from 'chai';

import { type MongoClient, MongoInvalidArgumentError } from '../../mongodb';
import { filterForCommands } from '../shared';

describe('Aggregation', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('should correctly execute simple aggregation pipeline using array', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    const collection = db.collection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray');
    // Insert the docs
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
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

  it('should correctly execute db.aggregate() with $currentOp', {
    metadata: { requires: { mongodb: '>=4.0.0' } },
    test: function (done) {
      const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

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
    }
  });

  it('should fail when executing simple aggregation pipeline using arguments not an array', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    const collection = db.collection(
      'shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments'
    );
    // Insert the docs
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
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

  it('should fail when executing simple aggregation pipeline using arguments using single object', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    const collection = db.collection(
      'shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments'
    );
    // Insert the docs
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
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

  it('should correctly return and iterate over all the cursor results', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
      expect(err).to.not.exist;
      expect(result).to.exist;

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

  it(
    'should correctly return a cursor and call explain',
    { requires: { mongodb: '<7.1.0' } },
    function (done) {
      const client = this.configuration.newClient({ maxPoolSize: 1 }),
        databaseName = this.configuration.db;

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
      collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
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
            cursor: { batchSize: 100 }
          }
        );

        // Iterate over all the items in the cursor
        cursor.explain(function (err, result) {
          expect(err).to.not.exist;
          expect(JSON.stringify(result)).to.include('$cursor');
          client.close(done);
        });
      });
    }
  );

  it('should correctly return a cursor with batchSize 1 and call next', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    collection.insertMany(docs, { writeConcern: { w: 1 } }, (err, result) => {
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

  it('should correctly write the results out to a new collection', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
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

  it('should correctly use allowDiskUse when performing an aggregation', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
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

  it('should perform a simple group aggregation', function (done) {
    const databaseName = this.configuration.db;
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      maxPoolSize: 1
    });

    const db = client.db(databaseName);
    // Create a collection
    const col = db.collection('shouldPerformSimpleGroupAggregation');
    col.deleteMany({}, function (err) {
      expect(err).to.not.exist;

      // Insert a single document
      col.insertMany([{ a: 1 }, { a: 1 }, { a: 1 }], function (err, r) {
        expect(err).to.not.exist;
        expect(r).property('insertedCount').to.equal(3);

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

  it('should correctly perform an aggregation using a collection name with dot in it', function (done) {
    const databaseName = this.configuration.db;
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      maxPoolSize: 1
    });

    const db = client.db(databaseName);
    const col = db.collection('te.st');
    let count = 0;

    col.insertMany([{ a: 1 }, { a: 1 }, { a: 1 }], function (err, r) {
      expect(err).to.not.exist;
      expect(r).property('insertedCount').to.equal(3);

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

  it('should fail aggregation due to illegal cursor option and streams', async function () {
    const db = client.db();
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
    const collection = db.collection('shouldCorrectlyDoAggWithCursorGetStream');
    // Insert the docs
    const result = await collection.insertMany(docs, { writeConcern: { w: 1 } });
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
      {
        cursor: 1
      }
    );

    const error = await cursor.next().catch(error => error);
    expect(error).to.be.instanceOf(MongoInvalidArgumentError);
  });

  it(`should fail if you try to use explain flag with { readConcern: { level: 'local' }, writeConcern: { j: true } }`, async function () {
    const db = client.db();

    const collection = db.collection('foo');
    Object.assign(collection.s, { writeConcern: { j: true } });
    const error = await collection
      .aggregate([{ $project: { _id: 0 } }, { $out: 'bar' }], { explain: true })
      .toArray()
      .catch(error => error);

    expect(error).to.be.instanceOf(MongoInvalidArgumentError);
  });

  it('should fail if you try to use explain flag with { writeConcern: { j: true } }', async function () {
    const db = client.db();

    const collection = db.collection('foo');
    Object.assign(collection.s, { writeConcern: { j: true } });

    const error = await collection
      .aggregate([{ $project: { _id: 0 } }, { $out: 'bar' }], { explain: true })
      .toArray()
      .catch(error => error);

    expect(error).to.be.instanceOf(MongoInvalidArgumentError);
  });

  it('should ensure MaxTimeMS is correctly passed down into command execution when using a cursor', function (done) {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 }),
      databaseName = this.configuration.db;

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
    collection.insertMany(docs, { writeConcern: { w: 1 } }, (err, result) => {
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
      const command = db.command.bind(db);
      // Validate the command
      db.command = function (...args: Parameters<(typeof db)['command']>) {
        const c = args[0];
        expect(err).to.not.exist;
        expect(c.maxTimeMS).to.equal(1000);

        // Apply to existing command
        command(...args);
      };

      // Iterate over all the items in the cursor
      cursor.next((err, result) => {
        expect(err).to.not.exist;
        expect(result._id.tags).to.equal('good');
        expect(result.authors).to.eql(['bob']);

        // Validate the command
        db.command = function (...args: Parameters<(typeof db)['command']>) {
          const c = args[0];
          expect(err).to.not.exist;
          expect(c.maxTimeMS).to.equal(1000);

          // Apply to existing command
          command(...args);
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
        db.command = command;
        done();
      });
    });
  });

  it('should pass a comment down via the aggregation command', async function () {
    const client = this.configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
    const databaseName = this.configuration.db;

    const comment = 'Darmok and Jalad at Tanagra';

    const db = client.db(databaseName);
    const collection = db.collection('testingPassingDownTheAggregationCommand');

    const command = db.command.bind(db);

    db.command = function (...args: Parameters<(typeof db)['command']>) {
      const c = args[0];
      expect(c).to.be.an('object');
      expect(c.comment).to.be.a('string').and.to.equal('comment');
      command(...args);
    };

    const cursor = collection.aggregate([{ $project: { _id: 1 } }], { comment });

    expect(cursor).to.not.be.null;

    await client.close();
  });

  it('should correctly handle ISODate date matches in aggregation framework', function (done) {
    const databaseName = this.configuration.db;
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      maxPoolSize: 1
    });

    const db = client.db(databaseName);
    const date1 = new Date();
    date1.setHours(date1.getHours() - 1);

    // Some docs for insertion
    const docs = [
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
    const collection = db.collection('shouldCorrectlyQueryUsingISODate');
    // Insert the docs
    collection.insertMany(docs, { writeConcern: { w: 1 } }, function (err, result) {
      expect(result).to.exist;
      expect(err).to.not.exist;

      // Execute aggregate, notice the pipeline is expressed as an Array
      const cursor = collection.aggregate([
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

  it('should correctly exercise hasNext function on aggregation cursor', function (done) {
    const databaseName = this.configuration.db;
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      maxPoolSize: 1
    });
    const db = client.db(databaseName);
    // Create a collection
    const collection = db.collection('shouldCorrectlyQueryUsingISODate3');
    // Insert the docs
    collection.insertMany([{ a: 1 }, { b: 1 }], { writeConcern: { w: 1 } }, function (err, result) {
      expect(result).to.exist;
      expect(err).to.not.exist;

      // Execute aggregate, notice the pipeline is expressed as an Array
      const cursor = collection.aggregate([
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

  it('should not send a batchSize for aggregations with an out stage', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },
    async test() {
      const databaseName = this.configuration.db;
      const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });

      const events = [];
      client.on('commandStarted', filterForCommands(['aggregate'], events));
      const coll1 = client.db(databaseName).collection('coll1');
      const coll2 = client.db(databaseName).collection('coll2');

      await Promise.all([coll1.deleteMany({}), coll2.deleteMany({})])
        .then(() => {
          const docs = Array.from({ length: 10 }).map(() => ({ a: 1 }));
          return Promise.all([
            coll1.insertMany(docs),
            client
              .db(databaseName)
              .createCollection('coll2')
              .catch(() => null)
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
        .finally(() => client.close());
    }
  });
});
