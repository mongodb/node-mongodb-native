'use strict';

const path = require('path');
const TestRunnerContext = require('./runner').TestRunnerContext;
const gatherTestSuites = require('./runner').gatherTestSuites;
const generateTopologyTests = require('./runner').generateTopologyTests;

const missingAwsConfiguration =
  process.env.AWS_ACCESS_KEY_ID == null || process.env.AWS_SECRET_ACCESS_KEY == null;

describe('Client Side Encryption', function() {
  const testContext = new TestRunnerContext();
  const testSuites = gatherTestSuites(path.join(__dirname, 'spec', 'client-side-encryption'));
  after(() => testContext.teardown());
  before(function() {
    return testContext.setup(this.configuration);
  });

  if (missingAwsConfiguration) {
    console.log('skipping Client Side Encryption tests due to lack of AWS credentials');
    return;
  }

  generateTopologyTests(testSuites, testContext);
});
