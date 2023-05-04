#! /usr/bin/env node --experimental-modules

import { createReadStream, existsSync, promises } from 'fs';
const { readFile } = promises;
import { createInterface } from 'readline';
import xml2js from 'xml2js';
const { parseStringPromise } = xml2js;
import yargs from 'yargs';
import chalk from 'chalk';

let warnings = false;

/**
 * @param args - program arguments
 */
async function main(args) {
  args = yargs(args)
    .option('l', {
      alias: 'log',
      demandOption: true,
      default: './data/mongod.log', // cluster_setup.sh default
      describe: 'The log you wish to filter',
      type: 'string'
    })
    .option('f', {
      alias: 'filter',
      demandOption: true,
      default: '', // No filter is still useful if you want to look at all tests
      describe: 'The test name filter, if none provided all test logs will be shown',
      type: 'string'
    })
    .option('v', {
      alias: 'verbose',
      demandOption: false,
      describe: 'Enable warnings about processing',
      type: 'boolean'
    })
    .help('h')
    .alias('h', 'help').epilog(`
  - Some log processing is done:
    - better date time format
    - string interpolation
    - 'testName' property added
  - Depends on an xunit file, should be left over from every test run

  Examples:
  ${chalk.green('crawfish.mjs | jq -SC | less -R')}
    - jq -SC will sort the keys and force color output
    - less lets you page through and search logs

  ${chalk.green('crawfish.mjs | jq -Sc | code -')}
    - jq -Sc will sort the keys and keep the logs one line (compact)
    - Opens the output in vscode, good for searching!
    `).argv;

  warnings = !!args.verbose;
  const logFile = args.log;
  const testNameRegex = args.filter;

  if (!existsSync('xunit.xml')) {
    console.error('xunit.xml file not found, required for db log test filtering.');
    process.exit(1);
  }

  const content = await readFile('xunit.xml', { encoding: 'utf8' });
  const xunit = await parseStringPromise(content);

  const tests = collectTests(xunit, testNameRegex);
  if (warnings) console.error(`filtering log file ${logFile}`);

  const logStream =
    logFile === '-' ? process.stdin : createReadStream(logFile, { encoding: 'utf8' });
  const lineStream = createInterface({
    input: logStream,
    crlfDelay: Infinity
  });

  const testToLogs = new Map(tests.map(({ name }) => [name, []]));
  for await (const line of lineStream) {
    const structuredLog = JSON.parse(line);
    for (const test of tests) {
      const logTime = Date.parse(structuredLog.t.$date);
      if (logTime <= test.end && logTime >= test.start) {
        testToLogs.get(test.name).push(structuredLog);
      }
    }
  }

  for (const [name, logs] of testToLogs.entries()) {
    for (const log of logs) {
      log.testName = name;
      interpolateMsg(log);
      friendlyDate(log);
      console.log(JSON.stringify(log));
    }
  }
}

function interpolateMsg(log) {
  if (!log.msg) return;

  if (!log.attr) return;

  for (const key in log.attr) {
    if (Reflect.has(log.attr, key)) {
      log.msg = log.msg.split(`{${key}}`).join(`${JSON.stringify(log.attr[key])}`);
      delete log.attr[key];
    }
  }

  if (Object.keys(log.attr).length === 0) delete log.attr;
  log.msg = log.msg.split(`"`).join(`'`);
}

function friendlyDate(log) {
  const dateString = typeof log.t === 'string' ? log.t : log.t.$date;
  try {
    log.t = new Date(Date.parse(dateString)).toISOString();
  } catch (e) {
    if (warnings) console.error(`Cannot translate date time of ${JSON.stringify(log)}`);
  }
}

function collectTests(xuint, testFilter) {
  const suites = xuint.testsuites.testsuite;

  const tests = [];

  for (const suite of suites) {
    if (suite.testcase) {
      for (const test of suite.testcase) {
        const fullName = `${suite.$.name} ${test.$.name}`;
        if (fullName.toLowerCase().includes(testFilter.toLowerCase())) {
          if (test.$.start === '0') {
            if (warnings) console.error(`Warning: ${fullName} was skipped, theres no logs`);
            continue;
          }
          tests.push({
            name: fullName,
            start: Date.parse(test.$.start),
            end: Date.parse(test.$.end)
          });
        }
      }
    }
  }

  return tests;
}

main(process.argv).catch(e => {
  console.error(e);
  process.exit(1);
});
