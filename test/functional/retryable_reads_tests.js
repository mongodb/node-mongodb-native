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

  generateTopologyTests(testSuites, testContext, spec => {
    return (
      spec.description.match(/distinct/i) ||
      spec.description.match(/aggregate/i) ||
      spec.description.match(/countDocuments/i) ||
      spec.description.match(/listIndexes/i) ||
      spec.description.match(/listDatabases/i) ||
      spec.description.match(/listDatabaseNames/i) ||
      spec.description.match(/listCollections/i) ||
      spec.description.match(/listCollectionNames/i) ||
      spec.description.match(/estimatedDocumentCount/i) ||
      spec.description.match(/count/i)
    );
  });
});
