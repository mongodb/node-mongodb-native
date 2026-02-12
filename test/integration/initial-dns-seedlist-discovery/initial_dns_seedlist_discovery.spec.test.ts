import { expect } from 'chai';
import * as dns from 'dns';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { HostAddress, MongoClient } from '../../mongodb';

function makeTest(test, topology) {
  let client;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  it(test.comment, async function () {
    this.test.skipReason =
      'TODO(NODE-3757): These tests require specific environment setups, also the error cases need better assertions';
    return this.skip();
    if (topology === 'replica-set' && this.configuration.topologyType !== 'ReplicaSetWithPrimary') {
      return this.skip();
    }

    if (topology === 'sharded' && this.configuration.topologyType !== 'sharded') {
      return this.skip();
    }

    if (topology === 'load-balanced' && this.configuration.topologyType !== 'load-balanced') {
      return this.skip();
    }

    let thrownError;
    try {
      client = new MongoClient(test.uri, { serverSelectionTimeoutMS: 2000, tls: false });
      await client.connect();
    } catch (error) {
      thrownError = error;
    }

    if (test.error) {
      expect(thrownError).to.exist;
      return; // Nothing more to test...
    }

    const options = client.options;
    const hosts = Array.from(client.topology.s.description.servers.keys());

    expect(thrownError).to.not.exist;
    expect(options).to.exist;

    // Implicit SRV options must be set.
    expect(options.directConnection).to.be.false;
    const testOptions = test.options;
    if (testOptions && 'tls' in testOptions) {
      expect(options).to.have.property('tls', testOptions.tls);
    } else if (testOptions && 'ssl' in testOptions) {
      expect(options).to.have.property('tls', testOptions.ssl);
    } else {
      expect(options.tls).to.be.true;
    }
    if (testOptions && testOptions.replicaSet) {
      expect(options).to.have.property('replicaSet', testOptions.replicaSet);
    }
    if (testOptions && testOptions.authSource) {
      expect(options).to.have.property('credentials');
      expect(options.credentials.source).to.equal(testOptions.authSource);
    }
    if (testOptions && testOptions.loadBalanced) {
      expect(options).to.have.property('loadBalanced', testOptions.loadBalanced);
    }
    if (test.parsed_options && test.parsed_options.user && test.parsed_options.password) {
      expect(options.credentials.username).to.equal(test.parsed_options.user);
      expect(options.credentials.password).to.equal(test.parsed_options.password);
    }

    // srvMaxHost limiting happens in the topology constructor
    if (options.srvHost && test.comment.includes('srvMaxHosts')) {
      const initialSeedlist = hosts.map(h => h.toString());
      const selectedHosts = Array.from(topology.s.description.servers.keys());

      if (typeof test.numSeeds === 'number') {
        // numSeeds: the expected number of initial seeds discovered from the SRV record.
        expect(initialSeedlist).to.have.lengthOf(test.numSeeds);
      }
      if (typeof test.numHosts === 'number') {
        // numHosts: the expected number of hosts discovered once SDAM completes a scan.
        // (In our case, its the Topology constructor, but not actual SDAM)
        expect(selectedHosts).to.have.lengthOf(test.numHosts);
      }

      if (Array.isArray(test.seeds)) {
        // verify that the set of hosts in the client's initial seedlist
        // matches the list in seeds
        expect(initialSeedlist).to.deep.equal(test.seeds);
      }
      if (Array.isArray(test.hosts)) {
        // verify that the set of ServerDescriptions in the client's TopologyDescription
        // eventually matches the list in hosts
        const actualAddresses = await Promise.all(
          selectedHosts
            .map(async hn => await promisify(dns.lookup)(HostAddress.fromString(hn).host))
            .map(async (addr, i) => {
              let address = (await addr).address;
              address = address === '127.0.0.1' ? 'localhost' : address;
              return HostAddress.fromString(
                `${address}:${HostAddress.fromString(selectedHosts[i]).port}`
              ).toString();
            })
        );

        expect(actualAddresses).to.deep.equal(test.hosts);
      }
    }
  });
}

function readTestFilesFor(topology) {
  const specPath = path.join(__dirname, '../../spec', 'initial-dns-seedlist-discovery', topology);
  const testFiles = fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x => [x, fs.readFileSync(path.join(specPath, x), 'utf8')])
    .map(x => {
      const test = JSON.parse(x[1]);
      const fileName = path.basename(x[0], '.json');
      if (!test.comment) {
        test.comment = fileName;
      }
      return [fileName, test];
    });
  return testFiles;
}

/**
 * The tests in the replica-set directory MUST be executed against a three-node replica set on localhost ports 27017, 27018, and 27019 with replica set name repl0.
 * The tests in the load-balanced directory MUST be executed against a load-balanced sharded cluster with the mongos servers running on localhost ports 27017 and 27018 (corresponding to the script in drivers-evergreen-tools).
 * The load balancers, shard servers, and config servers may run on any open ports.
 * The tests in the sharded directory MUST be executed against a sharded cluster with the mongos servers running on localhost ports 27017 and 27018. Shard servers and config servers may run on any open ports.
 * In all cases, the clusters MUST be started with SSL enabled.
 * To run the tests that accompany this spec, you need to configure the SRV and TXT records with a real name server. The following records are required for these tests:
 */
describe('Initial DNS Seedlist Discovery', () => {
  for (const topology of ['replica-set', 'load-balanced', 'sharded']) {
    describe(topology, function () {
      const testFiles = readTestFilesFor(topology);
      for (const [, test] of testFiles) {
        makeTest(test, topology);
      }
    });
  }
});
