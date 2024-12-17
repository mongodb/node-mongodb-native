'use strict';

/* eslint-disable no-undef */

const driverPath = "/Users/aditi.khare/Desktop/node-mongodb-native/lib";
const func = (async function run({ MongoClient, uri }) {
                    const client = new MongoClient(uri);
                    await client.connect();
                    await client.close();
                });
const name = "topology-clean-up";
const uri = "mongodb://bob:pwd123@localhost:31000/integration_tests?replicaSet=rs&authSource=admin";

const { MongoClient } = require(driverPath);
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');

const run = func;

async function main() {
  process.on('beforeExit', (code) => {
    console.log('Process beforeExit event with code: ', code);
  });
  const originalReport = process.report.getReport().libuv;
  await run({ MongoClient, uri });
  const finalReport = process.report.getReport().libuv;
  process.send({originalReport, finalReport});
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
