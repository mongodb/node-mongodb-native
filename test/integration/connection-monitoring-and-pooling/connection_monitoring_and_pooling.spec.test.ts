import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTestSuite, SkipDescription } from '../../tools/cmap_spec_runner';

// These tests rely on a simple "pool.clear()" command, which is not sufficient
// to properly clear the pool in LB mode, since it requires a serviceId to be passed in
const LB_SKIP_TESTS: SkipDescription[] = [
  'must destroy checked in connection if it is stale',
  'must destroy and must not check out a stale connection if found while iterating available connections'
].map(description => ({
  description,
  skipIfCondition: 'loadBalanced',
  skipReason: 'cannot run against a load balanced environment'
}));

describe('Connection Monitoring and Pooling Spec Tests (Integration)', function () {
  const tests: CmapTest[] = loadSpecTests('connection-monitoring-and-pooling');

  runCmapTestSuite(
    // TODO(NODE-2993): unskip integration tests for maxConnecting
    tests.filter(({ style }) => style === 'unit'),
    { testsToSkip: LB_SKIP_TESTS }
  );
});
