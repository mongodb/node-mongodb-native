'use strict';
const mock = require('../../tools/mongodb-mock/index');
const { ServerType } = require('../../../src/sdam/common');
const { Topology } = require('../../../src/sdam/topology');
const { Monitor } = require('../../../src/sdam/monitor');
const { expect } = require('chai');
const { ServerDescription } = require('../../../src/sdam/server_description');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { isHello } = require('../../../src/utils');

class MockServer {
  constructor(options) {
    this.s = { pool: { generation: 1 } };
    this.description = new ServerDescription(`${options.host}:${options.port}`);
    this.description.type = ServerType.Unknown;
  }
}

describe('monitoring', function () {
  let mockServer;

  after(() => mock.cleanup());
  beforeEach(function () {
    return mock.createServer().then(server => (mockServer = server));
  });

  // TODO: NODE-3819: Unskip flaky tests.
  it.skip('should record roundTripTime', function (done) {
    mockServer.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    // set `heartbeatFrequencyMS` to 250ms to force a quick monitoring check, and wait 500ms to validate below
    const topology = new Topology(mockServer.hostAddress(), { heartbeatFrequencyMS: 250 });
    topology.connect(err => {
      expect(err).to.not.exist;

      setTimeout(() => {
        expect(topology).property('description').property('servers').to.have.length(1);

        const serverDescription = Array.from(topology.description.servers.values())[0];
        expect(serverDescription).property('roundTripTime').to.be.greaterThan(0);

        topology.close(done);
      }, 500);
    });
  });

  // TODO(NODE-3600): Unskip flaky test
  it.skip('should recover on error during initial connect', function (done) {
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
      if (isHello(doc)) {
        request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    setTimeout(() => {
      acceptConnections = true;
    }, 250);

    const topology = new Topology(mockServer.hostAddress(), {});
    topology.connect(err => {
      expect(err).to.not.exist;
      expect(topology).property('description').property('servers').to.have.length(1);

      const serverDescription = Array.from(topology.description.servers.values())[0];
      expect(serverDescription).property('roundTripTime').to.be.greaterThan(0);

      topology.close(done);
    });
  });

  describe('Monitor', function () {
    it('should connect and issue an initial server check', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {});
      this.defer(() => monitor.close());

      monitor.on('serverHeartbeatFailed', () => done(new Error('unexpected heartbeat failure')));
      monitor.on('serverHeartbeatSucceeded', () => done());
      monitor.connect();
    });

    it('should ignore attempts to connect when not already closed', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
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

    it('should not initiate another check if one is in progress', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          setTimeout(() => request.reply(Object.assign({}, mock.HELLO)), 250);
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

    it('should not close the monitor on a failed heartbeat', function (done) {
      let helloCount = 0;
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          helloCount++;
          if (helloCount === 2) {
            request.reply({ ok: 0, errmsg: 'forced from mock server' });
            return;
          }

          if (helloCount === 3) {
            request.connection.destroy();
            return;
          }

          request.reply(mock.HELLO);
        }
      });

      const server = new MockServer(mockServer.address());
      server.description = new ServerDescription(server.description.hostAddress);
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

    it('should upgrade to hello from legacy hello when initial handshake contains helloOk', function (done) {
      const docs = [];
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        docs.push(doc);
        if (docs.length === 2) {
          expect(docs[0]).to.have.property(LEGACY_HELLO_COMMAND, true);
          expect(docs[0]).to.have.property('helloOk', true);
          expect(docs[1]).to.have.property('hello', true);
          done();
        } else if (isHello(doc)) {
          setTimeout(() => request.reply(Object.assign({ helloOk: true }, mock.HELLO)), 250);
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {});
      this.defer(() => monitor.close());
      monitor.connect();
      monitor.once('serverHeartbeatSucceeded', () => {
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
  });
});
