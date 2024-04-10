import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIPPED_TESTS = [
  'callback succeeds after multiple connection errors',
  'callback is not retried after non-transient error (DuplicateKeyError)',
  'withTransaction succeeds if callback aborts'
];

describe('Transactions Convenient API Spec Unified Tests', function () {
  beforeEach(function () {
    if (this.configuration.topologyType === 'LoadBalanced') {
      if (this.currentTest) {
        this.currentTest.skipReason =
          'TODO(NODE-5931) - Fix socket leaks in load balancer transaction tests.';
      }
      this.skip();
    }
  });

  runUnifiedSuite(loadSpecTests(path.join('transactions-convenient-api', 'unified')), test => {
    return SKIPPED_TESTS.includes(test.description)
      ? 'TODO(NODE-5855): Skipping failing transaction tests'
      : false;
  });
});
