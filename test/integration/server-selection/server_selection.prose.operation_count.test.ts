import { expect } from 'chai';

import { type Collection, type CommandStartedEvent, type MongoClient } from '../../mongodb';
import { HostAddress } from '../../mongodb';
import { waitUntilPoolsFilled } from '../../tools/utils';

const failPoint = {
  configureFailPoint: 'failCommand',
  mode: { times: 10000 },
  data: {
    failCommands: ['find'],
    blockConnection: true,
    blockTimeMS: 500,
    appName: 'loadBalancingTest'
  }
};

const POOL_SIZE = 100;

async function runTaskGroup(collection: Collection, count: 10 | 100 | 1000) {
  for (let i = 0; i < count; ++i) {
    await collection.findOne({});
  }
}

// Step 1: Configure a sharded cluster with two mongoses. Use a 4.2.9 or newer server version.
const TEST_METADATA: MongoDBMetadataUI = { requires: { mongodb: '>=4.2.9', topology: 'sharded' } };

describe('operationCount-based Selection Within Latency Window - Prose Test', function () {
  let client: MongoClient;
  let seeds: Array<string>;
  let counts: Record<string, number> = {};
  const updateCount = ({ address }: CommandStartedEvent) => {
    const hostAddress = HostAddress.fromString(address);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const port = hostAddress.port!.toString();
    const count = counts[port] ?? 0;
    counts[port] = count + 1;
  };

  beforeEach(async function () {
    // Step 3: Create a client with both mongoses' addresses in its seed list, appName="loadBalancingTest", and localThresholdMS=30000.
    const uri = this.configuration.url({
      appName: 'loadBalancingTest',
      localThresholdMS: 30000,
      minPoolSize: POOL_SIZE,
      maxPoolSize: POOL_SIZE,
      monitorCommands: true,
      useMultipleMongoses: true
    });

    client = this.configuration.newClient(uri, {
      appName: 'loadBalancingTest',
      localThresholdMS: 30000,
      minPoolSize: POOL_SIZE,
      maxPoolSize: POOL_SIZE,
      monitorCommands: true
    });

    client.on('commandStarted', updateCount);

    // Step 4: Using CMAP events, ensure the client's connection pools for both mongoses have been saturated
    await waitUntilPoolsFilled(client, AbortSignal.timeout(30_000), POOL_SIZE * 2);

    seeds = client.topology.s.seedlist.map(address => address.toString());

    counts = {};
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    seeds = [];
  });

  it('needs to run on exactly two mongoses', TEST_METADATA, function () {
    expect(seeds).to.have.lengthOf(2);
  });

  context('when one mongos is overloaded', function () {
    let failCommandClient: MongoClient;

    beforeEach(async function () {
      // Step 2: Enable the following failpoint against exactly one of the mongoses:
      const failingSeed = seeds[0];

      failCommandClient = this.configuration.newClient(`mongodb://${failingSeed}/integration_test`);

      await failCommandClient.connect();
      await failCommandClient.db('admin').command(failPoint);
    });

    afterEach(async function () {
      // Step 7: Disable the failpoint.
      await failCommandClient.db('admin').command({
        configureFailPoint: 'failCommand',
        mode: 'off',
        data: {
          failCommands: ['find'],
          blockConnection: true,
          blockTimeMS: 500,
          appName: 'loadBalancingTest'
        }
      });

      await failCommandClient.close();
      failCommandClient = undefined;
    });

    it('sends fewer requests to the overloaded server', TEST_METADATA, async function () {
      const failingSeed = seeds[0];
      const collection = client.db('test-db').collection('collection0');

      // Step 5: Start 10 concurrent threads / tasks that each run 10 findOne operations with empty filters using that client.
      await Promise.all(Array.from({ length: 10 }, () => runTaskGroup(collection, 10)));

      // Step 6: Using command monitoring events, assert that fewer than 25% of the CommandStartedEvents
      // occurred on the mongos that the failpoint was enabled on.
      const port = failingSeed.split(':')[1];
      const percentageSentToSlowHost = (counts[port] / 100) * 100;
      expect(percentageSentToSlowHost).to.be.lessThan(25);
    });
  });

  it('equally distributes operations with both hosts are fine', TEST_METADATA, async function () {
    const collection = client.db('test-db').collection('collection0');

    const numberTaskGroups = 10;
    const numberOfTasks = 1000;
    const totalNumberOfTasks = numberTaskGroups * numberOfTasks;

    // This test has proved flakey, not just for Node.  The number of iterations for the test has been increased,
    // to prevent the test from failing.
    // Step 8: Start 10 concurrent threads / tasks that each run 100 findOne operations with empty filters using that client.
    await Promise.all(
      Array.from({ length: numberTaskGroups }, () => runTaskGroup(collection, numberOfTasks))
    );

    // Step 9: Using command monitoring events, assert that each mongos was selected roughly 50% of the time (within +/- 10%).
    const [host1, host2] = seeds.map(seed => seed.split(':')[1]);
    const percentageToHost1 = (counts[host1] / totalNumberOfTasks) * 100;
    const percentageToHost2 = (counts[host2] / totalNumberOfTasks) * 100;
    expect(percentageToHost1).to.be.greaterThan(35).and.lessThan(65);
    expect(percentageToHost2).to.be.greaterThan(35).and.lessThan(65);
  });

  it(
    'equally distributes operations with both hosts when requests are in sequence',
    TEST_METADATA,
    /**
     * note that this test is NOT a prose test, but it lives in this file because it uses the
     * same setup as the operation count prose tests
     */
    async function () {
      const collection = client.db('test-db').collection('collection0');

      const { insertedId } = await collection.insertOne({ name: 'bumpy' });

      const n = 1000;

      for (let i = 0; i < n; ++i) {
        await collection.findOne({ _id: insertedId });
      }

      const [host1, host2] = seeds.map(seed => seed.split(':')[1]);
      const percentageToHost1 = (counts[host1] / n) * 100;
      const percentageToHost2 = (counts[host2] / n) * 100;
      expect(percentageToHost1).to.be.greaterThan(35).and.lessThan(65);
      expect(percentageToHost2).to.be.greaterThan(35).and.lessThan(65);
    }
  );
});
