'use strict';

/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const driverPath = DRIVER_SOURCE_PATH;
const func = FUNCTION_STRING;
const scriptName = SCRIPT_NAME_STRING;
const uri = URI_STRING;

const { MongoClient, ClientEncryption, BSON } = require(driverPath);
const process = require('node:process');
const util = require('node:util');
const timers = require('node:timers');
const fs = require('node:fs');
const { expect } = require('chai');
const { setTimeout } = require('timers');

let originalReport;
const logFile = 'logs.txt';

const run = func;

/**
 *
 * Returns an array containing the new resources created after script started.
 * A new resource is something that will keep the event loop running.
 *
 * In order to be counted as a new resource, a resource MUST:
 * - Must NOT share an address with a libuv resource that existed at the start of script
 * - Must be referenced. See [here](https://nodejs.org/api/timers.html#timeoutref) for more context.
 * - Must NOT be an inactive server
 *
 * We're using the following tool to track resources: `process.report.getReport().libuv`
 * For more context, see documentation for [process.report.getReport()](https://nodejs.org/api/report.html), and [libuv](https://docs.libuv.org/en/v1.x/handle.html).
 *
 */
function getNewLibuvResourceArray() {
  let currReport = process.report.getReport().libuv;
  const originalReportAddresses = originalReport.map(resource => resource.address);

  /**
   * @typedef {Object} LibuvResource
   * @property {boolean} is_active Is the resource active? For a socket, this means it is allowing I/O. For a timer, this means a timer is has not expired.
   * @property {string} type What is the resource type? For example, 'tcp' | 'timer' | 'udp' | 'tty'... (See more in [docs](https://docs.libuv.org/en/v1.x/handle.html)).
   * @property {boolean} is_referenced Is the resource keeping the JS event loop active?
   *
   * @param {LibuvResource} resource
   */
  function isNewLibuvResource(resource) {
    const serverType = ['tcp', 'udp'];
    return (
      !originalReportAddresses.includes(resource.address) &&
      resource.is_referenced && // if a resource is unreferenced, it's not keeping the event loop open
      (!serverType.includes(resource.type) || resource.is_active)
    );
  }

  currReport = currReport.filter(resource => isNewLibuvResource(resource));
  return currReport;
}

// A log function for debugging
function log(message) {
  // remove outer parentheses for easier parsing
  const messageToLog = JSON.stringify(message) + ' \n';
  fs.writeFileSync(logFile, messageToLog, { flag: 'a' });
}

async function main() {
  originalReport = process.report.getReport().libuv;
  process.on('beforeExit', () => {
    log({ beforeExitHappened: true });
  });
  await run({ MongoClient, uri, log, expect, ClientEncryption, BSON });
  log({ newLibuvResources: getNewLibuvResourceArray() });
}

main()
  .then(() => {})
  .catch(e => {
    log({ exitCode: 1, error: util.inspect(e) });
  });

setTimeout(() => {
  // this means something was in the event loop such that it hung for more than 10 seconds
  // so we kill the process
  process.exit(99);
  // using `unref` will ensure this setTimeout call is not a resource / does not keep the event loop running
}, 10000).unref();
