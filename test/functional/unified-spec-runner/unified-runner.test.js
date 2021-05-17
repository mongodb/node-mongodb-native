'use strict';
const loadSpecTests = require('../../spec/index').loadSpecTests;

let runUnifiedSuite;
try {
  runUnifiedSuite = require('./runner').runUnifiedSuite;
} catch (error) {
  console.error('Unable to run unified spec tests, attempting to compile');
  const cp = require('child_process');
  try {
    cp.execSync('npm run build:unified');
    console.error('Compiled! Please re-run!');
    process.exit(0);
  } catch (error) {
    console.error('Unable to compile! Run `npm run build:unified to see errors`');
    console.error(error);
    process.exit(1);
  }
}

const SKIPPED_TESTS = [
  // commitTransaction retry seems to be swallowed by mongos in this case
  'unpin after transient error within a transaction and commit',
  // These two tests need to run against multiple mongoses
  'Dirty explicit session is discarded',
  // Will be implemented as part of NODE-2034
  'Client side error in command starting transaction'
];

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'), SKIPPED_TESTS);
});
