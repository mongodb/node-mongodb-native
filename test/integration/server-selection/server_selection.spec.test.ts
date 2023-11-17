import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe.only('Server Selection Tests - Unified', function () {
  runUnifiedSuite(loadSpecTests(path.join('server-selection', 'logging')));
});