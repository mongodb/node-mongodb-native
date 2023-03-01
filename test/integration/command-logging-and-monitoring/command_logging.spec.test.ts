import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Command Logging Spec (unified)', () => {
  runUnifiedSuite(loadSpecTests(path.join('command-logging-and-monitoring', 'logging', 'command')));
});
