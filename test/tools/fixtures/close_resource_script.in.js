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
