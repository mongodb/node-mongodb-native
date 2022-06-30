import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { TestFilter } from '../../tools/unified-spec-runner/schema';

const filter: TestFilter = ({ description }) => {
  if (description === 'unpin after transient error within a transaction and commit') {
    // OLD COMMENT: commitTransaction retry seems to be swallowed by mongos in this case
    // TODO(NODE-3943):
    return `TODO(NODE-3943): commitTransaction retry seems to be swallowed by mongos in this case`;
  }

  if (description === 'Client side error in command starting transaction') {
    // TODO(NODE-2034): Will be implemented as part of NODE-2034
    return 'TODO(NODE-2034): Specify effect of client-side errors on in-progress transactions';
  }

  if (description === 'Dirty explicit session is discarded') {
    // TODO(NODE-3951): investigate why this is failing while the legacy version is passing
    return 'TODO(NODE-3951): investigate why this is failing while the legacy version is passing';
  }

  if (description === 'A successful find event with a getmore and the server kills the cursor') {
    return 'TODO(NODE-3308): failures due unnecessary getMore and killCursors calls in 5.0';
  }

  if (
    process.env.AUTH === 'auth' &&
    [
      'FindOneAndUpdate is committed on first attempt',
      'FindOneAndUpdate is not committed on first attempt',
      'FindOneAndUpdate is never committed',
      'eventType defaults to command if unset',
      'events are captured during an operation',
      'eventType can be set to command and cmap'
    ].includes(description)
  ) {
    return 'TODO(NODE-3891): fix tests broken when AUTH enabled';
  }

  if (description.length === 0) {
    // This may seem weird, but the kmsProvider valid pass tests really test that the new
    // client encryption entity is constructed correctly so the "test" section of each
    // unified test is empty (save the required properties) and the test description
    // is just the empty string
    return 'TODO(NODE-4363): add support for client encryption entity to unified runner';
  }

  return false;
};

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'), filter);
});
