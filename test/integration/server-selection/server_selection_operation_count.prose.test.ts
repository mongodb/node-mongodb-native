import { MongoClient } from '../../../src/mongo_client';

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

async function runTaskGroup(client: MongoClient, count: 10 | 100) {
  for (let i = 0; i < count; ++i) {
    await client.db('test-db').collection('test-collection').findOne({});
  }
}

describe('', function () {
  let client: MongoClient;
  beforeEach(async function () {
    // setup sharded cluster using 4.2.9 or later
    // enable failpoint against exactly one of them

    // TODO : ensure that both mongoses' addresses are in the seedlist for the client
    client = await this.configuration
      .newClient({
        appName: 'loadBalancingTest',
        localThresholdMS: 30000,
        minPoolSize: POOL_SIZE,
        maxPoolSize: POOL_SIZE,
        monitorCommands: true
      })
      .connect();
  });

  it('adjusts based on operation count', async function () {
    const counts: Record<string, number> = {};
    const updateCount = (address: string) => {
      counts[address] = counts[address] ?? 0;
      counts[address]++;
    };

    client.on('commandStarted', updateCount);

    await Array.from({ length: 10 }, () => runTaskGroup(client, 10));

    client.removeListener('commandStarted', updateCount);
    // assert percentages
    // disable failpoint
  });
});
