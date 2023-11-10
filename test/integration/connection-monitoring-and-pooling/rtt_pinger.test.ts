import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import { type Connection, type MongoClient, type RTTPinger } from '../../mongodb';
import { sleep } from '../../tools/utils';

/**
 * RTTPinger creation depends on getting a response to the monitor's initial hello
 * and that hello containing a topologyVersion.
 * Subsequently the rttPinger creates its connection asynchronously
 *
 * I just went with a sleepy loop, until we have what we need, One could also use SDAM events in a clever way perhaps?
 */
async function getRTTPingers(client: MongoClient) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rttPingers = Array.from(client.topology?.s.servers.values() ?? [], s => {
      if (s.monitor?.rttPinger?.connection != null) return s.monitor?.rttPinger;
      else null;
    }).filter(rtt => rtt != null);

    if (rttPingers.length !== 0) {
      return rttPingers as (Omit<RTTPinger, 'connection'> & { connection: Connection })[];
    }

    await sleep(5);
  }
}

describe('class RTTPinger', () => {
  afterEach(() => sinon.restore());

  beforeEach(async function () {
    if (this.configuration.isLoadBalanced) {
      if (this.currentTest)
        this.currentTest.skipReason = 'No monitoring in LB mode, test not relevant';
      return this.skip();
    }
    if (semver.gte('4.4.0', this.configuration.version)) {
      if (this.currentTest)
        this.currentTest.skipReason =
          'Test requires streaming monitoring, needs to be on MongoDB 4.4+';
      return this.skip();
    }
  });

  context('when serverApi is enabled', () => {
    let serverApiClient: MongoClient;
    beforeEach(async function () {
      if (semver.gte('5.0.0', this.configuration.version)) {
        if (this.currentTest)
          this.currentTest.skipReason = 'Test requires serverApi, needs to be on MongoDB 5.0+';
        return this.skip();
      }

      serverApiClient = this.configuration.newClient(
        {},
        { serverApi: { version: '1', strict: true }, heartbeatFrequencyMS: 10 }
      );
    });

    afterEach(async () => {
      await serverApiClient?.close();
    });

    it('measures rtt with a hello command', async function () {
      await serverApiClient.connect();
      const rttPingers = await getRTTPingers(serverApiClient);

      const spies = rttPingers.map(rtt => sinon.spy(rtt.connection, 'command'));

      await sleep(11); // allow for another ping after spies have been made

      expect(spies).to.have.lengthOf.at.least(1);
      for (const spy of spies) {
        expect(spy).to.have.been.calledWith(sinon.match.any, { hello: 1 }, sinon.match.any);
      }
    });
  });

  context('when rtt hello receives an error', () => {
    let client: MongoClient;
    beforeEach(async function () {
      client = this.configuration.newClient({}, { heartbeatFrequencyMS: 10 });
    });

    afterEach(async () => {
      await client?.close();
    });

    it('destroys the connection', async function () {
      await client.connect();
      const rttPingers = await getRTTPingers(client);

      for (const rtt of rttPingers) {
        sinon.stub(rtt.connection, 'command').yieldsRight(new Error('any'));
      }
      const spies = rttPingers.map(rtt => sinon.spy(rtt.connection, 'destroy'));

      await sleep(11); // allow for another ping after spies have been made

      expect(spies).to.have.lengthOf.at.least(1);
      for (const spy of spies) {
        expect(spy).to.have.been.called;
      }
    });
  });
});
