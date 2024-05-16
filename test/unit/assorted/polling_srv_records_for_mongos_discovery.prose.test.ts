import { expect } from 'chai';
import * as dns from 'dns';
import { once } from 'events';
import { satisfies } from 'semver';
import * as sinon from 'sinon';

import {
  HostAddress,
  isHello,
  MongoClient,
  SrvPoller,
  type SrvPollerOptions,
  SrvPollingEvent,
  type Topology,
  type TopologyOptions,
  TopologyType
} from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import type { MockServer } from '../../tools/mongodb-mock/src/server';
import { processTick, topologyWithPlaceholderClient } from '../../tools/utils';
import { createTimerSandbox } from '../timer_sandbox';
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
// TODO(NODE-3773): Make use of the shared driver's DNS records
// TODO(NODE-3773): Implement tests 6-9
describe('Polling Srv Records for Mongos Discovery', () => {
  beforeEach(function () {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const test = this.currentTest!;
    test.skipReason = satisfies(process.version, '>=18.0.0')
      ? `TODO(NODE-5666): fix failing unit tests on Node18 (Running with Nodejs ${process.version})`
      : undefined;
    if (test.skipReason) this.skip();
  });

  describe('SRV polling prose cases 1-5', () => {
    const SRV_HOST = 'darmok.tanagra.com';
    const context: Record<string, any> = {};
    function srvRecord(mockServer, port?) {
      if (typeof mockServer === 'string') {
        mockServer = { host: mockServer, port };
      }
      return {
        priority: 0,
        weight: 0,
        port: mockServer.port,
        name: mockServer.host
      };
    }
    class FakeSrvPoller extends SrvPoller {
      start() {
        return;
      }
      stop() {
        return;
      }
      trigger(srvRecords) {
        this.emit('srvRecordDiscovery', new SrvPollingEvent(srvRecords));
      }
    }
    function srvAddresses(records) {
      return records.map(r => `${r.name}:${r.port}`);
    }
    const MONGOS_HELLO = Object.assign({}, mock.HELLO, {
      msg: 'isdbgrid'
    });

    beforeEach(function () {
      return Promise.all(Array.from({ length: 4 }).map(() => mock.createServer())).then(servers => {
        context.servers = servers;
      });
    });

    afterEach(function () {
      return mock.cleanup();
    });

    afterEach(function (done) {
      if (context.topology) {
        context.topology.close();
        done();
      } else {
        done();
      }
    });
    async function runSrvPollerTest(recordSets) {
      context.servers.forEach(server => {
        server.setMessageHandler(request => {
          const doc = request.document;
          if (isHello(doc)) {
            request.reply(Object.assign({}, MONGOS_HELLO));
          }
        });
      });
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST } as SrvPollerOptions);
      const seedlist = recordSets[0].map(record =>
        HostAddress.fromString(`${record.name}:${record.port}`)
      );
      context.topology = topologyWithPlaceholderClient(seedlist, {
        srvPoller: srvPoller as SrvPoller,
        srvHost: SRV_HOST
      } as TopologyOptions);
      const topology: Topology = context.topology;
      await topology.connect({});
      expect(topology.description).to.have.property('type', TopologyType.Sharded);
      const servers = Array.from(topology.description.servers.keys());
      expect(servers).to.deep.equal(srvAddresses(recordSets[0]));
      process.nextTick(() => srvPoller.trigger(recordSets[1]));
      await once(topology, 'topologyDescriptionChanged');
      const server = Array.from(topology.description.servers.keys());
      expect(server).to.deep.equal(srvAddresses(recordSets[1]));
    }
    // The addition of a new DNS record:
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
    it('1. Addition of a new DNS record', async function () {
      const recordSets = [
        [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
        [
          srvRecord(context.servers[0]),
          srvRecord(context.servers[1]),
          srvRecord(context.servers[2])
        ]
      ];
      await runSrvPollerTest(recordSets);
    });
    // The removal of an existing DNS record:
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27018  localhost.test.build.10gen.cc.
    it('2. Removal of an existing DNS record', async function () {
      const recordSets = [
        [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
        [srvRecord(context.servers[0])]
      ];
      await runSrvPollerTest(recordSets);
    });
    // The replacement of a DNS record:
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27018  localhost.test.build.10gen.cc.
    // replace by:
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
    it('3. Replacement of a DNS record', async function () {
      const recordSets = [
        [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
        [srvRecord(context.servers[0]), srvRecord(context.servers[2])]
      ];
      await runSrvPollerTest(recordSets);
    });
    // The replacement of both existing DNS records with one new record:
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
    it('4. replacement of both existing DNS records with one new record', async function () {
      const recordSets = [
        [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
        [srvRecord(context.servers[2])]
      ];
      await runSrvPollerTest(recordSets);
    });
    // The replacement of both existing DNS records with two new records:
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
    // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27020  localhost.test.build.10gen.cc.
    it('5. Replacement of both existing DNS records with two new records', async function () {
      const recordSets = [
        [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
        [srvRecord(context.servers[2]), srvRecord(context.servers[3])]
      ];
      await runSrvPollerTest(recordSets);
    });
  });

  describe('SRV polling prose cases 10-13', () => {
    const SRV_CONNECTION_STRING = 'mongodb+srv://test.mock.test.build.10gen.cc';
    let shardedCluster: ShardedClusterMocks;
    let resolveSrvStub: sinon.SinonStub;
    let lookupStub: sinon.SinonStub;
    let client: MongoClient;
    let clock: sinon.SinonFakeTimers;
    let timerSandbox: sinon.SinonSandbox;
    const initialRecords = Object.freeze([
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2017 },
      { name: 'localhost.test.mock.test.build.10gen.cc', port: 2018 }
    ]);

    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      if (clock) {
        timerSandbox.restore();
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
    }: {
      initialRecords?: dns.SrvRecord[];
      replacementRecords?: dns.SrvRecord[];
      srvServiceName?: string;
    }) {
      let initialDNSLookup = true;
      const mockRecords = shardedCluster.srvRecords;
      replacementRecords ??= mockRecords;
      initialRecords ??= mockRecords;
      // first call is for the driver initial connection
      // second call will check the poller
      resolveSrvStub = sinon.stub(dns.promises, 'resolveSrv').callsFake(async address => {
        expect(address).to.equal(`_${srvServiceName}._tcp.test.mock.test.build.10gen.cc`);
        if (initialDNSLookup) {
          initialDNSLookup = false;
          return initialRecords;
        }
        return replacementRecords;
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
});
