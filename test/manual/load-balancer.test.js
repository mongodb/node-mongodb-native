'use strict';
const path = require('path');
const { loadSpecTests } = require('../spec/index');
const { runUnifiedSuite } = require('../functional/unified-spec-runner/runner');

const SKIP = [
  // Verified they use the same connection but the Node implementation executes
  // a getMore before the killCursors even though the stream is immediately
  // closed.
  'change streams pin to a connection',
  'errors during the initial connection hello are ignore',

  // NOTE: The following three tests are skipped pending a decision made on DRIVERS-1847, since
  //       pinning the connection on any getMore error is very awkward in node and likely results
  //       in sub-optimal pinning.
  'pinned connections are not returned after an network error during getMore',
  'pinned connections are not returned to the pool after a non-network error on getMore',
  'stale errors are ignored'
];

require('../functional/retryable_reads.test');
require('../functional/retryable_writes.test');
require('../functional/uri_options_spec.test');
require('../functional/change_stream_spec.test');
require('../functional/versioned-api.test');
require('../unit/core/mongodb_srv.test');
require('../unit/sdam/server_selection/spec.test');

describe('Load Balancer Unified Tests', function () {
  this.timeout(10000);
  runUnifiedSuite(loadSpecTests(path.join('load-balancers')), SKIP);
});
