'use strict';

/* eslint-disable no-undef */

const driverPath = DRIVER_SOURCE_PATH;
const func = FUNCTION_STRING;
const name = NAME_STRING;
const uri = URI_STRING;

const { MongoClient } = require(driverPath);
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');
const fs = require('node:fs');
const sinon = require('sinon');

const run = func;

async function main() {
  process.on('beforeExit', (code) => {
    process.send({ beforeExitCode: code });
  });
  const originalReport = process.report.getReport().libuv;
  await run({ MongoClient, uri, fs, sinon });
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
