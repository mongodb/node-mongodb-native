import { strictEqual } from 'node:assert';
import { on, once } from 'node:events';

import { expect } from 'chai';
import * as process from 'process';

import { Binary, type Collection, type Db, type MongoClient, MongoServerError } from '../../../src';
import { sleep } from '../../tools/utils';

describe('Cursor Streams', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient({ maxPoolSize: 1 });
    db = client.db();
  });

  afterEach(async function () {
    await db.dropCollection('streaming_test');
    await client.close();
  });

  async function setupCollection(
    collection: Collection<{ _id: number }>,
    docCount: number
  ): Promise<void> {
    const docs = Array.from({ length: docCount }, (_, i) => ({
      _id: i,
      b: new Binary(Buffer.alloc(1024))
    }));
    await collection.insertMany(docs, { writeConcern: { w: 1 } });
  }

  it('should stream all documents and emit "end"', async function () {
    const collection = db.collection<{ _id: number }>('streaming_test');
    await setupCollection(collection, 100);

    const stream = collection.find({}, { batchSize: 10 }).stream();
    let docCount = 0;

    // Wrap the stream logic in a Promise to use await
    await new Promise((resolve, reject) => {
      stream.on('data', doc => {
        expect(doc).to.have.property('_id', docCount);
        docCount++;
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    expect(docCount).to.equal(100);
  });

  it('should stream all documents in for..of', async function () {
    const collection = db.collection<{ _id: number }>('streaming_test');
    await setupCollection(collection, 100);

    const stream = collection.find({}, { batchSize: 10 }).stream();
    let docCount = 0;

    for await (const doc of stream) {
      expect(doc).to.have.property('_id', docCount);
      docCount++;
    }

    expect(docCount).to.equal(100);
  });

  it('should throws error', async function () {
    const cursor = db.collection('myCollection').find({
      timestamp: { $ltx: '1111' } // Error in query.
    });

    const stream = cursor.stream();
    const onError = once(stream, 'error');
    stream.pipe(process.stdout);

    const [error] = await onError;

    expect(error).to.be.instanceof(MongoServerError);
    expect(error.message).to.include('unknown operator');
  });

  it('does not auto destroy streams', async function () {
    const docs = [];

    for (let i = 0; i < 10; i++) {
      docs.push({ a: i + 1 });
    }

    const configuration = this.configuration;
    await client.connect();

    const db = client.db(configuration.db);
    const collection = await db.createCollection('does_not_autodestroy_streams');

    await collection.insertMany(docs, configuration.writeConcernMax());

    const cursor = collection.find();
    const stream = cursor.stream();
    stream.on('close', () => {
      expect.fail('extra close event must not be called');
    });
    stream.on('data', doc => {
      expect(doc).to.exist;
    });
    stream.resume();
    await once(stream, 'end');

    await cursor.close();
  });

  it('immediately destroying a stream prevents the query from executing', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const docs = [{ b: 2 }, { b: 3 }];
      let i = 0,
        doneCalled = 0;

      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = await db.createCollection(
        'immediately_destroying_a_stream_prevents_the_query_from_executing'
      );

      // insert all docs
      await collection.insertMany(docs, configuration.writeConcernMax());

      const cursor = collection.find();
      const stream = cursor.stream();

      stream.on('data', function () {
        i++;
      });

      function testDone() {
        return err => {
          ++doneCalled;

          if (doneCalled === 1) {
            expect(err).to.not.exist;
            strictEqual(0, i);
            strictEqual(true, cursor.closed);
          }
        };
      }

      cursor.once('close', testDone('close'));
      stream.once('error', testDone('error'));
      const promise = once(cursor, 'close');

      stream.destroy();

      await cursor.close();
      await promise;
    }
  });

  it('destroying a stream stops it', async function () {
    const db = client.db();
    await db.dropCollection('destroying_a_stream_stops_it');
    const collection = await db.createCollection('destroying_a_stream_stops_it');

    const docs = Array.from({ length: 10 }, (_, i) => ({ b: i + 1 }));

    await collection.insertMany(docs);

    const cursor = collection.find();
    const stream = cursor.stream();

    expect(cursor).property('closed', false);

    const willClose = once(cursor, 'close');

    const dataEvents = on(stream, 'data');

    for (let i = 0; i < 5; i++) {
      const {
        value: [doc]
      } = await dataEvents.next();
      expect(doc).property('b', i + 1);
    }

    // After 5 successful data events, destroy stream
    stream.destroy();

    // We should get a close event on the stream and a close event on the cursor
    // We should **not** get an 'error' or an 'end' event,
    // the following will throw if either stream or cursor emitted an 'error' event
    await Promise.race([
      willClose,
      sleep(100).then(() => Promise.reject(new Error('close event never emitted')))
    ]);
  });

  it('Should not emit any events after close event emitted due to cursor killed', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: async function () {
      const configuration = this.configuration;
      await client.connect();

      const db = client.db(configuration.db);
      const collection = db.collection('cursor_limit_skip_correctly');

      // Insert x number of docs
      const ordered = collection.initializeUnorderedBulkOp();

      for (let i = 0; i < 100; i++) {
        ordered.insert({ a: i });
      }

      await ordered.execute({ writeConcern: { w: 1 } });

      // Let's attempt to skip and limit
      const cursor = collection.find({}).batchSize(10);
      const stream = cursor.stream();
      stream.on('data', function () {
        stream.destroy();
      });

      const onClose = once(cursor, 'close');
      await cursor.close();
      await onClose;
    }
  });
});
