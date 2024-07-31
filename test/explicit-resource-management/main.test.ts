
import { describe, it } from 'mocha';
import { GridFSBucket, MongoClient } from 'mongodb/lib/beta';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { expect } from 'chai';
import { setTimeout } from 'timers/promises';
import { createReadStream } from 'fs';
import { join } from 'path';

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

    it('always cleans up the client, regardless of thrown errors', async function () {
      const error = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        throw new Error('error thrown');
      })().catch(e => e);

      expect(error).to.match(/error thrown/);
    });

    it('works if client is explicitly closed', async function () {
      const expected = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();
        await client.close();

        return 'not error';
      })();

      expect(expected).to.equal('not error');
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

    it('always cleans up the cursor, regardless of thrown errors', async function () {
      const error = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const collection = await setUpCollection(client);

        await using cursor = collection.find();
        await cursor.next();

        throw new Error('error thrown');
      })().catch(e => e);

      expect(error).to.match(/error thrown/);
    });

    it('works if cursor is explicitly closed', async function () {
      const expected = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const collection = await setUpCollection(client);

        await using cursor = collection.find();
        await cursor.next();

        await cursor.close();

        return 'not error';
      })();

      expect(expected).to.equal('not error');
    })

    describe('cursor streams', function () {
      it('does not crash or error when used with await-using syntax', async function () {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const collection = await setUpCollection(client);

        await using readable = collection.find().stream();
      })

      it('always cleans up the stream, regardless of thrown errors', async function () {
        const error = await (async () => {
          await using client = new MongoClient(process.env.MONGODB_URI!);
          await client.connect();

          const collection = await setUpCollection(client);

          await using readable = collection.find().stream();

          throw new Error('error thrown');
        })().catch(e => e);

        expect(error).to.match(/error thrown/);
      });

      it('works if stream is explicitly closed', async function () {
        const expected = await (async () => {
          await using client = new MongoClient(process.env.MONGODB_URI!);
          await client.connect();

          const collection = await setUpCollection(client);

          await using readable = collection.find().stream();

          readable.destroy();

          return 'not error';
        })();

        expect(expected).to.equal('not error');
      })

    })
  })

  describe('Sessions', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      await using client = new MongoClient(process.env.MONGODB_URI!);
      await client.connect();

      await using session = client.startSession();
    })

    it('always cleans up the session, regardless of thrown errors', async function () {
      const error = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        await using session = client.startSession();

        throw new Error('error thrown');
      })().catch(e => e);

      expect(error).to.match(/error thrown/);
    });

    it('works if session is explicitly closed', async function () {
      const expected = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        await using session = client.startSession();

        await session.endSession();

        return 'not error';
      })();

      expect(expected).to.equal('not error');
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

    it('always cleans up the change stream, regardless of thrown errors', async function () {
      const error = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const collection = await setUpCollection(client);
        await using cs = collection.watch();

        setTimeout(1000).then(() => collection.insertOne({ name: 'bailey' }));
        await cs.next();

        throw new Error('error thrown');
      })().catch(e => e);

      expect(error).to.match(/error thrown/);
    });

    it('works if change stream is explicitly closed', async function () {
      const expected = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const collection = await setUpCollection(client);
        await using cs = collection.watch();

        setTimeout(1000).then(() => collection.insertOne({ name: 'bailey' }));
        await cs.next();
        await cs.close();

        return 'not error';
      })();

      expect(expected).to.equal('not error');
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

    it('always cleans up the stream, regardless of thrown errors', async function () {
      const error = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const bucket = new GridFSBucket(client.db('foo'));
        const uploadStream = bucket.openUploadStream('foo.txt')
        await pipeline(Readable.from("AAAAAAA".split('')), uploadStream);

        await using downloadStream = bucket.openDownloadStreamByName('foo.txt');

        throw new Error('error thrown');
      })().catch(e => e);

      expect(error).to.match(/error thrown/);
    });

    it('works if stream is explicitly closed', async function () {
      const expected = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const bucket = new GridFSBucket(client.db('foo'));
        const uploadStream = bucket.openUploadStream('foo.txt')
        await pipeline(Readable.from("AAAAAAA".split('')), uploadStream);

        await using downloadStream = bucket.openDownloadStreamByName('foo.txt');

        await downloadStream.abort();

        return 'not error';
      })();

      expect(expected).to.equal('not error');
    })

    it('throws premature close error if explicitly destroyed early', async function () {
      // Gridfs streams inherit their _destroy() and Symbol.asyncDispose implementations from
      // Nodejs' readable implementation.  This behavior matches the behavior for other readable streams
      // (see the below test).
      const expected = await (async () => {
        await using client = new MongoClient(process.env.MONGODB_URI!);
        await client.connect();

        const bucket = new GridFSBucket(client.db('foo'));
        const uploadStream = bucket.openUploadStream('foo.txt')
        await pipeline(Readable.from("AAAAAAA".split('')), uploadStream);

        await using downloadStream = bucket.openDownloadStreamByName('foo.txt');

        downloadStream.destroy();

        return 'not error';
      })().catch(e => e);

      expect(expected).to.match(/Premature close/);
    })

    it('throws premature close error if explicitly destroyed early (builtin stream)', async function () {
      // Gridfs streams inherit their _destroy() and Symbol.asyncDispose implementations from
      // Nodejs' readable implementation.  This behavior matches the behavior for other readable streams (ie - ReadFileStream)
      const expected = await (async () => {
        await using readStream = createReadStream(join(__dirname, 'main.test.ts'));
        readStream.destroy();

        return 'not error';
      })().catch(e => e);

      expect(expected).to.match(/Premature close/);
    })
  });
})
