import { expect } from 'chai';

import {
  type Collection,
  type FindCursor,
  MongoAPIError,
  type MongoClient,
  MongoCursorExhaustedError
} from '../../../src';
import { CursorTimeoutContext } from '../../../src/cursor/abstract_cursor';
import { TimeoutContext } from '../../../src/timeout';
import { promiseWithResolvers } from '../../../src/utils';
import { filterForCommands } from '../shared';

describe('Find Cursor', function () {
  let client: MongoClient;

  beforeEach(async function () {
    const setupClient = this.configuration.newClient();
    const docs = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }, { a: 6 }];
    const coll = setupClient.db().collection('abstract_cursor');
    const tryNextColl = setupClient.db().collection('try_next');
    await coll.drop().catch(() => null);
    await tryNextColl.drop().catch(() => null);
    await coll.insertMany(docs);
    await setupClient.close();
  });

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
  });

  afterEach(async function () {
    await client.close();
  });

  context('#next', function () {
    it('should support a batch size', async function () {
      const commands = [];
      client.on('commandStarted', filterForCommands(['getMore'], commands));

      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });

      const docs = await cursor.toArray();
      expect(docs).to.have.length(6);
      expect(commands).to.have.length(3);
    });
  });

  describe('#readBufferedDocuments', function () {
    let cursor;

    beforeEach(async () => {
      const coll = client.db().collection('abstract_cursor');
      cursor = coll.find({}, { batchSize: 5 });
      await cursor.hasNext(); // fetch firstBatch
    });

    it('should remove buffered documents from subsequent cursor iterations', async () => {
      const [doc] = cursor.readBufferedDocuments(1);
      expect(doc).to.have.property('a', 1);

      const nextDoc = await cursor.next();
      expect(nextDoc).to.have.property('a', 2);
    });

    it('should return the amount of documents requested', async () => {
      const buf1 = cursor.readBufferedDocuments(1);
      expect(buf1).to.be.lengthOf(1);

      const buf2 = cursor.readBufferedDocuments(3);
      expect(buf2).to.be.lengthOf(3);
    });

    it('should bound the request by the maximum amount of documents currently buffered', async () => {
      const buf1 = cursor.readBufferedDocuments(1000);
      expect(buf1).to.be.lengthOf(5);

      const buf2 = cursor.readBufferedDocuments(23);
      expect(buf2).to.be.lengthOf(0);
    });

    it('should return all buffered documents when no argument is passed', async () => {
      const buf1 = cursor.readBufferedDocuments();
      expect(buf1).to.be.lengthOf(5);

      const buf2 = cursor.readBufferedDocuments();
      expect(buf2).to.be.lengthOf(0);
    });

    it('should return empty array for size zero or less', async () => {
      const buf1 = cursor.readBufferedDocuments(0);
      expect(buf1).to.be.lengthOf(0);

      const buf2 = cursor.readBufferedDocuments(-23);
      expect(buf2).to.be.lengthOf(0);
    });

    it('should return the same amount of documents reported by bufferedCount', async function () {
      const doc = await cursor.next();
      expect(doc).property('a', 1);

      const bufferedCount = cursor.bufferedCount();
      expect(bufferedCount).to.equal(4);

      // Read the buffered Count
      const bufferedDocs = cursor.readBufferedDocuments(bufferedCount);
      expect(bufferedDocs.map(({ a }) => a)).to.deep.equal([2, 3, 4, 5]);

      const doc2 = await cursor.next();
      expect(doc2).to.have.property('a', 6);

      const doc3 = await cursor.next();
      expect(doc3).to.be.null;
    });
  });

  describe('#close', function () {
    let collection;

    beforeEach(async function () {
      collection = client.db().collection('abstract_cursor');
      await collection.drop().catch(() => null);
      await collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);
    });

    afterEach(async function () {
      await collection?.drop().catch(() => null);
    });

    context('when closed before completely iterated', () => {
      it('sends a killCursors command', async () => {
        const killCursorsCommands = [];
        client.on('commandStarted', filterForCommands(['killCursors'], killCursorsCommands));

        const cursor = collection.find({}, { batchSize: 2 });

        const doc = await cursor.next();
        expect(doc).property('a', 1);

        expect(killCursorsCommands).to.have.length(0);
        await cursor.close();
        expect(killCursorsCommands).to.have.length(1);
      });
    });

    context('when closed after completely iterated', () => {
      it('does not send a killCursors command', async () => {
        const killCursorsCommands = [];
        client.on('commandStarted', filterForCommands(['killCursors'], killCursorsCommands));

        const cursor = collection.find();
        await cursor.toArray();
        expect(killCursorsCommands).to.have.length(0);
        await cursor.close();
        expect(killCursorsCommands).to.have.length(0);
      });
    });

    context('when closed before initialization', () => {
      it('does not send a killCursors command', async () => {
        const killCursorsCommands = [];
        client.on('commandStarted', filterForCommands(['killCursors'], killCursorsCommands));

        const cursor = collection.find();

        expect(killCursorsCommands).to.have.length(0);
        await cursor.close();
        expect(killCursorsCommands).to.have.length(0);
      });
    });
  });

  context('#forEach', function () {
    it('should iterate each document in a cursor', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });

      const bag = [];
      await cursor.forEach(doc => {
        bag.push(doc);
      });

      expect(bag).to.have.lengthOf(6);
    });
  });

  context('#tryNext', function () {
    it('should return control to the user if an empty batch is returned', async function () {
      const db = client.db();
      await db.createCollection('try_next', { capped: true, size: 10000000 });
      const coll = db.collection('try_next');
      await coll.insertMany([{}, {}]);

      const cursor = coll.find({}, { tailable: true, awaitData: true });

      const doc1 = await cursor.tryNext();
      expect(doc1).to.exist;

      const doc2 = await cursor.tryNext();
      expect(doc2).to.exist;

      const doc3 = await cursor.tryNext();
      expect(doc3).to.be.null;
    });
  });

  context('#clone', function () {
    it('should clone a find cursor', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({});

      const docsFromOriginal = await cursor.toArray();
      expect(docsFromOriginal).to.have.length(6);
      expect(cursor).property('closed').to.be.true;

      const clonedCursor = cursor.clone();
      const docsFromCloned = await clonedCursor.toArray();
      expect(docsFromCloned).to.have.length(6);
      expect(cursor).property('closed').to.be.true;
    });

    it('should clone an aggregate cursor', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.aggregate([{ $match: {} }]);

      const docsFromOriginal = await cursor.toArray();
      expect(docsFromOriginal).to.have.length(6);
      expect(cursor).property('closed').to.be.true;

      const clonedCursor = cursor.clone();
      const docsFromCloned = await clonedCursor.toArray();
      expect(docsFromCloned).to.have.length(6);
      expect(cursor).property('closed').to.be.true;
    });
  });

  describe('#rewind', function () {
    it('should rewind a cursor', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({});

      try {
        let docs = await cursor.toArray();
        expect(docs).to.have.lengthOf(6);

        cursor.rewind();
        docs = await cursor.toArray();
        expect(docs).to.have.lengthOf(6);
      } finally {
        await cursor.close();
      }
    });

    it('throws if the cursor does not own its timeoutContext', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find(
        {},
        {
          timeoutContext: new CursorTimeoutContext(
            TimeoutContext.create({
              timeoutMS: 1000,
              serverSelectionTimeoutMS: 1000
            }),
            Symbol()
          )
        }
      );

      try {
        cursor.rewind();
        expect.fail(`rewind should have thrown.`);
      } catch (error) {
        expect(error).to.be.instanceOf(MongoAPIError);
      } finally {
        await cursor.close();
      }
    });

    it('should end an implicit session on rewind', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 1 });

      const doc = await cursor.next();
      expect(doc).to.exist;

      const session = cursor.session;
      expect(session).property('hasEnded').to.be.false;
      cursor.rewind();
      expect(session).property('hasEnded').to.be.true;
    });

    it('should not end an explicit session on rewind', async function () {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 1, session: client.startSession() });

      const doc = await cursor.next();
      expect(doc).to.exist;

      const session = cursor.session;
      expect(session).property('hasEnded').to.be.false;
      cursor.rewind();
      expect(session).property('hasEnded').to.be.false;

      await session.endSession();
    });

    it('emits close after rewind', async () => {
      let cursor: FindCursor;
      try {
        const coll = client.db().collection('abstract_cursor');
        cursor = coll.find({}, { batchSize: 1 });
        const closes = [];
        cursor.on('close', () => closes.push('close'));
        const doc0 = await cursor.next();
        await cursor.close();
        cursor.rewind();
        const doc1 = await cursor.next();
        await cursor.close();
        expect(doc0).to.deep.equal(doc1); // make sure rewind happened
        expect(closes).to.have.lengthOf(2);
      } finally {
        await cursor.close();
      }
    });
  });

  context('#allowDiskUse', function () {
    it('should set allowDiskUse to true by default', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: async function () {
        const commands = [];
        client.on('commandStarted', filterForCommands(['find'], commands));

        const coll = client.db().collection('abstract_cursor');
        const cursor = coll.find({}, { sort: 'foo' });
        cursor.allowDiskUse();

        await cursor.toArray();
        expect(commands).to.have.length(1);
        expect(commands[0].command.allowDiskUse).to.equal(true);
      }
    });

    it('should set allowDiskUse to false if specified', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: async function () {
        const commands = [];
        client.on('commandStarted', filterForCommands(['find'], commands));

        const coll = client.db().collection('abstract_cursor');
        const cursor = coll.find({}, { sort: 'foo' });
        cursor.allowDiskUse(false);

        await cursor.toArray();
        expect(commands).to.have.length(1);
        expect(commands[0].command.allowDiskUse).to.equal(false);
      }
    });

    it('throws if the query does not have sort specified', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: function (done) {
        const coll = client.db().collection('abstract_cursor');
        const cursor = coll.find({});
        expect(() => cursor.allowDiskUse(false)).to.throw(
          'Option "allowDiskUse" requires a sort specification'
        );
        done();
      }
    });
  });

  describe('mixing iteration APIs', function () {
    let client: MongoClient;
    let collection: Collection;
    let cursor: FindCursor;

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();
      collection = client.db('next-symbolasynciterator').collection('bar');
      await collection.deleteMany({}, { writeConcern: { w: 'majority' } });
      await collection.insertMany([{ a: 1 }, { a: 2 }], { writeConcern: { w: 'majority' } });
    });

    afterEach(async function () {
      await cursor.close();
      await client.close();
    });

    context('when all documents are retrieved in the first batch', function () {
      it('allows combining iteration modes', async function () {
        let count = 0;
        cursor = collection.find().map(doc => {
          count++;
          return doc;
        });

        await cursor.next();

        for await (const _ of cursor) {
          /* empty */
        }

        expect(count).to.equal(2);
      });

      it('works with next + next() loop', async function () {
        let count = 0;
        cursor = collection.find().map(doc => {
          count++;
          return doc;
        });

        await cursor.next();

        while ((await cursor.next()) != null) {
          /** empty */
        }

        expect(count).to.equal(2);
      });

      context('when next() is called in a loop after a single invocation', function () {
        it('iterates over all documents', async function () {
          let count = 0;
          cursor = collection.find({}).map(doc => {
            count++;
            return doc;
          });

          await cursor.next();

          while ((await cursor.next()) != null) {
            /** empty */
          }

          expect(count).to.equal(2);
        });
      });

      context(
        'when cursor.next() is called after cursor.stream() is partially iterated',
        function () {
          it('returns null', async function () {
            cursor = collection.find({});

            const stream = cursor.stream();
            const { promise, resolve, reject } = promiseWithResolvers();

            stream.once('data', v => {
              resolve(v);
            });

            stream.once('error', v => {
              reject(v);
            });
            await promise;

            expect(await cursor.next()).to.be.null;
          });
        }
      );

      context('when cursor.tryNext() is called after cursor.stream()', function () {
        it('returns null', async function () {
          cursor = collection.find({});

          const stream = cursor.stream();
          const { promise, resolve, reject } = promiseWithResolvers();

          stream.once('data', v => {
            resolve(v);
          });

          stream.once('error', v => {
            reject(v);
          });
          await promise;

          expect(await cursor.tryNext()).to.be.null;
        });
      });

      context(
        'when cursor.[Symbol.asyncIterator] is called after cursor.stream() is partly iterated',
        function () {
          it('returns an empty iterator', async function () {
            cursor = collection.find({});

            const stream = cursor.stream();
            const { promise, resolve, reject } = promiseWithResolvers();

            stream.once('data', v => {
              resolve(v);
            });

            stream.once('error', v => {
              reject(v);
            });
            await promise;

            let count = 0;

            for await (const _ of cursor) {
              count++;
            }

            expect(count).to.equal(0);
          });
        }
      );

      context('when cursor.readBufferedDocuments() is called after cursor.next()', function () {
        it('returns an array with remaining buffered documents', async function () {
          cursor = collection.find({});

          await cursor.next();
          const docs = cursor.readBufferedDocuments();

          expect(docs).to.have.lengthOf(1);
        });
      });

      context('when cursor.next() is called after cursor.toArray()', function () {
        it('returns null', async function () {
          cursor = collection.find({});

          await cursor.toArray();
          expect(await cursor.next()).to.be.null;
        });
      });

      context('when cursor.tryNext is called after cursor.toArray()', function () {
        it('returns null', async function () {
          cursor = collection.find({});

          await cursor.toArray();
          expect(await cursor.tryNext()).to.be.null;
        });
      });

      context('when cursor.[Symbol.asyncIterator] is called after cursor.toArray()', function () {
        it('should not iterate', async function () {
          cursor = collection.find({});

          await cursor.toArray();

          for await (const _ of cursor) {
            expect.fail('should not iterate');
          }
        });
      });

      context('when cursor.readBufferedDocuments() is called after cursor.toArray()', function () {
        it('return and empty array', async function () {
          cursor = collection.find({});

          await cursor.toArray();
          expect(cursor.readBufferedDocuments()).to.have.lengthOf(0);
        });
      });

      context('when cursor.stream() is called after cursor.toArray()', function () {
        it('returns an empty stream', async function () {
          cursor = collection.find({});
          await cursor.toArray();

          const s = cursor.stream();
          const { promise, resolve, reject } = promiseWithResolvers();

          s.once('data', d => {
            reject(d);
          });

          s.once('end', d => {
            resolve(d);
          });

          expect(await promise).to.be.undefined;
        });
      });
    });

    context('when there are documents that are not retrieved in the first batch', function () {
      it('allows combining next() and for await syntax', async function () {
        let count = 0;
        cursor = collection.find({}, { batchSize: 1 }).map(doc => {
          count++;
          return doc;
        });

        await cursor.next();

        for await (const _ of cursor) {
          /* empty */
        }

        expect(count).to.equal(2);
      });

      context(
        'when a cursor is partially iterated with for await and then .next() is called',
        function () {
          it('throws a MongoCursorExhaustedError', async function () {
            cursor = collection.find({}, { batchSize: 1 });

            for await (const _ of cursor) {
              /* empty */
              break;
            }

            const maybeError = await cursor.next().then(
              () => null,
              e => e
            );
            expect(maybeError).to.be.instanceof(MongoCursorExhaustedError);
          });
        }
      );

      context('when next() is called in a loop after a single invocation', function () {
        it('iterates over all documents', async function () {
          let count = 0;
          cursor = collection.find({}, { batchSize: 1 }).map(doc => {
            count++;
            return doc;
          });

          await cursor.next();

          while ((await cursor.next()) != null) {
            /** empty */
          }

          expect(count).to.equal(2);
        });
      });

      context('when cursor.readBufferedDocuments() is called after cursor.next()', function () {
        it('returns an empty array', async function () {
          cursor = collection.find({}, { batchSize: 1 });

          await cursor.next();
          const docs = cursor.readBufferedDocuments();

          expect(docs).to.have.lengthOf(0);
        });
      });

      context('when cursor.next() is called after cursor.toArray()', function () {
        it('returns null', async function () {
          cursor = collection.find({}, { batchSize: 1 });

          await cursor.toArray();
          expect(await cursor.next()).to.be.null;
        });
      });

      context('when cursor.tryNext is called after cursor.toArray()', function () {
        it('returns null', async function () {
          cursor = collection.find({}, { batchSize: 1 });

          await cursor.toArray();
          expect(await cursor.tryNext()).to.be.null;
        });
      });

      context('when cursor.[Symbol.asyncIterator] is called after cursor.toArray()', function () {
        it('should not iterate', async function () {
          cursor = collection.find({}, { batchSize: 1 });

          await cursor.toArray();

          for await (const _ of cursor) {
            expect.fail('should not iterate');
          }
        });
      });

      context('when cursor.readBufferedDocuments() is called after cursor.toArray()', function () {
        it('return and empty array', async function () {
          cursor = collection.find({}, { batchSize: 1 });

          await cursor.toArray();
          expect(cursor.readBufferedDocuments()).to.have.lengthOf(0);
        });
      });

      context('when cursor.stream() is called after cursor.toArray()', function () {
        it('returns an empty stream', async function () {
          cursor = collection.find({}, { batchSize: 1 });
          await cursor.toArray();

          const s = cursor.stream();
          const { promise, resolve, reject } = promiseWithResolvers();

          s.once('data', d => {
            reject(d);
          });

          s.once('end', d => {
            resolve(d);
          });

          expect(await promise).to.be.undefined;
        });
      });
    });
  });
});
