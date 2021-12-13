import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import { MongoClient } from '../../src';
import { isHello } from '../../src/utils';
import * as mock from '../tools/mongodb-mock/index';
import type { MockServer } from '../tools/mongodb-mock/src/server';
import { processTick } from '../tools/utils';

/*
    The SRV Prose Tests make use of the following REAL DNS records.
    CURRENTLY, WE DO NOT USE THESE. We have stubbed the methods to build our own fake data for testing.
    We use sinon to replace the results from resolveSrv to test hostname removals and insertions.

    The actual spec prose assumes you have a 4 node sharded cluster running on ports:
    [27017, 27018, 27019, 27020]

    Record                                        TTL    Class   Address
    localhost.test.test.build.10gen.cc.           86400  IN A    127.0.0.1

    Record                                        TTL    Class   Port   Target
    _mongodb._tcp.test1.test.build.10gen.cc.      86400  IN SRV  27017  localhost.test.build.10gen.cc.
    _mongodb._tcp.test1.test.build.10gen.cc.      86400  IN SRV  27018  localhost.test.build.10gen.cc.
    _mongodb._tcp.test3.test.build.10gen.cc.      86400  IN SRV  27017  localhost.test.build.10gen.cc.
    _customname._tcp.test22.test.build.10gen.cc.  86400  IN SRV  27017  localhost.test.build.10gen.cc.
*/

const srvRecord = (name, port) => ({ name, port, weight: 0, priority: 0 });
interface ShardedClusterMocks {
  mongoses: MockServer[];
  readonly srvRecords: dns.SrvRecord[];
}

// TODO(): Make use of the shared driver's DNS records

