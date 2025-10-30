import { expect } from 'chai';
import { once } from 'events';

import { MongoClientClosedError } from '../../../src/error';
import { type MongoClient } from '../../../src/mongo_client';
import { ReadPreference } from '../../../src/read_preference';
import { ServerType } from '../../../src/sdam/common';
import { formatSort } from '../../../src/sort';
import { runLater, sleep } from '../../tools/utils';
import { assert as test, filterForCommands, setupDatabase } from '../shared';

describe('Cursor', function () {
  before(function () {
    return setupDatabase(this.configuration, [
      'cursorkilltest1',
      'cursor_session_tests',
      'cursor_session_tests2'
    ]);
  });

  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient({ maxPoolSize: 1, monitorCommands: true });
  });

  afterEach(async function () {
    await client.close();
  });

  it('should not throw an error when toArray and forEach are called after cursor is closed', async function () {
    const db = client.db();

    const collection = await db.collection('test_to_a');
    await collection.insertMany([{ a: 1 }]);
    const cursor = collection.find({});

    const firstToArray = await cursor.toArray().catch(error => error);
    expect(firstToArray).to.be.an('array');

    expect(cursor.closed).to.be.true;

    const secondToArray = await cursor.toArray().catch(error => error);
    expect(secondToArray).to.be.an('array');
    expect(secondToArray).to.have.lengthOf(0);

    const forEachResult = await cursor
      .forEach(() => {
        expect.fail('should not run forEach on an empty/closed cursor');
      })
      .catch(error => error);
    expect(forEachResult).to.be.undefined;
  });

  it('shouldCorrectlyExecuteCursorExplain', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_explain');

      await collection.insertMany([{ a: 1 }], configuration.writeConcernMax());

      const explanation = await collection.find({ a: 1 }).explain();

      expect(explanation).to.exist;
    }
  });

  it('shouldCorrectlyExecuteCursorCount', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_count');
      await collection.find().count();

      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      async function finished() {
        let count = await collection.find().count();
        test.equal(10, count);
        test.ok(count.constructor === Number);

        count = await collection.find({}, { limit: 5 }).count();
        test.equal(5, count);

        count = await collection.find({}, { skip: 5 }).count();
        test.equal(5, count);

        count = await db.collection('acollectionthatdoesn').count();

        test.equal(0, count);

        const cursor = collection.find();
        count = await cursor.count();
        test.equal(10, count);

        await cursor.forEach(() => {
          // do nothing
        });

        const count2 = await cursor.count();
        expect(count2).to.equal(10);
        expect(count2).to.equal(count);
      }

      await insert();
      await finished();
    }
  });

  it('should correctly execute cursor count with secondary readPreference', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const bag = [];
      client.on('commandStarted', filterForCommands(['count'], bag));

      const cursor = client
        .db()
        .collection('countTEST')
        .find({ qty: { $gt: 4 } });
      await cursor.count({ readPreference: ReadPreference.SECONDARY });

      const selectedServerAddress = bag[0].address
        .replace('127.0.0.1', 'localhost')
        .replace('[::1]', 'localhost');
      const selectedServer = client.topology.description.servers.get(selectedServerAddress);
      expect(selectedServer).property('type').to.equal(ServerType.RSSecondary);
    }
  });

  it('shouldThrowErrorOnEachWhenMissingCallback', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_each');
      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      function finished() {
        const cursor = collection.find();

        test.throws(function () {
          cursor.forEach();
        });
      }

      await insert();

      finished();
    }
  });

  it('shouldCorrectlyHandleLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_cursor_limit');

      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      async function finished() {
        const items = await collection.find().limit(5).toArray();
        test.equal(5, items.length);
      }
      await insert();
      await finished();
    }
  });

  it('shouldCorrectlyHandleNegativeOneLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_cursor_negative_one_limit');

      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      async function finished() {
        const items = await collection.find().limit(-1).toArray();
        test.equal(1, items.length);
      }

      await insert();
      await finished();
    }
  });

  it('shouldCorrectlyHandleAnyNegativeLimitOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_cursor_any_negative_limit');

      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      async function finished() {
        const items = await collection.find().limit(-5).toArray();
        test.equal(5, items.length);
      }
      await insert();
      await finished();
    }
  });

  it('shouldCorrectlyReturnErrorsOnIllegalLimitValuesNotAnInt', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_limit_exceptions_2');

      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      const cursor = collection.find();

      try {
        cursor.limit('not-an-integer' as any);
        test.ok(false);
      } catch (err) {
        test.equal('Operation "limit" requires an integer', err.message);
      }

      await cursor.close();
    }
  });

  it('shouldCorrectlyReturnErrorsOnIllegalLimitValuesIsClosedWithinNext', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_limit_exceptions');

      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      const cursor = collection.find();

      await cursor.next();
      expect(() => {
        cursor.limit(1);
      }).to.throw(/Cursor is already initialized/);

      await cursor.close();
    }
  });

  it('shouldCorrectlySkipRecordsOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_skip');

      const insert = async () => {
        for (let i = 0; i < 10; i++) {
          await collection.insertOne({ x: i }, configuration.writeConcernMax());
        }
      };

      await insert();
      const cursor = collection.find();
      // this.defer(() => cursor.close());

      const count = await cursor.count();
      test.equal(10, count);

      const cursor2 = collection.find();
      // this.defer(() => cursor2.close());

      const items = await cursor2.toArray();
      test.equal(10, items.length);

      const items2 = await collection.find().skip(2).toArray();
      test.equal(8, items2.length);

      // Check that we have the same elements
      let numberEqual = 0;
      const sliced = items.slice(2, 10);

      for (let i = 0; i < sliced.length; i++) {
        if (sliced[i].x === items2[i].x) numberEqual = numberEqual + 1;
      }

      test.equal(8, numberEqual);
      await cursor.close();
      await cursor2.close();
    }
  });

  it('shouldCorrectlyReturnErrorsOnIllegalSkipValues', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_skip_exceptions');

      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      try {
        collection.find().skip('not-an-integer' as any);
        test.ok(false);
      } catch (err) {
        test.equal('Operation "skip" requires an integer', err.message);
      }
    }
  });

  it('shouldReturnErrorsOnIllegalBatchSizes', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_batchSize_exceptions');
      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      const cursor = collection.find();
      try {
        cursor.batchSize('not-an-integer' as any);
        test.ok(false);
      } catch (err) {
        test.equal('Operation "batchSize" requires an integer', err.message);
      }
    }
  });

  it('shouldCorrectlyHandleBatchSize', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_multiple_batch_size');

      //test with the last batch that is a multiple of batchSize
      const records = 4;
      const batchSize = 2;
      const docs = [];
      for (let i = 0; i < records; i++) {
        docs.push({ a: i });
      }

      await collection.insertMany(docs, configuration.writeConcernMax());

      const cursor = collection.find({}, { batchSize: batchSize });

      //1st
      let items = await cursor.next();
      test.equal(1, cursor.bufferedCount());
      test.ok(items != null);

      //2nd
      items = await cursor.next();
      test.equal(0, cursor.bufferedCount());
      test.ok(items != null);

      //3rd
      items = await cursor.next();
      test.equal(1, cursor.bufferedCount());
      test.ok(items != null);

      //4th
      items = await cursor.next();
      test.equal(0, cursor.bufferedCount());
      test.ok(items != null);

      //No more
      items = await cursor.next();
      test.ok(items == null);
      test.ok(cursor.closed);
    }
  });

  it('shouldHandleWhenLimitBiggerThanBatchSize', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_limit_greater_than_batch_size');

      const limit = 4;
      const records = 10;
      const batchSize = 3;
      const docs = [];
      for (let i = 0; i < records; i++) {
        docs.push({ a: i });
      }

      await collection.insertMany(docs, configuration.writeConcernMax());

      const cursor = collection.find({}, { batchSize: batchSize, limit: limit });
      //1st
      await cursor.next();
      test.equal(2, cursor.bufferedCount());

      //2nd
      await cursor.next();
      test.equal(1, cursor.bufferedCount());

      //3rd
      await cursor.next();
      test.equal(0, cursor.bufferedCount());

      //4th
      await cursor.next();

      //No more
      const items = await cursor.next();
      test.ok(items == null);
      test.ok(cursor.closed);
    }
  });

  it('shouldHandleLimitLessThanBatchSize', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_limit_less_than_batch_size');

      const limit = 2;
      const records = 10;
      const batchSize = 4;
      const docs = [];
      for (let i = 0; i < records; i++) {
        docs.push({ a: i });
      }

      await collection.insertMany(docs, configuration.writeConcernMax());

      const cursor = collection.find({}, { batchSize: batchSize, limit: limit });
      //1st
      await cursor.next();
      test.equal(1, cursor.bufferedCount());

      //2nd
      await cursor.next();
      test.equal(0, cursor.bufferedCount());

      //No more
      const items = await cursor.next();

      test.ok(items == null);
      test.ok(cursor.closed);
    }
  });

  it('shouldHandleSkipLimitChaining', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = db.collection('shouldHandleSkipLimitChaining');

      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      async function finished() {
        const items = await collection.find().toArray();
        test.equal(10, items.length);

        const items2 = await collection.find().limit(5).skip(3).toArray();
        test.equal(5, items2.length);

        // Check that we have the same elements
        let numberEqual = 0;
        const sliced = items.slice(3, 8);

        for (let i = 0; i < sliced.length; i++) {
          if (sliced[i].x === items2[i].x) numberEqual = numberEqual + 1;
        }
        test.equal(5, numberEqual);
      }
      await insert();
      await finished();
    }
  });

  it('shouldCorrectlyHandleLimitSkipChainingInline', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_limit_skip_chaining_inline');

      async function insert() {
        await collection.insertMany(Array.from({ length: 10 }, (_, i) => ({ x: i })));
      }

      async function finished() {
        const items = await collection.find().toArray();
        test.equal(10, items.length);

        const items2 = await collection.find().limit(5).skip(3).toArray();
        test.equal(5, items2.length);

        // Check that we have the same elements
        let numberEqual = 0;
        const sliced = items.slice(3, 8);

        for (let i = 0; i < sliced.length; i++) {
          if (sliced[i].x === items2[i].x) numberEqual = numberEqual + 1;
        }
        test.equal(5, numberEqual);
      }
      await insert();
      await finished();
    }
  });

  it('shouldCloseCursorNoQuerySent', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_close_no_query_sent');

      const cursor = collection.find();
      await cursor.close();

      test.equal(true, cursor.closed);
    }
  });

  it('shouldCloseCursorAfterQueryHasBeenSent', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_close_after_query_sent');

      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      const cursor = collection.find({ a: 1 });
      await cursor.next();

      await cursor.close();
      test.equal(true, cursor.closed);
    }
  });

  it('shouldCorrectlyExecuteCursorCountWithFields', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_count_with_fields');

      await collection.insertOne({ x: 1, a: 2 }, configuration.writeConcernMax());

      const items = await collection.find({}).project({ a: 1 }).toArray();
      test.equal(1, items.length);
      test.equal(2, items[0].a);
      expect(items[0].x).to.not.exist;
    }
  });

  it('shouldCorrectlyCountWithFieldsUsingExclude', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_count_with_fields_using_exclude');

      await collection.insertOne({ x: 1, a: 2 }, configuration.writeConcernMax());

      const items = await collection.find({}, { projection: { x: 0 } }).toArray();

      test.equal(1, items.length);
      test.equal(2, items[0].a);
      expect(items[0].x).to.not.exist;
    }
  });

  it('removes session when cloning an find cursor', async function () {
    const collection = await client.db().collection('test');

    const cursor = collection.find({});
    await cursor.next();

    const clonedCursor = cursor.clone();

    expect(cursor).to.have.property('session').not.to.be.null;
    expect(clonedCursor).to.have.property('session').to.be.null;
  });

  it('removes session when cloning an aggregation cursor', async function () {
    const collection = await client.db().collection('test');

    const cursor = collection.aggregate([{ $match: {} }]);
    await cursor.next();

    const clonedCursor = cursor.clone();

    expect(cursor).to.have.property('session').not.to.be.null;
    expect(clonedCursor).to.have.property('session').to.be.null;
  });

  // NOTE: skipped for use of topology manager
  // it.skip('cursor stream errors', {
  //   // Add a tag that our runner can trigger on
  //   // in this case we are setting that node needs to be higher than 0.10.X to run
  //   metadata: { requires: { topology: ['single'] } },

  //   test: function (done) {
  //     const configuration = this.configuration;
  //     client.connect((err, client) => {
  //       expect(err).to.not.exist;
  //       this.defer(() => client.close());

  //       const db = client.db(configuration.db);
  //       db.createCollection('cursor_stream_errors', (err, collection) => {
  //         expect(err).to.not.exist;

  //         const docs = [];
  //         for (let ii = 0; ii < 10; ++ii) docs.push({ b: ii + 1 });

  //         // insert all docs
  //         collection.insertMany(docs, configuration.writeConcernMax(), err => {
  //           expect(err).to.not.exist;

  //           let finished = 0,
  //             i = 0;

  //           const cursor = collection.find({}, { batchSize: 5 });
  //           const stream = cursor.stream();

  //           stream.on('data', function () {
  //             if (++i === 4) {
  //               // Force restart
  //               configuration.manager.stop(9);
  //             }
  //           });

  //           stream.once('close', testDone('close'));
  //           stream.once('error', testDone('error'));

  //           function testDone() {
  //             return function () {
  //               ++finished;

  //               if (finished === 2) {
  //                 setTimeout(function () {
  //                   test.equal(5, i);
  //                   test.equal(true, cursor.closed);
  //                   client.close();

  //                   configuration.manager.start().then(function () {
  //                     done();
  //                   });
  //                 }, 150);
  //               }
  //             };
  //           }
  //         });
  //       });
  //     });
  //   }
  // });

  it(
    'closes cursors when client is closed even if it has not been exhausted',
    { requires: { topology: '!replicaset' } },
    async function () {
      await client.db().dropCollection('test_cleanup_tailable');

      const collection = await client
        .db()
        .createCollection('test_cleanup_tailable', { capped: true, size: 1000, max: 3 });

      // insert only 2 docs in capped coll of 3
      await collection.insertMany([{ a: 1 }, { a: 1 }]);

      const cursor = collection.find({}, { tailable: true, awaitData: true, maxAwaitTimeMS: 2000 });

      await cursor.next();
      await cursor.next();

      const nextCommand = once(client, 'commandStarted');
      // will block for maxAwaitTimeMS (except we are closing the client)
      const rejectedEarlyBecauseClientClosed = cursor.next().catch(error => error);

      for (
        let [{ commandName }] = await nextCommand;
        commandName !== 'getMore';
        [{ commandName }] = await once(client, 'commandStarted')
      );

      await client.close();
      expect(cursor).to.have.property('closed', true);

      const error = await rejectedEarlyBecauseClientClosed;
      expect(error).to.be.instanceOf(MongoClientClosedError);
    }
  );

  it('shouldAwaitDataWithDocumentsAvailable', async function () {
    // www.mongodb.com/docs/display/DOCS/Tailable+Cursors

    const configuration = this.configuration;
    const client = configuration.newClient({ maxPoolSize: 1 });
    await client.connect();

    const db = client.db(configuration.db);
    const options = { capped: true, size: 8 };
    const collection = await db.createCollection('should_await_data_no_docs', options);

    // Create cursor with awaitData, and timeout after the period specified
    const cursor = collection.find({}, { tailable: true, awaitData: true });

    await cursor.forEach(() => {
      // do nothing
    });
    await cursor.close();
    await client.close();
  });

  context('awaiting data core tailable cursor test', () => {
    let client;
    let cursor;

    beforeEach(async function () {
      client = await this.configuration.newClient().connect();
    });

    afterEach(async () => {
      if (cursor) await cursor.close();
      await client.close();
    });

    it(
      'should block waiting for new data to arrive when the cursor reaches the end of the capped collection',
      {
        metadata: { requires: { mongodb: '>=3.2' } },
        async test() {
          const db = client.db('cursor_tailable');

          await db.collection('cursor_tailable').drop();

          const collection = await db.createCollection('cursor_tailable', {
            capped: true,
            size: 10000
          });

          const res = await collection.insertOne({ a: 1 });
          expect(res).property('insertedId').to.exist;

          cursor = collection.find({}, { batchSize: 2, tailable: true, awaitData: true });
          const doc0 = await cursor.next();
          expect(doc0).to.have.property('a', 1);

          // After 300ms make an insert
          const later = runLater(async () => {
            const res = await collection.insertOne({ b: 2 });
            expect(res).property('insertedId').to.exist;
          }, 300);

          const start = performance.now();
          const doc1 = await cursor.next();
          expect(doc1).to.have.property('b', 2);
          const end = performance.now();

          await later; // make sure this finished, without a failure

          // We should see here that cursor.next blocked for at least 300ms
          expect(end - start).to.be.at.least(290);
        }
      }
    );
  });

  it('shouldFailToSetReadPreferenceOnCursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      try {
        await db
          .collection('shouldFailToSetReadPreferenceOnCursor')
          .find()
          .withReadPreference('notsecondary' as any);
        test.ok(false);
      } catch (err) { } // eslint-disable-line

      await db
        .collection('shouldFailToSetReadPreferenceOnCursor')
        .find()
        .withReadPreference('secondary');
    }
  });

  it('should allow setting the cursors readConcern through a builder', {
    metadata: { requires: { mongodb: '>=3.2' } },
    test: async function () {
      const client = this.configuration.newClient({ monitorCommands: true });
      const events = [];
      client.on('commandStarted', event => {
        if (event.commandName === 'find') {
          events.push(event);
        }
      });
      const db = client.db(this.configuration.db);
      const cursor = db.collection('foo').find().withReadConcern('local');
      expect(cursor).property('readConcern').to.have.property('level').equal('local');

      await cursor.toArray();

      expect(events).to.have.length(1);
      const findCommand = events[0];
      expect(findCommand).nested.property('command.readConcern').to.eql({ level: 'local' });
      await client.close();
    }
  });

  it('should not fail due to stack overflow toArray', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('shouldNotFailDueToStackOverflowToArray');

    const docs = Array.from({ length: 30000 }, (_, i) => ({ a: i }));
    const allDocs = [];
    let left = 0;

    while (docs.length > 0) {
      allDocs.push(docs.splice(0, 1000));
    }
    // Get all batches we must insert
    left = allDocs.length;
    let totalI = 0;
    let timeout = 0;

    // Execute inserts
    for (let i = 0; i < left; i++) {
      await sleep(timeout);

      const d = await collection.insertMany(allDocs.shift());
      left = left - 1;
      totalI = totalI + d.insertedCount;

      if (left === 0) {
        const items = await collection.find({}).toArray();
        expect(items).to.have.a.lengthOf(3000);
      }
      timeout = timeout + 100;
    }

    await client.close();
  });

  it('shouldFailToTailANormalCollection', async function () {
    const configuration = this.configuration;
    await client.connect();

    const db = client.db(configuration.db);
    const collection = db.collection('shouldFailToTailANormalCollection');
    const docs = [];
    for (let i = 0; i < 100; i++) docs.push({ a: i, OrderNumber: i });

    await collection.insertMany(docs, configuration.writeConcernMax());

    const cursor = collection.find({}, { tailable: true });
    const err = await cursor
      .forEach(() => {
        // do nothing
      })
      .catch(e => e);
    test.ok(err instanceof Error);
    test.ok(typeof err.code === 'number');

    // Close cursor b/c we did not exhaust cursor
    await cursor.close();
  });

  it('should correctly apply hint to count command for cursor', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded'],
        mongodb: '>2.5.5'
      }
    },

    test: async function () {
      const configuration = this.configuration;

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      // Establish connection to db
      await client.connect();

      const db = client.db(configuration.db);
      const col = db.collection('count_hint');

      await col.insertMany([{ i: 1 }, { i: 2 }], { writeConcern: { w: 1 } });

      await col.createIndex({ i: 1 });

      let count = await col.find({ i: 1 }, { hint: '_id_' }).count();
      test.equal(1, count);

      count = await col.find({}, { hint: '_id_' }).count();
      test.equal(2, count);

      const err = await col
        .find({ i: 1 }, { hint: 'BAD HINT' })
        .count()
        .catch(e => e);
      test.ok(err != null);

      await col.createIndex({ x: 1 }, { sparse: true });

      count = await col.find({ i: 1 }, { hint: 'x_1' }).count();
      test.equal(0, count);

      count = await col.find({}, { hint: 'i_1' }).count();

      test.equal(2, count);
      // DOC_END
    }
  });

  it('Terminate each after first document by returning false', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();
      const db = client.db(configuration.db);

      // Create a lot of documents to insert
      const docs = [];
      for (let i = 0; i < 100; i++) {
        docs.push({ a: i });
      }

      // Create a collection
      const collection = await db.createCollection('terminate_each_returning_false');

      // Insert documents into collection
      await collection.insertMany(docs, configuration.writeConcernMax());
      let finished = false;

      await collection.find({}).forEach(doc => {
        expect(doc).to.exist;
        test.equal(finished, false);
        finished = true;

        return false;
      });
    }
  });

  it('Should report database name and collection name', {
    metadata: { requires: { topology: ['single'] } },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const cursor = db.collection('myCollection').find({});
      test.equal('myCollection', cursor.namespace.collection);
      test.equal('integration_tests', cursor.namespace.db);
    }
  });

  it('Should correctly apply map to toArray', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const docs = [];

      for (let i = 0; i < 1000; i++) {
        const d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = db.collection('map_toArray');

      // insert all docs
      await collection.insertMany(docs, configuration.writeConcernMax());

      // Create a cursor for the content
      const cursor = collection
        .find({})
        .map(function () {
          return { a: 1 };
        })
        .batchSize(5)
        .limit(10);

      const docs2 = await cursor.toArray();
      test.equal(10, docs2.length);

      // Ensure all docs where mapped
      docs2.forEach(doc => {
        expect(doc).property('a').to.equal(1);
      });
    }
  });

  it('Should correctly apply map to next', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const docs = [];
      for (let i = 0; i < 1000; i++) {
        const d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = db.collection('map_next');

      // insert all docs
      await collection.insertMany(docs, configuration.writeConcernMax());

      // Create a cursor for the content
      const cursor = collection
        .find({})
        .map(function () {
          return { a: 1 };
        })
        .batchSize(5)
        .limit(10);

      const doc = await cursor.next();
      test.equal(1, doc.a);
      await cursor.close();
    }
  });

  it('Should correctly apply map to each', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const docs = [];

      for (let i = 0; i < 1000; i++) {
        const d = new Date().getTime() + i * 1000;
        docs[i] = { a: i, createdAt: new Date(d) };
      }

      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = db.collection('map_each');

      // insert all docs
      await collection.insertMany(docs, configuration.writeConcernMax());

      // Create a cursor for the content
      const cursor = collection
        .find({})
        .map(function () {
          return { a: 1 };
        })
        .batchSize(5)
        .limit(10);

      await cursor.forEach(doc => {
        test.equal(1, doc.a);
      });
    }
  });

  it('should tail cursor using maxAwaitTimeMS for 3.2 or higher', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'], mongodb: '<7.0.0' } },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient();
      await client.connect();

      const db = client.db(configuration.db);
      const options = { capped: true, size: 8 };
      const collection = await db.createCollection('should_await_data_max_awaittime_ms', options);

      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      // Create cursor with awaitData, and timeout after the period specified
      const cursor = collection
        .find({})
        .addCursorFlag('tailable', true)
        .addCursorFlag('awaitData', true)
        .maxAwaitTimeMS(500);

      const s = new Date();
      const err = await cursor
        .forEach(async () => {
          await sleep(300);
          await cursor.close();
        })
        .catch(e => e);
      test.ok(err instanceof Error);
      test.ok(new Date().getTime() - s.getTime() >= 500);
      await cursor.close();
      await client.close();
    }
  });

  it('Correctly decorate the cursor count command with skip, limit, hint, readConcern', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const started = [];
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });
      client.on('commandStarted', function (event) {
        if (event.commandName === 'count') started.push(event);
      });

      await client.connect();

      const db = client.db(configuration.db);
      await db
        .collection('cursor_count_test', { readConcern: { level: 'local' } })
        .find({ project: '123' })
        .limit(5)
        .skip(5)
        .hint({ project: 1 })
        .count();

      test.equal(1, started.length);
      if (started[0].command.readConcern) {
        test.deepEqual({ level: 'local' }, started[0].command.readConcern);
      }
      test.deepEqual({ project: 1 }, started[0].command.hint);
      test.equal(5, started[0].command.skip);
      test.equal(5, started[0].command.limit);

      await client.close();
    }
  });

  it('Correctly decorate the collection count command with skip, limit, hint, readConcern', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const started = [];

      const configuration = this.configuration;
      client.on('commandStarted', function (event) {
        if (event.commandName === 'count') started.push(event);
      });

      await client.connect();

      const db = client.db(configuration.db);
      await db.collection('cursor_count_test1', { readConcern: { level: 'local' } }).count(
        {
          project: '123'
        },
        {
          readConcern: { level: 'local' },
          limit: 5,
          skip: 5,
          hint: { project: 1 }
        }
      );

      test.equal(1, started.length);
      if (started[0].command.readConcern) {
        test.deepEqual({ level: 'local' }, started[0].command.readConcern);
      }
      test.deepEqual({ project: 1 }, started[0].command.hint);
      test.equal(5, started[0].command.skip);
      test.equal(5, started[0].command.limit);
    }
  });

  it('should return implicit session to pool when client-side cursor exhausts results on initial query', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();

    await client.connect();
    const db = client.db(configuration.db);
    const collection = db.collection('cursor_session_tests');

    await collection.insertMany([{ a: 1, b: 2 }]);
    const cursor = collection.find({});

    await cursor.next(); // implicit close, cursor is exhausted
    expect(client.s.activeSessions.size).to.equal(0);
    await cursor.close();
    await client.close();
  });

  it('should return implicit session to pool when client-side cursor exhausts results after a getMore', async function () {
    const db = client.db(this.configuration.db);
    const collection = db.collection('cursor_session_tests2');

    const docs = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
      { a: 5, b: 6 },
      { a: 7, b: 8 },
      { a: 9, b: 10 }
    ];

    await collection.insertMany(docs);

    const cursor = await collection.find({}, { batchSize: 3 });
    for (let i = 0; i < 3; ++i) {
      await cursor.next();
      expect(client.s.activeSessions.size).to.equal(1);
    }

    await cursor.next();
    expect(client.s.activeSessions.size, 'session not checked in after cursor exhausted').to.equal(
      0
    );

    await cursor.close();
  });

  describe('#clone', function () {
    let client;
    let db;
    let collection;

    beforeEach(function () {
      client = this.configuration.newClient({ w: 1 });

      return client.connect().then(client => {
        db = client.db(this.configuration.db);
        collection = db.collection('test_coll');
      });
    });

    afterEach(function () {
      return client.close();
    });

    context('when executing on a find cursor', function () {
      it('removes the existing session from the cloned cursor', async function () {
        const docs = [{ name: 'test1' }, { name: 'test2' }];
        await collection.insertMany(docs);

        const cursor = collection.find({}, { batchSize: 1 });
        try {
          const doc = await cursor.next();
          expect(doc).to.exist;

          const clonedCursor = cursor.clone();
          expect(clonedCursor.session).to.be.null;
        } finally {
          await cursor.close();
        }
      });
    });

    context('when executing on an aggregation cursor', function () {
      it('removes the existing session from the cloned cursor', async function () {
        const docs = [{ name: 'test1' }, { name: 'test2' }];
        await collection.insertMany(docs);

        const cursor = collection.aggregate([{ $match: {} }], { batchSize: 1 });
        try {
          const doc = await cursor.next();
          expect(doc).to.exist;

          const clonedCursor = cursor.clone();
          expect(clonedCursor.session).to.be.null;
        } finally {
          await cursor.close();
        }
      });
    });
  });

  describe('Cursor forEach Error propagation', function () {
    let configuration;
    let client;
    let cursor;
    let collection;

    beforeEach(async function () {
      configuration = this.configuration;
      client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
      await client.connect().catch(() => {
        expect.fail('Failed to connect to client');
      });
      collection = client.db(configuration.db).collection('cursor_session_tests2');
    });

    afterEach(async function () {
      await cursor.close();
      await client.close();
    });

    // NODE-2035
    it('should propagate error when exceptions are thrown from an awaited forEach call', async function () {
      const docs = [{ unique_key_2035: 1 }, { unique_key_2035: 2 }, { unique_key_2035: 3 }];
      await collection.insertMany(docs).catch(() => {
        expect.fail('Failed to insert documents');
      });
      cursor = collection.find({
        unique_key_2035: {
          $exists: true
        }
      });
      await cursor
        .forEach(() => {
          throw new Error('FAILURE IN FOREACH CALL');
        })
        .then(() => {
          expect.fail('Error in forEach call not caught');
        })
        .catch(err => {
          expect(err.message).to.deep.equal('FAILURE IN FOREACH CALL');
        });
    });
  });

  it('should return a promise when no callback supplied to forEach method', function () {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

    return client.connect().then(() => {
      this.defer(() => client.close());

      const db = client.db(configuration.db);
      const collection = db.collection('cursor_session_tests2');
      const cursor = collection.find();
      this.defer(() => cursor.close());

      const promise = cursor.forEach(() => {
        // do nothing
      });
      expect(promise).to.exist.and.to.be.an.instanceof(Promise);
      return promise;
    });
  });

  it('should return false when exhausted and hasNext called more than once', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

    await client.connect();

    const db = client.db(configuration.db);
    await db.createCollection('cursor_hasNext_test');
    const cursor = db.collection('cursor_hasNext_test').find();

    const val1 = await cursor.hasNext();
    expect(val1).to.equal(false);
    const val2 = await cursor.hasNext();
    expect(val2).to.equal(false);

    await cursor.close();
    await client.close();
  });

  // it.skip('should apply parent read preference to count command', function (done) {
  //   // NOTE: this test is skipped because mongo orchestration does not test sharded clusters
  //   // with secondaries. This behavior should be unit tested

  //   const configuration = this.configuration;
  //   const client = configuration.newClient(
  //     { w: 1, readPreference: ReadPreference.SECONDARY },
  //     { maxPoolSize: 1, connectWithNoPrimary: true }
  //   );

  //   client.connect((err, client) => {
  //     expect(err).to.not.exist;
  //     this.defer(() => client.close());

  //     const db = client.db(configuration.db);
  //     let collection, cursor, spy;
  //     const close = e => cursor.close(() => client.close(() => done(e)));

  //     Promise.resolve()
  //       .then(() => new Promise(resolve => setTimeout(() => resolve(), 500)))
  //       .then(() => db.createCollection('test_count_readPreference'))
  //       .then(() => (collection = db.collection('test_count_readPreference')))
  //       .then(() => collection.find())
  //       .then(_cursor => (cursor = _cursor))
  //       .then(() => (spy = sinon.spy(cursor.topology, 'command')))
  //       .then(() => cursor.count())
  //       .then(() =>
  //         expect(spy.firstCall.args[2])
  //           .to.have.nested.property('readPreference.mode')
  //           .that.equals('secondary')
  //       )
  //       .then(() => close())
  //       .catch(e => close(e));
  //   });
  // });

  describe('transforms', function () {
    it('should correctly apply map transform to cursor as readable stream', async function () {
      const configuration = this.configuration;
      const client = configuration.newClient();
      await client.connect();

      const docs = 'Aaden Aaron Adrian Aditya Bob Joe'.split(' ').map(x => ({ name: x }));
      const coll = client.db(configuration.db).collection('cursor_stream_mapping');
      await coll.insertMany(docs);
      const bag = [];
      const stream = coll
        .find()
        .project({ _id: 0, name: 1 })
        .map(doc => ({ mapped: doc }))
        .stream()
        .on('data', doc => bag.push(doc));

      stream.on('error', () => expect.fail());
      stream.on('end', () => {
        expect(bag.map(x => x.mapped)).to.eql(docs.map(x => ({ name: x.name })));
      });
      await once(stream, 'end');
      await client.close();
    });

    it('should correctly apply map transform when converting cursor to array', async function () {
      const configuration = this.configuration;
      const client = configuration.newClient();
      await client.connect();
      // this.defer(() => client.close());

      const docs = 'Aaden Aaron Adrian Aditya Bob Joe'.split(' ').map(x => ({ name: x }));
      const coll = client.db(configuration.db).collection('cursor_toArray_mapping');
      await coll.insertMany(docs);

      const mappedDocs = await coll
        .find()
        .project({ _id: 0, name: 1 })
        .map(doc => ({ mapped: doc }))
        .toArray();
      expect(mappedDocs.map(x => x.mapped)).to.eql(docs.map(x => ({ name: x.name })));
      await client.close();
    });
  });

  context('sort', function () {
    const findSort = (input, output) =>
      async function () {
        const client = this.configuration.newClient({ monitorCommands: true });
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const db = client.db('test');
        const collection = db.collection('test_sort_dos');
        const cursor = collection.find({}, { sort: input });
        await cursor.next();
        expect(events[0].command.sort).to.be.instanceOf(Map);
        expect(Array.from(events[0].command.sort)).to.deep.equal(Array.from(output));
        await client.close();
      };

    const cursorSort = (input, output) =>
      async function () {
        const client = this.configuration.newClient({ monitorCommands: true });
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const db = client.db('test');
        const collection = db.collection('test_sort_dos');
        const cursor = collection.find({}).sort(input);
        await cursor.next();
        expect(events[0].command.sort).to.be.instanceOf(Map);
        expect(Array.from(events[0].command.sort)).to.deep.equal(Array.from(output));
        await client.close();
      };

    it('should use find options object', findSort({ alpha: 1 }, new Map([['alpha', 1]])));
    it('should use find options string', findSort('alpha', new Map([['alpha', 1]])));
    it('should use find options shallow array', findSort(['alpha', 1], new Map([['alpha', 1]])));
    it('should use find options deep array', findSort([['alpha', 1]], new Map([['alpha', 1]])));

    it('should use cursor.sort object', cursorSort({ alpha: 1 }, new Map([['alpha', 1]])));
    it('should use cursor.sort string', cursorSort('alpha', new Map([['alpha', 1]])));
    it('should use cursor.sort shallow array', cursorSort(['alpha', 1], new Map([['alpha', 1]])));
    it('should use cursor.sort deep array', cursorSort([['alpha', 1]], new Map([['alpha', 1]])));

    it('formatSort - one key', () => {
      // TODO (NODE-3236): These are unit tests for a standalone function and should be moved out of the cursor context file
      expect(formatSort('alpha')).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort(['alpha'])).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort('alpha', 1)).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort('alpha', 'asc')).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort([['alpha', 'asc']])).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort('alpha', 'ascending')).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort({ alpha: 1 })).to.deep.equal(new Map([['alpha', 1]]));
      expect(formatSort('beta')).to.deep.equal(new Map([['beta', 1]]));
      expect(formatSort(['beta'])).to.deep.equal(new Map([['beta', 1]]));
      expect(formatSort('beta', -1)).to.deep.equal(new Map([['beta', -1]]));
      expect(formatSort('beta', 'desc')).to.deep.equal(new Map([['beta', -1]]));
      expect(formatSort('beta', 'descending')).to.deep.equal(new Map([['beta', -1]]));
      expect(formatSort({ beta: -1 })).to.deep.equal(new Map([['beta', -1]]));
      expect(formatSort({ alpha: { $meta: 'hi' } })).to.deep.equal(
        new Map([['alpha', { $meta: 'hi' }]])
      );
    });

    it('formatSort - multi key', () => {
      expect(formatSort(['alpha', 'beta'])).to.deep.equal(
        new Map([
          ['alpha', 1],
          ['beta', 1]
        ])
      );
      expect(formatSort({ alpha: 1, beta: 1 })).to.deep.equal(
        new Map([
          ['alpha', 1],
          ['beta', 1]
        ])
      );
      expect(
        formatSort([
          ['alpha', 'asc'],
          ['beta', 'ascending']
        ])
      ).to.deep.equal(
        new Map([
          ['alpha', 1],
          ['beta', 1]
        ])
      );
      expect(
        formatSort(
          new Map([
            ['alpha', 'asc'],
            ['beta', 'ascending']
          ])
        )
      ).to.deep.equal(
        new Map([
          ['alpha', 1],
          ['beta', 1]
        ])
      );
      expect(
        formatSort([
          ['3', 'asc'],
          ['1', 'ascending']
        ])
      ).to.deep.equal(
        new Map([
          ['3', 1],
          ['1', 1]
        ])
      );
      expect(formatSort({ alpha: { $meta: 'hi' }, beta: 'ascending' })).to.deep.equal(
        new Map([
          ['alpha', { $meta: 'hi' }],
          ['beta', 1]
        ])
      );
    });

    it('should use allowDiskUse option on sort', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: async function () {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const db = client.db('test');
        const collection = db.collection('test_sort_allow_disk_use');
        const cursor = collection.find({}).sort(['alpha', 1]).allowDiskUse();
        await cursor.next();
        const { command } = events.shift();
        expect(command.sort).to.deep.equal(new Map([['alpha', 1]]));
        expect(command.allowDiskUse).to.be.true;
      }
    });

    it('should error if allowDiskUse option used without sort', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: async function () {
        const client = this.configuration.newClient();
        const db = client.db('test');
        const collection = db.collection('test_sort_allow_disk_use');
        expect(() => collection.find({}).allowDiskUse()).to.throw(
          /Option "allowDiskUse" requires a sort specification/
        );
        await client.close();
      }
    });
  });
});
