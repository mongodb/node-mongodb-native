'use strict';

/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const driverPath = "/Users/aditi.khare/Desktop/node-mongodb-native/lib";
const func = (async function run({ MongoClient, uri, log, chai }) {
                                const client = new MongoClient(uri, { serverMonitoringMode: 'auto' });
                                await client.connect();
                                // returns all active tcp endpoints
                                const connectionMonitoringReport = () => process.report.getReport().libuv.filter(r => r.type === 'tcp' && r.is_active).map(r => r.remoteEndpoint);
                                log({ report: connectionMonitoringReport() });
                                // assert socket creation
                                const servers = client.topology?.s.servers;
                                for (const server of servers) {
                                    let { host, port } = server[1].s.description.hostAddress;
                                    // regardless of if its active the socket should be gone from the libuv report
                                    chai.expect(connectionMonitoringReport()).to.deep.include({ host, port });
                                }
                                await client.close();
                                // assert socket destruction 
                                for (const server of servers) {
                                    let { host, port } = server[1].s.description.hostAddress;
                                    chai.expect(connectionMonitoringReport()).to.not.deep.include({ host, port });
                                }
                            });
const name = "socket-connection-monitoring";
const uri = "mongodb://bob:pwd123@localhost:27017/integration_tests?authSource=admin";

const { MongoClient, ClientEncryption, BSON } = require(driverPath);
const process = require('node:process');
const util = require('node:util');
const timers = require('node:timers');
const fs = require('node:fs');
const chai = require('chai');
const { setTimeout } = require('timers');

let originalReport;
const logFile = 'logs.txt';

const run = func;
const serverType = ['tcp', 'udp'];

// Returns an array containing new the resources created after script start
function getNewLibuvResourceArray() {
  let currReport = process.report.getReport().libuv;
  const originalReportAddresses = originalReport.map(resource => resource.address);
  currReport = currReport.filter(resource => 
    !originalReportAddresses.includes(resource.address) &&
    resource.is_referenced && // if a resource is unreferenced, it's not keeping the event loop open
    (!serverType.includes(resource.type) || resource.is_active)
);
  return currReport;
}

function log(message) {
  // remove outer parentheses for easier parsing
  const messageToLog = JSON.stringify(message).slice(1, -1) + ', \n';
  fs.writeFileSync(logFile, messageToLog, { flag: 'a' });
}

async function main() {
  originalReport = process.report.getReport().libuv;
  process.on('beforeExit', () => {
    log({ beforeExitHappened: true });
  });
  await run({ MongoClient, uri, log, chai, ClientEncryption, BSON });
  log({ newLibuvResources: getNewLibuvResourceArray() });
}

main()
  .then(() => {
    log({ exitCode: 0 });
  })
  .catch(e => {
    log({ exitCode: 1, error: util.inspect(e) });
  });

setTimeout(() => {
  // this means something was in the event loop such that it hung for more than 10 seconds
  // so we kill the process
  log({ exitCode: 99 });
  process.exit(99);
  // using `unref` will ensure this setTimeout call is not a resource / does not keep the event loop running
}, 10000).unref();
