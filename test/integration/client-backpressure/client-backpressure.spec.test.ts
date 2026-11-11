import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Client Backpressure (spec)', function () {
  runUnifiedSuite(loadSpecTests('client-backpressure'));
});
