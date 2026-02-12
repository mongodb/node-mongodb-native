import { expect } from 'chai';
import * as net from 'net';
import * as os from 'os';
import * as sinon from 'sinon';

import {
  type ConnectionCreatedEvent,
  type MongoClient,
  ReadPreference,
  TopologyType
} from '../../mongodb';

describe('IPv6 Addresses', () => {
  let client: MongoClient;
  let ipv6Hosts: string[];

  beforeEach(async function () {
    if (
      os.platform() === 'linux' ||
      this.configuration.topologyType !== TopologyType.ReplicaSetWithPrimary
    ) {
      if (this.currentTest) {
        // Ubuntu 18 (linux) does not support localhost AAAA lookups (IPv6)
        // Windows (VS2019) has the AAAA lookup
        // We do not run a replica set on macos
        this.currentTest.skipReason =
          'We are only running this on windows currently because it has the IPv6 translation for localhost';
      }
      return this.skip();
    }

    ipv6Hosts = this.configuration.options.hostAddresses.map(({ port }) => `[::1]:${port}`);
    client = this.configuration.newClient(`mongodb://${ipv6Hosts.join(',')}/test`, {
      __skipPingOnConnect: true,
      maxPoolSize: 1
    });
  });

  afterEach(async function () {
    sinon.restore();
    await client?.close();
  });

  it('should have IPv6 loopback addresses set on the client', function () {
    const ipv6LocalhostAddresses = this.configuration.options.hostAddresses.map(({ port }) => ({
      host: '::1',
      port,
      isIPv6: true,
      socketPath: undefined
    }));
    expect(client.options.hosts).to.deep.equal(ipv6LocalhostAddresses);
  });

  it('should successfully connect using IPv6 loopback addresses', async function () {
    const localhostHosts: string[] = this.configuration.options.hostAddresses.map(
      ({ port }) => `localhost:${port}` // ::1 will be swapped out for localhost
    );
    await client.db().command({ ping: 1 });
    // After running the first command we should receive the hosts back as reported by the mongod in a hello response
    // mongodb will report the bound host address, in this case "localhost"
    expect(client.topology).to.exist;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const hosts = Array.from(client.topology!.s.description.servers.keys());

    for (const key of localhostHosts) {
      expect(hosts).to.include(key);
    }
  });

  it('should createConnection with IPv6 addresses initially then switch to mongodb bound addresses', async () => {
    const createConnectionSpy = sinon.spy(net, 'createConnection');

    const connectionCreatedEvents: ConnectionCreatedEvent[] = [];
    client.on('connectionCreated', ev => connectionCreatedEvents.push(ev));

    await client.db().command({ ping: 1 }, { readPreference: ReadPreference.primary });

    const callArgs = createConnectionSpy.getCalls().map(({ args }) => args[0]);

    for (let index = 0; index < ipv6Hosts.length; index++) {
      // The first 3 connections (monitoring) are made using the user provided addresses
      expect(callArgs[index]).to.have.property('host', '::1');
    }

    for (let index = ipv6Hosts.length; index < callArgs.length; index++) {
      // MongoDB sends back hellos that have the bound address 'localhost'
      // We make new connection using that address instead
      expect(callArgs[index]).to.have.property('host', 'localhost');
    }
  });
});
