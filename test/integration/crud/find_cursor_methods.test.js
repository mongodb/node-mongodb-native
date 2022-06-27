'use strict';
const { expect } = require('chai');
const { filterForCommands } = require('../shared');

describe('Find Cursor', function () {
  let client;
  before(async function () {
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

  context('#readBufferedDocuments', function () {
    it('should support reading buffered documents', function (done) {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 5 });

      cursor.next((err, doc) => {
        expect(err).to.not.exist;
        expect(doc).property('a').to.equal(1);
        expect(cursor.bufferedCount()).to.equal(4);

        // Read the buffered Count
        cursor.readBufferedDocuments(cursor.bufferedCount());

        // Get the next item
        cursor.next((err, doc) => {
          expect(err).to.not.exist;
          expect(doc).to.exist;

          cursor.next((err, doc) => {
            expect(err).to.not.exist;
            expect(doc).to.be.null;

            done();
          });
        });
      });
    });
  });

  context('#close', function () {
    it('should send a killCursors command when closed before completely iterated', function (done) {
      const commands = [];
      client.on('commandStarted', filterForCommands(['killCursors'], commands));

      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });
      cursor.next(err => {
        expect(err).to.not.exist;
        cursor.close(err => {
          expect(err).to.not.exist;
          expect(commands).to.have.length(1);
          done();
        });
      });
    });

    it('should not send a killCursors command when closed after completely iterated', function (done) {
      const commands = [];
      client.on('commandStarted', filterForCommands(['killCursors'], commands));

      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });
      cursor.toArray(err => {
        expect(err).to.not.exist;

        cursor.close(err => {
          expect(err).to.not.exist;
          expect(commands).to.have.length(0);
          done();
        });
      });
    });

    it('should not send a killCursors command when closed before initialization', function (done) {
      const commands = [];
      client.on('commandStarted', filterForCommands(['killCursors'], commands));

      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({}, { batchSize: 2 });
      cursor.close(err => {
        expect(err).to.not.exist;
        expect(commands).to.have.length(0);
        done();
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
    it('should clone a find cursor', function (done) {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.find({});
      this.defer(() => cursor.close());

      cursor.toArray((err, docs) => {
        expect(err).to.not.exist;
        expect(docs).to.have.length(6);
        expect(cursor).property('closed').to.be.true;

        const clonedCursor = cursor.clone();
        this.defer(() => clonedCursor.close());

        clonedCursor.toArray((err, docs) => {
          expect(err).to.not.exist;
          expect(docs).to.have.length(6);
          expect(clonedCursor).property('closed').to.be.true;
          done();
        });
      });
    });

    it('should clone an aggregate cursor', function (done) {
      const coll = client.db().collection('abstract_cursor');
      const cursor = coll.aggregate([{ $match: {} }]);
      this.defer(() => cursor.close());

      cursor.toArray((err, docs) => {
        expect(err).to.not.exist;
        expect(docs).to.have.length(6);
        expect(cursor).property('closed').to.be.true;

        const clonedCursor = cursor.clone();
        this.defer(() => clonedCursor.close());

        clonedCursor.toArray((err, docs) => {
          expect(err).to.not.exist;
          expect(docs).to.have.length(6);
          expect(clonedCursor).property('closed').to.be.true;
          done();
        });
      });
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
