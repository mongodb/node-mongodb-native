'use strict';

const { clearTimeout } = require('timers');
const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const sinon = require('sinon');
const net = require('net');
const { MongoClient, MongoServerSelectionError, ReadPreference } = require('../../mongodb');
const { Topology } = require('../../mongodb');
const { Server } = require('../../mongodb');
const { ns, makeClientMetadata, isHello } = require('../../mongodb');
const { TopologyDescriptionChangedEvent } = require('../../mongodb');
const { TopologyDescription } = require('../../mongodb');
const { TopologyType } = require('../../mongodb');
const { SrvPoller, SrvPollingEvent } = require('../../mongodb');
const { getSymbolFrom } = require('../../tools/utils');
const { LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE } = require('../../mongodb');

describe('Topology (unit)', function () {
  let client, topology;

  afterEach(async () => {
    if (client) {
      await client.close();
    }

    if (topology) {
      topology.close({});
    }
  });

  describe('client metadata', function () {
    let mockServer;
    before(() => mock.createServer().then(server => (mockServer = server)));
    after(() => mock.cleanup());

    it('should correctly pass appname', function (done) {
      const server = new Topology([`localhost:27017`], {
        metadata: makeClientMetadata({
          appName: 'My application name',
          driverInfo: {}
        })
      });

      expect(server.clientMetadata.application.name).to.equal('My application name');
      done();
    });

    it('should report the correct platform in client metadata', async function () {
      const helloRequests = [];
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          helloRequests.push(doc);
          request.reply(mock.HELLO);
        } else {
          request.reply({ ok: 1 });
        }
      });

      client = new MongoClient(`mongodb://${mockServer.uri()}/`);

      await client.connect();

      await client.db().command({ ping: 1 });

      expect(helloRequests).to.have.length.greaterThan(1);
      for (const request of helloRequests) {
        expect(request)
          .nested.property('client.platform')
          .to.match(/Node.js /);
      }
    });
  });

  describe('black holes', function () {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

    it('should time out operations against servers that have been blackholed', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;

        let initialHelloSent = false;
        if (isHello(doc) && !initialHelloSent) {
          request.reply(mock.HELLO);
          initialHelloSent = true;
        } else {
          // black hole all other operations
        }
      });

      const topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', {}, (err, server) => {
          expect(err).to.not.exist;

          server.command(ns('admin.$cmd'), { ping: 1 }, { socketTimeoutMS: 250 }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.match(/timed out/);

            topology.close({}, done);
          });
        });
      });
    });
  });

  describe('error handling', function () {
    let mockServer;
    let secondMockServer;
    beforeEach(async () => {
      await mock.createServer().then(server => (mockServer = server));
      await mock.createServer().then(server => (secondMockServer = server));
    });
    afterEach(async () => {
      await mock.cleanup();
      sinon.restore();
    });

    context(
      'when server selection returns a server description but the description is not in the topology',
      function () {
        beforeEach(() => {
          mockServer.setMessageHandler(request => {
            const doc = request.document;
            if (isHello(doc)) {
              request.reply(Object.assign({}, mock.HELLO, { maxWireVersion: 9 }));
            } else {
              request.reply({ ok: 1 });
            }
          });
          secondMockServer.setMessageHandler(request => {
            const doc = request.document;
            if (isHello(doc)) {
              request.reply(Object.assign({}, mock.HELLO, { maxWireVersion: 9 }));
            } else {
              request.reply({ ok: 1 });
            }
          });
        });
        context('when the topology originally only contained one server', function () {
          it('returns a MongoServerSelectionError', function (done) {
            topology = new Topology([mockServer.hostAddress(), secondMockServer.hostAddress()]);

            topology.connect(err => {
              expect(err).to.not.exist;
              sinon.stub(topology.s.servers, 'get').callsFake(() => {
                return undefined;
              });
              topology.selectServer('primary', {}, (err, server) => {
                expect(err).to.be.instanceOf(MongoServerSelectionError);
                expect(server).not.to.exist;
                done();
              });
            });
          });
        });
        context('when the topology originally contained more than one server', function () {
          it('returns a MongoServerSelectionError', function (done) {
            topology = new Topology([mockServer.hostAddress(), secondMockServer.hostAddress()]);

            topology.connect(err => {
              expect(err).to.not.exist;
              sinon.stub(topology.s.servers, 'get').callsFake(() => {
                return undefined;
              });
              topology.selectServer('primary', {}, (err, server) => {
                expect(err).to.be.instanceOf(MongoServerSelectionError);
                expect(server).not.to.exist;
                done();
              });
            });
          });
        });
      }
    );

    it('should set server to unknown and reset pool on `node is recovering` error', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.reply({ ok: 0, message: 'node is recovering', code: 11600 });
        } else {
          request.reply({ ok: 1 });
        }
      });

      topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', {}, (err, server) => {
          expect(err).to.not.exist;

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command(ns('test.test'), { insert: { a: 42 } }, {}, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.true;
            done();
          });
        });
      });
    });

    it('should set server to unknown and NOT reset pool on stepdown errors', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.reply({ ok: 0, message: LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE.source });
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', {}, (err, server) => {
          expect(err).to.not.exist;

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command(ns('test.test'), { insert: { a: 42 } }, {}, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.false;
            topology.close({}, done);
          });
        });
      });
    });

    it('should set server to unknown on non-timeout network error', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.connection.destroy();
        } else {
          request.reply({ ok: 1 });
        }
      });

      topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', {}, (err, server) => {
          expect(err).to.not.exist;

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          server.command(ns('test.test'), { insert: { a: 42 } }, {}, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(server.description.type).to.equal('Unknown');
            done();
          });
        });
      });
    });

    it('should encounter a server selection timeout on garbled server responses', function (done) {
      const server = net.createServer();
      const p = Promise.resolve();
      let unexpectedError, expectedError;
      server.listen(0, 'localhost', 2, () => {
        server.on('connection', c => c.on('data', () => c.write('garbage_data')));
        const { address, port } = server.address();
        const client = new MongoClient(`mongodb://${address}:${port}`, {
          serverSelectionTimeoutMS: 1000
        });
        p.then(() =>
          client
            .connect()
            .then(() => {
              unexpectedError = new Error('Expected a server selection error but got none');
            })
            .catch(error => {
              expectedError = error;
            })
            .then(() => {
              server.close();
              return client.close(err => {
                if (!unexpectedError) {
                  unexpectedError = err;
                }
              });
            })
            .finally(() => {
              if (unexpectedError) {
                return done(unexpectedError);
              }
              if (expectedError) {
                return done();
              }
            })
        );
      });
    });

    describe('srv event listeners', function () {
      /** @type {Topology} */
      let topology;

      beforeEach(() => {
        topology = new Topology('', { srvHost: 'fakeHost' });

        expect(topology.s.detectSrvRecords).to.be.a('function');
        expect(topology.s.detectShardedTopology).to.be.a('function');
      });

      afterEach(() => {
        // The srv event starts a monitor that we need to clean up
        for (const [, server] of topology.s.servers) {
          const kMonitor = getSymbolFrom(server, 'monitor');
          const kMonitorId = getSymbolFrom(server[kMonitor], 'monitorId');
          server[kMonitor][kMonitorId].stop();
        }
      });

      function transitionTopology(topology, from, to) {
        topology.emit(
          Topology.TOPOLOGY_DESCRIPTION_CHANGED,
          new TopologyDescriptionChangedEvent(
            2,
            new TopologyDescription(from),
            new TopologyDescription(to)
          )
        );
        // We don't want the SrvPoller to actually run
        clearTimeout(topology.s.srvPoller._timeout);
      }

      describe('srvRecordDiscovery event listener', function () {
        beforeEach(() => {
          // fake a transition to Sharded
          transitionTopology(topology, TopologyType.Unknown, TopologyType.Sharded);
          expect(topology.s.srvPoller).to.be.instanceOf(SrvPoller);

          const srvPollerListeners = topology.s.srvPoller.listeners(SrvPoller.SRV_RECORD_DISCOVERY);
          expect(srvPollerListeners).to.have.lengthOf(1);
          expect(srvPollerListeners[0]).to.equal(topology.s.detectSrvRecords);
          const topologyChangeListeners = topology.listeners(Topology.TOPOLOGY_DESCRIPTION_CHANGED);
          expect(topologyChangeListeners).to.have.lengthOf(1);
          expect(topologyChangeListeners[0]).to.equal(topology.s.detectShardedTopology);
        });

        it('should emit topologyDescriptionChange event', function () {
          topology.once(Topology.TOPOLOGY_DESCRIPTION_CHANGED, ev => {
            // The first event we get here is caused by the srv record discovery event below
            expect(ev).to.have.nested.property('newDescription.servers');
            expect(ev.newDescription.servers.get('fake:2'))
              .to.be.a('object')
              .with.property('address', 'fake:2');
          });

          topology.s.srvPoller.emit(
            SrvPoller.SRV_RECORD_DISCOVERY,
            new SrvPollingEvent([{ priority: 1, weight: 1, port: 2, name: 'fake' }])
          );
        });

        it('should clean up listeners on close', function (done) {
          topology.s.state = 'connected'; // fake state to test clean up logic
          topology.close({}, e => {
            const srvPollerListeners = topology.s.srvPoller.listeners(
              SrvPoller.SRV_RECORD_DISCOVERY
            );
            expect(srvPollerListeners).to.have.lengthOf(0);
            const topologyChangeListeners = topology.listeners(
              Topology.TOPOLOGY_DESCRIPTION_CHANGED
            );
            expect(topologyChangeListeners).to.have.lengthOf(0);
            done(e);
          });
        });
      });

      describe('topologyDescriptionChange event listener', function () {
        it('should not add more than one srvRecordDiscovery listener', function () {
          // fake a transition to Sharded
          transitionTopology(topology, TopologyType.Unknown, TopologyType.Sharded); // Transition 1

          const srvListenersFirstTransition = topology.s.srvPoller.listeners(
            SrvPoller.SRV_RECORD_DISCOVERY
          );
          expect(srvListenersFirstTransition).to.have.lengthOf(1);

          transitionTopology(topology, TopologyType.Unknown, TopologyType.Sharded); // Transition 2

          const srvListenersSecondTransition = topology.s.srvPoller.listeners(
            SrvPoller.SRV_RECORD_DISCOVERY
          );
          expect(srvListenersSecondTransition).to.have.lengthOf(1);
        });

        it('should not add srvRecordDiscovery listener if transition is not to Sharded topology', function () {
          // fake a transition to **NOT** Sharded
          transitionTopology(topology, TopologyType.Unknown, TopologyType.ReplicaSetWithPrimary);

          const srvListeners = topology.s.srvPoller.listeners(SrvPoller.SRV_RECORD_DISCOVERY);
          expect(srvListeners).to.have.lengthOf(0);
        });
      });
    });
  });

  describe('selectServer()', function () {
    beforeEach(function () {
      this.sinon = sinon.createSandbox();
    });

    afterEach(function () {
      this.sinon.restore();
    });

    it('should schedule monitoring if no suitable server is found', function (done) {
      const topology = new Topology('someserver:27019');
      const requestCheck = this.sinon.stub(Server.prototype, 'requestCheck');

      // satisfy the initial connect, then restore the original method
      const selectServer = this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function (selector, options, callback) {
          const server = Array.from(this.s.servers.values())[0];
          selectServer.restore();
          callback(null, server);
        });

      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.connect(() => {
        topology.selectServer(ReadPreference.secondary, { serverSelectionTimeoutMS: 1000 }, err => {
          expect(err).to.exist;
          expect(err).to.match(/Server selection timed out/);
          expect(err).to.have.property('reason');

          // When server is created `connect` is called on the monitor. When server selection
          // occurs `requestCheck` will be called for an immediate check.
          expect(requestCheck).property('callCount').to.equal(1);

          topology.close({}, done);
        });
      });
    });

    it('should disallow selection when the topology is explicitly closed', function (done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.close({}, () => {
        topology.selectServer(ReadPreference.primary, { serverSelectionTimeoutMS: 2000 }, err => {
          expect(err).to.exist;
          expect(err).to.match(/Topology is closed/);
          done();
        });
      });
    });

    describe('waitQueue', function () {
      it('should process all wait queue members, including selection with errors', function (done) {
        const topology = new Topology('someserver:27019');
        const selectServer = this.sinon
          .stub(Topology.prototype, 'selectServer')
          .callsFake(function (selector, options, callback) {
            const server = Array.from(this.s.servers.values())[0];
            selectServer.restore();
            callback(null, server);
          });

        this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
          this.s.state = 'connected';
          this.emit('connect');
        });

        const toSelect = 10;
        let completed = 0;
        function finish() {
          completed++;
          if (completed === toSelect) done();
        }

        // methodology:
        //   - perform 9 server selections, a few with a selector that throws an error
        //   - ensure each selection immediately returns an empty result (gated by a boolean)
        //     guaranteeing tha the queue will be full before the last selection
        //   - make one last selection, but ensure that all selections are no longer blocked from
        //     returning their value
        //   - verify that 10 callbacks were called

        topology.connect(err => {
          expect(err).to.not.exist;

          let preventSelection = true;
          const anySelector = td => {
            if (preventSelection) return [];
            const server = Array.from(td.servers.values())[0];
            return [server];
          };

          const failingSelector = () => {
            if (preventSelection) return [];
            throw new TypeError('bad news!');
          };

          preventSelection = true;
          for (let i = 0; i < toSelect - 1; ++i) {
            topology.selectServer(i % 5 === 0 ? failingSelector : anySelector, {}, finish);
          }

          preventSelection = false;
          topology.selectServer(anySelector, {}, finish);
        });
      });
    });
  });
});
