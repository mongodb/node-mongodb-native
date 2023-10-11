import { loadSpecTests } from '../../spec';
import { type CmapTest, runCmapTestSuite } from '../../tools/cmap_spec_runner';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe.skip('Connection Monitoring and Pooling (Node Driver)', function () {
  const cmapTests: CmapTest[] = loadSpecTests(
    '../integration/connection-monitoring-and-pooling/cmap-node-specs'
  );

  runCmapTestSuite(cmapTests, {
    injectPoolStats: true,
    testsToSkip: [
      {
        description: 'must replace removed connections up to minPoolSize',
        skipIfCondition: 'loadBalanced',
        skipReason: 'cannot run against load balancer due to reliance on pool.clear() command'
      }
    ]
  });

  // TODO(NODE-5230): Remove this once the actual unified tests (test/spec/connection-monitoring-and-pooling/logging) are passing
  const unifiedTests = loadSpecTests(
    '../integration/connection-monitoring-and-pooling/unified-cmap-node-specs'
  );
  runUnifiedSuite(unifiedTests);
});
