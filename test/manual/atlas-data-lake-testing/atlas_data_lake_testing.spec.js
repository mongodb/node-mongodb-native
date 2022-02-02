'use strict';
const path = require('path');
const {
  TestRunnerContext,
  gatherTestSuites,
  generateTopologyTests
} = require('../../tools/spec-runner');

describe('Atlas Data Lake - spec', function () {
  const testContext = new TestRunnerContext({
    skipPrepareDatabase: true,
    useSessions: false,
    user: 'mhuser',
    password: 'pencil',
    authSource: 'admin'
  });

  const testSuites = gatherTestSuites(
    path.resolve(__dirname, '../../spec/atlas-data-lake-testing')
  );

  after(() => testContext.teardown());
  before(function () {
    return testContext.setup(this.configuration);
  });

  for (const suite of testSuites) suite.runOn = []; // patched in for the spec runner

  generateTopologyTests(testSuites, testContext);
});
