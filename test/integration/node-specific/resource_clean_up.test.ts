import { expect } from 'chai';

import { runScript } from './resource_tracking_script_builder';

/**
 * This 5MB range is selected arbitrarily and should likely be raised if failures are seen intermittently.
 *
 * The goal here is to catch unbounded memory growth, currently runScript defaults to 100 iterations of whatever test code is passed in
 * More than a 5MB growth in memory usage after the script has finished and _should have_ cleaned up all its resources likely indicates that
 * the growth will continue if the script is changed to iterate the the test code more.
 */
const MB_PERMITTED_OFFSET = 5;

describe.only('Driver Resources', () => {
  let startingMemoryUsed;
  let endingMemoryUsed;
  let heap;

  beforeEach(function () {
    if (globalThis.AbortController == null) {
      if (this.currentTest) this.currentTest.skipReason = 'Need AbortController to run this test';
      this.currentTest?.skip();
    }
    if (typeof this.configuration.serverApi === 'string') {
      if (this.currentTest) {
        this.currentTest.skipReason = 'runScript does not support serverApi settings';
      }
      this.currentTest?.skip();
    }
  });

  before('create leak reproduction script', async function () {
    if (globalThis.AbortController == null || typeof this.configuration.serverApi === 'string') {
      return;
    }
    const res = await runScript(
      'no_resource_leak_connect_close',
      this.configuration,
      async function run({ MongoClient, uri }) {
        const mongoClient = new MongoClient(uri);
        await mongoClient.connect();
        const db = mongoClient.db();
        await Promise.all([
          db.collections(),
          db.collections(),
          db.collections(),
          db.collections(),
          db.collections(),
          db.collections(),
          db.collections(),
          db.collections()
        ]);
        await mongoClient.close();
      }
    ).catch(error => error);

    if (res instanceof Error) {
      console.log(res);
      console.log(res.message);
      console.log(res.cause);
      throw res;
    }

    startingMemoryUsed = res.startingMemoryUsed;
    endingMemoryUsed = res.endingMemoryUsed;
    heap = res.heap;
  });

  it(`ending memory usage should be within ${MB_PERMITTED_OFFSET}MB of starting amount`, async () => {
    // Why check the lower bound? No reason, but it would be very surprising if we managed to free MB_PERMITTED_OFFSET MB of memory
    // I expect us to **never** be below the lower bound, but I'd want to know if it happened
    expect(
      endingMemoryUsed,
      `script started with ${startingMemoryUsed}MB heap but ended with ${endingMemoryUsed}MB heap used`
    ).to.be.within(
      startingMemoryUsed - MB_PERMITTED_OFFSET,
      startingMemoryUsed + MB_PERMITTED_OFFSET
    );
  });

  it('heapsnapshot has 0 MongoClients in memory', async () => {
    const clients = heap.nodes.filter(n => n.name === 'MongoClient' && n.type === 'object');
    // lengthOf crashes chai b/c it tries to print out a gigantic diff
    // Allow GC to miss a few
    expect(
      clients.length,
      `expected no MongoClients in the heapsnapshot found ${clients.length}`
    ).to.equal(0);
  });
});
