import { expect } from 'chai';

import {
  connect,
  Connection,
  type ConnectionOptions,
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

  describe('Connection - functional/cmap', function () {
    it('should execute a command against a server', {
      metadata: { requires: { apiVersion: false, topology: '!load-balanced' } },
      test: function (done) {
        const connectOptions: Partial<ConnectionOptions> = {
          connectionType: Connection,
          ...this.configuration.options,
          metadata: makeClientMetadata({ driverInfo: {} })
        };

        connect(connectOptions as any as ConnectionOptions, (err, conn) => {
          expect(err).to.not.exist;
          this.defer(_done => conn.destroy(_done));

          conn.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined).then(hello => {
            expect(hello).to.exist;
            expect(hello.ok).to.equal(1);
            done();
          });
        });
      }
    });

    it('should emit command monitoring events', {
      metadata: { requires: { apiVersion: false, topology: '!load-balanced' } },
      test: function (done) {
        const connectOptions: Partial<ConnectionOptions> = {
          connectionType: Connection,
          monitorCommands: true,
          ...this.configuration.options,
          metadata: makeClientMetadata({ driverInfo: {} })
        };

        connect(connectOptions as any as ConnectionOptions, (err, conn) => {
          expect(err).to.not.exist;
          this.defer(_done => conn.destroy(_done));

          const events = [];
          conn.on('commandStarted', event => events.push(event));
          conn.on('commandSucceeded', event => events.push(event));
          conn.on('commandFailed', event => events.push(event));

          conn.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined).then(hello => {
            expect(err).to.not.exist;
            expect(hello).to.exist;
            expect(hello.ok).to.equal(1);
            expect(events).to.have.length(2);
            done();
          });
        });
      }
    });

    it('should support calling back multiple times on exhaust commands', {
      metadata: {
        requires: { apiVersion: false, mongodb: '>=4.2.0', topology: ['single'] }
      },
      test: function (done) {
        const namespace = ns(`${this.configuration.db}.$cmd`);
        const connectOptions: Partial<ConnectionOptions> = {
          connectionType: Connection,
          ...this.configuration.options,
          metadata: makeClientMetadata({ driverInfo: {} })
        };

        connect(connectOptions as any as ConnectionOptions, (err, conn) => {
          expect(err).to.not.exist;
          this.defer(_done => conn.destroy(_done));

          const documents = Array.from(Array(10000), (_, idx) => ({
            test: Math.floor(Math.random() * idx)
          }));

          conn.command(namespace, { drop: 'test' }, undefined, () => {
            conn.command(namespace, { insert: 'test', documents }, undefined, (err, res) => {
              expect(err).to.not.exist;
              expect(res).nested.property('n').to.equal(documents.length);

              let totalDocumentsRead = 0;
              conn.command(
                namespace,
                { find: 'test', batchSize: 100 },
                undefined,
                (err, result) => {
                  expect(err).to.not.exist;
                  expect(result).nested.property('cursor').to.exist;
                  const cursor = result.cursor;
                  totalDocumentsRead += cursor.firstBatch.length;

                  conn.command(
                    namespace,
                    { getMore: cursor.id, collection: 'test', batchSize: 100 },
                    { exhaustAllowed: true },
                    (err, result) => {
                      expect(err).to.not.exist;
                      expect(result).nested.property('cursor').to.exist;
                      const cursor = result.cursor;
                      totalDocumentsRead += cursor.nextBatch.length;

                      if (cursor.id === 0 || cursor.id.isZero()) {
                        expect(totalDocumentsRead).to.equal(documents.length);
                        done();
                      }
                    }
                  );
                }
              );
            });
          });
        });
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
