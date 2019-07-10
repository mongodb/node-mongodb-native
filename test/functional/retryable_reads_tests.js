'use strict';

const path = require('path');
const TestRunnerContext = require('./runner').TestRunnerContext;
const gatherTestSuites = require('./runner').gatherTestSuites;
const generateTopologyTests = require('./runner').generateTopologyTests;

describe('Retryable Reads', function() {
  const testContext = new TestRunnerContext();
  const testSuites = gatherTestSuites(path.join(__dirname, 'spec', 'retryable-reads'));

  after(() => testContext.teardown());
  before(function() {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext);
});
