import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIPPED_TESTS = [
  // TODO(NODE-5925) - secondary read preference not allowed in transactions.
  'readPreference inherited from defaultTransactionOptions',
  // TODO(NODE-5924) - Fix modification of readConcern object post message send.
  'readConcern local in defaultTransactionOptions',
  'defaultTransactionOptions override client options',
  'transaction options inherited from defaultTransactionOptions',
  'transaction options inherited from client',
  'causal consistency disabled'
  // TODO(NODE-5855) - Gone away after NODE-5929
];

describe('Transactions Spec Unified Tests', function () {
  this.beforeEach(function () {
    if (this.configuration.topologyType === 'LoadBalanced') {
      if (this.currentTest) {
        this.currentTest.skipReason =
          'TODO(NODE-5931) - Fix socket leaks in load balancer transaction tests.';
      }
    }
    this.skip();
  });

  runUnifiedSuite(loadSpecTests(path.join('transactions', 'unified')), test => {
    return SKIPPED_TESTS.includes(test.description)
      ? 'TODO(NODE-5924/NODE-5925): Skipping failing transaction tests'
      : false;
  });
});
