'use strict';
const { loadSpecTests } = require('../spec/index');
const { runUnifiedTest } = require('../functional/unified-spec-runner/runner');
const { expect } = require('chai');

const SKIP = [
  // Verified they use the same connection but the Node implementation executes
  // a getMore before the killCursors even though the stream is immediately
  // closed.
  'change streams pin to a connection'
];

describe('Load Balancer Spec Unified Tests', function () {
  this.timeout(10000);
  for (const loadBalancerTest of loadSpecTests('load-balancers')) {
    expect(loadBalancerTest).to.exist;
    context(String(loadBalancerTest.description), function () {
      for (const test of loadBalancerTest.tests) {
        const description = String(test.description);
        if (!SKIP.includes(description)) {
          it(description, {
            metadata: { sessions: { skipLeakTests: true } },
            test: async function () {
              await runUnifiedTest(this, loadBalancerTest, test);
            }
          });
        }
      }
    });
  }
});

// require('../functional/retryable_reads.test');
// require('../functional/retryable_writes.test');
// require('../functional/uri_options_spec.test');
// require('../functional/change_stream_spec.test');
// require('../functional/versioned-api.test');
// require('../unit/core/mongodb_srv.test');
// require('../unit/sdam/server_selection/spec.test');
