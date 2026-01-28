import { expect } from 'chai';
import { once } from 'events';
import * as net from 'net';
import { type AddressInfo } from 'net';
import * as process from 'process';
import { satisfies } from 'semver';
import * as sinon from 'sinon';
import { clearTimeout } from 'timers';

import { ConnectionPool } from '../../../src/cmap/connection_pool';
import { makeClientMetadata } from '../../../src/cmap/handshake/client_metadata';
import {
  LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE,
  MongoServerSelectionError
} from '../../../src/error';
import { MongoClient } from '../../../src/mongo_client';
import {
  RunCommandOperation,
  RunCursorCommandOperation
} from '../../../src/operations/run_command';
import { ReadPreference } from '../../../src/read_preference';
import { TopologyType } from '../../../src/sdam/common';
import { TopologyDescriptionChangedEvent } from '../../../src/sdam/events';
import { Server } from '../../../src/sdam/server';
import { SrvPoller, SrvPollingEvent } from '../../../src/sdam/srv_polling';
import { Topology } from '../../../src/sdam/topology';
import { TopologyDescription } from '../../../src/sdam/topology_description';
import { TimeoutContext } from '../../../src/timeout';
import { isHello, ns } from '../../../src/utils';
import * as mock from '../../tools/mongodb-mock/index';
import { topologyWithPlaceholderClient } from '../../tools/utils';
import { Runtime } from '../../../src';

const runtime: Runtime = {
  os: require('os')
};

