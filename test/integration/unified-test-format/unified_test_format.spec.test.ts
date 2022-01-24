import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

// TODO: NODE-3891 - fix tests broken when AUTH enabled
const FAILING_TESTS_AUTH_ENABLED = [
  'FindOneAndUpdate is committed on first attempt',
  'FindOneAndUpdate is not committed on first attempt',
  'FindOneAndUpdate is never committed',
  'eventType defaults to command if unset',
  'events are captured during an operation',
  'eventType can be set to command and cmap'
];

const SKIPPED_TESTS = [
  // commitTransaction retry seems to be swallowed by mongos in this case
  'unpin after transient error within a transaction and commit',
  // These two tests need to run against multiple mongoses
  'Dirty explicit session is discarded',
  // Will be implemented as part of NODE-2034
  'Client side error in command starting transaction',
  'A successful find event with a getmore and the server kills the cursor' // NODE-3308,
].concat(process.env.AUTH === 'auth' ? FAILING_TESTS_AUTH_ENABLED : []);

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'), SKIPPED_TESTS);
});
