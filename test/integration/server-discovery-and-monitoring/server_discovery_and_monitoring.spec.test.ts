import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('SDAM Unified Tests', function () {
  const sdamPoolClearedTests = [
    'Connection pool clear uses interruptInUseConnections=true after monitor timeout',
    'Error returned from connection pool clear with interruptInUseConnections=true is retryable',
    'Error returned from connection pool clear with interruptInUseConnections=true is retryable for write'
  ];
  runUnifiedSuite(
    loadSpecTests(path.join('server-discovery-and-monitoring', 'unified')),
    ({ description }) =>
      sdamPoolClearedTests.includes(description)
        ? 'TODO(NODE-4691): interrupt in-use operations on heartbeat failure'
        : false
  );
});
