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
let originalReport;
const logFile = 'logs.txt';

const run = func;

// Returns an array containing new the resources th
function getNewResourceArray() {
  let currReport = process.report.getReport().libuv;
  const originalReportAddresses = originalReport.map(resource => resource.address);
  currReport = currReport.filter(resource =>!originalReportAddresses.includes(resource.address));
  return currReport;
}

function log(message) {
  // remove outer parentheses for easier parsing
  const messageToLog = JSON.stringify(message).slice(1, -1) + ', \n'
  fs.writeFileSync(logFile, messageToLog, { flag: 'a' });
}

async function main() {
  originalReport = process.report.getReport().libuv;
  console.log('please');
  process.on('beforeExit', code => {
    log({ beforeExitHappened: true });
  });
  log({newResources: getNewResourceArray()});
}

main()
  .then(() => {
    log({ exitCode: 0 });
  })
  .catch(() => {
    log({ exitCode: 1 });
  });
