import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { generateTopologyTests, TestRunnerContext } from '../../tools/spec-runner';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Retryable Reads (legacy)', function () {
  const testContext = new TestRunnerContext();
  const testSuites = loadSpecTests(path.join('retryable-reads', 'legacy'));

  after(() => testContext.teardown());

  before(function () {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext, spec => {
    const shouldRun =
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
      spec.description.match(/find/i);

    if (!shouldRun) {
      return 'Test skipped by generic filter.';
    }

    return true;
  });
});

const UNIMPLEMENTED_APIS = [
  'collection.listIndexNames',
  'database.listCollectionNames',
  'client.listDatabaseNames'
];

describe('Retryable Reads (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-reads', 'unified')), ({ description }) => {
    for (const apiName of UNIMPLEMENTED_APIS) {
      if (description.startsWith(apiName)) {
        return `The Node.js Driver does not support ${apiName}`;
      }
    }
    return false;
  });
});
