import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe.only('SDAM Unified Tests', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('server-discovery-and-monitoring', 'unified-standalone-logging-only'))
  );
});
