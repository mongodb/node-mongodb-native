import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const skipTable: { pattern: string; reason: string }[] = [
  {
    pattern: 'Topology lifecycle',
    reason: 'TODO(NODE-5723): Need to implement DRIVERS-2711 spec change'
  },
  {
    pattern: 'connect with serverMonitoringMode=stream >=4.4',
    reason: 'TODO(NODE-6045): Ensure that first server hearbeat does not report that it is awaited'
  },
  {
    pattern: 'connect with serverMonitoringMode=auto >=4.4',
    reason: 'TODO(NODE-6045): Ensure that first server hearbeat does not report that it is awaited'
  }
];

describe('SDAM Unified Tests (Spec)', function () {
  const specTests = loadSpecTests(path.join('server-discovery-and-monitoring', 'unified'));
  runUnifiedSuite(specTests, test => {
    for (const { pattern, reason } of skipTable) {
      if (test.description.includes(pattern)) return reason;
    }
    return false;
  });
});
