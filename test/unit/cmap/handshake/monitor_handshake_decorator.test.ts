import { expect } from 'chai';

import { LEGACY_HELLO_COMMAND, Long, MonitorHandshakeDecorator, ObjectId } from '../../../mongodb';

describe('MonitorHandshakeDecorator', function () {
  const monitorOptions = {
    heartbeatFrequencyMS: 1000,
    connectTimeoutMS: 2000,
    minHeartbeatFrequencyMS: 500
  };

  describe('#constructor', function () {
    const topologyVersion = {
      processId: new ObjectId(),
      counter: Long.fromNumber(5)
    };
    const decorator = new MonitorHandshakeDecorator(monitorOptions, topologyVersion, false);

    it('sets the monitor options', function () {
      expect(decorator.monitorOptions).to.equal(monitorOptions);
    });

    it('sets the topology version', function () {
      expect(decorator.topologyVersion).to.equal(topologyVersion);
    });
  });

  describe('#generate', function () {
    context('when a topology version exists', function () {
      const topologyVersion = {
        processId: new ObjectId(),
        counter: Long.fromNumber(5)
      };
      const decorator = new MonitorHandshakeDecorator(monitorOptions, topologyVersion, false);

      it('add maxAwaitTimeMS and topologyVersion to the handshake', async function () {
        const handshake = await decorator.decorate({});
        expect(handshake).to.deep.equal({
          [LEGACY_HELLO_COMMAND]: 1,
          maxAwaitTimeMS: monitorOptions.heartbeatFrequencyMS,
          topologyVersion: topologyVersion,
          helloOk: true
        });
      });
    });

    context('when a topology version does not exist', function () {
      const decorator = new MonitorHandshakeDecorator(monitorOptions, null, false);

      it('returns the handshake with a legacy hello', async function () {
        const handshake = await decorator.decorate({});
        expect(handshake).to.deep.equal({ [LEGACY_HELLO_COMMAND]: 1, helloOk: true });
      });
    });

    context('when the server response contains helloOk: true', function () {
      const decorator = new MonitorHandshakeDecorator(monitorOptions, null, true);

      it('uses the hello command in the handshake', async function () {
        const handshake = await decorator.decorate({});
        expect(handshake).to.deep.equal({ hello: 1, helloOk: true });
      });
    });
  });
});
