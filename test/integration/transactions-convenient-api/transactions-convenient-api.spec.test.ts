import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIPPED_TESTS = [
  'callback succeeds after multiple connection errors',
  'callback is not retried after non-transient error',
  'callback is not retried after non-transient error (DuplicateKeyError)'
];

describe('Transactions Convenient API Spec Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('transactions-convenient-api', 'unified')), test => {
    return SKIPPED_TESTS.includes(test.description)
      ? 'TODO(NODE-): Skipping failing transaction tests'
      : false;
  });
});
