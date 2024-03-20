import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Search Index Management Tests (Node Specific)', function () {
  runUnifiedSuite(loadSpecTests('../integration/index-management/node-specific'));
});
