import { expect } from 'chai';

const metadata = {
  requires: {
    mongodb: '>=4.2.0',
    topology: ['replicaset', 'sharded', 'load-balanced']
  }
};

describe.only('Retryable Reads (prose)', metadata, function () {
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

  afterEach(async function () {
    await db.admin().command({
      configureFailPoint: 'failCommand',
      mode: 'off'
    });
    await coll.drop();
    await client.close();
  });

  context('when the handshake fails with a network error', function () {
    it('retries the read', async function () {
      await client.connect();
      await coll.insertMany(docs);
      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['saslContinue', 'ping'],
          closeConnection: true
        }
      });
      const documents = await coll.find().toArray();
      expect(documents).to.deep.equal(docs);
    });
  });

  context('when the handshake fails with shutdown in progress', function () {
    it('retries the read', async function () {
      await client.connect();
      await coll.insertMany(docs);
      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['saslContinue', 'ping'],
          errorCode: 91 // ShutdownInProgress
        }
      });
      const documents = await coll.find().toArray();
      expect(documents).to.deep.equal(docs);
    });
  });
});
