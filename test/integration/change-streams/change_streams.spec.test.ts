import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { config } from 'chai';

// TODO: NODE-7559 - remove the mongodb version requirement once the spec tests are updated to be compatible with MongoDB 9.0
describe('Change Streams Spec - Unified', function () {
  it('should run, unless it should not', { requires: { mongodb: '<9.0' } }, function () {
    runUnifiedSuite(loadSpecTests(path.join('change-streams', 'unified')));
  });
});
