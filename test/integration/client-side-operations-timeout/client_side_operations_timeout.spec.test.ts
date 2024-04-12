import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

// TODO(NODE-5823): Implement unified runner operations and options support for CSOT
describe('CSOT spec tests', function () {
  runUnifiedSuite(loadSpecTests(join('client-side-operations-timeout')));
});
