'use strict';
const path = require('path');
const { installNodeDNSWorkaroundHooks } = require('../../tools/runner/hooks/configuration');
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

  // These tests timeout connecting to on localhost mongohoused in CI on Node18+.
  // Manually setting the ip address resolution is safe for testing purposes
  // because in production, mongohoused will never be running on localhost.
  installNodeDNSWorkaroundHooks();

  before(function () {
    return testContext.setup(this.configuration);
  });

  after(() => {
    testContext.teardown();
  });

  for (const suite of testSuites) suite.runOn = []; // patched in for the spec runner

  generateTopologyTests(testSuites, testContext);
});
