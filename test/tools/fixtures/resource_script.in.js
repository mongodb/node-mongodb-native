'use strict';

/* eslint-disable no-undef */

const driverPath = DRIVER_SOURCE_PATH;
const func = FUNCTION_STRING;
const name = NAME_STRING;
const uri = URI_STRING;
const iterations = ITERATIONS_STRING;

const { MongoClient } = require(driverPath);
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');

const sleep = util.promisify(timers.setTimeout);

const run = func;

const MB = (2 ** 10) ** 2;

async function main() {
  const startingMemoryUsed = process.memoryUsage().heapUsed / MB;
  process.send({ startingMemoryUsed });

  for (let iteration = 0; iteration < iterations; iteration++) {
    await run({ MongoClient, uri, iteration });
    global.gc();
  }

  global.gc();
  // Sleep b/c maybe gc will run
  await sleep(100);
  global.gc();

  const endingMemoryUsed = process.memoryUsage().heapUsed / MB;
  process.send({ endingMemoryUsed });
  v8.writeHeapSnapshot(`${name}.heapsnapshot.json`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
