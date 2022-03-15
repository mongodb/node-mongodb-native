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
   * TODO(DRIVERS-2218): Refactor tests to align exactly with spec wording. Preliminarily implements:
   * Drivers MAY assert that exactly one session is used for all the concurrent operations listed in the test, however this is a race condition if the session isn't released before checkIn (which SHOULD NOT be attempted)
   * Drivers SHOULD assert that after repeated runs they are able to achieve the use of exactly one session, this will statistically prove we've reduced the allocation amount
   * Drivers MUST assert that the number of allocated sessions never exceeds the number of concurrent operations executing
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

    expect(new Set(events.map(ev => ev.command.lsid.id.toString('hex'))).size).to.equal(1); // This is a guarantee in node
  });
});
