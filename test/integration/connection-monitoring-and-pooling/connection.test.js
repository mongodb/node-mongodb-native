'use strict';

const {
  ServerHeartbeatStartedEvent,
  MongoClient,
  MongoNotConnectedError
} = require('../../../src');
const { Connection } = require('../../../src/cmap/connection');
const { connect } = require('../../../src/cmap/connect');
const { expect } = require('chai');
const { setupDatabase, withClient, assert: test } = require('../shared');
const { ns, HostAddress } = require('../../../src/utils');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { Topology } = require('../../../src/sdam/topology');
const { skipBrokenAuthTestBeforeEachHook } = require('../../tools/runner/hooks/configuration');

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
        const connectOptions = Object.assign(
          { connectionType: Connection },
          this.configuration.options
        );

        connect(connectOptions, (err, conn) => {
          expect(err).to.not.exist;
          this.defer(_done => conn.destroy(_done));

          conn.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined, (err, hello) => {
            expect(err).to.not.exist;
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
        const connectOptions = Object.assign(
          { connectionType: Connection, monitorCommands: true },
          this.configuration.options
        );

        connect(connectOptions, (err, conn) => {
          expect(err).to.not.exist;
          this.defer(_done => conn.destroy(_done));

          const events = [];
          conn.on('commandStarted', event => events.push(event));
          conn.on('commandSucceeded', event => events.push(event));
          conn.on('commandFailed', event => events.push(event));

          conn.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined, (err, hello) => {
            expect(err).to.not.exist;
            expect(hello).to.exist;
            expect(hello.ok).to.equal(1);
            expect(events).to.have.length(2);
            done();
          });
        });
      }
    });

    it.skip('should support socket timeouts', {
      // FIXME: NODE-2941
      metadata: {
        requires: {
          os: '!win32' // 240.0.0.1 doesnt work for windows
        }
      },
      test: function (done) {
        const connectOptions = {
          hostAddress: new HostAddress('240.0.0.1'),
          connectionType: Connection,
          connectionTimeout: 500
        };

        connect(connectOptions, err => {
          expect(err).to.exist;
          expect(err).to.match(/timed out/);
          done();
        });
      }
    });

    it('should support calling back multiple times on exhaust commands', {
      metadata: {
        requires: { apiVersion: false, mongodb: '>=4.2.0', topology: ['single'] }
      },
      test: function (done) {
        const namespace = ns(`${this.configuration.db}.$cmd`);
        const connectOptions = Object.assign(
          { connectionType: Connection },
          this.configuration.options
        );

        connect(connectOptions, (err, conn) => {
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
      let savedError;
      if (client) {
        try {
          await client.close();
        } catch (err) {
          savedError = err;
        }
      }
      if (testClient) {
        try {
          await testClient.close();
        } catch (err) {
          savedError = err;
        }
      }
      if (savedError) {
        throw savedError;
      }
    });

    it('should correctly start monitoring for single server connection', {
      metadata: { requires: { topology: 'single', os: '!win32' } },
      test: function (done) {
        var configuration = this.configuration;
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

        client.connect().then(() => {
          expect(isMonitoring);
          done();
        });
      }
    });

    it('should correctly connect to server using domain socket', {
      metadata: {
        requires: { topology: 'single', os: '!win32' }
      },

      test: function (done) {
        var configuration = this.configuration;
        client = configuration.newClient(
          `mongodb://${encodeURIComponent('/tmp/mongodb-27017.sock')}?w=1`,
          { maxPoolSize: 1 }
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

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
        });
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
      var configuration = this.configuration;
      client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

      client.on('open', clientFromEvent => {
        expect(clientFromEvent).to.be.instanceOf(MongoClient);
        expect(clientFromEvent).to.equal(client);
        done();
      });

      client.connect();
    });

    it('should correctly connect to server using big connection pool', {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function (done) {
        var configuration = this.configuration;
        client = configuration.newClient({ w: 1 }, { maxPoolSize: 2000 });
        client.on('open', function () {
          done();
        });

        client.connect();
      }
    });

    /**
     * @param {any} configuration
     * @param {any} testName
     * @param {any} callback
     */
    function connectionTester(configuration, testName, callback) {
      return function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        db.createCollection(testName, function (err, collection) {
          expect(err).to.not.exist;

          collection.insert({ foo: 123 }, { writeConcern: { w: 1 } }, function (err) {
            expect(err).to.not.exist;

            db.dropDatabase(function (err, dropped) {
              expect(err).to.not.exist;
              test.ok(dropped);
              if (callback) return callback(client);
            });
          });
        });
      };
    }

    it('test connect no options', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        const configuration = this.configuration;
        client = configuration.newClient();

        client.connect(
          connectionTester(configuration, 'testConnectNoOptions', function () {
            done();
          })
        );
      }
    });

    it('test connect good auth', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        const configuration = this.configuration;
        const username = 'testConnectGoodAuth';
        const password = 'password';

        client = configuration.newClient();

        // First add a user.
        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.addUser(username, password, function (err) {
            expect(err).to.not.exist;
            restOfTest();
          });
        });

        function restOfTest() {
          testClient = configuration.newClient(configuration.url({ username, password }));
          testClient.connect(
            connectionTester(configuration, 'testConnectGoodAuth', function () {
              done();
            })
          );
        }
      }
    });

    it('test connect good auth as option', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        const configuration = this.configuration;
        const username = 'testConnectGoodAuthAsOption';
        const password = 'password';

        // First add a user.
        client = configuration.newClient();
        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.addUser(username, password, { roles: ['readWrite', 'dbAdmin'] }, function (err) {
            expect(err).to.not.exist;
            restOfTest();
          });
        });

        function restOfTest() {
          var opts = { auth: { username, password }, authSource: configuration.db };

          testClient = configuration.newClient(opts);

          testClient.connect(
            connectionTester(configuration, 'testConnectGoodAuthAsOption', function () {
              done();
            })
          );
        }
      }
    });

    it('test connect bad auth', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        var configuration = this.configuration;
        client = configuration.newClient({
          auth: {
            username: 'slithy',
            password: 'toves'
          }
        });
        client.connect(function (err, client) {
          expect(err).to.exist;
          expect(client).to.not.exist;
          done();
        });
      }
    });

    it('test connect bad url', {
      metadata: { requires: { topology: 'single' } },

      test: function () {
        const configuration = this.configuration;
        expect(() =>
          configuration.newClient('mangodb://localhost:27017/test?safe=false')
        ).to.throw();
      }
    });

    it(
      'should be able to connect again after close',
      withClient(function (client, done) {
        const collection = client.db('shouldConnectAfterClose').collection('test');
        collection.insertOne({ a: 1, b: 2 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;

          client.close(err => {
            expect(err).to.not.exist;

            client.connect(err => {
              expect(err).to.not.exist;

              collection.findOne({ a: 1 }, (err, result) => {
                expect(err).to.not.exist;
                expect(result).to.exist;
                expect(result).to.have.property('a', 1);
                expect(result).to.have.property('b', 2);
                expect(client.topology.isDestroyed()).to.be.false;
                done();
              });
            });
          });
        });
      })
    );

    it.skip('throws when attempting an operation if the client is not connected', function (done) {
      const client = this.configuration.newClient();
      const collection = client.db('shouldCorrectlyFailOnRetry').collection('test');
      collection.insertOne({ a: 2 }, err => {
        expect(err).to.be.instanceof(MongoNotConnectedError);
        done();
      });
    }).skipReason = 'Not anymore!!!';

    it.skip('throws when attempting an operation if the client is not connected (promises)', async function () {
      const client = this.configuration.newClient();
      const collection = client.db('shouldCorrectlyFailOnRetry').collection('test');

      const err = await collection.insertOne({ a: 2 }).catch(err => err);
      expect(err).to.be.instanceof(MongoNotConnectedError);
    }).skipReason = 'Not anymore!!!';

    it.skip(
      'should correctly fail on retry when client has been closed',
      withClient(function (client, done) {
        const collection = client.db('shouldCorrectlyFailOnRetry').collection('test');
        collection.insertOne({ a: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;

          client.close(true, function (err) {
            expect(err).to.not.exist;

            collection.insertOne({ a: 2 }, err => {
              expect(err).to.be.instanceof(MongoNotConnectedError);
              done();
            });
          });
        });
      })
    ).skipReason = 'Not anymore!!!';

    it.skip('should correctly fail on retry when client has been closed (promises)', async function () {
      const client = await this.configuration.newClient().connect();
      const collection = client.db('shouldCorrectlyFailOnRetry').collection('test');
      await collection.insertOne({ a: 1 });
      await client.close(true);

      const err = await collection.insertOne({ a: 2 }).catch(err => err);
      expect(err).to.be.instanceof(MongoNotConnectedError);
    }).skipReason = 'Not anymore!!!';
  });
});
