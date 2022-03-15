'use strict';

const { expect } = require('chai');

describe('Retryable Reads (prose)', function () {
  const dbName = 'retryable-handshake-tests';
  const collName = 'coll';
  const docs = [
    { _id: 1, x: 11 },
    { _id: 2, x: 22 },
    { _id: 3, x: 33 }
  ];
  let client;
  let db;
  let coll;

  beforeEach(function () {
    client = this.configuration.newClient({});
    db = client.db(dbName);
    coll = db.collection(collName);
  });

  afterEach(function (done) {
    db.admin().command(
      {
        configureFailPoint: 'failCommand',
        mode: 'off'
      },
      () => {
        coll.drop(() => {
          client.close(done);
        });
      }
    );
  });

  context('when the handshake fails with a network error', function () {
    it('retries the read', function (done) {
      client.connect(() => {
        coll.insertMany(docs, () => {
          db.admin().command(
            {
              configureFailPoint: 'failCommand',
              mode: { times: 1 },
              data: {
                failCommands: ['saslContinue', 'ping'],
                closeConnection: true
              }
            },
            () => {
              coll.find().toArray((error, documents) => {
                expect(documents).to.deep.equal(docs);
                done();
              });
            }
          );
        });
      });
    });
  });

  context('when the handshake fails with shutdown in progress', function () {
    it('retries the read', function (done) {
      client.connect(() => {
        coll.insertMany(docs, () => {
          db.admin().command(
            {
              configureFailPoint: 'failCommand',
              mode: { times: 1 },
              data: {
                failCommands: ['saslContinue', 'ping'],
                errorCode: 91 // ShutdownInProgress
              }
            },
            () => {
              coll.find().toArray((error, documents) => {
                expect(documents).to.deep.equal(docs);
                done();
              });
            }
          );
        });
      });
    });
  });
});
