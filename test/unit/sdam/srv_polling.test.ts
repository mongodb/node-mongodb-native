import { expect } from 'chai';
import * as dns from 'dns';
import { EventEmitter, once } from 'events';
import * as sinon from 'sinon';
import { clearTimeout } from 'timers';

import {
  MongoDriverError,
  SrvPoller,
  SrvPollingEvent,
  TopologyDescription,
  TopologyDescriptionChangedEvent,
  TopologyType
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('Mongos SRV Polling', function () {
  const SRV_HOST = 'darmok.tanagra.com';

  function srvRecord(mockServer, port?: number) {
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

  function stubDns(err: Error | null, records?: dns.SrvRecord[]) {
    if (err) {
      sinon.stub(dns.promises, 'resolveSrv').rejects(err);
    } else {
      sinon.stub(dns.promises, 'resolveSrv').resolves(records);
    }
  }

  afterEach(function () {
    sinon.restore();
  });

  describe('SrvPoller', function () {
    function stubPoller(poller) {
      sinon.stub(poller, 'success');
      sinon.stub(poller, 'failure');
    }

    it('should always return a valid value for `intervalMS`', function () {
      const poller = new SrvPoller({ srvHost: SRV_HOST });
      expect(poller).property('intervalMS').to.equal(60000);
    });

    describe('success', function () {
      it('should emit event, disable haMode, and schedule another poll', async function () {
        const records = [srvRecord('jalad.tanagra.com'), srvRecord('thebeast.tanagra.com')];
        const poller = new SrvPoller({ srvHost: SRV_HOST, heartbeatFrequencyMS: 100 });

        const willBeDiscovery = once(poller, 'srvRecordDiscovery');

        sinon.stub(poller, 'schedule');

        poller.haMode = true;
        expect(poller).to.have.property('haMode', true);
        poller.success(records);

        const [e] = await willBeDiscovery;
        expect(e)
          .to.be.an.instanceOf(SrvPollingEvent)
          .and.to.have.property('srvRecords')
          .that.deep.equals(records);
        expect(poller.schedule).to.have.been.calledOnce;
        expect(poller).to.have.property('haMode', false);
      });
    });

    describe('failure', function () {
      it('should enable haMode and schedule', async () => {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        sinon.stub(poller, 'schedule');
        poller.failure('Some kind of failure');

        expect(poller.schedule).to.have.been.calledOnce;
        expect(poller).to.have.property('haMode', true);
      });
    });

    describe('poll', function () {
      it('should throw if srvHost is not passed in', function () {
        expect(() => new SrvPoller()).to.throw(MongoDriverError);
        expect(() => new SrvPoller({})).to.throw(MongoDriverError);
      });

      it('should poll dns srv records', async function () {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        sinon.stub(dns.promises, 'resolveSrv').resolves([srvRecord('iLoveJavascript.lots')]);

        await poller._poll();

        clearTimeout(poller._timeout);

        expect(dns.promises.resolveSrv).to.have.been.calledOnce.and.to.have.been.calledWith(
          `_mongodb._tcp.${SRV_HOST}`
        );
      });

      it('should not succeed or fail if poller was stopped', async function () {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        stubDns(null, []);
        stubPoller(poller);

        const pollerPromise = poller._poll();
        poller.generation += 1;
        await pollerPromise;

        expect(poller.success).to.not.have.been.called;
        expect(poller.failure).to.not.have.been.called;
      });

      it('should fail if dns returns error', async () => {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        stubDns(new Error('Some Error'));
        stubPoller(poller);

        await poller._poll();

        expect(poller.success).to.not.have.been.called;
        expect(poller.failure).to.have.been.calledOnce;
      });

      it('should fail if dns returns no records', async () => {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        stubDns(null, []);
        stubPoller(poller);

        await poller._poll();

        expect(poller.success).to.not.have.been.called;
        expect(poller.failure).to.have.been.calledOnce;
      });

      it('should fail if dns returns no records that match parent domain', async () => {
        const poller = new SrvPoller({ srvHost: SRV_HOST });
        const records = [srvRecord('jalad.tanagra.org'), srvRecord('shaka.walls.com')];

        stubDns(null, records);
        stubPoller(poller);

        await poller._poll();

        expect(poller.success).to.not.have.been.called;
        expect(poller.failure).to.have.been.calledOnce;
      });

      it('should succeed when valid records are returned by dns', async () => {
        const poller = new SrvPoller({ srvHost: SRV_HOST });
        const records = [srvRecord('jalad.tanagra.com'), srvRecord('thebeast.tanagra.com')];

        stubDns(null, records);
        stubPoller(poller);

        await poller._poll();

        expect(poller.success).to.have.been.calledOnce.and.calledWithMatch(records);
        expect(poller.failure).to.not.have.been.called;
      });

      it('should succeed when some valid records are returned and some do not match parent domain', async () => {
        const poller = new SrvPoller({ srvHost: SRV_HOST });
        const records = [srvRecord('jalad.tanagra.com'), srvRecord('thebeast.walls.com')];

        stubDns(null, records);
        stubPoller(poller);

        await poller._poll();

        expect(poller.success).to.have.been.calledOnce.and.calledWithMatch([records[0]]);
        expect(poller.failure).to.not.have.been.called;
      });
    });
  });

  describe('topology', function () {
    class FakeSrvPoller extends EventEmitter {
      constructor() {
        super();
        this.on('error', () => null);
      }
      start() {
        // ignore
      }
      stop() {
        // ignore
      }
      trigger(srvRecords) {
        this.emit('srvRecordDiscovery', new SrvPollingEvent(srvRecords));
      }
    }

    it('should not make an srv poller if there is no srv host', function () {
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });

      const topology = topologyWithPlaceholderClient(['localhost:27017', 'localhost:27018'], {
        srvPoller
      });

      expect(topology).to.not.have.property('srvPoller');
    });

    it('should make an srvPoller if there is an srvHost', function () {
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });

      const topology = topologyWithPlaceholderClient(['localhost:27017', 'localhost:27018'], {
        srvHost: SRV_HOST,
        srvPoller
      });

      expect(topology.s).to.have.property('srvPoller').that.equals(srvPoller);
    });

    it('should only start polling if topology description changes to sharded', function () {
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });
      sinon.stub(srvPoller, 'start');

      const topology = topologyWithPlaceholderClient(['localhost:27017', 'localhost:27018'], {
        srvHost: SRV_HOST,
        srvPoller
      });

      const topologyDescriptions = [
        new TopologyDescription(TopologyType.Unknown),
        new TopologyDescription(TopologyType.Unknown),
        new TopologyDescription(TopologyType.Sharded),
        new TopologyDescription(TopologyType.Sharded)
      ];

      function emit(prev, current) {
        topology.emit(
          'topologyDescriptionChanged',
          new TopologyDescriptionChangedEvent(topology.s.id, prev, current)
        );
      }

      expect(srvPoller.start).to.not.have.been.called;
      emit(topologyDescriptions[0], topologyDescriptions[1]);
      expect(srvPoller.start).to.not.have.been.called;
      emit(topologyDescriptions[1], topologyDescriptions[2]);
      expect(srvPoller.start).to.have.been.calledOnce;
      emit(topologyDescriptions[2], topologyDescriptions[3]);
      expect(srvPoller.start).to.have.been.calledOnce;
    });
  });
});
