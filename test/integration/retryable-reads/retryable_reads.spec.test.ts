import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const UNIMPLEMENTED_APIS = [
  'listIndexNames',
  'listCollectionNames',
  'listDatabaseNames',
  'mapReduce',
  'listCollectionObjects',
  'listDatabaseObjects'
];

const skippedTests = ['collection.listIndexes succeeds after retryable handshake network error'];

describe.only('Retryable Reads (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-reads', 'unified')), ({ description }) => {
    for (const apiName of UNIMPLEMENTED_APIS) {
      if (description.toLowerCase().includes(apiName.toLowerCase())) {
        return `The Node.js Driver does not support ${apiName}`;
      }

      if (skippedTests.includes(description)) {
        return `TODO(NODE-6832): fix flaky retryable reads tests`;
      }
    }
    return false;
  });
});
