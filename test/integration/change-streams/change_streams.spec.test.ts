import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Change Streams Spec - Unified', function () {
  runUnifiedSuite(loadSpecTests(path.join('change-streams', 'unified')));
});
