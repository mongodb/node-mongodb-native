'use strict';

const path = require('path');
const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { loadSpecTests } = require('../../spec');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

describe('Retryable Reads (legacy)', function () {
  const testContext = new TestRunnerContext();
  const testSuites = loadSpecTests(path.join('retryable-reads', 'legacy'));

  after(() => testContext.teardown());
  before(function () {
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

// These tests are skipped because the driver 1) executes a ping when connecting to
// an authenticated server and 2) command monitoring is at the connection level so
// when the handshake fails no command started event is emitted.
describe.skip('Retryable Reads (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-reads', 'unified')));
});
