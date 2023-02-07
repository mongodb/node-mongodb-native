import { expect } from 'chai';

import { runScript } from './resource_tracking_script_builder';

const MB_PERMITTED_OFFSET = 3;

describe('Driver Resources', () => {
  let startingMemoryUsed;
  let endingMemoryUsed;
  let asyncResourcesCount;
  let heap;

  before('create leak reproduction script', async function () {
    const res = await runScript(
      'no_resource_leak_connect_close',
      this.configuration,
      async function run({ MongoClient, async_hooks, uri }) {
        const mongoClient = new MongoClient(uri);
        // @ts-expect-error: Adding asyncResource property dynamically
        mongoClient.asyncResource = new async_hooks.AsyncResource('MongoClient');
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
    );

    startingMemoryUsed = res.startingMemoryUsed;
    endingMemoryUsed = res.endingMemoryUsed;
    asyncResourcesCount = res.asyncResourcesCount;
    heap = res.heap;
  });

  it(`ending memory usage should be within ${MB_PERMITTED_OFFSET}MB of starting amount`, async () => {
    expect(
      endingMemoryUsed,
      `script started with ${startingMemoryUsed}MB heap but ended with ${endingMemoryUsed}MB heap used`
    ).to.be.within(
      startingMemoryUsed - MB_PERMITTED_OFFSET,
      startingMemoryUsed + MB_PERMITTED_OFFSET
    );
  });

  it('all but 1 MongoClient async resource should be destroyed', async () => {
    expect(
      asyncResourcesCount,
      `${asyncResourcesCount} MongoClient's with an asyncResource attached never had their destroy hook invoked`
    ).to.equal(1);
  });

  it('heapsnapshot has 0 MongoClients in memory', async () => {
    const clients = heap.nodes.filter(n => n.name === 'MongoClient' && n.type === 'object');
    // lengthOf crashes chai b/c it tries to print out a gig
    // Allow GC to miss a few
    expect(
      clients.length,
      `expected no MongoClients in the heapsnapshot found ${clients.length}`
    ).to.equal(0);
  });
});
