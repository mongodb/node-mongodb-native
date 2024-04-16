import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIPPED_TESTS = [
  // TODO(NODE-5924) - Fix modification of readConcern object post message send.
  'readConcern local in defaultTransactionOptions',
  'defaultTransactionOptions override client options',
  'transaction options inherited from defaultTransactionOptions',
  'transaction options inherited from client',
  'causal consistency disabled'
];

describe('Transactions Spec Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('transactions', 'unified')), test => {
    return SKIPPED_TESTS.includes(test.description)
      ? 'TODO(NODE-5924): Skipping failing transaction tests'
      : false;
  });
});
