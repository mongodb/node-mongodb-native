'use strict';

/* eslint-disable no-undef */

const driverPath = "/Users/aditi.khare/Desktop/node-mongodb-native/lib";
const func = (async function run({ MongoClient, uri }) {
                    const mongoClient = new MongoClient(uri, { minPoolSize: 100 });
                    await mongoClient.connect();
                    // Any operations will reproduce the issue found in v5.0.0/v4.13.0
                    // it would seem the MessageStream has to be used?
                    await mongoClient.db().command({ ping: 1 });
                    await mongoClient.close();
                });
const name = "no_resource_leak_connect_close";
const uri = "mongodb://bob:pwd123@localhost:31000/integration_tests?replicaSet=rs&authSource=admin";
const iterations = 100;

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
