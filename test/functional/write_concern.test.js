'use strict';

const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;
const loadSpecTests = require('../spec').loadSpecTests;

describe('Write Concern', function() {
  describe('spec tests', function() {
    const testContext = new TestRunnerContext();
    const testSuites = loadSpecTests('read-write-concern/operation');

    after(() => testContext.teardown());
    before(function() {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });
});
