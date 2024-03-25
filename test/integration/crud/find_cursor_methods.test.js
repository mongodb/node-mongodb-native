'use strict';
const { expect } = require('chai');
const { filterForCommands } = require('../shared');

describe('Find Cursor', function () {
  let client;

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
    it('should support a batch size', function (done) {
      const commands = [];
      client.on('commandStarted', filterForCommands(['getMore'], commands));

      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });
      this.defer(() => cursor.close());

      cursor.toArray((err, docs) => {
        expect(err).to.not.exist;
        expect(docs).to.have.length(6);
        expect(commands).to.have.length(3);
        done();
      });
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
    it('should iterate each document in a cursor', function (done) {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });

      const bag = [];
      cursor.forEach(
        doc => bag.push(doc),
        err => {
          expect(err).to.not.exist;
          expect(bag).to.have.lengthOf(6);
          done();
        }
      );
    });
  });

  context('#tryNext', function () {
    it('should return control to the user if an empty batch is returned', function (done) {
      const db = client.db();
      db.createCollection('try_next', { capped: true, size: 10000000 }, () => {
        const coll = db.collection('try_next');
        coll.insertMany([{}, {}], err => {
          expect(err).to.not.exist;

          const cursor = coll.find({}, { tailable: true, awaitData: true });
          this.defer(() => cursor.close());

          cursor.tryNext((err, doc) => {
            expect(err).to.not.exist;
            expect(doc).to.exist;

            cursor.tryNext((err, doc) => {
              expect(err).to.not.exist;
              expect(doc).to.exist;

              cursor.tryNext((err, doc) => {
                expect(err).to.not.exist;
                expect(doc).to.be.null;
                done();
              });
            });
          });
        });
      });
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

  context('#rewind', function () {
    it('should rewind a cursor', function (done) {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({});
      this.defer(() => cursor.close());

      cursor.toArray((err, docs) => {
        expect(err).to.not.exist;
        expect(docs).to.have.length(6);

        cursor.rewind();
        cursor.toArray((err, docs) => {
          expect(err).to.not.exist;
          expect(docs).to.have.length(6);

          done();
        });
      });
    });

    it('should end an implicit session on rewind', {
      metadata: { requires: { mongodb: '>=3.6' } },
      test: function (done) {
        const coll = client.db().collection('abstract_cursor');
        const cursor = coll.find({}, { batchSize: 1 });
        this.defer(() => cursor.close());

        cursor.next((err, doc) => {
          expect(err).to.not.exist;
          expect(doc).to.exist;

          const session = cursor.session;
          expect(session).property('hasEnded').to.be.false;
          cursor.rewind();
          expect(session).property('hasEnded').to.be.true;
          done();
        });
      }
    });

    it('should not end an explicit session on rewind', {
      metadata: { requires: { mongodb: '>=3.6' } },
      test: function (done) {
        const coll = client.db().collection('abstract_cursor');
        const session = client.startSession();

        const cursor = coll.find({}, { batchSize: 1, session });
        this.defer(() => cursor.close());

        cursor.next((err, doc) => {
          expect(err).to.not.exist;
          expect(doc).to.exist;

          const session = cursor.session;
          expect(session).property('hasEnded').to.be.false;
          cursor.rewind();
          expect(session).property('hasEnded').to.be.false;

          session.endSession(done);
        });
      }
    });
  });

  context('#allowDiskUse', function () {
    it('should set allowDiskUse to true by default', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: function (done) {
        const commands = [];
        client.on('commandStarted', filterForCommands(['find'], commands));

        const coll = client.db().collection('abstract_cursor');
        const cursor = coll.find({}, { sort: 'foo' });
        cursor.allowDiskUse();
        this.defer(() => cursor.close());

        cursor.toArray(err => {
          expect(err).to.not.exist;
          expect(commands).to.have.length(1);
          expect(commands[0].command.allowDiskUse).to.equal(true);
          done();
        });
      }
    });

    it('should set allowDiskUse to false if specified', {
      metadata: { requires: { mongodb: '>=4.4' } },
      test: function (done) {
        const commands = [];
        client.on('commandStarted', filterForCommands(['find'], commands));

        const coll = client.db().collection('abstract_cursor');
        const cursor = coll.find({}, { sort: 'foo' });
        cursor.allowDiskUse(false);
        this.defer(() => cursor.close());

        cursor.toArray(err => {
          expect(err).to.not.exist;
          expect(commands).to.have.length(1);
          expect(commands[0].command.allowDiskUse).to.equal(false);
          done();
        });
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
});
