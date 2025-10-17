import { expect } from 'chai';

import { Binary, type Collection, type Db, type MongoClient } from '../../../src';
import { sleep } from '../../tools/utils';

describe('Cursor Streams', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient({ maxPoolSize: 1 });
    db = client.db();
  });

  afterEach(async function () {
    await db.dropCollection('streaming_test').catch(() => null);
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

  describe('using Async Iterator (for await...of)', function () {
    it('should stream all documents correctly, triggering getMores', async function () {
      const collection = db.collection<{ _id: number }>('streaming_test');
      await setupCollection(collection, 100);

      // Use a small batchSize to force the driver to issue getMore commands
      const cursor = collection.find({}, { batchSize: 10 });
      let docCount = 0;

      for await (const doc of cursor) {
        expect(doc).to.have.property('_id', docCount);
        docCount++;

        await sleep(100);
      }

      expect(docCount).to.equal(100);
    });
  });

  describe('using Event Emitter API', function () {
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

    it('should respect manual pause() and resume() calls', async function () {
      const collection = db.collection<{ _id: number }>('streaming_test');
      await setupCollection(collection, 10);

      const stream = collection.find({}, { batchSize: 2 }).stream();
      let docCount = 0;

      await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', resolve);
        stream.on('data', () => {
          docCount++;
          // Manually pause the stream
          stream.pause();

          // Perform an async operation, then resume
          sleep(100).then(() => stream.resume());
        });
      });

      expect(docCount).to.equal(10);
    });
  });
});
