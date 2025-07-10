import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('MongoDB Handshake Tests (Unified)', function () {
  runUnifiedSuite(loadSpecTests(join('mongodb-handshake')));
});
