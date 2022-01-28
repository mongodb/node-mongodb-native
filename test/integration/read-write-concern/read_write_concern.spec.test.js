'use strict';

const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { loadSpecTests } = require('../../spec');

describe('Read Write Concern spec tests', function () {
  describe('operation spec tests', function () {
    const testContext = new TestRunnerContext();
    const isAuthEnabled = process.env.AUTH === 'auth';
    const testSuites = isAuthEnabled ? loadSpecTests('read-write-concern/operation') : [];

    after(() => testContext.teardown());
    before(function () {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });
});
