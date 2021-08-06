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

  // NOTE: The driver correctly fails these 2 tests in non LB mode due to validation that
  // loadBalanced=true is only valid as a URI option and not a regular driver option according
  // to the spec. However the unified test runner implementation incorrectly passes URI options
  // as regular driver options to the MongoClient. There are additional unit tests to cover
  // these cases that demostrate this works as intended.
  'operations against non-load balanced clusters fail if URI contains loadBalanced=true',
  'operations against non-load balanced clusters succeed if URI contains loadBalanced=false'
];

describe('Load Balancer Unified Tests', function () {
  this.timeout(10000);
  runUnifiedSuite(loadSpecTests(path.join('load-balancers')), SKIP);
});
