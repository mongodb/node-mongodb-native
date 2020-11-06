'use strict';
const { expect } = require('chai');
const { filterForCommands } = require('./shared');

function withClientV2(callback) {
  return function testFunction(done) {
    const client = this.configuration.newClient({ monitorCommands: true });
    client.connect(err => {
      if (err) return done(err);
      this.defer(() => client.close());

      try {
        callback.call(this, client, done);
      } catch (err) {
        done(err);
      }
    });
  };
}

describe('AbstractCursor', function () {
  before(
    withClientV2((client, done) => {
      const docs = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }, { a: 6 }];
      const coll = client.db().collection('find_cursor');
      coll.drop(() => coll.insertMany(docs, done));
    })
  );

  context('#next', function () {
    it(
      'should support a batch size',
      withClientV2(function (client, done) {
        const commands = [];
        client.on('commandStarted', filterForCommands(['getMore'], commands));

        const coll = client.db().collection('find_cursor');
        const cursor = coll.find({}, { batchSize: 2 });
        this.defer(() => cursor.close());

        cursor.toArray((err, docs) => {
          expect(err).to.not.exist;
          expect(docs).to.have.length(6);
          expect(commands).to.have.length(3);
          done();
        });
      })
    );
  });

  context('#close', function () {
    it(
      'should a killCursors command when closed before completely iterated',
      withClientV2(function (client, done) {
        const commands = [];
        client.on('commandStarted', filterForCommands(['killCursors'], commands));

        const coll = client.db().collection('find_cursor');
        const cursor = coll.find({}, { batchSize: 2 });
        cursor.next(err => {
          expect(err).to.not.exist;
          cursor.close(err => {
            expect(err).to.not.exist;
            expect(commands).to.have.length(1);
            done();
          });
        });
      })
    );

    it(
      'should not send a killCursors command when closed after completely iterated',
      withClientV2(function (client, done) {
        const commands = [];
        client.on('commandStarted', filterForCommands(['killCursors'], commands));

        const coll = client.db().collection('find_cursor');
        const cursor = coll.find({}, { batchSize: 2 });
        cursor.toArray(err => {
          expect(err).to.not.exist;

          cursor.close(err => {
            expect(err).to.not.exist;
            expect(commands).to.have.length(0);
            done();
          });
        });
      })
    );

    it(
      'should not send a killCursors command when closed before initialization',
      withClientV2(function (client, done) {
        const commands = [];
        client.on('commandStarted', filterForCommands(['killCursors'], commands));

        const coll = client.db().collection('find_cursor');
        const cursor = coll.find({}, { batchSize: 2 });
        cursor.close(err => {
          expect(err).to.not.exist;
          expect(commands).to.have.length(0);
          done();
        });
      })
    );
  });

  context('#forEach', function () {
    it(
      'should iterate each document in a cursor',
      withClientV2(function (client, done) {
        const coll = client.db().collection('find_cursor');
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
      })
    );
  });

  context('sessions', function () {
    it(
      'should end a session after close if the cursor owns the session',
      withClientV2(function (client, done) {
        // TBD
        done();
      })
    );
  });
});
