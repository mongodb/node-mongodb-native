import * as path from 'path';
import * as dns from 'dns';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { MongoClient } from '../../../src';
import { processTick } from '../../tools/utils';
import { it } from 'mocha';
import * as mock from '../../tools/mock';

/*
    The SRV Prose Tests make use of the following REAL DNS records.
    We use sinon to replace the results from resolveSrv to test hostname removals and insertions.

    The prose tests assume you have a 4 node sharded cluster running on ports:
    [27017, 27018, 27019, 27020]

    Record                                    TTL    Class   Address
    localhost.test.test.build.10gen.cc.       86400  IN A    127.0.0.1

    Record                                    TTL    Class   Port   Target
    _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27017  localhost.test.build.10gen.cc.
    _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27018  localhost.test.build.10gen.cc.
    _mongodb._tcp.test3.test.build.10gen.cc.  86400  IN SRV  27017  localhost.test.build.10gen.cc.
*/

// const makeSrvRecordName = (host, serviceName = 'mongodb') => `_${serviceName}._tcp.${host}`;
// const dnsResolveSrvAsync = promisify(dns.resolveSrv);
const srvRecord = (name, port) => ({ name, port, weight: 0, priority: 0 });
interface ShardedClusterMocks {
  mongoses: mock.MockServer[];
  readonly srvRecords: dns.SrvRecord[];
}

