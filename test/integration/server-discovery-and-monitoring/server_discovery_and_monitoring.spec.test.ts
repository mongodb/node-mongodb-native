import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const skipTable: { pattern: string; reason: string }[] = [
  { pattern: 'Topology lifecycle', reason: 'see NODE-5723' },
  { pattern: 'connect with serverMonitoringMode=stream >=4.4', reason: 'NODE-6045' },
  { pattern: 'connect with serverMonitoringMode=auto >=4.4', reason: 'NODE-6045' }
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
