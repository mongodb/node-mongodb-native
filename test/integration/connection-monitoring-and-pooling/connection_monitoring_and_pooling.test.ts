import { expect } from 'chai';
import { once } from 'events';

import { type MongoClient } from '../../mongodb';
import { loadSpecTests } from '../../spec';
import { type CmapTest, runCmapTestSuite } from '../../tools/cmap_spec_runner';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Connection Monitoring and Pooling (Node Driver)', function () {
  const cmapTests: CmapTest[] = loadSpecTests(
    '../integration/connection-monitoring-and-pooling/cmap-node-specs'
  );

  runCmapTestSuite(cmapTests, {
    injectPoolStats: true,
    testsToSkip: [
      {
        description: 'must replace removed connections up to minPoolSize',
        skipIfCondition: 'loadBalanced',
        skipReason: 'cannot run against load balancer due to reliance on pool.clear() command'
      }
    ]
  });

  // TODO(NODE-5230): Remove this once the actual unified tests (test/spec/connection-monitoring-and-pooling/logging) are passing
  const unifiedTests = loadSpecTests(
    '../integration/connection-monitoring-and-pooling/unified-cmap-node-specs'
  );
  runUnifiedSuite(unifiedTests);

  describe('ConnectionPoolCreatedEvent', () => {
    let client: MongoClient;
    beforeEach(async function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      await client.close();
    });

    describe('constructor()', () => {
      it('when auth is enabled redacts credentials from options', {
        metadata: { requires: { auth: 'enabled' } },
        async test() {
          const poolCreated = once(client, 'connectionPoolCreated');
          await client.connect();
          const [event] = await poolCreated;
          expect(event).to.have.deep.nested.property('options.credentials', {});

          const poolOptions = Array.from(client.topology?.s.servers.values() ?? []).map(
            s => s.pool.options
          );
          expect(poolOptions).to.have.length.of.at.least(1);

          for (const { credentials = {} } of poolOptions) {
            expect(
              Object.keys(credentials),
              'pool.options.credentials must exist and have keys'
            ).to.not.equal(0);
          }
        }
      });

      it('when auth is disabled does not add a credentials property to options', {
        metadata: { requires: { auth: 'disabled' } },
        async test() {
          const poolCreated = once(client, 'connectionPoolCreated');
          await client.connect();
          const [event] = await poolCreated;
          expect(event).to.not.have.nested.property('options.credentials');
        }
      });
    });
  });
});
