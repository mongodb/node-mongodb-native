import { join } from 'path';
import * as semver from 'semver';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const skippedSpecs = {};

const skippedTests = {
  'Tailable cursor iteration timeoutMS is refreshed for getMore - failure': 'TODO(DRIVERS-2965)',
  'Tailable cursor awaitData iteration timeoutMS is refreshed for getMore - failure':
    'TODO(DRIVERS-2965)',
  'command is not sent if RTT is greater than timeoutMS': 'TODO(DRIVERS-2965)',
  'Non-tailable cursor iteration timeoutMS is refreshed for getMore if timeoutMode is iteration - failure':
    'TODO(DRIVERS-2965)',
  'maxTimeMS value in the command is less than timeoutMS':
    'TODO(DRIVERS-2970): see modified test in unified-csot-node-specs',
  'timeoutMS is refreshed for getMore - failure':
    'TODO(DRIVERS-2965): see modified test in unified-csot-node-specs',
  'timeoutMS applies to full resume attempt in a next call': 'TODO(DRIVERS-3006)',
  'timeoutMS is refreshed for getMore if maxAwaitTimeMS is set': 'TODO(DRIVERS-3018)',
  'error on aggregate if maxAwaitTimeMS is greater than timeoutMS': 'TODO(NODE-7360)',
  'error on aggregate if maxAwaitTimeMS is equal to timeoutMS': 'TODO(NODE-7360)',
  'apply remaining timeoutMS if less than maxAwaitTimeMS': 'TODO(NODE-7360)'
};

describe('CSOT spec tests', function () {
  const specs = loadSpecTests('client-side-operations-timeout');
  for (const spec of specs) {
    for (const test of spec.tests) {
      if (skippedSpecs[spec.name] != null) {
        test.skipReason = skippedSpecs[spec.name];
      }
      if (skippedTests[test.description] != null) {
        test.skipReason = skippedTests[test.description];
      }
    }
  }

  runUnifiedSuite(specs, (test, configuration) => {
    const sessionCSOTTests = ['timeoutMS applied to withTransaction'];
    if (
      configuration.topologyType === 'LoadBalanced' &&
      test.description === 'timeoutMS is refreshed for close'
    ) {
      return 'LoadBalanced cannot refresh timeoutMS and run expected killCursors because pinned connection has been closed by the timeout';
    }
    if (
      sessionCSOTTests.includes(test.description) &&
      configuration.topologyType === 'ReplicaSetWithPrimary' &&
      semver.satisfies(configuration.version, '<=4.4')
    ) {
      return '4.4 replicaset fail point does not blockConnection for requested time';
    }
    // TODO(NODE-7418): on latest server (>=9.0) sharded clusters, the initial $changeStream
    // aggregate blocks server-side for the full maxTimeMS because mongos propagates maxTimeMS to
    // each shard as maxAwaitTimeMS. The legacy-timeout retryability tests also fail because
    // socketTimeoutMS=100 is too tight for SSL connection establishment on a sharded+SSL host.
    if (
      configuration.topologyType === 'Sharded' &&
      semver.satisfies(configuration.version, '>=9.0') &&
      csotChangeStreamShardedSkips.has(test.description)
    ) {
      return 'TODO(NODE-7418): CSOT createChangeStream tests hang on sharded clusters, fixed by NODE-7418';
    }
    return false;
  });
});

// Descriptions of CSOT change stream tests that fail specifically on sharded topologies
// running against the latest server (>=9.0). On sharded clusters, mongos propagates maxTimeMS
// to each shard as maxAwaitTimeMS on the initial $changeStream aggregate, causing the server to
// block for the full budget. The legacy timeout tests additionally fail because socketTimeoutMS=100
// is too tight for SSL connection establishment overhead on sharded+SSL CI hosts.
// Tracked in NODE-7418 / DRIVERS-3018 / SERVER-129623.
const csotChangeStreamShardedSkips = new Set([
  'change stream can be iterated again if previous iteration times out',
  'timeoutMS can be configured on a MongoCollection - createChangeStream on collection',
  'timeoutMS can be configured on a MongoDatabase - createChangeStream on database',
  'timeoutMS can be configured on a MongoDatabase - createChangeStream on collection',
  'timeoutMS can be configured for an operation - createChangeStream on client',
  'timeoutMS can be configured for an operation - createChangeStream on database',
  'timeoutMS can be configured for an operation - createChangeStream on collection',
  'operation succeeds after one socket timeout - createChangeStream on client',
  'operation succeeds after one socket timeout - createChangeStream on database',
  'operation succeeds after one socket timeout - createChangeStream on collection',
  'operation is retried multiple times for non-zero timeoutMS - createChangeStream on client',
  'operation is retried multiple times for non-zero timeoutMS - createChangeStream on database',
  'operation is retried multiple times for non-zero timeoutMS - createChangeStream on collection'
]);

describe('CSOT modified spec tests', function () {
  const specs = loadSpecTests(
    join('..', 'integration', 'client-side-operations-timeout', 'unified-csot-node-specs')
  );
  runUnifiedSuite(specs, (test, configuration) => {
    // TODO(NODE-7418): same root cause as csotChangeStreamShardedSkips above.
    if (
      configuration.topologyType === 'Sharded' &&
      semver.satisfies(configuration.version, '>=9.0') &&
      test.description === 'timeoutMS is refreshed for getMore if maxAwaitTimeMS is set'
    ) {
      return 'TODO(NODE-7418): CSOT createChangeStream tests hang on sharded clusters, fixed by NODE-7418';
    }
    return false;
  });
});
