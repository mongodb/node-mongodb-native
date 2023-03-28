import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Auth (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('auth', 'unified')));
});
