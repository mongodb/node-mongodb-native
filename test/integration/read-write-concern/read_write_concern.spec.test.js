'use strict';

const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { loadSpecTests } = require('../../spec');

describe('Read Write Concern spec tests', function () {
  describe('operation spec tests', function () {
    const testContext = new TestRunnerContext();
    const testSuites = loadSpecTests('read-write-concern/operation');

    after(() => testContext.teardown());

    before(function () {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext, ({ description }) => {
      if (description === 'MapReduce omits default write concern') {
        return 'The node driver does not have a mapReduce collection helper';
      }
      return true;
    });
  });
});
