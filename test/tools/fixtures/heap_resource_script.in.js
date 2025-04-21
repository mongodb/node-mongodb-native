'use strict';

/* eslint-disable no-undef */

const driverPath = DRIVER_SOURCE_PATH;
const func = FUNCTION_STRING;
const name = SCRIPT_NAME_STRING;
const uri = URI_STRING;
const iterations = ITERATIONS_STRING;
const log = LOG_FN;

const { MongoClient } = require(driverPath);
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');

const now = performance.now.bind(performance);
const sleep = util.promisify(timers.setTimeout);

const run = func;

const MB = (2 ** 10) ** 2;

async function main() {
  log('starting execution' + '\n');
  const startingMemoryUsed = process.memoryUsage().heapUsed / MB;
  process.send({ startingMemoryUsed });

  log('sent first message' + '\n');

  for (let iteration = 0; iteration < iterations; iteration++) {
    await run({ MongoClient, uri, iteration });
    iteration % 20 === 0 && log(`iteration ${iteration} complete\n`);
    global.gc();
  }

  log('script executed' + '\n');

  global.gc();
  // Sleep b/c maybe gc will run
  await sleep(100);
  global.gc();

  const endingMemoryUsed = process.memoryUsage().heapUsed / MB;

  log('sending second message' + '\n');

  process.send({ endingMemoryUsed });
  log('second message sent.' + '\n');

  const start = now();
  v8.writeHeapSnapshot(`${name}.heapsnapshot.json`);
  const end = now();

  log(`heap snapshot written in ${end - start}ms. script exiting` + '\n');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
