import { expect } from 'chai';
import { type EventEmitter, once } from 'events';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';

import {
  addContainerMetadata,
  Binary,
  connect,
  Connection,
  type ConnectionOptions,
  HostAddress,
  LEGACY_HELLO_COMMAND,
  makeClientMetadata,
  MongoClient,
  MongoClientAuthProviders,
  type MongoClientOptions,
  MongoDBResponse,
  MongoServerError,
  ns,
  ServerHeartbeatStartedEvent,
  Topology
} from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { processTick, sleep } from '../../tools/utils';
import { assert as test, setupDatabase } from '../shared';

const commonConnectOptions = {
  id: 1,
  generation: 1,
  monitorCommands: false,
  tls: false,
  loadBalanced: false,
  // Will be overridden by configuration options
  hostAddress: HostAddress.fromString('127.0.0.1:1'),
  authProviders: new MongoClientAuthProviders()
};

describe('Connection', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  describe('Connection.command', function () {
    it('should execute a command against a server', {
      metadata: { requires: { apiVersion: false, topology: '!load-balanced' } },
      test: async function () {
        const connectOptions: ConnectionOptions = {
          ...commonConnectOptions,
          connectionType: Connection,
          ...this.configuration.options,
          metadata: makeClientMetadata([], {}),
          extendedMetadata: addContainerMetadata(makeClientMetadata([], {}))
        };

        let conn;
        try {
          conn = await connect(connectOptions);
          const hello = await conn?.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 });
          expect(hello).to.have.property('ok', 1);
        } finally {
          conn?.destroy();
        }
      }
    });

    it('should emit command monitoring events', {
      metadata: { requires: { apiVersion: false, topology: '!load-balanced' } },
      test: async function () {
        const connectOptions: ConnectionOptions = {
          ...commonConnectOptions,
          connectionType: Connection,
          ...this.configuration.options,
          monitorCommands: true,
          metadata: makeClientMetadata([], {}),
          extendedMetadata: addContainerMetadata(makeClientMetadata([], {}))
        };

        let conn;
        try {
          conn = await connect(connectOptions);

          const events: any[] = [];
          conn.on('commandStarted', event => events.push(event));
          conn.on('commandSucceeded', event => events.push(event));
          conn.on('commandFailed', event => events.push(event));

          const hello = await conn?.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 });
          expect(hello).to.have.property('ok', 1);
          expect(events).to.have.lengthOf(2);
        } finally {
          conn?.destroy();
        }
      }
    });

    afterEach(() => sinon.restore());

    it('command monitoring event do not deserialize more than once', {
      metadata: { requires: { apiVersion: false, topology: '!load-balanced' } },
      test: async function () {
        const connectOptions: ConnectionOptions = {
          ...commonConnectOptions,
          connectionType: Connection,
          ...this.configuration.options,
          monitorCommands: true,
          metadata: makeClientMetadata([], {}),
          extendedMetadata: addContainerMetadata(makeClientMetadata([], {}))
        };

        let conn;
        try {
          conn = await connect(connectOptions);

          const toObjectSpy = sinon.spy(MongoDBResponse.prototype, 'toObject');

          const events: any[] = [];
          conn.on('commandStarted', event => events.push(event));
          conn.on('commandSucceeded', event => events.push(event));
          conn.on('commandFailed', event => events.push(event));

          const hello = await conn.command(ns('admin.$cmd'), { ping: 1 });
          expect(toObjectSpy).to.have.been.calledOnce;
          expect(hello).to.have.property('ok', 1);
          expect(events).to.have.lengthOf(2);

          toObjectSpy.resetHistory();

          const garbage = await conn.command(ns('admin.$cmd'), { garbage: 1 }).catch(e => e);
          expect(toObjectSpy).to.have.been.calledOnce;
          expect(garbage).to.have.property('ok', 0);
          expect(events).to.have.lengthOf(4);
        } finally {
          conn?.destroy();
        }
      }
    });
  });

  describe('Connection - functional', function () {
    let client;
    let testClient;

    afterEach(async () => {
      if (client) await client.close();
      if (testClient) await testClient.close();
    });

    it('should correctly start monitoring for single server connection', {
      metadata: { requires: { topology: 'single', os: '!win32' } },
      test: async function () {
        const configuration = this.configuration;
        client = configuration.newClient(
          `mongodb://${encodeURIComponent('/tmp/mongodb-27017.sock')}?w=1`,
          {
            maxPoolSize: 1,
            heartbeatFrequencyMS: 250
          }
        );

        let isMonitoring = false;
        client.once('serverHeartbeatStarted', event => {
          // just to be sure we get what we expect, checking the instanceof
          isMonitoring = event instanceof ServerHeartbeatStartedEvent;
        });

        await client.connect();
        expect(isMonitoring).to.be.true;
      }
    });

    it('should correctly connect to server using domain socket', {
      metadata: {
        requires: { topology: 'single', os: '!win32' }
      },
      test: function (done) {
        const configuration = this.configuration;
        const uri = `mongodb://${encodeURIComponent('/tmp/mongodb-27017.sock')}?w=1`;
        const options: MongoClientOptions = {
          maxPoolSize: 1
        };
        if (this.configuration.options.auth) {
          options.auth = this.configuration.options.auth;
        }
        client = configuration.newClient(uri, options);

        const db = client.db(configuration.db);

        db.collection('domainSocketCollection0').insert(
          { a: 1 },
          { writeConcern: { w: 1 } },
          function (err) {
            expect(err).to.not.exist;

            db.collection('domainSocketCollection0')
              .find({ a: 1 })
              .toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal(1, items.length);

                done();
              });
          }
        );
      }
    });

    it('should only pass one argument (topology and not error) for topology "open" events', function (done) {
      const configuration = this.configuration;
      client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

      client.on('topologyOpening', () => {
        client.topology.on('open', (...args) => {
          expect(args).to.have.lengthOf(1);
          expect(args[0]).to.be.instanceOf(Topology);
          done();
        });
      });

      client.connect();
    });

    it('should correctly connect to server using just events', function (done) {
      const configuration = this.configuration;
      client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

      client.on('open', clientFromEvent => {
        expect(clientFromEvent).to.be.instanceOf(MongoClient);
        expect(clientFromEvent).to.equal(client);
        done();
      });

      client.connect();
    });

    it('should correctly connect to server using big connection pool', function (done) {
      const configuration = this.configuration;
      client = configuration.newClient({ w: 1 }, { maxPoolSize: 2000 });
      client.on('open', function () {
        done();
      });

      client.connect();
    });

    describe(
      'when a monitoring Connection receives many hellos in one chunk',
      { requires: { topology: 'replicaset', mongodb: '>=4.4' } }, // need to be on a streaming hello version
      function () {
        let client: MongoClient;

        beforeEach(async function () {
          // set heartbeatFrequencyMS just so we don't have to wait so long for a hello
          client = this.configuration.newClient({}, { heartbeatFrequencyMS: 10 });
        });

        afterEach(async function () {
          await client.close();
        });

        // In the future we may want to skip processing concatenated heartbeats.
        // This test exists to prevent regression of processing many messages inside one chunk.
        it(
          'processes all of them and emits heartbeats',
          {
            requires: {
              topology: 'replicaset',
              mongodb: '>=4.4',
              // When compression is enabled, processing heartbeat events is asynchronous.
              predicate: () =>
                process.env.COMPRESSOR ? 'test requires that compression is disabled' : true
            }
          },
          async function () {
            let hbSuccess = 0;
            client.on('serverHeartbeatSucceeded', () => (hbSuccess += 1));
            expect(hbSuccess).to.equal(0);

            await client.db().command({ ping: 1 }); // start monitoring.
            const monitor = [...client.topology.s.servers.values()][0].monitor;

            // @ts-expect-error: accessing private property
            const messageStream = monitor.connection.messageStream;
            // @ts-expect-error: accessing private property
            const socket = monitor.connection.socket;

            const [hello] = (await once(messageStream, 'data')) as [Buffer];

            const thousandHellos = Array.from({ length: 1000 }, () => [...hello]).flat(1);

            // pretend this came from the server
            socket.emit('data', Buffer.from(thousandHellos));

            // All of the hb will be emitted synchronously in the next tick as the entire chunk is processed.
            await processTick();

            expect(hbSuccess).to.be.greaterThan(1000);
          }
        );
      }
    );

    context(
      'when a large message is written to the socket',
      { requires: { topology: 'single', auth: 'disabled' } },
      () => {
        let client, mockServer: import('../../tools/mongodb-mock/src/server').MockServer;

        beforeEach(async function () {
          mockServer = await mock.createServer();

          mockServer
            .addMessageHandler('insert', req => {
              setTimeout(() => {
                req.reply({ ok: 1 });
              }, 800);
            })
            .addMessageHandler('hello', req => {
              req.reply(Object.assign({}, mock.HELLO));
            })
            .addMessageHandler(LEGACY_HELLO_COMMAND, req => {
              req.reply(Object.assign({}, mock.HELLO));
            });

          client = new MongoClient(`mongodb://${mockServer.uri()}`, {
            minPoolSize: 1,
            maxPoolSize: 1
          });
        });

        afterEach(async function () {
          await client.close();
          mockServer.destroy();
          sinon.restore();
        });

        it('waits for an async drain event because the write was buffered', async () => {
          const connectionReady = once(client, 'connectionReady');
          await client.connect();
          await connectionReady;

          // Get the only connection
          const pool = [...client.topology.s.servers.values()][0].pool;

          expect(pool.connections).to.have.lengthOf(1);

          const connection = pool.connections.first();
          const socket: EventEmitter = connection.socket;

          // Spy on the socket event listeners
          const addedListeners: string[] = [];
          const removedListeners: string[] = [];
          socket
            .on('removeListener', name => removedListeners.push(name))
            .on('newListener', name => addedListeners.push(name));

          // Make server sockets block
          for (const s of mockServer.sockets) s.pause();

          const insert = client
            .db('test')
            .collection('test')
            // Anything above 16Kb should work I think (10mb to be extra sure)
            .insertOne({ a: new Binary(Buffer.alloc(10 * (2 ** 10) ** 2), 127) });

          // Sleep a bit and unblock server sockets
          await sleep(10);
          for (const s of mockServer.sockets) s.resume();

          // Let the operation finish
          await insert;

          // Ensure that we used the drain event for this write
          expect(addedListeners).to.deep.equal(['drain', 'error']);
          expect(removedListeners).to.deep.equal(['error']);
          expect(socket.listenerCount('drain')).to.equal(0);
        });
      }
    );

    context('when connecting with a username and password', () => {
      let utilClient: MongoClient;
      let client: MongoClient;
      const username = 'spot';
      const password = 'dogsRCool';

      beforeEach(async function () {
        utilClient = this.configuration.newClient();
        await utilClient.db().admin().command({ createUser: username, pwd: password, roles: [] });
      });

      afterEach(async () => {
        await utilClient.db().admin().command({ dropUser: username });
        await client?.close();
        await utilClient?.close();
      });

      it('accepts a client that provides the correct username and password', async function () {
        client = this.configuration.newClient({ auth: { username, password } });
        await client.connect();
      });

      it('rejects a client that provides the incorrect username and password', async function () {
        client = this.configuration.newClient({ auth: { username: 'u', password: 'p' } });
        const error = await client.connect().catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
      });
    });
  });
});
