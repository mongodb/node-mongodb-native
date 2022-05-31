import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Command Monitoring Spec (unified)', () => {
  runUnifiedSuite(loadSpecTests(path.join('command-monitoring', 'unified')));
});
