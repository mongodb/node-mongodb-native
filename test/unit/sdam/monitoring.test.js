'use strict';
const mock = require('mongodb-mock-server');
const BSON = require('bson');
const { ServerType } = require('../../../lib/sdam/common');
const { Topology } = require('../../../lib/sdam/topology');
const { Monitor } = require('../../../lib/sdam/monitor');
const { expect } = require('chai');

class MockServer {
  constructor(options) {
    this.s = {
      bson: new BSON()
    };

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

    it('should signal to reset the connection pool after first failed heartbeat', function(done) {
      let isMasterCount = 0;
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          isMasterCount++;
          request.reply(
            isMasterCount === 2
              ? { ok: 0, errmsg: 'forced from mock server' }
              : mock.DEFAULT_ISMASTER_36
          );
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {
        heartbeatFrequencyMS: 250,
        minHeartbeatFrequencyMS: 50
      });
      this.defer(() => monitor.close());

      let resetRequested = false;
      monitor.on('serverHeartbeatFailed', () => {
        if (resetRequested) {
          done(new Error('unexpected heartbeat failure'));
        }
      });

      monitor.on('resetConnectionPool', () => (resetRequested = true));
      monitor.on('serverHeartbeatSucceeded', () => {
        if (server.description.type === ServerType.Unknown) {
          // this is the first successful heartbeat, set the server type
          server.description.type = ServerType.Standalone;
          return;
        }

        // otherwise, this is the second heartbeat success and we should verify
        // a reset was requested
        expect(resetRequested).to.be.true;
        done();
      });

      monitor.connect();
    });

    it('should report the most recent error on second monitoring failure', function(done) {
      let failedCount = 0;
      let initialConnectCompleted = false;
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          if (!initialConnectCompleted) {
            request.reply(mock.DEFAULT_ISMASTER_36);
            initialConnectCompleted = true;
            return;
          }

          if (failedCount === 0) {
            failedCount++;
            request.reply({ ok: 0, errmsg: 'first error message' });
          } else if (failedCount === 1) {
            failedCount++;
            request.reply({ ok: 0, errmsg: 'second error message' });
          } else {
            request.reply(mock.DEFAULT_ISMASTER_36);
          }
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {
        heartbeatFrequencyMS: 250,
        minHeartbeatFrequencyMS: 50
      });
      this.defer(() => monitor.close());

      let resetRequested = false;
      monitor.on('resetConnectionPool', () => (resetRequested = true));
      monitor.once('serverHeartbeatSucceeded', () => {
        // this is the first successful heartbeat, set the server type
        server.description.type = ServerType.Standalone;

        let failureCount = 0;
        monitor.on('serverHeartbeatFailed', event => {
          failureCount++;
          if (failureCount === 2) {
            expect(resetRequested).to.be.true;
            expect(event)
              .property('failure')
              .to.match(/second error message/);
            done();
          }
        });
      });

      monitor.connect();
    });

    it('should report events in the correct order during monitoring failure', function(done) {
      let failedCount = 0;
      let initialConnectCompleted = false;
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          if (!initialConnectCompleted) {
            request.reply(mock.DEFAULT_ISMASTER_36);
            initialConnectCompleted = true;
            return;
          }

          if (failedCount === 0) {
            failedCount++;
            request.reply({ ok: 0, errmsg: 'first error message' });
          } else {
            failedCount++;
            request.reply({ ok: 0, errmsg: 'second error message' });
          }
        }
      });

      const server = new MockServer(mockServer.address());
      const monitor = new Monitor(server, {
        heartbeatFrequencyMS: 250,
        minHeartbeatFrequencyMS: 50
      });
      this.defer(() => monitor.close());

      let poolResetRequested = false;
      let serverResetRequested = false;
      monitor.on('resetConnectionPool', () => (poolResetRequested = true));
      monitor.on('resetServer', () => (serverResetRequested = true));

      const events = [];
      monitor.once('serverHeartbeatSucceeded', () => {
        // this is the first successful heartbeat, set the server type
        server.description.type = ServerType.Standalone;

        monitor.on('serverHeartbeatStarted', event => events.push(event));
        monitor.on('serverHeartbeatFailed', event => events.push(event));
        monitor.once('resetServer', err => {
          expect(poolResetRequested).to.be.true;
          expect(serverResetRequested).to.be.true;
          expect(events.map(e => e.constructor.name)).to.eql([
            'ServerHeartbeatStartedEvent',
            'ServerHeartbeatFailedEvent',
            'ServerHeartbeatStartedEvent',
            'ServerHeartbeatFailedEvent'
          ]);

          expect(events[1])
            .property('failure')
            .to.match(/first error message/);
          expect(events[3])
            .property('failure')
            .to.match(/second error message/);
          expect(events[3])
            .property('failure')
            .to.eql(err);

          done();
        });
      });

      monitor.connect();
    });
  });
});
