import { fork } from 'node:child_process';
import { on, once } from 'node:events';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import { parseSnapshot } from 'v8-heapsnapshot';

const HEAPSNAPSHOT_BEFORE = './before.heapsnapshot.json';
const HEAPSNAPSHOT_AFTER = './after.heapsnapshot.json';

const REPRO_SCRIPT = (uri: string) => `
const { MongoClient } = require(${JSON.stringify(path.resolve(__dirname, '../../../lib'))});
const process = require('node:process');
const async_hooks = require('node:async_hooks');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');

const resources = new Set();
const hook = async_hooks.createHook({
  init: (asyncId, type, triggerAsyncId, resource) => {
    if (type !== 'MongoClient') return;
    resources.add(asyncId)
  },
  destroy: (asyncId) => {
    resources.delete(asyncId)
  }
}).enable();

async function run(i) {
  const mongoClient = new MongoClient(
    ${JSON.stringify(uri)},
    { maxPoolSize: 3 }
  );
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

async function main() {
  // v8.writeHeapSnapshot(${JSON.stringify(HEAPSNAPSHOT_BEFORE)});
  const startingMemoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
  process.send({ startingMemoryUsed });

  for (let i = 0; i < 100; i++) {
    await run(i);
    global.gc();
  }

  global.gc();
  await util.promisify(timers.setTimeout)(100); // Sleep b/c maybe gc will run
  global.gc();

  const endingMemoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
  process.send({ endingMemoryUsed });
  process.send({ resourcesSize: resources.size });
  v8.writeHeapSnapshot(${JSON.stringify(HEAPSNAPSHOT_AFTER)});
}

main()
  .then(result => {
    process.exit(0);
  })
  .catch(error => {
    process.exit(1);
  });

`;

const SCRIPT_NAME = './memScript.js';
const MB_PERMITTED_OFFSET = 3;

describe('Driver Resources', () => {
  let startingMemoryUsed;
  let endingMemoryUsed;
  let asyncResourcesCount;

  let heapAfter;

  before('create leak reproduction script', async function () {
    await writeFile(SCRIPT_NAME, REPRO_SCRIPT(this.configuration.url()), { encoding: 'utf8' });

    const script = fork(SCRIPT_NAME, { execArgv: ['--expose-gc'] });
    const messages = on(script, 'message');
    const willClose = once(script, 'close');

    const starting = await messages.next();
    const ending = await messages.next();
    const asyncResources = await messages.next();

    startingMemoryUsed = starting.value[0].startingMemoryUsed;
    endingMemoryUsed = ending.value[0].endingMemoryUsed;
    asyncResourcesCount = asyncResources.value[0].resourcesSize;

    // process exit
    const [exitCode] = await willClose;
    expect(exitCode).to.equal(0);

    heapAfter = await readFile(HEAPSNAPSHOT_AFTER, { encoding: 'utf8' }).then(c => JSON.parse(c));
  });

  after('cleanup leak reproduction script', async function () {
    await unlink(SCRIPT_NAME);
    // await unlink(HEAPSNAPSHOT_BEFORE);
    await unlink(HEAPSNAPSHOT_AFTER);
  });

  it(`ending memory usage should be within ${MB_PERMITTED_OFFSET}MB of starting amount`, async () => {
    // plus/minus 3 MB
    expect(endingMemoryUsed).to.be.within(
      startingMemoryUsed - MB_PERMITTED_OFFSET,
      startingMemoryUsed + MB_PERMITTED_OFFSET
    );
  });

  it('all but 1 MongoClient async resource should be destroyed', async () => {
    expect(asyncResourcesCount).to.equal(1);
  });

  it('heapsnapshot may have 0 to 2 MongoClients in memory', async () => {
    const heap = await parseSnapshot(heapAfter);
    const clients = heap.nodes.filter(n => n.name === 'MongoClient' && n.type === 'object');
    // lengthOf crashes chai b/c it tries to print out a gig
    // Allow GC to miss a few
    expect(
      clients.length,
      `expected no MongoClients in the heapdump found ${clients.length}`
    ).to.equal(0);
  });
});
