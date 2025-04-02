import { expect } from 'chai';
import * as semver from 'semver';

import { type MongoClient, type ObjectId } from '../../mongodb';

const metadata: MongoDBMetadataUI = {
  requires: {
    topology: '!single'
  }
};

describe('Transactions Spec Prose', function () {
  let client: MongoClient;
  const started = [];

  beforeEach(async function () {
    if (
      semver.satisfies(this.configuration.version, '<=4.2') &&
      this.configuration.topologyType === 'Sharded'
    ) {
      if (this.currentTest) {
        this.currentTest.skipReason =
          'Transactions on sharded clusters are only supported after 4.2';
        this.skip();
      }
    }
    started.length = 0;
    client = this.configuration.newClient({}, { monitorCommands: true });

    await client
      .db()
      .collection('txn-test')
      .drop()
      .catch(() => null);
    await client.db().createCollection('txn-test');

    client.on('commandStarted', ev => started.push(ev));
  });

  afterEach(async function () {
    await client
      ?.db()
      .collection('txn-test')
      .drop()
      .catch(() => null);
    await client?.close();
  });

  describe('Options Inside Transaction', function () {
    it(
      '1.0 Write concern not inherited from collection object inside transaction.',
      metadata,
      async () => {
        let _id: ObjectId;
        const collection = client.db().collection('txn-test', { writeConcern: { w: 0 } });

        await client.withSession(async session => {
          session.startTransaction();
          _id = (await collection.insertOne({ n: 1 }, { session })).insertedId;
          await session.commitTransaction();
        });

        // keep finding until we get a result, otherwise the test will timeout.
        expect(await collection.findOne({ _id })).to.have.property('n', 1);

        const insertStarted = started.find(ev => ev.commandName === 'insert');
        expect(insertStarted).to.not.have.nested.property('command.writeConcern');

        // not in asked by the spec test but good to check, this is where the WC would be if it wasn't ignored.
        const commitTransactionStarted = started.find(ev => ev.commandName === 'commitTransaction');
        expect(commitTransactionStarted).to.not.have.nested.property('command.writeConcern');
      }
    );
  });
});
