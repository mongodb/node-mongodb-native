import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('SDAM Unified Tests (Spec)', function () {
  const specTests = loadSpecTests(path.join('server-discovery-and-monitoring', 'unified'));
  runUnifiedSuite(specTests, test => {
    const skippedDescriptions = [
      'connect with serverMonitoringMode=auto >=4.4',
      'connect with serverMonitoringMode=stream >=4.4'
    ];
    return skippedDescriptions.some(description => test.description.includes(description))
      ? 'See NODE-6045'
      : false;
  });
});
