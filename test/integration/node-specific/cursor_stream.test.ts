import { once } from 'node:events';

import { expect } from 'chai';

import { Binary, type Collection, type Db, type MongoClient, MongoServerError } from '../../../src';

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
});
