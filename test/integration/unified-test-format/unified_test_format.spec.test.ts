import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIPPED_TESTS = [
  // TODO(NODE-3943):
  // OLD COMMENT: commitTransaction retry seems to be swallowed by mongos in this case
  'unpin after transient error within a transaction and commit',

  // TODO(NODE-2034): Will be implemented as part of NODE-2034
  'Client side error in command starting transaction',

  // TODO(NODE-3951): investigate why this is failing while the legacy version is passing
  'Dirty explicit session is discarded',

  // TODO(NODE-3308):
  'A successful find event with a getmore and the server kills the cursor'
];

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'), SKIPPED_TESTS);
});
