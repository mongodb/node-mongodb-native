import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Causal Consistency Spec - Unified', function () {
  runUnifiedSuite(loadSpecTests(path.join('causal-consistency', 'unified')));
});
