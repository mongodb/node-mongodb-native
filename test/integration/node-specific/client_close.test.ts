import * as events from 'node:events';

import { expect } from 'chai';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { type Collection, type FindCursor, type MongoClient } from '../../mongodb';
import { runScriptAndGetProcessInfo } from './resource_tracking_script_builder';

describe('MongoClient.close() Integration', () => {
  // note: these tests are set-up in accordance of the resource ownership tree

  describe('Node.js resource: TLS File read', () => {
    describe('when client is connecting and reads an infinite TLS file', () => {
      it('the file read is interrupted by client.close()', async function () {
        await runScriptAndGetProcessInfo(
          'tls-file-read',
          this.configuration,
          async function run({ mongodb: { MongoClient, MongoClientClosedError }, uri, expect }) {
            const infiniteFile = '/dev/zero';
            const client = new MongoClient(uri, { tls: true, tlsCertificateKeyFile: infiniteFile });
            const connectPromise = client.connect().then(
              () => null,
              e => e
            );
            expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
            await client.close();
            const err = await connectPromise;
            expect(err).to.be.instanceOf(MongoClientClosedError);
            expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');
          }
        );
      });
    });
  });

  describe('MongoClientAuthProviders', () => {
    describe('Node.js resource: Token file read', () => {
      let tokenFileEnvCache;

      beforeEach(function () {
        if (process.env.AUTH === 'auth') {
          this.currentTest.skipReason = 'OIDC test environment requires auth disabled';
          this.skip();
        }
        tokenFileEnvCache = process.env.OIDC_TOKEN_FILE;
      });

      afterEach(function () {
        process.env.OIDC_TOKEN_FILE = tokenFileEnvCache;
      });

      describe('when MongoClientAuthProviders is instantiated and token file read hangs', () => {
        it('the file read is interrupted by client.close()', async function () {
          await runScriptAndGetProcessInfo(
            'token-file-read',
            this.configuration,
            async function run({ MongoClient, uri, expect }) {
              const infiniteFile = '/dev/zero';
              process.env.OIDC_TOKEN_FILE = infiniteFile;
              const options = {
                authMechanismProperties: { ENVIRONMENT: 'test' },
                authMechanism: 'MONGODB-OIDC'
              } as const;
              const client = new MongoClient(uri, options);
              const connectPromise = client.connect();
              expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
              await client.close();
              expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');
              await connectPromise;
            }
          );
        });
      });
    });
  });

  describe('Topology', () => {
    describe('Node.js resource: Server Selection Timer', () => {
      describe('after a Topology is created through client.connect()', () => {
        const metadata: MongoDBMetadataUI = { requires: { topology: 'replicaset' } };

        it.skip(
          'server selection timers are cleaned up by client.close()',
          metadata,
          async function () {
            const run = async function ({
              MongoClient,
              uri,
              expect,
              sleep,
              mongodb,
              getTimerCount
            }) {
              const serverSelectionTimeoutMS = 2222;
              const client = new MongoClient(uri, {
                minPoolSize: 1,
                serverSelectionTimeoutMS,
                readPreference: new mongodb.ReadPreference('secondary', [
                  { something: 'that does not exist' }
                ])
              });
              const insertPromise = client.db('db').collection('collection').insertOne({ x: 1 });

              // don't allow entire server selection timer to elapse to ensure close is called mid-timeout
              await sleep(serverSelectionTimeoutMS / 2);

              expect(getTimerCount()).to.not.equal(0);
              await client.close();
              expect(getTimerCount()).to.equal(0);

              const err = await insertPromise.catch(e => e);
              expect(err).to.be.instanceOf(mongodb.MongoTopologyClosedError);
            };
            await runScriptAndGetProcessInfo('timer-server-selection', this.configuration, run);
          }
        );
      });
    });

    describe('Server', () => {
      describe('Monitor', () => {
        // connection monitoring is by default turned on - with the exception of load-balanced mode
        const metadata: MongoDBMetadataUI = {
          requires: {
            topology: ['single', 'replicaset', 'sharded']
          }
        };

        describe('MonitorInterval', () => {
          describe('Node.js resource: Timer', () => {
            describe('after a new monitor is made', () => {
              it.skip(
                'monitor interval timer is cleaned up by client.close()',
                metadata,
                async function () {
                  const run = async function ({ MongoClient, uri, expect, getTimerCount, once }) {
                    const heartbeatFrequencyMS = 2000;
                    const client = new MongoClient(uri, { heartbeatFrequencyMS });
                    const willBeHeartbeatSucceeded = once(client, 'serverHeartbeatSucceeded');
                    await client.connect();
                    await willBeHeartbeatSucceeded;

                    function monitorTimersExist(servers) {
                      for (const [, server] of servers) {
                        // the current expected behavior is that timerId is set to undefined once it expires or is interrupted
                        if (server?.monitor.monitorId.timerId === undefined) {
                          return false;
                        }
                      }
                      return true;
                    }
                    const servers = client.topology.s.servers;
                    expect(monitorTimersExist(servers)).to.be.true;
                    await client.close();
                    expect(monitorTimersExist(servers)).to.be.true;

                    expect(getTimerCount()).to.equal(0);
                  };
                  await runScriptAndGetProcessInfo(
                    'timer-monitor-interval',
                    this.configuration,
                    run
                  );
                }
              );
            });

            describe('after a heartbeat fails', () => {
              it.skip(
                'the new monitor interval timer is cleaned up by client.close()',
                metadata,
                async function () {
                  const run = async function ({ MongoClient, expect, getTimerCount, once }) {
                    const heartbeatFrequencyMS = 2000;
                    const client = new MongoClient('mongodb://fakeUri', { heartbeatFrequencyMS });
                    const willBeHeartbeatFailed = once(client, 'serverHeartbeatFailed');
                    const connectPromise = client.connect();
                    await willBeHeartbeatFailed;
                    function getMonitorTimer(servers) {
                      for (const [, server] of servers) {
                        return server?.monitor.monitorId.timerId;
                      }
                    }
                    const servers = client.topology.s.servers;
                    expect(getMonitorTimer(servers)).to.exist;
                    await client.close();
                    // the current expected behavior is that timerId is set to undefined once it expires or is interrupted
                    expect(getMonitorTimer(servers)).to.not.exist;

                    expect(getTimerCount()).to.equal(0);

                    await connectPromise;
                  };
                  await runScriptAndGetProcessInfo(
                    'timer-heartbeat-failed-monitor',
                    this.configuration,
                    run
                  );
                }
              );
            });
          });
        });

        describe('Monitoring Connection', () => {
          describe('Node.js resource: Socket', () => {
            it.skip('no sockets remain after client.close()', metadata, async function () {
              const run = async function ({ MongoClient, uri, expect, getSocketEndpoints }) {
                const client = new MongoClient(uri);
                await client.connect();

                const servers = client.topology?.s.servers;
                // assert socket creation
                for (const [, server] of servers) {
                  const { host, port } = server.s.description.hostAddress;
                  expect(getSocketEndpoints()).to.deep.include({ host, port });
                }

                await client.close();

                // assert socket destruction
                for (const [, server] of servers) {
                  const { host, port } = server.s.description.hostAddress;
                  expect(getSocketEndpoints()).to.not.deep.include({ host, port });
                }
              };
              await runScriptAndGetProcessInfo(
                'socket-connection-monitoring',
                this.configuration,
                run
              );
            });
          });
        });

        describe('RTT Pinger', () => {
          describe('Node.js resource: Timer', () => {
            describe('after entering monitor streaming mode ', () => {
              it.skip(
                'the rtt pinger timer is cleaned up by client.close()',
                metadata,
                async function () {
                  const run = async function ({ MongoClient, uri, expect, getTimerCount, once }) {
                    const heartbeatFrequencyMS = 2000;
                    const client = new MongoClient(uri, {
                      serverMonitoringMode: 'stream',
                      heartbeatFrequencyMS
                    });
                    await client.connect();
                    await once(client, 'serverHeartbeatSucceeded');

                    function getRttTimer(servers) {
                      for (const [, server] of servers) {
                        return server?.monitor.rttPinger.monitorId;
                      }
                    }

                    const servers = client.topology.s.servers;
                    expect(getRttTimer(servers)).to.exist;

                    await client.close();
                    expect(getRttTimer(servers)).to.not.exist;

                    expect(getTimerCount()).to.equal(0);
                  };
                  await runScriptAndGetProcessInfo('timer-rtt-monitor', this.configuration, run);
                }
              );
            });
          });

          describe('Connection', () => {
            describe('Node.js resource: Socket', () => {
              describe('when rtt monitoring is turned on', () => {
                it.skip('no sockets remain after client.close()', metadata, async function () {
                  const run = async ({ MongoClient, uri, expect, getSockets, once }) => {
                    const heartbeatFrequencyMS = 500;
                    const client = new MongoClient(uri, {
                      serverMonitoringMode: 'stream',
                      heartbeatFrequencyMS
                    });
                    await client.connect();

                    const socketsAddressesBeforeHeartbeat = getSockets().map(r => r.address);

                    // set of servers whose heartbeats have occurred
                    const heartbeatOccurredSet = new Set();

                    const servers = client.topology.s.servers;

                    while (heartbeatOccurredSet.size < servers.size) {
                      const ev = await once(client, 'serverHeartbeatSucceeded');
                      heartbeatOccurredSet.add(ev[0].connectionId);
                    }

                    const activeSocketsAfterHeartbeat = () =>
                      getSockets()
                        .filter(r => !socketsAddressesBeforeHeartbeat.includes(r.address))
                        .map(r => r.remoteEndpoint?.host + ':' + r.remoteEndpoint?.port);
                    // all servers should have had a heartbeat event and had a new socket created for rtt pinger
                    const activeSocketsBeforeClose = activeSocketsAfterHeartbeat();
                    for (const [server] of servers) {
                      expect(activeSocketsBeforeClose).to.deep.contain(server);
                    }

                    // close the client
                    await client.close();
                    // upon close, assert rttPinger sockets are cleaned up
                    const activeSocketsAfterClose = activeSocketsAfterHeartbeat();
                    expect(activeSocketsAfterClose).to.have.lengthOf(0);
                  };

                  await runScriptAndGetProcessInfo(
                    'socket-connection-rtt-monitoring',
                    this.configuration,
                    run
                  );
                });
              });
            });
          });
        });
      });

      describe('ConnectionPool', () => {
        describe('Node.js resource: minPoolSize timer', () => {
          describe('after new connection pool is created', () => {
            it.skip('the minPoolSize timer is cleaned up by client.close()', async function () {
              const run = async function ({ MongoClient, uri, expect, getTimerCount }) {
                const client = new MongoClient(uri, { minPoolSize: 1 });
                let minPoolSizeTimerCreated = false;
                client.on('connectionPoolReady', () => (minPoolSizeTimerCreated = true));
                await client.connect();

                expect(minPoolSizeTimerCreated).to.be.true;

                const servers = client.topology?.s.servers;

                function getMinPoolSizeTimer(servers) {
                  for (const [, server] of servers) {
                    return server.pool.minPoolSizeTimer;
                  }
                }
                // note: minPoolSizeCheckFrequencyMS = 100 ms by client, so this test has a chance of being flaky
                expect(getMinPoolSizeTimer(servers)).to.exist;

                await client.close();
                expect(getMinPoolSizeTimer(servers)).to.not.exist;
                expect(getTimerCount()).to.equal(0);
              };
              await runScriptAndGetProcessInfo('timer-min-pool-size', this.configuration, run);
            });
          });
        });

        describe('Node.js resource: checkOut Timer', () => {
          describe('after new connection pool is created', () => {
            let utilClient;
            const waitQueueTimeoutMS = 1515;

            beforeEach(async function () {
              utilClient = this.configuration.newClient();
              await utilClient.connect();
              const failPoint = {
                configureFailPoint: 'failCommand',
                mode: { times: 1 },
                data: {
                  appName: 'waitQueueTestClient',
                  blockConnection: true,
                  blockTimeMS: waitQueueTimeoutMS * 3,
                  failCommands: ['insert']
                }
              };
              await utilClient.db('admin').command(failPoint);
            });

            afterEach(async function () {
              await utilClient.db().admin().command({
                configureFailPoint: 'failCommand',
                mode: 'off'
              });
              await utilClient.close();
            });

            it.skip('the wait queue timer is cleaned up by client.close()', async function () {
              const run = async function ({ MongoClient, uri, expect, getTimerCount, once }) {
                const waitQueueTimeoutMS = 1515;

                const client = new MongoClient(uri, {
                  maxPoolSize: 1,
                  waitQueueTimeoutMS,
                  appName: 'waitQueueTestClient',
                  monitorCommands: true
                });
                client
                  .db('db')
                  .collection('collection')
                  .insertOne({ x: 1 })
                  .catch(e => e);
                await once(client, 'connectionCheckedOut');

                const blockedInsert = client
                  .db('db')
                  .collection('collection')
                  .insertOne({ x: 1 })
                  .catch(e => e);
                await once(client, 'connectionCheckOutStarted');

                expect(getTimerCount()).to.not.equal(0);
                await client.close();
                expect(getTimerCount()).to.equal(0);

                const err = await blockedInsert;
                expect(err).to.be.instanceOf(Error);
                expect(err.message).to.contain(
                  'Timed out while checking out a connection from connection pool'
                );
              };
              await runScriptAndGetProcessInfo('timer-check-out', this.configuration, run);
            });
          });
        });

        describe('Connection', () => {
          describe('Node.js resource: Socket', () => {
            describe('after a minPoolSize has been set on the ConnectionPool', () => {
              it.skip('no sockets remain after client.close()', async function () {
                const run = async function ({ MongoClient, uri, expect, getSockets }) {
                  // assert no sockets to start with
                  expect(getSockets()).to.have.lengthOf(0);
                  const options = { minPoolSize: 1 };
                  const client = new MongoClient(uri, options);
                  await client.connect();

                  // regardless of pool size: there should be a client connection socket for each server, and one monitor socket total
                  // with minPoolSize = 1, there should be one or more extra active sockets
                  expect(getSockets()).to.have.length.gte(client.topology?.s.servers.size + 2);

                  await client.close();

                  // assert socket clean-up
                  expect(getSockets()).to.have.lengthOf(0);
                };

                await runScriptAndGetProcessInfo('socket-minPoolSize', this.configuration, run);
              });
            });
          });
        });
      });
    });

    describe('SrvPoller', () => {
      describe('Node.js resource: Timer', () => {
        // requires an srv environment that can transition to sharded
        const metadata: MongoDBMetadataUI = { requires: { topology: 'sharded' } };

        describe('after SRVPoller is created', () => {
          it('timers are cleaned up by client.close()', metadata, async function () {
            const run = async function ({ MongoClient, expect, getTimerCount }) {
              const SRV_CONNECTION_STRING = `mongodb+srv://test1.test.build.10gen.cc`;

              // 27018 localhost.test.build.10gen.cc.
              // 27017 localhost.test.build.10gen.cc.

              const client = new MongoClient(SRV_CONNECTION_STRING, {
                serverSelectionTimeoutMS: 2000, // if something changes make this test fail faster than 30s (connect() will reject)
                tls: false // srv automatically sets tls to true, so we have to set it to false here.
              });
              await client.connect();
              // the current expected behavior is that _timeout is set to undefined until SRV polling starts
              // then _timeout is set to undefined again when SRV polling stops
              expect(client.topology.s.srvPoller._timeout).to.exist;
              await client.close();
              expect(getTimerCount()).to.equal(0);
            };
            await runScriptAndGetProcessInfo('timer-srv-poller', this.configuration, run);
          });
        });
      });
    });
  });

  describe('ClientSession (Implicit)', () => {
    let client: MongoClient;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
    });

    afterEach(async function () {
      await client.close();
    });

    describe('when MongoClient.close is called', function () {
      it('sends an endSessions command', async function () {
        await client.db('a').collection('a').insertOne({ a: 1 });
        await client.db('a').collection('a').insertOne({ a: 1 });
        await client.db('a').collection('a').insertOne({ a: 1 });
        const endSessionsStarted = events.once(client, 'commandStarted');
        const willEndSessions = events.once(client, 'commandSucceeded');

        await client.close();

        const [startedEv] = await endSessionsStarted;
        expect(startedEv).to.have.nested.property('command.endSessions').that.has.lengthOf(1);

        const [commandEv] = await willEndSessions;
        expect(commandEv).to.have.property('commandName', 'endSessions');
      });
    });
  });

  describe('ClientSession (Explicit)', () => {
    let idleSessionsBeforeClose;
    let idleSessionsAfterClose;
    let client;
    let utilClient;
    let session;

    const metadata: MongoDBMetadataUI = {
      requires: {
        topology: ['replicaset', 'sharded'],
        mongodb: '>=4.2'
      }
    };

    beforeEach(async function () {
      client = this.configuration.newClient();
      utilClient = this.configuration.newClient();
      await client.connect();
      await client
        .db('db')
        .collection('collection')
        .drop()
        .catch(() => null);
      const collection = await client.db('db').createCollection('collection');
      session = client.startSession();
      session.startTransaction();
      await collection.insertOne({ x: 1 }, { session });

      const opBefore = await utilClient.db().admin().command({ currentOp: 1 });
      idleSessionsBeforeClose = opBefore.inprog.filter(s => s.type === 'idleSession');

      await client.close();

      const opAfter = await utilClient.db().admin().command({ currentOp: 1 });
      idleSessionsAfterClose = opAfter.inprog.filter(s => s.type === 'idleSession');
    });

    afterEach(async function () {
      await utilClient?.close();
      await session?.endSession();
      await client?.close();
    });

    describe('Server resource: LSID/ServerSession', () => {
      describe('after a clientSession is created and used', () => {
        it(
          'the server-side ServerSession is cleaned up by client.close()',
          metadata,
          async function () {
            expect(idleSessionsBeforeClose).to.not.be.empty;
            expect(idleSessionsAfterClose).to.be.empty;
          }
        );
      });
    });

    describe('Server resource: Transactions', () => {
      describe('after a clientSession is created and used', () => {
        it(
          'the server-side transaction is cleaned up by client.close()',
          metadata,
          async function () {
            expect(idleSessionsBeforeClose[0].transaction.txnNumber).to.not.null;
            expect(idleSessionsAfterClose).to.be.empty;
          }
        );
      });
    });
  });

  describe('AutoEncrypter', () => {
    const metadata: MongoDBMetadataUI = {
      requires: {
        mongodb: '>=4.2.0',
        clientSideEncryption: true
      }
    };

    describe('KMS Request', () => {
      describe('Node.js resource: TLS file read', () => {
        describe('when KMSRequest reads an infinite TLS file', () => {
          it('the file read is interrupted by client.close()', metadata, async function () {
            await runScriptAndGetProcessInfo(
              'tls-file-read-auto-encryption',
              this.configuration,
              async function run({ MongoClient, uri, expect, mongodb, getCSFLEKMSProviders }) {
                const infiniteFile = '/dev/zero';

                const kmsProviders = getCSFLEKMSProviders();
                const masterKey = {
                  region: 'us-east-1',
                  key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
                };
                const provider = 'aws';

                const keyVaultClient = new MongoClient(uri);
                await keyVaultClient.connect();
                await keyVaultClient.db('keyvault').collection('datakeys');

                const clientEncryption = new mongodb.ClientEncryption(keyVaultClient, {
                  keyVaultNamespace: 'keyvault.datakeys',
                  kmsProviders
                });
                const dataKey = await clientEncryption.createDataKey(provider, { masterKey });

                function getEncryptExtraOptions() {
                  if (
                    typeof process.env.CRYPT_SHARED_LIB_PATH === 'string' &&
                    process.env.CRYPT_SHARED_LIB_PATH.length > 0
                  ) {
                    return { cryptSharedLibPath: process.env.CRYPT_SHARED_LIB_PATH };
                  }
                  return {};
                }
                const schemaMap = {
                  'db.coll': {
                    bsonType: 'object',
                    encryptMetadata: {
                      keyId: [dataKey]
                    },
                    properties: {
                      a: {
                        encrypt: {
                          bsonType: 'int',
                          algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random',
                          keyId: [dataKey]
                        }
                      }
                    }
                  }
                };
                const encryptionOptions = {
                  autoEncryption: {
                    keyVaultNamespace: 'keyvault.datakeys',
                    kmsProviders,
                    extraOptions: getEncryptExtraOptions(),
                    schemaMap,
                    tlsOptions: { aws: { tlsCAFile: infiniteFile } }
                  }
                };

                const encryptedClient = new MongoClient(uri, encryptionOptions);
                await encryptedClient.connect();

                expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');

                const insertPromise = encryptedClient
                  .db('db')
                  .collection('coll')
                  .insertOne({ a: 1 });

                expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');

                await keyVaultClient.close();
                await encryptedClient.close();

                expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');

                const err = await insertPromise.catch(e => e);
                expect(err).to.exist;
                expect(err.errmsg).to.contain('Error in KMS response');
              }
            );
          });
        });
      });

      describe('Node.js resource: Socket', () => {
        it.skip('no sockets remain after client.close()', metadata, async () => null);
      });
    });
  });

  describe('Server resource: Cursor', () => {
    const metadata: MongoDBMetadataUI = {
      requires: {
        mongodb: '>=4.2.0' // MongoServerError: Unrecognized option 'idleCursors' in $currentOp stage. on 4.0
      }
    };

    describe('after cursors are created', metadata, () => {
      let client: MongoClient;
      let coll: Collection;
      let cursor: FindCursor;
      let utilClient: MongoClient;

      beforeEach(async function () {
        client = this.configuration.newClient();
        utilClient = this.configuration.newClient();
        await client.connect();
        await client
          .db('close_db')
          .collection('close_coll')
          .drop()
          .catch(() => null);
        coll = await client.db('close_db').createCollection('close_coll');
        await coll.insertMany([{ a: 1 }, { b: 2 }, { c: 3 }]);
      });

      afterEach(async function () {
        await utilClient?.close();
        await client?.close();
        await cursor?.close();
      });

      it(
        'all active server-side cursors are closed by client.close()',
        metadata,
        async function () {
          const getCursors = async function () {
            const cursors = await utilClient
              .db('admin')
              .aggregate([{ $currentOp: { idleCursors: true } }])
              .toArray();

            return cursors.filter(c => c.ns === 'close_db.close_coll');
          };

          cursor = coll.find({}, { batchSize: 1 });
          await cursor.next();

          // assert creation
          expect(await getCursors()).to.not.be.empty;

          await client.close();

          // assert clean-up
          expect(await getCursors()).to.be.empty;
        }
      );
    });
  });
});
