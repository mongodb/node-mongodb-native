import * as process from 'node:process';

import { runUnifiedSuite } from '../tools/unified-spec-runner/runner';

describe('Node Driver Atlas Testing', function () {
  // Astrolabe can, well, take some time. In some cases up to 800s to
  // reconfigure clusters.
  this.timeout(0);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const spec = JSON.parse(process.env.WORKLOAD_SPECIFICATION!);
  runUnifiedSuite([spec]);
});
