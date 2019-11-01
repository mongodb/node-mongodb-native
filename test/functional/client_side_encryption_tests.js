'use strict';

const path = require('path');
const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const gatherTestSuites = require('./spec-runner').gatherTestSuites;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;

const missingAwsConfiguration =
  process.env.AWS_ACCESS_KEY_ID == null || process.env.AWS_SECRET_ACCESS_KEY == null;
const skipTests = missingAwsConfiguration || process.env.MONGODB_CLIENT_ENCRYPTION == null;

describe('Client Side Encryption', function() {
  if (skipTests) {
    console.log('skipping Client Side Encryption tests due to lack of AWS credentials');
    return;
  }

  const testContext = new TestRunnerContext();
  const testSuites = gatherTestSuites(path.join(__dirname, 'spec', 'client-side-encryption'));
  after(() => testContext.teardown());
  before(function() {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext, spec => {
    return !spec.description.match(/type=regex/);
  });
});
