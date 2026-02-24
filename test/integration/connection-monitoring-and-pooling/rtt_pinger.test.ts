import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import {
  type Connection,
  LEGACY_HELLO_COMMAND,
  type MongoClient,
  type RTTPinger
} from '../../mongodb';
import { sleep } from '../../tools/utils';

/**
 * RTTPingers are only created after getting a hello from the server that defines topologyVersion
 * Each monitor is reaching out to a different node and rttPinger's are created async as a result.
 *
 * This function checks for rttPingers and sleeps if none are found.
 */
async function getRTTPingers(client: MongoClient) {
  type RTTPingerConnection = Omit<RTTPinger, 'connection'> & { connection: Connection };
  const pingers = (rtt => rtt?.connection != null) as (r?: RTTPinger) => r is RTTPingerConnection;

  if (!client.topology) expect.fail('Must provide a connected client');

  while (true) {
    const servers = client.topology.s.servers.values();
    const rttPingers = Array.from(servers, s => s.monitor?.rttPinger).filter(pingers);

    if (rttPingers.length !== 0) {
      return rttPingers;
    }

    await sleep(5);
  }
}

describe('class RTTPinger', () => {
  afterEach(() => sinon.restore());

  beforeEach(async function () {
    if (!this.currentTest) return;
    if (this.configuration.isLoadBalanced) {
      this.currentTest.skipReason = 'No monitoring in LB mode, test not relevant';
      return this.skip();
    }
    if (semver.gte('4.4.0', this.configuration.version)) {
      this.currentTest.skipReason =
        'Test requires streaming monitoring, needs to be on MongoDB 4.4+';
      return this.skip();
    }
  });

  context('when serverApi is enabled', () => {
    let serverApiClient: MongoClient;

    beforeEach(async function () {
      if (!this.currentTest) return;

      if (semver.gte('5.0.0', this.configuration.version)) {
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

  context('when serverApi is disabled', () => {
    let client: MongoClient;

    beforeEach(async function () {
      if (!this.currentTest) return;
      if (this.configuration.serverApi) {
        this.currentTest.skipReason = 'Test requires serverApi to NOT be enabled';
        return this.skip();
      }

      client = this.configuration.newClient({}, { heartbeatFrequencyMS: 10 });
    });

    afterEach(async () => {
      await client?.close();
    });

    context('connected to a pre-hello server', () => {
      it('measures rtt with a LEGACY_HELLO_COMMAND command', async function () {
        await client.connect();
        const rttPingers = await getRTTPingers(client);

        // Fake pre-hello server.
        // Hello was back-ported to feature versions of the server so we would need to pin
        // versions prior to 4.4.2, 4.2.10, 4.0.21, and 3.6.21 to integration test
        for (const rtt of rttPingers) rtt.connection.helloOk = false;

        const spies = rttPingers.map(rtt => sinon.spy(rtt.connection, 'command'));

        await sleep(11); // allow for another ping after spies have been made

        expect(spies).to.have.lengthOf.at.least(1);
        for (const spy of spies) {
          expect(spy).to.have.been.calledWith(
            sinon.match.any,
            { [LEGACY_HELLO_COMMAND]: 1 },
            sinon.match.any
          );
        }
      });
    });

    context('connected to a helloOk server', () => {
      it('measures rtt with a hello command', async function () {
        await client.connect();
        const rttPingers = await getRTTPingers(client);

        const spies = rttPingers.map(rtt => sinon.spy(rtt.connection, 'command'));

        // We should always be connected to helloOk servers
        for (const rtt of rttPingers) expect(rtt.connection).to.have.property('helloOk', true);

        await sleep(11); // allow for another ping after spies have been made

        expect(spies).to.have.lengthOf.at.least(1);
        for (const spy of spies) {
          expect(spy).to.have.been.calledWith(sinon.match.any, { hello: 1 }, sinon.match.any);
        }
      });
    });
  });

  context(`when the RTTPinger's hello command receives any error`, () => {
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
        sinon.stub(rtt.connection, 'command').rejects(new Error('any error'));
      }
      const spies = rttPingers.map(rtt => sinon.spy(rtt.connection, 'destroy'));

      await sleep(11); // allow for another ping after spies have been made

      expect(spies).to.have.lengthOf.at.least(1);
      for (const spy of spies) {
        expect(spy).to.have.been.calledOnce;
      }
    });
  });
});