describe('Polling Srv Records for Mongos Discovery', () => {
  const SRV_CONNECTION_STRING = 'mongodb+srv://test.mock.test.build.10gen.cc';
  let shardedCluster: ShardedClusterMocks;
  let resolveSrvStub: sinon.SinonStub;
  let lookupStub: sinon.SinonStub;
  let client: MongoClient;
  let clock: sinon.SinonFakeTimers;
  const initialRecords = Object.freeze([
    { name: 'localhost.test.mock.test.build.10gen.cc', port: 2017 },
    { name: 'localhost.test.mock.test.build.10gen.cc', port: 2018 }
  ]);

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    if (clock) {
      clock.restore();
      clock = undefined;
    }
  });

  beforeEach(async () => {
    const mongoses = [
      await mock.createServer(2017),
      await mock.createServer(2018),
      await mock.createServer(2019),
      await mock.createServer(2020)
    ];

    const srvRecords = mongoses.map(s =>
      srvRecord('localhost.test.mock.test.build.10gen.cc', s.port)
    );

    shardedCluster = { mongoses, srvRecords };

    for (const mongos of shardedCluster.mongoses) {
      mongos.setMessageHandler(request => {
        const document = request.document;

        if (isHello(document)) {
          request.reply({ ...mock.HELLO, msg: 'isdbgrid' });
        }
      });
    }
  });

  afterEach(async () => {
    await mock.cleanup();
  });

  afterEach(async () => {
    if (resolveSrvStub) {
      resolveSrvStub.restore();
      resolveSrvStub = undefined;
    }
    if (lookupStub) {
      lookupStub.restore();
      lookupStub = undefined;
    }
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  function makeStubs({
    initialRecords = undefined,
    replacementRecords = undefined,
    srvServiceName = 'mongodb'
  }) {
    let initialDNSLookup = true;
    const mockRecords = shardedCluster.srvRecords;
    replacementRecords ??= mockRecords;
    initialRecords ??= mockRecords;
    // first call is for the driver initial connection
    // second call will check the poller
    resolveSrvStub = sinon.stub(dns, 'resolveSrv').callsFake((address, callback) => {
      expect(address).to.equal(`_${srvServiceName}._tcp.test.mock.test.build.10gen.cc`);
      if (initialDNSLookup) {
        initialDNSLookup = false;
        return process.nextTick(callback, null, initialRecords);
      }
      process.nextTick(callback, null, replacementRecords);
    });

    lookupStub = sinon.stub(dns, 'lookup').callsFake((...args) => {
      const hostname = args[0];
      const options = typeof args[1] === 'object' ? args[1] : {};
      const callback = args[args.length - 1] as (err: null, address: string, family: 4) => void;

      if (hostname.includes('test.mock.test.build.10gen.cc')) {
        return process.nextTick(callback, null, '127.0.0.1', 4);
      }

      const { wrappedMethod: lookup } = lookupStub;
      lookup(hostname, options, callback);
    });
  }

  it('10 - All DNS records are selected (srvMaxHosts = 0)', async () => {
    const replacementRecords = [
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2017, weight: 0, priority: 0 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2019, weight: 0, priority: 0 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2020, weight: 0, priority: 0 }
    ];

    makeStubs({ initialRecords, replacementRecords });

    client = new MongoClient(SRV_CONNECTION_STRING, {
      tls: false, // Need to turn off the automatic TLS turn on with SRV connection strings
      srvMaxHosts: 0,
      serverSelectionTimeoutMS: 5000 // This is just to make the test fail in a nice amount of time
    });
    await client.connect();

    const selectedHosts = client.topology.s.seedlist;
    expect(selectedHosts).to.have.lengthOf(initialRecords.length);
    expect(selectedHosts.map(({ host }) => host)).to.deep.equal(
      initialRecords.map(({ name }) => name)
    );

    clock.tick(2 * client.topology.s.srvPoller.rescanSrvIntervalMS);
    await processTick();

    const polledServerAddresses = Array.from(client.topology.description.servers.keys());
    polledServerAddresses.sort();
    expect(polledServerAddresses).to.deep.equal(
      replacementRecords.map(({ name, port }) => `${name}:${port}`)
    );
  });

  it('11 - All DNS records are selected (srvMaxHosts >= records)', async () => {
    const replacementRecords = [
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2019, weight: 0, priority: 0 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2020, weight: 0, priority: 0 }
    ];

    makeStubs({ initialRecords, replacementRecords });

    client = new MongoClient(SRV_CONNECTION_STRING, {
      tls: false,
      srvMaxHosts: 2,
      serverSelectionTimeoutMS: 5000
    });
    await client.connect();

    const selectedHosts = client.topology.s.seedlist;
    expect(selectedHosts).to.have.lengthOf(2);
    expect(selectedHosts.map(({ host }) => host)).to.deep.equal(
      initialRecords.map(({ name }) => name)
    );

    clock.tick(2 * client.topology.s.srvPoller.rescanSrvIntervalMS);
    await processTick();

    const polledServerAddresses = Array.from(client.topology.description.servers.keys());
    polledServerAddresses.sort();
    expect(polledServerAddresses).to.deep.equal(
      replacementRecords.map(({ name, port }) => `${name}:${port}`)
    );
  });

  it('12 - New DNS records are randomly selected (srvMaxHosts > 0)', async () => {
    const replacementRecords = [
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2017, weight: 0, priority: 0 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2019, weight: 0, priority: 0 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2020, weight: 0, priority: 0 }
    ];

    makeStubs({ initialRecords, replacementRecords });

    client = new MongoClient(SRV_CONNECTION_STRING, {
      tls: false,
      srvMaxHosts: 2,
      serverSelectionTimeoutMS: 5000
    });
    await client.connect();

    const selectedHosts = client.topology.s.seedlist;
    expect(selectedHosts).to.have.lengthOf(2);
    expect(selectedHosts.map(({ host }) => host)).to.deep.equal(
      initialRecords.map(({ name }) => name)
    );

    clock.tick(2 * client.topology.s.srvPoller.rescanSrvIntervalMS);
    await processTick();

    const polledServerAddresses = Array.from(client.topology.description.servers.keys());
    polledServerAddresses.sort();
    // Only two addresses, one should remain the original 2017,
    // while the other will be one of 2019 or 2020
    expect(polledServerAddresses).to.have.lengthOf(2);
    expect(polledServerAddresses).to.include('localhost.test.mock.test.build.10gen.cc:2017');
    expect(polledServerAddresses).satisfies(
      addresses =>
        // If you want proof, comment one of these conditions out, and run the test a few times
        // you should see it pass and fail at random
        addresses.includes('localhost.test.mock.test.build.10gen.cc:2019') ||
        addresses.includes('localhost.test.mock.test.build.10gen.cc:2020')
    );
  });

  it('13 - DNS record with custom service name can be found', async () => {
    const replacementRecords = [
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2019, weight: 0, priority: 0 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2020, weight: 0, priority: 0 }
    ];

    makeStubs({
      initialRecords: [initialRecords[0]],
      replacementRecords,
      srvServiceName: 'myFancySrvServiceName'
    });

    client = new MongoClient(SRV_CONNECTION_STRING, {
      tls: false,
      srvServiceName: 'myFancySrvServiceName',
      serverSelectionTimeoutMS: 5000
    });

    await client.connect();

    clock.tick(2 * client.topology.s.srvPoller.rescanSrvIntervalMS);
    // No need to await process tick, since we're not checking DNS lookups

    const resolveSrvCalls = resolveSrvStub.getCalls();
    expect(resolveSrvCalls).to.have.lengthOf(2);
    expect(resolveSrvCalls[0].args[0]).includes('myFancySrvServiceName');
    expect(resolveSrvCalls[1].args[0]).include('myFancySrvServiceName');
  });
});
