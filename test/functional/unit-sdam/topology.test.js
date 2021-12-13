'use strict';

const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const sinon = require('sinon');
const { Topology } = require('../../../src/sdam/topology');
const { Server } = require('../../../src/sdam/server');
const { ServerDescription } = require('../../../src/sdam/server_description');
const { ns, makeClientMetadata, isHello } = require('../../../src/utils');
const { TopologyDescriptionChangedEvent } = require('../../../src/sdam/events');
const { TopologyDescription } = require('../../../src/sdam/topology_description');
const { TopologyType } = require('../../../src/sdam/common');
const { SrvPoller, SrvPollingEvent } = require('../../../src/sdam/srv_polling');
const { getSymbolFrom } = require('../../tools/utils');

describe('Topology (unit)', function () {
  describe('client metadata', function () {
    let mockServer;
    before(() => mock.createServer().then(server => (mockServer = server)));
    after(() => mock.cleanup());

    it('should correctly pass appname', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        // Attempt to connect
        var server = new Topology([`${this.configuration.host}:${this.configuration.port}`], {
          metadata: makeClientMetadata({
            appName: 'My application name'
          })
        });

        expect(server.clientMetadata.application.name).to.equal('My application name');
        done();
      }
    });

    it('should report the correct platform in client metadata', function (done) {
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

      const client = this.configuration.newClient(`mongodb://${mockServer.uri()}/`);
      client.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        client.db().command({ ping: 1 }, err => {
          expect(err).to.not.exist;

          expect(helloRequests).to.have.length.greaterThan(1);
          helloRequests.forEach(helloRequest =>
            expect(helloRequest)
              .nested.property('client.platform')
              .to.match(/unified/)
          );

          done();
        });
      });
    });
  });

  describe('shouldCheckForSessionSupport', function () {
    beforeEach(function () {
      this.sinon = sinon.createSandbox();

      // these are mocks we want across all tests
      this.sinon.stub(Server.prototype, 'requestCheck');
      this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function (selector, options, callback) {
          setTimeout(() => {
            const server = Array.from(this.s.servers.values())[0];
            callback(null, server);
          }, 50);
        });
    });

    afterEach(function () {
      this.sinon.restore();
    });

    it('should check for sessions if connected to a single server and has no known servers', function (done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.true;
        topology.close(done);
      });
    });

    it('should not check for sessions if connected to a single server', function (done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');

        setTimeout(() => {
          this.emit(
            'descriptionReceived',
            new ServerDescription('someserver:27019', { ok: 1, maxWireVersion: 6 })
          );
        }, 20);
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });

    it('should check for sessions if there are no data-bearing nodes', function (done) {
      const topology = new Topology(['mongos:27019', 'mongos:27018', 'mongos:27017'], {});
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');

        setTimeout(() => {
          this.emit(
            'descriptionReceived',
            new ServerDescription(this.name, { ok: 1, msg: 'isdbgrid', maxWireVersion: 6 })
          );
        }, 20);
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
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

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          server.command(ns('admin.$cmd'), { ping: 1 }, { socketTimeoutMS: 250 }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.match(/timed out/);

            topology.close(done);
          });
        });
      });
    });
  });

  describe('error handling', function () {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

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

      const topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command(ns('test.test'), { insert: { a: 42 } }, (err, result) => {
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
          request.reply({ ok: 0, message: 'not master' });
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command(ns('test.test'), { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.false;
            done();
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

      const topology = new Topology(mockServer.hostAddress());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          server.command(ns('test.test'), { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(server.description.type).to.equal('Unknown');
            done();
          });
        });
      });
    });

    it('should encounter a server selection timeout on garbled server responses', function () {
      const net = require('net');
      const server = net.createServer();
      const p = Promise.resolve();
      server.listen(0, 'localhost', 2, () => {
        server.on('connection', c => c.on('data', () => c.write('garbage_data')));
        const { address, port } = server.address();
        const client = this.configuration.newClient(`mongodb://${address}:${port}`, {
          serverSelectionTimeoutMS: 1000
        });
        p.then(() =>
          client
            .connect()
            .then(() => {
              expect.fail('Should throw a server selection error!');
            })
            .catch(error => {
              expect(error).to.exist;
            })
            .finally(() => {
              server.close();
              return client.close();
            })
        );
      });
      return p;
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
          topology.close(e => {
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
});
