'use strict';

const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;
const loadSpecTests = require('../spec').loadSpecTests;

describe('Retryable Reads', function() {
  const testContext = new TestRunnerContext();
  const testSuites = loadSpecTests('retryable-reads');

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
      spec.description.match(/count/i) ||
      spec.description.match(/find/i)
    );
  });
});
