import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { type TestFilter } from '../../tools/unified-spec-runner/schema';

const filter: TestFilter = ({ description }) => {
  if (description === 'Client side error in command starting transaction') {
    // TODO(NODE-2034): Will be implemented as part of NODE-2034
    return 'TODO(NODE-2034): Specify effect of client-side errors on in-progress transactions';
  }

  if (description === 'Dirty explicit session is discarded') {
    // TODO(NODE-3951): investigate why this is failing while the legacy version is passing
    return 'TODO(NODE-3951): investigate why this is failing while the legacy version is passing';
  }

  if (
    [
      'withTransaction and no transaction options set',
      'withTransaction inherits transaction options from client',
      'withTransaction inherits transaction options from defaultTransactionOptions',
      'withTransaction explicit transaction options',
      'remain pinned after non-transient Interrupted error on insertOne',
      'unpin after transient error within a transaction',
      'remain pinned after non-transient Interrupted error on insertOne'
    ].includes(description)
  ) {
    return 'TODO(NODE-5962): fix migration conflict in transaction tests';
  }

  if (
    process.env.AUTH === 'auth' &&
    [
      'FindOneAndUpdate is committed on first attempt',
      'FindOneAndUpdate is not committed on first attempt',
      'FindOneAndUpdate is never committed'
    ].includes(description)
  ) {
    return 'TODO(NODE-3891): fix tests broken when AUTH enabled';
  }

  return false;
};

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'), filter);
});
