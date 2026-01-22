import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { isTLSEnabled } from '../../tools/runner/filters/tls_filter';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const filter = () =>
  isTLSEnabled ? 'TODO(NODE-7408): fix these tests when TLS is enabled' : false;
describe('Retryable Writes (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-writes', 'unified')), filter);
});
