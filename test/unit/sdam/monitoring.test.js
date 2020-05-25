'use strict';
const mock = require('mongodb-mock-server');
const { ServerType } = require('../../../src/sdam/common');
const { Topology } = require('../../../src/sdam/topology');
const { Monitor } = require('../../../src/sdam/monitor');
const { expect } = require('chai');

class MockServer {
  constructor(options) {
    this.s = {};
    this.description = {
      type: ServerType.Unknown,
      address: `${options.host}:${options.port}`
    };
  }
}

describe('monitoring', function() {
  let mockServer;

  after(() => mock.cleanup());
  beforeEach(function() {
    return mock.createServer().then(server => (mockServer = server));
  });

  it('should record roundTripTime', function(done) {
    mockServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    // set `heartbeatFrequencyMS` to 250ms to force a quick monitoring check, and wait 500ms to validate below
    const topology = new Topology(mockServer.uri(), { heartbeatFrequencyMS: 250 });
    topology.connect(err => {
      expect(err).to.not.exist;

      setTimeout(() => {
        expect(topology)
          .property('description')
          .property('servers')
          .to.have.length(1);

        const serverDescription = Array.from(topology.description.servers.values())[0];
        expect(serverDescription)
          .property('roundTripTime')
          .to.be.greaterThan(0);

        topology.close(done);
      }, 500);
    });
  });

  it('should recover on error during initial connect', function(done) {
    // This test should take ~1s because initial server selection fails and an immediate check
    // is requested. If the behavior of the immediate check is broken, the test will take ~10s
    // to complete. We want to ensure validation of the immediate check behavior, and therefore
    // hardcode the test timeout to 2s.
    this.timeout(2000);

    let acceptConnections = false;
    mockServer.setMessageHandler(request => {
      if (!acceptConnections) {
        request.connection.destroy();
        return;
      }

      const doc = request.document;
      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    setTimeout(() => {
      acceptConnections = true;
    }, 250);

    const topology = new Topology(mockServer.uri());
    topology.connect(err => {
      expect(err).to.not.exist;
      expect(topology)
        .property('description')
        .property('servers')
        .to.have.length(1);

      const serverDescription = Array.from(topology.description.servers.values())[0];
      expect(serverDescription)
        .property('roundTripTime')
        .to.be.greaterThan(0);

      topology.close(done);
    });
  });

  describe('Monitor', function() {
    it('should connect and issue an initial server check', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {});
      this.defer(() => monitor.close());

      monitor.on('serverHeartbeatFailed', () => done(new Error('unexpected heartbeat failure')));
      monitor.on('serverHeartbeatSucceeded', () => done());
      monitor.connect();
    });

    it('should ignore attempts to connect when not already closed', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {});
      this.defer(() => monitor.close());

      monitor.on('serverHeartbeatFailed', () => done(new Error('unexpected heartbeat failure')));
      monitor.on('serverHeartbeatSucceeded', () => done());
      monitor.connect();
      monitor.connect();
    });

    it('should not initiate another check if one is in progress', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          setTimeout(() => request.reply(Object.assign({}, mock.DEFAULT_ISMASTER)), 250);
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {});

      const startedEvents = [];
      monitor.on('serverHeartbeatStarted', event => startedEvents.push(event));
      monitor.on('close', () => {
        expect(startedEvents).to.have.length(2);
        done();
      });

      monitor.connect();
      monitor.once('serverHeartbeatSucceeded', () => {
        monitor.requestCheck();
        monitor.requestCheck();
        monitor.requestCheck();
        monitor.requestCheck();
        monitor.requestCheck();

        const minHeartbeatFrequencyMS = 500;
        setTimeout(() => {
          // wait for minHeartbeatFrequencyMS, then request a check and verify another check occurred
          monitor.once('serverHeartbeatSucceeded', () => {
            monitor.close();
          });

          monitor.requestCheck();
        }, minHeartbeatFrequencyMS);
      });
    });

    it('should not close the monitor on a failed heartbeat', function(done) {
      let isMasterCount = 0;
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          isMasterCount++;
          if (isMasterCount === 2) {
            request.reply({ ok: 0, errmsg: 'forced from mock server' });
            return;
          }

          if (isMasterCount === 3) {
            request.connection.destroy();
            return;
          }

          request.reply(mock.DEFAULT_ISMASTER_36);
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {
        heartbeatFrequencyMS: 250,
        minHeartbeatFrequencyMS: 50
      });

      const events = [];
      monitor.on('serverHeartbeatFailed', event => events.push(event));

      let successCount = 0;
      monitor.on('serverHeartbeatSucceeded', () => {
        if (successCount++ === 2) {
          monitor.close();
        }
      });

      monitor.on('close', () => {
        expect(events).to.have.length(2);
        done();
      });

      monitor.connect();
    });
  });
});
