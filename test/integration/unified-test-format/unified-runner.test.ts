import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIPPED_TESTS = [
  // commitTransaction retry seems to be swallowed by mongos in this case
  'unpin after transient error within a transaction and commit',
  // These two tests need to run against multiple mongoses
  'Dirty explicit session is discarded',
  // Will be implemented as part of NODE-2034
  'Client side error in command starting transaction',
  'A successful find event with a getmore and the server kills the cursor' // NODE-3308
];

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'), SKIPPED_TESTS);
});
