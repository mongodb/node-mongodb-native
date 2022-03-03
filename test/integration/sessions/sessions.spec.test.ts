import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Sessions spec tests', function () {
  runUnifiedSuite(loadSpecTests('sessions'), [
    // TODO(NODE-3951): fix broken dirty sessions spec tests
    'Dirty explicit session is discarded (insert)',
    'Dirty explicit session is discarded (findAndModify)'
  ]);
});
