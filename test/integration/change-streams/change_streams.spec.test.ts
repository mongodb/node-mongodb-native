import * as path from 'path';
import { gte } from 'semver';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Change Streams Spec - Unified', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('change-streams', 'unified')),
    ({ description }, { version }) =>
      description === 'change stream resumes after StaleShardVersion' && gte(version, '6.0.0')
        ? 'TODO(NODE-4434): fix StaleShardVersion resumability tests'
        : false
  );
});