describe(path.basename(__dirname), () => {
  describe('prose tests', () => {
    // TODO(): Make use of the shared driver's DNS records
    // const SRV_CONNECTION_STRING_T1 = 'mongodb+srv://test1.test.build.10gen.cc';
    // const SRV_CONNECTION_STRING_t3 = 'mongodb+srv://test3.test.build.10gen.cc';
    const SRV_CONNECTION_STRING = 'mongodb+srv://my.fancy.prose.tests';
    let shardedCluster: ShardedClusterMocks;
    let resolveSrvStub: sinon.SinonStub;
    let lookupStub: sinon.SinonStub;
    let client: MongoClient;
    let clock: sinon.SinonFakeTimers;
    let dnsRecordsForTest1;
    //let dnsRecordsForTest3;

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
        await mock.createServer(2000),
        await mock.createServer(2001),
        await mock.createServer(2002),
        await mock.createServer(2003)
      ];

      const srvRecords = mongoses.map(s => srvRecord('localhost.my.fancy.prose.tests', s.port));

      shardedCluster = { mongoses, srvRecords };

      for (const mongos of shardedCluster.mongoses) {
        mongos.setMessageHandler(request => {
          const document = request.document;

          if (document.ismaster || document.hello) {
            request.reply({ ...mock.HELLO, msg: 'isdbgrid' });
          }
        });
      }
    });

    afterEach(async () => {
      await mock.cleanup();
    });

    before(async () => {
      // const srvTest1 = makeSrvRecordName('test1.test.build.10gen.cc');
      // const srvTest3 = makeSrvRecordName('test3.test.build.10gen.cc');
      dnsRecordsForTest1 = [
        { name: 'localhost.my.fancy.prose.tests', port: 2000 },
        { name: 'localhost.my.fancy.prose.tests', port: 2001 }
      ]; // await dnsResolveSrvAsync(srvTest1);
      // dnsRecordsForTest3 = await dnsResolveSrvAsync(srvTest3);
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
      }
    });

    function makeStubs({
      replacementRecords = undefined,
      mockLimit = 0,
      srvServiceName = 'mongodb'
    }) {
      let initialDNSLookup = true;
      const mockRecords = shardedCluster.srvRecords;
      replacementRecords ??= mockRecords;
      // for some reason the stub needs to be set up here.
      // first call is for the driver initial connection
      // second call will check the poller
      resolveSrvStub = sinon.stub(dns, 'resolveSrv').callsFake((address, callback) => {
        expect(address).to.equal(`_${srvServiceName}._tcp.my.fancy.prose.tests`);
        if (initialDNSLookup) {
          initialDNSLookup = false;
          const recordsToUse = mockRecords.slice(
            0,
            mockLimit === 0 ? mockRecords.length : mockLimit
          );

          return process.nextTick(callback, null, recordsToUse);
        }
        process.nextTick(callback, null, replacementRecords);
      });

      lookupStub = sinon.stub(dns, 'lookup').callsFake((...args) => {
        const hostname = args[0];
        const options = typeof args[1] === 'object' ? args[1] : {};
        const callback = args[args.length - 1] as (err: null, address: string, family: 4) => void;

        if (hostname.includes('my.fancy.prose.tests')) {
          return process.nextTick(() => {
            callback(null, '127.0.0.1', 4);
          });
        }

        const { wrappedMethod: lookup } = lookupStub;
        lookup(hostname, options, callback);
      });
    }

    it('10 - All DNS records are selected (srvMaxHosts = 0)', async () => {
      const replacementRecords = [
        { name: 'localhost.my.fancy.prose.tests', port: 2000, weight: 0, priority: 0 },
        { name: 'localhost.my.fancy.prose.tests', port: 2002, weight: 0, priority: 0 },
        { name: 'localhost.my.fancy.prose.tests', port: 2003, weight: 0, priority: 0 }
      ];

      makeStubs({ replacementRecords, mockLimit: 2 });

      client = new MongoClient(SRV_CONNECTION_STRING, {
        tls: false,
        srvMaxHosts: 0,
        serverSelectionTimeoutMS: 5000
      });
      await client.connect();

      const selectedHosts = client.topology.s.seedlist;
      expect(selectedHosts).to.have.lengthOf(dnsRecordsForTest1.length);
      expect(selectedHosts.map(({ host }) => host)).to.deep.equal(
        dnsRecordsForTest1.map(({ name }) => name)
      );

      clock.tick(2 * client.topology.s.srvPoller.intervalMS);
      await processTick();

      const polledServerAddresses = Array.from(client.topology.description.servers.keys());
      polledServerAddresses.sort();
      expect(polledServerAddresses).to.deep.equal(
        replacementRecords.map(({ name, port }) => `${name}:${port}`)
      );
    });

    it('11 - All DNS records are selected (srvMaxHosts >= records)', async () => {
      const replacementRecords = [
        { name: 'localhost.my.fancy.prose.tests', port: 2002, weight: 0, priority: 0 },
        { name: 'localhost.my.fancy.prose.tests', port: 2003, weight: 0, priority: 0 }
      ];

      makeStubs({ replacementRecords, mockLimit: 2 });

      client = new MongoClient(SRV_CONNECTION_STRING, {
        tls: false,
        srvMaxHosts: 2,
        serverSelectionTimeoutMS: 5000
      });
      await client.connect();

      const selectedHosts = client.topology.s.seedlist;
      expect(selectedHosts).to.have.lengthOf(2);
      expect(selectedHosts.map(({ host }) => host)).to.deep.equal(
        dnsRecordsForTest1.map(({ name }) => name)
      );

      clock.tick(2 * client.topology.s.srvPoller.intervalMS);
      await processTick();

      const polledServerAddresses = Array.from(client.topology.description.servers.keys());
      polledServerAddresses.sort();
      expect(polledServerAddresses).to.deep.equal(
        replacementRecords.map(({ name, port }) => `${name}:${port}`)
      );
    });

    it('12 - New DNS records are randomly selected (srvMaxHosts > 0)', async () => {
      const replacementRecords = [
        { name: 'localhost.my.fancy.prose.tests', port: 2000, weight: 0, priority: 0 },
        { name: 'localhost.my.fancy.prose.tests', port: 2002, weight: 0, priority: 0 },
        { name: 'localhost.my.fancy.prose.tests', port: 2003, weight: 0, priority: 0 }
      ];

      makeStubs({ replacementRecords, mockLimit: 2 });

      client = new MongoClient(SRV_CONNECTION_STRING, {
        tls: false,
        srvMaxHosts: 2,
        serverSelectionTimeoutMS: 5000
      });
      await client.connect();

      const selectedHosts = client.topology.s.seedlist;
      expect(selectedHosts).to.have.lengthOf(2);
      expect(selectedHosts.map(({ host }) => host)).to.deep.equal(
        dnsRecordsForTest1.map(({ name }) => name)
      );

      clock.tick(2 * client.topology.s.srvPoller.intervalMS);
      await processTick();

      const polledServerAddresses = Array.from(client.topology.description.servers.keys());
      polledServerAddresses.sort();
      // Only two addresses, one should remain the original 2000,
      // while the other will be one of 2002 or 2003
      expect(polledServerAddresses).to.have.lengthOf(2);
      expect(polledServerAddresses.find(addr => addr.includes('2000'))).to.be.a('string');
      expect(polledServerAddresses).satisfies(
        addresses =>
          // If you want proof, comment one of these conditions out, and run the test a few times
          // you should see it pass and fail at random
          typeof addresses.find(addr => addr.includes('2002')) === 'string' ||
          typeof addresses.find(addr => addr.includes('2003')) === 'string'
      );
    });

    it('13 - DNS record with custom service name can be found', async () => {
      client = new MongoClient(SRV_CONNECTION_STRING, {
        tls: false,
        srvServiceName: 'myFancySrvServiceName',
        serverSelectionTimeoutMS: 5000
      });

      makeStubs({ srvServiceName: 'myFancySrvServiceName' });

      await client.connect();

      clock.tick(2 * client.topology.s.srvPoller.intervalMS);
      // No need to await process tick, since we're not checking DNS lookups

      const resolveSrvCalls = resolveSrvStub.getCalls();
      expect(resolveSrvCalls).to.have.lengthOf(2);
      expect(resolveSrvCalls[0].args[0]).includes('myFancySrvServiceName');
      expect(resolveSrvCalls[1].args[0]).include('myFancySrvServiceName');
    });
  });
});
