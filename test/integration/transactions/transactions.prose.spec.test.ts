import { expect } from 'chai';
import * as semver from 'semver';

import { TopologyType } from '../../../src';

const VALID_TOPOLOGIES = [
  TopologyType.ReplicaSetWithPrimary,
  TopologyType.Sharded,
  TopologyType.LoadBalanced
];

describe('Transactions (prose)', function () {
  const dbName = 'retryable-handshake-tests';
  const collName = 'coll';
  const docs = [{ _id: 1, x: 11 }];
  let client;
  let db;
  let coll;

  beforeEach(function () {
    if (
      semver.lt(this.configuration.buildInfo.version, '4.2.0') ||
      !VALID_TOPOLOGIES.includes(this.configuration.topologyType)
    ) {
      this.currentTest.skipReason =
        'Transaction tests require MongoDB 4.2 and higher and no standalone';
      this.skip();
    }
    client = this.configuration.newClient({});
    db = client.db(dbName);
    coll = db.collection(collName);
  });

  afterEach(async function () {
    await db?.admin().command({
      configureFailPoint: 'failCommand',
      mode: 'off'
    });
    await coll?.drop();
    await client?.close();
  });

  context('when the handshake fails with a network error', function () {
    it('retries the abort', async function () {
      await client.connect();
      await coll.insertMany(docs);
      const session = client.startSession();
      session.startTransaction();
      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['saslContinue', 'ping'],
          closeConnection: true
        }
      });
      await coll.insertOne({ _id: 2, x: 22 }, { session });
      await session.abortTransaction();
      await session.endSession();
      const doc = await coll.findOne({ _id: 2 });
      expect(doc).to.not.exist;
    });

    it('retries the commit', async function () {
      await client.connect();
      await coll.insertMany(docs);
      const session = client.startSession();
      session.startTransaction();
      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['saslContinue', 'ping'],
          closeConnection: true
        }
      });
      await coll.insertOne({ _id: 2, x: 22 }, { session });
      await session.commitTransaction();
      await session.endSession();
      const doc = await coll.findOne({ _id: 2 });
      expect(doc.x).to.equal(22);
    });
  });
});
