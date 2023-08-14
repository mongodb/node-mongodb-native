import { expect } from 'chai';
import { once } from 'events';

import { MongoClient } from '../../../src';
import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTestSuite } from '../../tools/cmap_spec_runner';

describe('Connection Monitoring and Pooling (Node Driver)', function () {
  const tests: CmapTest[] = loadSpecTests(
    '../integration/connection-monitoring-and-pooling/cmap-node-specs'
  );

  runCmapTestSuite(tests, {
    injectPoolStats: true,
    testsToSkip: [
      {
        description: 'must replace removed connections up to minPoolSize',
        skipIfCondition: 'loadBalanced',
        skipReason: 'cannot run against load balancer due to reliance on pool.clear() command'
      }
    ]
  });

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
