import { expect } from 'chai';

import { MongoClient } from '../../../src';

describe.only('SDAM should give electionId precedence', () => {
  let utilClient: MongoClient;
  beforeEach('setup test fail points', async function () {
    if (this.configuration.topologyType !== 'ReplicaSetWithPrimary') {
      this.currentTest.skipReason = 'Must run against a replica set';
      this.skip();
    }
    // Setup failpoints
    utilClient = this.configuration.newClient();
    await utilClient.connect();
    const hosts = Array.from(utilClient.topology.s.servers.entries());

    const primary = hosts.filter(([, server]) => server.s.description.type === 'RSPrimary')[0][0];
    expect(primary).to.exist;
    const secondaries = hosts.filter(([, server]) => server.s.description.type === 'RSSecondary');
    expect(secondaries).to.have.lengthOf.at.least(2);

    const primaryClient = this.configuration.newClient(
      { host: primary[0] },
      { directConnect: true }
    );

    const firstSecondaryClient = this.configuration.newClient(
      { host: primary[0] },
      { directConnect: true }
    );

    const secondSecondaryClient = this.configuration.newClient(
      { host: primary[0] },
      { directConnect: true }
    );

    utilClient.db('admin').command({
      configureFailPoint: '',
      mode: 'alwaysOn',
      data: ''
    });
  });

  it('test electionId precedence in the real world', () => {
    expect(true).to.be.false;
  });
});
