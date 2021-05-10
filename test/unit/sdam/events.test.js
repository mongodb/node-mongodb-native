'use strict';
const { Topology } = require('../../../src/sdam/topology');
const { SrvPollingEvent } = require('../../../src/sdam/srv_polling');
const { expect } = require('chai');

function srvRecord(host, port) {
  if (typeof host === 'string') {
    host = { host, port };
  }
  return {
    priority: 0,
    weight: 0,
    port: host.port,
    name: host.host
  };
}

describe('SDAM Events', function () {
  it('topologyDescriptionChanged events are emitted when receiving an SRV update', {
    // no sessions are created in the running of this test, yet the leak checker throws
    metadata: { sessions: { skipLeakTests: false } },

    test(done) {
      const topology = new Topology([], { srvHost: 'some.random.host' });
      expect(topology.s.handleSrvPolling).to.be.a('function');

      topology.once(Topology.TOPOLOGY_DESCRIPTION_CHANGED, ev => {
        expect(ev.topologyId).to.equal(1);
        expect(ev.newDescription.servers.size, 'next should have 1 server').to.equal(1);
        expect(ev.previousDescription.servers.size, `previous should have 0 servers`).to.equal(0);

        // if done is called more than once it will catch erroneous events
        topology.close({ force: true }, () => {
          // Since this topology was never connected (b/c unit test)
          // We need to do some extra manual clean up
          if (topology.s.srvPoller) {
            topology.s.srvPoller.stop();
          }

          expect(topology.s.servers.size).to.equal(1);
          const server = Array.from(topology.s.servers.values())[0];
          server.destroy({ force: true }, done);
        });
      });

      topology.s.handleSrvPolling(new SrvPollingEvent([srvRecord('nonexistentHost', 1)]));
    }
  });
});
