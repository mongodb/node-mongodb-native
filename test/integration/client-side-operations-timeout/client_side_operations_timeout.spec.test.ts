import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe.skip('CSOT spec tests', function () {
  runUnifiedSuite(loadSpecTests(join('client-side-operations-timeout')));
});
