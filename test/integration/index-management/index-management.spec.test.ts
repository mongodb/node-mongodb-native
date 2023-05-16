import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe.only('Index Management Tests (Unified)', function () {
  runUnifiedSuite(loadSpecTests(join('index-management')));
});
