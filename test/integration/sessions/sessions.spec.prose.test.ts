import { expect } from 'chai';

import { Collection } from '../../../src/index';

describe('ServerSession', () => {
  let client;
  let testCollection: Collection<{ _id: number; a?: number }>;
  beforeEach(async function () {
    const configuration = this.configuration;
    client = await configuration.newClient({ maxPoolSize: 1, monitorCommands: true }).connect();

    // reset test collection
    testCollection = client.db('test').collection('too.many.sessions');
    await testCollection.drop().catch(() => null);
  });

  afterEach(async () => {
    await client?.close(true);
  });

  /**
   * TODO(NODE-4082): Refactor tests to align exactly with spec wording.
   * Assert the following across at least 5 retries of the above test: (We do not need to retry in nodejs)
   * Drivers MUST assert that exactly one session is used for all operations at least once across the retries of this test.
   * Note that it's possible, although rare, for greater than 1 server session to be used because the session is not released until after the connection is checked in.
   * Drivers MUST assert that the number of allocated sessions is strictly less than the number of concurrent operations in every retry of this test. In this instance it would less than (but NOT equal to) 8.
   */
  it('13. may reuse one server session for many operations', async () => {
    const events = [];
    client.on('commandStarted', ev => events.push(ev));

    const operations = [
      testCollection.insertOne({ _id: 1 }),
      testCollection.deleteOne({ _id: 2 }),
      testCollection.updateOne({ _id: 3 }, { $set: { a: 1 } }),
      testCollection.bulkWrite([{ updateOne: { filter: { _id: 4 }, update: { $set: { a: 1 } } } }]),
      testCollection.findOneAndDelete({ _id: 5 }),
      testCollection.findOneAndUpdate({ _id: 6 }, { $set: { a: 1 } }),
      testCollection.findOneAndReplace({ _id: 7 }, { a: 8 }),
      testCollection.find().toArray()
    ];

    const allResults = await Promise.all(operations);

    expect(allResults).to.have.lengthOf(operations.length);
    expect(events).to.have.lengthOf(operations.length);

    // This is a guarantee in node, unless you are performing a transaction (which is not being done in this test)
    expect(new Set(events.map(ev => ev.command.lsid.id.toString('hex'))).size).to.equal(1);
  });
});
