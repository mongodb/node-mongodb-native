import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTestSuite, SkipDescription } from '../../tools/cmap_spec_runner';

// These tests rely on a simple "pool.clear()" command, which is not sufficient
// to properly clear the pool in LB mode, since it requires a serviceId to be passed in
const LB_SKIP_TESTS: SkipDescription[] = [
  'must replace removed connections up to minPoolSize',
  'must destroy checked in connection if it is stale',
  'must destroy and must not check out a stale connection if found while iterating available connections',
  'clearing pool clears the WaitQueue',
  'pool clear halts background minPoolSize establishments',
  'clearing a paused pool emits no events',
  'after clear, cannot check out connections until pool ready',
  'readying a ready pool emits no events'
].map(description => ({
  description,
  skipIfCondition: 'loadBalanced',
  skipReason: 'cannot run against a load balanced environment'
}));

const POOL_PAUSED_SKIP_TESTS: SkipDescription[] = [
  'error during minPoolSize population clears pool'
].map(description => ({
  description,
  skipIfCondition: 'always',
  skipReason: 'TODO(NODE-3135): make connection pool SDAM aware'
}));

describe('Connection Monitoring and Pooling Spec Tests (Integration)', function () {
  const tests: CmapTest[] = loadSpecTests('connection-monitoring-and-pooling');

  runCmapTestSuite(tests, {
    testsToSkip: LB_SKIP_TESTS.concat(
      [
        {
          description: 'waiting on maxConnecting is limited by WaitQueueTimeoutMS',
          skipIfCondition: 'always',
          skipReason:
            'not applicable: waitQueueTimeoutMS limits connection establishment time in our driver'
        }
      ],
      POOL_PAUSED_SKIP_TESTS
    )
  });
});
