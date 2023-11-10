import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import { type MongoClient } from '../../mongodb';
import { sleep } from '../../tools/utils';

describe('class RTTPinger', () => {
  afterEach(() => sinon.restore());

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
      await sleep(1001); // rttPinger creation

      const rttPingers = Array.from(serverApiClient.topology?.s.servers.values() ?? [], s => {
        if (s.monitor?.rttPinger) return s.monitor?.rttPinger;
        else expect.fail('expected rttPinger to be defined');
      });

      await sleep(11); // rttPinger connection creation

      const spies = rttPingers.map(rtt => sinon.spy(rtt.connection!, 'command'));

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
      await sleep(1001); // rttPinger creation

      const rttPingers = Array.from(client.topology?.s.servers.values() ?? [], s => {
        if (s.monitor?.rttPinger) return s.monitor?.rttPinger;
        else expect.fail('expected rttPinger to be defined');
      });

      await sleep(11); // rttPinger connection creation

      for (const rtt of rttPingers)
        sinon.stub(rtt.connection!, 'command').yieldsRight(new Error('any'));

      const spies = rttPingers.map(rtt => sinon.spy(rtt.connection!, 'destroy'));

      await sleep(11); // allow for another ping after spies have been made

      expect(spies).to.have.lengthOf.at.least(1);
      for (const spy of spies) {
        expect(spy).to.have.been.called;
      }
    });
  });
});
