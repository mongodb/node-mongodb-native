import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTestSuite } from '../../tools/cmap_spec_runner';

describe('Connection Monitoring and Pooling (Node Driver)', function () {
  const tests: CmapTest[] = loadSpecTests(
    '../integration/connection-monitoring-and-pooling/cmap-node-specs'
  );

  runCmapTestSuite(tests, {
    injectPoolStats: true,
    testsToSkip: [
      {
        description: 'must replace removed connections up to minPoolSize',
        skipIfCondition: 'loadBalanced',
        skipReason: 'cannot run against load balancer due to reliance on pool.clear() command'
      }
    ]
  });
});
