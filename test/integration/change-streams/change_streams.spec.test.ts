import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

// TODO: NODE-7559 - remove the mongodb version requirement once the spec tests are updated to be compatible with MongoDB 9.0
describe('Change Streams Spec - Unified', { requires: { mongodb: '<9.0.0' } }, function () {
  runUnifiedSuite(loadSpecTests(path.join('change-streams', 'unified')));
});
