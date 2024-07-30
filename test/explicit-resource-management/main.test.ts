
import { describe, it } from 'mocha';
import { GridFSBucket, MongoClient } from 'mongodb/lib/beta';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { setTimeout } from 'timers/promises';

async function setUpCollection(client: MongoClient) {
  const collection = client.db('foo').collection<{ name: string }>('bar');
  const documents: Array<{ name: string }> = Array.from({ length: 5 }).map(i => ({
    name: String(i)
  }));
  await collection.insertMany(documents)
  return collection;
}

describe('explicit resource management feature integration tests', function () {
  describe('MongoClient', function () {
    it('does not crash or error when used with await-using syntax', async function () {
            await using client = new MongoClient(process.env.MONGODB_URI!);
            await client.connect();
    })
  })

  describe('Cursors', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      await using client = new MongoClient(process.env.MONGODB_URI!);
      await client.connect();

      const collection = await setUpCollection(client);

      await using cursor = collection.find();
      await cursor.next();
    })

    describe('cursor streams', function() {
      it('does not crash or error when used with await-using syntax', async function() {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const collection = await setUpCollection(client);

        await using readable = collection.find().stream();
      })
    })
  })

  describe('Sessions', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      await using client = new MongoClient(process.env.MONGODB_URI!);
      await client.connect();

      await using session = client.startSession();
    })
  })

  describe('ChangeStreams', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      await using client = new MongoClient(process.env.MONGODB_URI!);
      await client.connect();

      const collection = await setUpCollection(client);
      await using cs = collection.watch();

      setTimeout(1000).then(() => collection.insertOne({ name: 'bailey' }));
      await cs.next();
    })
  });

  describe('GridFSDownloadStream', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      await using client = new MongoClient(process.env.MONGODB_URI!);
      await client.connect();

      const bucket = new GridFSBucket(client.db('foo'));
      const uploadStream = bucket.openUploadStream('foo.txt')
      await pipeline(Readable.from("AAAAAAA".split('')), uploadStream);

      await using downloadStream = bucket.openDownloadStreamByName('foo.txt');
    })
  });
})
