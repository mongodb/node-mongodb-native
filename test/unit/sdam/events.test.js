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
    metadata: { sessions: { skipLeakTests: true } },

    test(done) {
      // 0th event is triggered by the SRV resolution
      // 1st event is triggered by the single server contained in the record
      // more events would be triggered by more servers
      const topology = new Topology([], { srvHost: 'darmok.tanagra.com' });
      expect(topology.s.handleSrvPolling).to.be.a('function');

      let eventCount = 0;
      topology.on(Topology.TOPOLOGY_DESCRIPTION_CHANGED, ev => {
        expect(ev.topologyId).to.equal(1);
        expect(ev.newDescription.servers.size, 'next should have 1 server').to.equal(1);
        expect(
          ev.previousDescription.servers.size,
          `previous should have ${eventCount} servers`
        ).to.equal(eventCount);

        if (eventCount >= 1) {
          topology.close(() => done());
          // Testing >= 1 to allow done to be called
          // potentially more than once here catching erroneous events
          // done();
        }
        eventCount += 1;
      });

      topology.s.handleSrvPolling(new SrvPollingEvent([srvRecord('localhost', 27017)]));
    }
  });
});
