import * as path from 'path';
import * as process from 'process';

import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const filter = ({ description }) => {
  if (description === 'change streams pin to a connection') {
    // Verified they use the same connection but the Node implementation executes
    // a getMore before the killCursors even though the stream is immediately
    // closed.
    return 'TODO(NODE-3970): implement and reference a node specific integration test for this';
  }

  if (
    [
      'pinned connections are not returned after an network error during getMore',
      'pinned connections are not returned to the pool after a non-network error on getMore',
      'stale errors are ignored'
    ].includes(description)
  ) {
    // TODO(DRIVERS-1847): The above three tests are skipped pending a decision made in DRIVERS-1847
    // since pinning the connection on any getMore error is very awkward in node and likely results
    // in sub-optimal pinning.
    return 'TODO(DRIVERS-1847): Skipped pending a decision made on DRIVERS-1847';
  }

  if (
    process.env.AUTH === 'auth' &&
    ['errors during authentication are processed'].includes(description)
  ) {
    return 'TODO(NODE-7014): clear pool after handshake error in lb mode';
  }

  return false;
};

describe('Load Balancer Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('load-balancers')), filter);
});
