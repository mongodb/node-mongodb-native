import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Server Selection Unified Tests (Spec)', function () {
  const tests = loadSpecTests(path.join('server-selection', 'logging'));
  runUnifiedSuite(tests, test => {
    if (
      [
        'Failed bulkWrite operation: log messages have operationIds',
        'Successful bulkWrite operation: log messages have operationIds'
      ].includes(test.description)
    ) {
      return 'not applicable: operationId not supported';
    }
    return 'TODO: NODE-2471 (ping on connect) and NODE-5774 (duplicate server selection for bulkWrite and other wrapper operations)';
  });
});
