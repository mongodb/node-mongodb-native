import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { isTLSEnabled } from '../../tools/runner/filters/tls_filter';

const filter = () => (isTLSEnabled ? 'TODO(NODE-XXXX): ...' : false);
describe('Retryable Writes (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-writes', 'unified')), filter);
});
