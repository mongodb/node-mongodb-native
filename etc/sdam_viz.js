/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */

// run this file with ts-node:
// npx ts-node etc/sdam_viz.js -h

const { MongoClient } = require('../src');
const { calculateDurationInMs, arrayStrictEqual, errorStrictEqual, processTimeMS } = require('../src/utils');

const util = require('util');
const chalk = require('chalk');
const argv = require('yargs')
  .usage('Usage: $0 [options] <connection string>')
  .demandCommand(1)
  .help('h')
  .describe('workload', 'Simulate a read workload')
  .describe('writeWorkload', 'Simulate a write workload')
  .describe('writeWorkloadInterval', 'Time interval between write workload write attempts')
  .describe('writeWorkloadSampleSize', 'Sample size between status display for write workload')
  .describe('legacy', 'Use the legacy topology types')
  .alias('l', 'legacy')
  .alias('w', 'workload')
  .alias('h', 'help').argv;

function print(msg) {
  console.log(`${chalk.white(new Date().toISOString())} ${msg}`);
}

const uri = argv._[0];
const client = new MongoClient(uri);

function diff(lhs, rhs, fields, comparator) {
  return fields.reduce((diff, field) => {
    if ((lhs[field] == null || rhs[field] == null) && field !== 'error') {
      return diff;
    }

    if (!comparator(lhs[field], rhs[field])) {
      diff.push(
        `  ${field}: ${chalk.green(`${util.inspect(lhs[field])}`)} => ${chalk.green(
          `${util.inspect(rhs[field])}`
        )}`
      );
    }

    return diff;
  }, []);
}

function serverDescriptionDiff(lhs, rhs) {
  const objectIdFields = ['electionId'];
  const arrayFields = ['hosts', 'tags'];
  const simpleFields = [
    'type',
    'minWireVersion',
    'me',
    'setName',
    'setVersion',
    'electionId',
    'primary',
    'logicalSessionTimeoutMinutes'
  ];

  return diff(lhs, rhs, simpleFields, (x, y) => x === y)
    .concat(diff(lhs, rhs, ['error'], (x, y) => errorStrictEqual(x, y)))
    .concat(diff(lhs, rhs, arrayFields, (x, y) => arrayStrictEqual(x, y)))
    .concat(diff(lhs, rhs, objectIdFields, (x, y) => x.equals(y)))
    .join(',\n');
}

function topologyDescriptionDiff(lhs, rhs) {
  const simpleFields = [
    'type',
    'setName',
    'maxSetVersion',
    'stale',
    'compatible',
    'compatibilityError',
    'logicalSessionTimeoutMinutes',
    'error',
    'commonWireVersion'
  ];

  return diff(lhs, rhs, simpleFields, (x, y) => x === y).join(',\n');
}

function visualizeMonitoringEvents(client) {
  function print(msg) {
    console.error(`${chalk.white(new Date().toISOString())} ${msg}`);
  }

  client.on('serverHeartbeatStarted', event =>
    print(`${chalk.yellow('heartbeat')} ${chalk.bold('started')} host: '${event.connectionId}`)
  );

  client.on('serverHeartbeatSucceeded', event =>
    print(
      `${chalk.yellow('heartbeat')} ${chalk.green('succeeded')} host: '${
        event.connectionId
      }' ${chalk.gray(`(${event.duration} ms)`)}`
    )
  );

  client.on('serverHeartbeatFailed', event =>
    print(
      `${chalk.yellow('heartbeat')} ${chalk.red('failed')} host: '${
        event.connectionId
      }' ${chalk.gray(`(${event.duration} ms)`)}`
    )
  );

  // server information
  client.on('serverOpening', event => {
    print(
      `${chalk.cyan('server')} [${event.address}] ${chalk.bold('opening')} in topology#${
        event.topologyId
      }`
    );
  });

  client.on('serverClosed', event => {
    print(
      `${chalk.cyan('server')} [${event.address}] ${chalk.bold('closed')} in topology#${
        event.topologyId
      }`
    );
  });

  client.on('serverDescriptionChanged', event => {
    print(`${chalk.cyan('server')} [${event.address}] changed:`);
    console.error(serverDescriptionDiff(event.previousDescription, event.newDescription));
  });

  // topology information
  client.on('topologyOpening', event => {
    print(`${chalk.magenta('topology')} adding topology#${event.topologyId}`);
  });

  client.on('topologyClosed', event => {
    print(`${chalk.magenta('topology')} removing topology#${event.topologyId}`);
  });

  client.on('topologyDescriptionChanged', event => {
    const diff = topologyDescriptionDiff(event.previousDescription, event.newDescription);
    if (diff !== '') {
      print(`${chalk.magenta('topology')} [topology#${event.topologyId}] changed:`);
      console.error(diff);
    }
  });
}

async function run() {
  print(`connecting to: ${chalk.bold(uri)}`);

  visualizeMonitoringEvents(client);
  await client.connect();

  if (argv.workload) {
    scheduleWorkload(client);
  }

  if (argv.writeWorkload) {
    scheduleWriteWorkload(client);
  }
}

let workloadTimer;
let workloadCounter = 0;
let workloadInterrupt = false;
async function scheduleWorkload(client) {
  if (!workloadInterrupt) {
    // immediately reschedule work
    workloadTimer = setTimeout(() => scheduleWorkload(client), 7000);
  }

  const currentWorkload = workloadCounter++;

  try {
    print(`${chalk.yellow(`workload#${currentWorkload}`)} issuing find...`);
    const result = await client
      .db('test')
      .collection('test')
      .find({}, { socketTimeoutMS: 2000 })
      .limit(1)
      .toArray();

    print(
      `${chalk.yellow(`workload#${currentWorkload}`)} find completed: ${JSON.stringify(result)}`
    );
  } catch (e) {
    print(`${chalk.yellow(`workload#${currentWorkload}`)} find failed: ${e.message}`);
  }
}

let writeWorkloadTimer;
let writeWorkloadCounter = 0;
let averageWriteMS = 0;
let completedWriteWorkloads = 0;
const writeWorkloadSampleSize = argv.writeWorkloadSampleSize || 100;
const writeWorkloadInterval = argv.writeWorkloadInterval || 100;
async function scheduleWriteWorkload(client) {
  if (!workloadInterrupt) {
    // immediately reschedule work
    writeWorkloadTimer = setTimeout(() => scheduleWriteWorkload(client), writeWorkloadInterval);
  }

  const currentWriteWorkload = writeWorkloadCounter++;

  try {
    const start = processTimeMS();
    await client.db('test').collection('test').insertOne({ a: 42 });
    averageWriteMS = 0.2 * calculateDurationInMs(start) + 0.8 * averageWriteMS;

    completedWriteWorkloads++;
    if (completedWriteWorkloads % writeWorkloadSampleSize === 0) {
      print(
        `${chalk.yellow(
          `workload#${currentWriteWorkload}`
        )} completed ${completedWriteWorkloads} writes with average time: ${averageWriteMS}`
      );
    }
  } catch (e) {
    print(`${chalk.yellow(`workload#${currentWriteWorkload}`)} write failed: ${e.message}`);
  }
}

let exitRequestCount = 0;
process.on('SIGINT', async function () {
  exitRequestCount++;
  if (exitRequestCount > 3) {
    console.log('force quitting...');
    process.exit(1);
  }

  workloadInterrupt = true;
  clearTimeout(workloadTimer);
  clearTimeout(writeWorkloadTimer);
  await client.close();
});

run().catch(error => console.log('Caught', error));
