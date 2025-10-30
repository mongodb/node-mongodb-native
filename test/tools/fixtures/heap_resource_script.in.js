'use strict';

/* eslint-disable no-undef */

const driverPath = DRIVER_SOURCE_PATH;
const func = FUNCTION_STRING;
const uri = URI_STRING;
const iterations = ITERATIONS_STRING;
const { inspect } = require('util');

const { MongoClient } = require(driverPath);
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');

const sleep = util.promisify(timers.setTimeout);

const run = func;

const MB = (2 ** 10) ** 2;

const log = (...args) => {
  const payload =
    args
      .map(item =>
        typeof item === 'string' ? item : inspect(item, { depth: Infinity, breakLength: Infinity })
      )
      .join(', ') + '\n';
  process.stdout.write('(subprocess): ' + payload);
};

async function main() {
  log('starting execution');
  const startingMemoryUsed = process.memoryUsage().heapUsed / MB;
  process.send({ startingMemoryUsed });

  log('sent first message');

  for (let iteration = 0; iteration < iterations; iteration++) {
    await run({ MongoClient, uri, iteration });
    iteration % 20 === 0 && log(`iteration ${iteration} complete`);
    global.gc();
  }

  log('script executed');

  global.gc();
  // Sleep b/c maybe gc will run
  await sleep(100);
  global.gc();

  const endingMemoryUsed = process.memoryUsage().heapUsed / MB;

  log('sending second message');

  process.send({ endingMemoryUsed });
  log('second message sent.');

  const clientsInMemory = v8.queryObjects(MongoClient);

  process.send({ clientsInMemory });

  log('clients instances in memory sent.');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
