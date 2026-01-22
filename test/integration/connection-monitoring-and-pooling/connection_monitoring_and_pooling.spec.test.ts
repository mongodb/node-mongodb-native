import { loadSpecTests } from '../../spec';
import {
  type CmapTest,
  runCmapTestSuite,
  type SkipDescription
} from '../../tools/cmap_spec_runner';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

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
  'readying a ready pool emits no events',
  'error during minPoolSize population clears pool'
].map(description => ({
  description,
  skipIfCondition: 'loadBalanced',
  skipReason: 'cannot run against a load balanced environment'
}));

const INTERRUPT_IN_USE_SKIPPED_TESTS: SkipDescription[] = [
  {
    description: 'clear with interruptInUseConnections = true closes pending connections',
    skipIfCondition: 'always',
    skipReason: 'TODO(NODE-4784): track and kill pending connections'
  },
  {
    description:
      'Pool clear SHOULD schedule the next background thread run immediately (interruptInUseConnections = false)',
    skipIfCondition: 'always',
    skipReason:
      'NodeJS does not have a background thread responsible for managing connections, and so already checked in connections are not pruned when in-use connections are interrupted.'
  }
];

describe.only('Connection Monitoring and Pooling Spec Tests (Integration) - cmap-format', function () {
  const tests: CmapTest[] = loadSpecTests('connection-monitoring-and-pooling', 'cmap-format');

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
      INTERRUPT_IN_USE_SKIPPED_TESTS
    )
  });
});

describe('Connection Monitoring and Pooling Spec Tests (Integration) - logging', function () {
  const tests = loadSpecTests('connection-monitoring-and-pooling', 'logging');

  runUnifiedSuite(tests, test => {
    if (
      [
        'waitQueueMultiple should be included in connection pool created message when specified',
        'waitQueueSize should be included in connection pool created message when specified'
      ].includes(test.description)
    ) {
      return 'not applicable: waitQueueSize not supported';
    }
    return false;
  });
});
