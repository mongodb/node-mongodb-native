import { expect } from 'chai';
import { promisify } from 'util';

import { CommandStartedEvent } from '../../../src';
import { Collection } from '../../../src/collection';
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

async function runTaskGroup(collection: Collection, count: 10 | 100) {
  for (let i = 0; i < count; ++i) {
    await collection.findOne({});
  }
}

async function ensurePoolIsFull(client) {
  let connectionCount = 0;
  client.on('connectionCreated', () => {
    connectionCount++;
  });

  // todo: ensure that the connection pool is filled
  while (connectionCount < POOL_SIZE) {
    // do nothing
    await promisify(setTimeout)(250);
  }
}

describe.only('foo', function () {
  let client: MongoClient;
  let seeds: Array<string>;
  let failCommandClient: MongoClient;
  let counts: Record<string, number> = {};
  const updateCount = ({ address }: CommandStartedEvent) => {
    const mongosPort = address.split(':')[1];
    counts[mongosPort] = counts[mongosPort] ?? 0;
    counts[mongosPort]++;
  };

  beforeEach(async function () {
    const uri = this.configuration.url({
      appName: 'loadBalancingTest',
      localThresholdMS: 30000,
      minPoolSize: POOL_SIZE,
      maxPoolSize: POOL_SIZE,
      monitorCommands: true,
      useMultipleMongoses: true
    });
    // setup sharded cluster using 4.2.9 or later
    // enable failpoint against exactly one of them
    client = this.configuration.newClient(uri, {
      appName: 'loadBalancingTest',
      localThresholdMS: 30000,
      minPoolSize: POOL_SIZE,
      maxPoolSize: POOL_SIZE,
      monitorCommands: true
    });

    client.on('commandStarted', updateCount);

    const poolIsFullPromise = ensurePoolIsFull(client);
    // TODO : ensure that both mongoses' addresses are in the seedlist for the client
    await client.connect();

    seeds = client.topology.s.seedlist.map(address => address.toString());

    // todo: ensure that the connection pool is filled
    await poolIsFullPromise;
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    seeds = [];
    if (failCommandClient) {
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
    }
  });

  it('sends fewer requests to a server with a high operation count', async function () {
    counts = {};

    const [failingSeed, _] = seeds;
    failCommandClient = this.configuration.newClient(`mongodb://${failingSeed}/integration_test`);

    await failCommandClient.connect();

    await failCommandClient.db('admin').command(failPoint);

    const collection = client.db('test-db').collection('collection0');

    await Promise.all(Array.from({ length: 10 }, () => runTaskGroup(collection, 10)));

    const port = failingSeed.split(':')[1];
    expect(counts[port]).to.be.lessThan(25);
  });

  it('splits 50/50 when no failcommand is set', async function () {
    counts = {};
    const collection = client.db('test-db').collection('collection0');

    await Promise.all(Array.from({ length: 10 }, () => runTaskGroup(collection, 100)));

    const [port1, port2] = seeds.map(seed => seed.split(':')[1]);
    const count1 = counts[port1];
    const count2 = counts[port2];

    // the server counts need to be within 10% of 50% of the operations
    //  so between 400-600 operations each
    expect(count1).to.be.greaterThanOrEqual(400);
    expect(count2).to.be.greaterThanOrEqual(400);
    expect(count1).to.be.lessThanOrEqual(600);
    expect(count2).to.be.lessThanOrEqual(600);
  });
});
