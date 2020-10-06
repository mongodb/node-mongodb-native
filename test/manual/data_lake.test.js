'use strict';
const path = require('path');
const TestRunnerContext = require('../functional/spec-runner').TestRunnerContext;
const gatherTestSuites = require('../functional/spec-runner').gatherTestSuites;
const generateTopologyTests = require('../functional/spec-runner').generateTopologyTests;

describe('Data Lake', function () {
  const testContext = new TestRunnerContext();
  testContext.dataLake = true;
  let testSuites = gatherTestSuites(path.resolve(__dirname, '../spec/atlas-data-lake-testing'));
  testSuites = testSuites.map(suite => {
    suite.runOn = [
      {
        topology: ['single']
      }
    ];
    return suite;
  });

  after(() => testContext.teardown());
  before(function () {
    this.configuration.user = 'mhuser';
    this.configuration.password = 'pencil';
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext);
});
