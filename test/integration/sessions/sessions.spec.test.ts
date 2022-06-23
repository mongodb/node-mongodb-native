import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Sessions spec tests', function () {
  runUnifiedSuite(loadSpecTests('sessions'));
});
