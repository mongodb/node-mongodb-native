'use strict';
const { loadSpecTests } = require('../spec/index');
const { runUnifiedTest } = require('../functional/unified-spec-runner/runner');
const { expect } = require('chai');

describe('Load Balancer Spec Unified Tests', function () {
  for (const loadBalancerTest of loadSpecTests('load-balancers')) {
    expect(loadBalancerTest).to.exist;
    context(String(loadBalancerTest.description), function () {
      for (const test of loadBalancerTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            await runUnifiedTest(this, loadBalancerTest, test);
          }
        });
      }
    });
  }
});

require('../functional/retryable_reads.test');
require('../functional/retryable_writes.test');
require('../functional/uri_options_spec.test');
require('../functional/change_stream_spec.test');
require('../functional/versioned-api.test');
require('../unit/core/mongodb_srv.test');
require('../unit/sdam/server_selection/spec.test');
