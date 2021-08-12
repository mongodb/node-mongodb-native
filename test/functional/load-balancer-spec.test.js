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
  'stale errors are ignored',
  // NOTE: The driver correctly fails these 2 tests in non LB mode for server versions greater than 3.4.
  // In versions that are 3.4 or less an error still occurs but a different one (connection closes).
  // TODO(NODE-3543): fix the path-ing that will produce errors for older servers
  'operations against non-load balanced clusters fail if URI contains loadBalanced=true',
  'operations against non-load balanced clusters succeed if URI contains loadBalanced=false'
];

describe('Load Balancer Unified Tests', function () {
  this.timeout(10000);
  runUnifiedSuite(loadSpecTests(path.join('load-balancers')), SKIP);
});
