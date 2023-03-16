import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe.skip('Command Logging Spec', () => {
  runUnifiedSuite(loadSpecTests(path.join('command-logging-and-monitoring', 'logging')));
}).skipReason = 'TODO(NODE-4686): Unskip these tests';
