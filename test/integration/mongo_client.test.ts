import { expect } from 'chai';
import * as sinon from 'sinon';

import { MongoClient } from '../../src';

describe('MongoClient', () => {
  let client: MongoClient;
  let topologyOpenEvents;

  beforeEach(async function () {
    client = this.configuration.newClient();
    topologyOpenEvents = [];
    client.on('open', event => topologyOpenEvents.push(event));
  });

  afterEach(async function () {
    await client.close();
  });

  it('Concurrents client connect correctly locked (only one topology created)', async function () {
    await Promise.all([client.connect(), client.connect(), client.connect()]);

    expect(topologyOpenEvents).to.have.lengthOf(1);
    expect(client.topology?.isConnected()).to.be.true;
  });

  it('Failed client connect must properly release lock', async function () {
    const internalConnectStub = sinon.stub(client, '_connect' as keyof MongoClient);
    internalConnectStub.onFirstCall().rejects();

    // first call rejected to simulate a connection failure
    try {
      await client.connect();
    } catch (err) {
      expect(err).to.exist;
    }

    internalConnectStub.restore();

    // second call should connect
    try {
      await client.connect();
    } catch (err) {
      expect.fail(`client connect throwed unexpected error`);
    }

    expect(topologyOpenEvents).to.have.lengthOf(1);
    expect(client.topology?.isConnected()).to.be.true;
  });
});
