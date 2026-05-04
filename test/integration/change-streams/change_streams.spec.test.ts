import * as path from 'path';
import { gte } from 'semver';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

// TODO: NODE-7559 - remove once spec tests are compatible with MongoDB 9.0
describe('Change Streams Spec - Unified', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('change-streams', 'unified')),
    (_test, ctx) =>
      gte(ctx.version, '9.0.0')
        ? 'TODO(NODE-7559): change stream spec tests not yet compatible with MongoDB >= 9.0'
        : false
  );
});
