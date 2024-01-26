import { expect } from 'chai';

import {
  connect,
  Connection,
  type ConnectionOptions,
  HostAddress,
  LEGACY_HELLO_COMMAND,
  makeClientMetadata,
  MongoClient,
  MongoServerError,
  ns,
  ServerHeartbeatStartedEvent,
  Topology
} from '../../mongodb';
import { skipBrokenAuthTestBeforeEachHook } from '../../tools/runner/hooks/configuration';
import { assert as test, setupDatabase } from '../shared';

const commonConnectOptions = {
  id: 1,
  generation: 1,
  monitorCommands: false,
  tls: false,
  loadBalanced: false,
  // Will be overridden by configuration options
  hostAddress: HostAddress.fromString('127.0.0.1:1')
};

describe('Connection', function () {
  beforeEach(
    skipBrokenAuthTestBeforeEachHook({
      skippedTests: [
        'should support calling back multiple times on exhaust commands',
        'should correctly connect to server using domain socket'
      ]
    })
  );

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
          metadata: makeClientMetadata({ driverInfo: {} })
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
          metadata: makeClientMetadata({ driverInfo: {} })
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
        client = configuration.newClient(
          `mongodb://${encodeURIComponent('/tmp/mongodb-27017.sock')}?w=1`,
          { maxPoolSize: 1 }
        );

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
