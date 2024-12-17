'use strict';

/* eslint-disable no-undef */

const driverPath = "/Users/aditi.khare/Desktop/node-mongodb-native/lib";
const func = (async function run({ MongoClient, uri }) {
                    const mongoClient = new MongoClient(uri);
                    await mongoClient.connect();
                });
const name = "topology";
const uri = "mongodb://bob:pwd123@localhost:31000/integration_tests?replicaSet=rs&authSource=admin";
const iterations = ITERATIONS_STRING;

const { MongoClient } = require(driverPath);
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');

const run = func;

async function main() {
  process.on('beforeExit', (code) => {
    process.send({beforeExit: true});
  });
  await run({ MongoClient, uri, iteration });
  const report = process.report.getReport();
  process.send({ report });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