describe('Topology (unit)', function () {
  let client, topology;

  afterEach(async () => {
    sinon.restore();
    if (client) {
      await client.close();
    }

    if (topology) {
      topology.close();
    }
  });

  describe('client metadata', function () {
    let mockServer;

    before(async () => {
      mockServer = await mock.createServer();
    });

    after(() => mock.cleanup());

    it('should correctly pass appname', async function () {
      const topology: Topology = topologyWithPlaceholderClient([`localhost:27017`], {
        metadata: makeClientMetadata([], {
          runtime,
          appName: 'My application name'
        })
      });

      const metadata = await topology.s.options.metadata;
      expect(metadata.application.name).to.equal('My application name');
    });

    it('should report the correct platform in client metadata', async function () {
      const helloRequests: any[] = [];
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

    beforeEach(async () => (mockServer = await mock.createServer()));

    afterEach(() => mock.cleanup());

    it('should time out operations against servers that have been blackholed', async function () {
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

      const topology = topologyWithPlaceholderClient(mockServer.hostAddress(), {});
      await topology.connect();
      const ctx = TimeoutContext.create({
        waitQueueTimeoutMS: 0,
        serverSelectionTimeoutMS: 0,
        socketTimeoutMS: 250
      });
      const server = await topology.selectServer('primary', {
        timeoutContext: ctx,
        operationName: 'none',
      });
      const err = await server
        .command(new RunCursorCommandOperation(ns('admin.$cmd'), { ping: 1 }, {}), ctx)
        .catch(e => e);
      expect(err).to.exist;
      expect(err).to.match(/timed out/);
      topology.close();
    });
  });

  describe('error handling', function () {
    let mockServer;
    let secondMockServer;

    beforeEach(async () => {
      mockServer = await mock.createServer();
      secondMockServer = await mock.createServer();
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
          it('returns a MongoServerSelectionError', async function () {
            topology = topologyWithPlaceholderClient([mockServer.hostAddress()], {});

            await topology.connect();
            sinon.stub(topology.s.servers, 'get').callsFake(() => {
              return undefined;
            });
            const err = await topology.selectServer('primary', {}).then(
              () => null,
              e => e
            );
            expect(err).to.be.instanceOf(MongoServerSelectionError);
          });
        });

        context('when the topology originally contained more than one server', function () {
          it('returns a MongoServerSelectionError', async function () {
            topology = topologyWithPlaceholderClient(
              [mockServer.hostAddress(), secondMockServer.hostAddress()],
              {}
            );

            await topology.connect();
            sinon.stub(topology.s.servers, 'get').callsFake(() => {
              return undefined;
            });
            const err = await topology.selectServer('primary', {}).then(
              () => null,
              e => e
            );
            expect(err).to.be.instanceOf(MongoServerSelectionError);
          });
        });
      }
    );

    it('should set server to unknown and reset pool on `node is recovering` error', async function () {
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

      topology = topologyWithPlaceholderClient(mockServer.hostAddress(), {});
      await topology.connect();
      const server = await topology.selectServer('primary', {});

      let serverDescription;
      server.on('descriptionReceived', sd => (serverDescription = sd));

      let poolCleared = false;
      topology.on('connectionPoolCleared', () => (poolCleared = true));

      const timeoutContext = TimeoutContext.create({
        serverSelectionTimeoutMS: 0,
        waitQueueTimeoutMS: 0
      });
      const err = await server
        .command(
          new RunCommandOperation(ns('test.test'), { insert: { a: 42 } }, {}),
          timeoutContext
        )
        .then(
          () => null,
          e => e
        );
      expect(err).to.eql(serverDescription.error);
      expect(poolCleared).to.be.true;
    });

    it('should set server to unknown and NOT reset pool on stepdown errors', async function () {
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

      const topology = topologyWithPlaceholderClient(mockServer.hostAddress(), {});
      await topology.connect();
      const server = await topology.selectServer('primary', {});
      let serverDescription;
      server.on('descriptionReceived', sd => (serverDescription = sd));

      let poolCleared = false;
      topology.on('connectionPoolCleared', () => (poolCleared = true));
      const timeoutContext = TimeoutContext.create({
        serverSelectionTimeoutMS: 0,
        waitQueueTimeoutMS: 0
      });

      const err = await server
        .command(
          new RunCommandOperation(ns('test.test'), { insert: { a: 42 } }, {}),
          timeoutContext
        )
        .then(
          () => null,
          e => e
        );
      expect(err).to.eql(serverDescription.error);
      expect(poolCleared).to.be.false;
      topology.close();
    });

    it('should set server to unknown on non-timeout network error', async function () {
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

      topology = topologyWithPlaceholderClient(mockServer.hostAddress(), {});
      await topology.connect();
      const timeoutContext = TimeoutContext.create({
        waitQueueTimeoutMS: 0,
        serverSelectionTimeoutMS: 0
      });
      const server = await topology.selectServer('primary', {});
      let serverDescription;
      server.on('descriptionReceived', sd => (serverDescription = sd));

      const err = await server
        .command(
          new RunCommandOperation(ns('test.test'), { insert: { a: 42 } }, {}),
          timeoutContext
        )
        .then(
          () => null,
          e => e
        );
      expect(err).to.eql(serverDescription.error);
      expect(server.description.type).to.equal('Unknown');
    });

    it('should encounter a server selection timeout on garbled server responses', function () {
      const test = this.test;

      test.skipReason = satisfies(process.version, '>=18.0.0')
        ? 'TODO(NODE-5666): fix failing unit tests on Node18'
        : undefined;

      if (test.skipReason) this.skip();

      const server = net.createServer();
      server.listen(0, 'localhost', 2, async () => {
        server.on('connection', c => c.on('data', () => c.write('garbage_data')));
        const { address, port } = server.address() as AddressInfo;
        const client = new MongoClient(`mongodb://${address}:${port}`, {
          serverSelectionTimeoutMS: 1000
        });
        const err = await client.connect().then(
          () => null,
          e => e
        );
        expect(err).to.be.instanceOf(MongoServerSelectionError);
        expect(err)
          .to.have.property('message')
          .that.matches(/Server selection timed out/);

        server.close();
        await client.close();
      });
    });

    describe('srv event listeners', function () {
      let topology;

      beforeEach(() => {
        topology = topologyWithPlaceholderClient('', { srvHost: 'fakeHost' });

        expect(topology.s.detectSrvRecords).to.be.a('function');
        expect(topology.s.detectShardedTopology).to.be.a('function');
      });

      afterEach(() => {
        // The srv event starts a monitor that we need to clean up
        for (const [, server] of topology.s.servers) {
          server.monitor.monitorId.stop();
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

        it('should emit topologyDescriptionChange event', async function () {
          const p = once(topology, Topology.TOPOLOGY_DESCRIPTION_CHANGED);

          topology.s.srvPoller.emit(
            SrvPoller.SRV_RECORD_DISCOVERY,
            new SrvPollingEvent([{ priority: 1, weight: 1, port: 2, name: 'fake' }])
          );

          const [ev] = await p;
          // The first event we get here is caused by the srv record discovery event below
          expect(ev).to.have.nested.property('newDescription.servers');
          expect(ev.newDescription.servers.get('fake:2'))
            .to.be.a('object')
            .with.property('address', 'fake:2');
        });

        it('should clean up listeners on close', function () {
          topology.s.state = 'connected'; // fake state to test clean up logic
          topology.close();
          const srvPollerListeners = topology.s.srvPoller.listeners(SrvPoller.SRV_RECORD_DISCOVERY);
          expect(srvPollerListeners).to.have.lengthOf(0);
          const topologyChangeListeners = topology.listeners(Topology.TOPOLOGY_DESCRIPTION_CHANGED);
          expect(topologyChangeListeners).to.have.lengthOf(0);
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
    it('should schedule monitoring if no suitable server is found', async function () {
      const topology = topologyWithPlaceholderClient('someserver:27019', {
        serverSelectionTimeoutMS: 10
      });
      const requestCheck = sinon.stub(Server.prototype, 'requestCheck');

      sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
        return;
      });

      const err = await topology.connect().then(
        () => null,
        e => e
      );
      expect(err).to.match(/Server selection timed out/);
      expect(err).to.have.property('reason');
      // When server is created `connect` is called on the monitor. When server selection
      // occurs `requestCheck` will be called for an immediate check.
      expect(requestCheck).to.have.been.calledOnce;
      topology.close();
    });

    it('should disallow selection when the topology is explicitly closed', async function () {
      const topology = topologyWithPlaceholderClient('someserver:27019', {});
      sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.close();

      const err = await topology
        .selectServer(ReadPreference.primary, { serverSelectionTimeoutMS: 2000 })
        .then(
          () => null,
          e => e
        );
      expect(err).to.match(/Topology is closed/);
    });

    describe('waitQueue', function () {
      let selectServer;
      let topology;

      afterEach(() => {
        selectServer.restore();
        topology.close();
      });

      it('should process all wait queue members, including selection with errors', async function () {
        topology = topologyWithPlaceholderClient('someserver:27019', {});
        selectServer = sinon.stub(Topology.prototype, 'selectServer').callsFake(async function () {
          const server = Array.from(this.s.servers.values())[0];
          return server;
        });

        sinon.stub(Server.prototype, 'connect').callsFake(function () {
          this.s.state = 'connected';
          this.emit('connect');
        });

        sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(async function () {
          return {};
        });

        sinon.stub(ConnectionPool.prototype, 'checkIn').callsFake(function (_) {
          return;
        });

        const toSelect = 10;
        let completed = 0;
        // methodology:
        //   - perform 9 server selections, a few with a selector that throws an error
        //   - ensure each selection immediately returns an empty result (gated by a boolean)
        //     guaranteeing that the queue will be full before the last selection
        //   - make one last selection, but ensure that all selections are no longer blocked from
        //     returning their value
        //   - verify that 10 callbacks were called

        await topology.connect();

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
          await topology.selectServer(i % 5 === 0 ? failingSelector : anySelector, {});
          completed++;
        }
        preventSelection = false;
        await topology.selectServer(anySelector, {});
        completed++;

        expect(completed).to.equal(toSelect);
      });
    });
  });
});
