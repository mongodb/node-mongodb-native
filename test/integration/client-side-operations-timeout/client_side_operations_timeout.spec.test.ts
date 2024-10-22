import { join } from 'path';
import * as semver from 'semver';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const skippedSpecs = {};

const skippedTests = {
  'timeoutMS can be configured on a MongoClient - createChangeStream on client': 'TODO(NODE-6305)',
  'timeoutMS applies to whole operation, not individual attempts - createChangeStream on client':
    'TODO(NODE-6305)',
  'Tailable cursor iteration timeoutMS is refreshed for getMore - failure': 'TODO(NODE-6305)',
  'Tailable cursor awaitData iteration timeoutMS is refreshed for getMore - failure':
    'TODO(NODE-6305)',
  'command is not sent if RTT is greater than timeoutMS': 'TODO(DRIVERS-2965)',
  'Non=tailable cursor iteration timeoutMS is refreshed for getMore if timeoutMode is iteration - failure':
    'TODO(DRIVERS-2965)',
  'Non-tailable cursor lifetime remaining timeoutMS applied to getMore if timeoutMode is unset':
    'TODO(DRIVERS-2965)',
  'maxTimeMS value in the command is less than timeoutMS':
    'TODO(DRIVERS-2970): see modified test in unified-csot-node-specs',
  'Tailable cursor awaitData iteration timeoutMS is refreshed for getMore - failure':
    'TODO(DRIVERS-2965)',
  'Tailable cursor iteration timeoutMS is refreshed for getMore - failure': 'TODO(DRIVERS-2965)',
  'timeoutMS is refreshed for getMore - failure':
    'TODO(DRIVERS-2965): see modified test in unified-csot-node-specs' // Skipping for both tailable awaitData and tailable non-awaitData cursors
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
    return false;
  });
});

describe('CSOT modified spec tests', function () {
  const specs = loadSpecTests(
    join('..', 'integration', 'client-side-operations-timeout', 'unified-csot-node-specs')
  );
  runUnifiedSuite(specs);
});
