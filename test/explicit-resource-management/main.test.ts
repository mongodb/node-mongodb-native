import { expect } from 'chai';
import { describe, it } from 'mocha';
import { AbstractCursor, ChangeStream, ClientSession, GridFSBucket, MongoClient } from 'mongodb';
import * as process from 'process';
import * as sinon from 'sinon';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { setTimeout } from 'timers/promises';

async function setUpCollection(client: MongoClient) {
  const collection = client.db('foo').collection<{ name: string }>('bar');
  const documents: Array<{ name: string }> = Array.from({ length: 5 }).map(i => ({
    name: String(i)
  }));
  await collection.insertMany(documents);
  return collection;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const MONGODB_URI = process.env.MONGODB_URI!;
describe('explicit resource management feature integration tests', function () {
  const clientDisposeSpy = sinon.spy(MongoClient.prototype, Symbol.asyncDispose);
  const sessionDisposeSpy = sinon.spy(ClientSession.prototype, Symbol.asyncDispose);
  const changeStreamDisposeSpy = sinon.spy(ChangeStream.prototype, Symbol.asyncDispose);
  const cursorDisposeSpy = sinon.spy(AbstractCursor.prototype, Symbol.asyncDispose);
  const readableDisposeSpy = sinon.spy(Readable.prototype, Symbol.asyncDispose);

  afterEach(function () {
    clientDisposeSpy.resetHistory();
    sessionDisposeSpy.resetHistory();
    changeStreamDisposeSpy.resetHistory();
    cursorDisposeSpy.resetHistory();
    readableDisposeSpy.resetHistory();
  });

  describe('MongoClient', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      {
        await using client = new MongoClient(MONGODB_URI);
        await client.connect();
      }
      expect(clientDisposeSpy.called).to.be.true;
    });
  });

  describe('Cursors', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      {
        await using client = new MongoClient(MONGODB_URI);
        await client.connect();

        const collection = await setUpCollection(client);

        await using cursor = collection.find();
        await cursor.next();
      }
      expect(cursorDisposeSpy.called).to.be.true;
    });

    describe('cursor streams', function () {
      it('does not crash or error when used with await-using syntax', async function () {
        {
          await using client = new MongoClient(MONGODB_URI);
          await client.connect();

          const collection = await setUpCollection(client);

          await using _readable = collection.find().stream();
        }
        expect(readableDisposeSpy.called).to.be.true;
      });
    });
  });

  describe('Sessions', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      {
        await using client = new MongoClient(MONGODB_URI);
        await client.connect();

        await using _session = client.startSession();
      }
      expect(sessionDisposeSpy.called).to.be.true;
    });
  });

  describe('ChangeStreams', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      {
        await using client = new MongoClient(MONGODB_URI);
        await client.connect();

        const collection = await setUpCollection(client);
        await using cs = collection.watch();

        setTimeout(1000).then(() => collection.insertOne({ name: 'bailey' }));
        await cs.next();
      }
      expect(changeStreamDisposeSpy.called).to.be.true;
    });
  });

  describe('GridFSDownloadStream', function () {
    it('does not crash or error when used with await-using syntax', async function () {
      {
        await using client = new MongoClient(MONGODB_URI);
        await client.connect();

        const bucket = new GridFSBucket(client.db('foo'));
        const uploadStream = bucket.openUploadStream('foo.txt');
        await pipeline(Readable.from('AAAAAAA'.split('')), uploadStream);

        await using _downloadStream = bucket.openDownloadStreamByName('foo.txt');
      }

      expect(readableDisposeSpy.called).to.be.true;
    });
  });
});
