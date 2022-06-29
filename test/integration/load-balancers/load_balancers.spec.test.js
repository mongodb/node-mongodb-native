'use strict';
const path = require('path');
const { loadSpecTests } = require('../../spec/index');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

const filter = ({ description }) => {
  if (description === 'change streams pin to a connection') {
    // Verified they use the same connection but the Node implementation executes
    // a getMore before the killCursors even though the stream is immediately
    // closed.
    // TODO(NODE-3970): implement and reference a node specific integration test for this
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

  if (description === 'errors during the initial connection hello are ignored') {
    // This test is skipped because it assumes drivers attempt connections on the first operation,
    // but Node has a connect() method that is called before the first operation is ever run.
    return 'TODO(NODE-2149): Refactor connect()';
  }

  if (
    process.env.AUTH === 'auth' &&
    [
      'errors during authentication are processed',
      'wait queue timeout errors include cursor statistics',
      'wait queue timeout errors include transaction statistics',
      'operations against non-load balanced clusters fail if URI contains loadBalanced=true',
      'operations against non-load balanced clusters succeed if URI contains loadBalanced=false'
    ].includes(description)
  ) {
    return 'TODO(NODE-3891): fix tests broken when AUTH enabled';
  }

  return false;
};

describe('Load Balancer Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('load-balancers')), filter);
});
