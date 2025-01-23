'use strict';

/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const driverPath = DRIVER_SOURCE_PATH;
const func = FUNCTION_STRING;
const scriptName = SCRIPT_NAME_STRING;
const uri = URI_STRING;

const mongodb = require(driverPath);
const { MongoClient } = mongodb;
const process = require('node:process');
const util = require('node:util');
const fs = require('node:fs');
const { expect } = require('chai');
const timers = require('node:timers');
const { setTimeout } = timers;
const { once } = require('node:events');

let originalReport;
const logFile = scriptName + '.logs.txt';
const sleep = util.promisify(setTimeout);

const run = func;

/**
 *
 * Returns an array containing the new libuv resources created after script started.
 * A new resource is something that will keep the event loop running.
 *
 * In order to be counted as a new resource, a resource MUST:
 * - Must NOT share an address with a libuv resource that existed at the start of script
 * - Must be referenced. See [here](https://nodejs.org/api/timers.html#timeoutref) for more context.
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
   * @property {string} type What is the resource type? For example, 'tcp' | 'timer' | 'udp' | 'tty'... (See more in [docs](https://docs.libuv.org/en/v1.x/handle.html)).
   * @property {boolean} is_referenced Is the resource keeping the JS event loop active?
   *
   * @param {LibuvResource} resource
   */
  function isNewLibuvResource(resource) {
    const serverType = ['tcp', 'udp'];
    return (
      !originalReportAddresses.includes(resource.address) && resource.is_referenced // if a resource is unreferenced, it's not keeping the event loop open
    );
  }

  currReport = currReport.filter(resource => isNewLibuvResource(resource));
  return currReport;
}

/**
 * Returns an object of the new resources created after script started.
 *
 *
 * In order to be counted as a new resource, a resource MUST either:
 * - Meet the criteria to be returned by our helper utility `getNewLibuvResourceArray()`
 * OR
 * - Be returned by `process.getActiveResourcesInfo() and is not 'TTYWrap'
 *
 * The reason we are using both methods to detect active resources is:
 * - `process.report.getReport().libuv` does not detect active requests (such as timers or file reads) accurately
 * - `process.getActiveResourcesInfo()` does not contain enough server information we need for our assertions
 *
 */

function getNewResources() {
  return {
    libuvResources: getNewLibuvResourceArray(),
    activeResources: process.getActiveResourcesInfo()
  };
}

/**
 * @returns Number of active timers in event loop
 */
const getTimerCount = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;

/**
 * @returns Array of socket resources in the event loop
 */
const getSockets = () => process.report.getReport().libuv.filter(r => r.type === 'tcp');

/**
 * @returns Array of remote endpoints of socket resources in the event loop
 * @example [{ host: 'localhost', port: 27020 }, { host: 'localhost', port: 27107 }]
 */
const getSocketEndpoints = () =>
  process.report
    .getReport()
    .libuv.filter(r => r.type === 'tcp')
    .map(r => r.remoteEndpoint);

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
  await run({
    MongoClient,
    uri,
    log,
    expect,
    mongodb,
    sleep,
    getTimerCount,
    getSockets,
    getSocketEndpoints,
    once
  });
  log({ newResources: getNewResources() });
}

main()
  .then(() => {})
  .catch(e => {
    log({ error: { message: e.message, stack: e.stack, resources: getNewResources() } });
    process.exit(1);
  });

setTimeout(() => {
  // this means something was in the event loop such that it hung for more than 10 seconds
  // so we kill the process
  log({
    error: {
      message: 'Process timed out: resources remain in the event loop',
      resources: getNewResources()
    }
  });
  process.exit(99);
  // using `unref` will ensure this setTimeout call is not a resource / does not keep the event loop running
}, 10000).unref();
