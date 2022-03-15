'use strict';

const { expect } = require('chai');

const metadata = {
  requires: {
    mongodb: '>=4.2.0',
    topology: ['replicaset', 'sharded', 'load-balanced']
  }
};

describe('Retryable Writes (prose)', metadata, function () {
  const dbName = 'retryable-handshake-tests';
  const collName = 'coll';
  const docs = [{ _id: 1, x: 11 }];
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
    it('retries the write', function (done) {
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
              coll.insertOne({ _id: 2, x: 22 }, (error, result) => {
                if (error) return error;
                expect(result.insertedId).to.equal(2);
                done();
              });
            }
          );
        });
      });
    });
  });

  context('when the handshake fails with shutdown in progress', function () {
    it('retries the write', function (done) {
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
              coll.insertOne({ _id: 2, x: 22 }, (error, result) => {
                if (error) return error;
                expect(result.insertedId).to.equal(2);
                done();
              });
            }
          );
        });
      });
    });
  });
});
