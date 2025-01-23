/* eslint-disable @typescript-eslint/no-empty-function */
import { type TestConfiguration } from '../../tools/runner/config';
import { runScriptAndGetProcessInfo } from './resource_tracking_script_builder';

describe.skip('MongoClient.close() Integration', () => {
  // note: these tests are set-up in accordance of the resource ownership tree

  let config: TestConfiguration;

  beforeEach(function () {
    config = this.configuration;
  });

  describe('Node.js resource: TLS File read', () => {
    describe('when client is connecting and reads an infinite TLS file', () => {
      it('the file read is interrupted by client.close()', async function () {
        await runScriptAndGetProcessInfo(
          'tls-file-read',
          config,
          async function run({ MongoClient, uri, expect }) {
            const infiniteFile = '/dev/zero';
            const client = new MongoClient(uri, { tls: true, tlsCertificateKeyFile: infiniteFile });
            const connectPromise = client.connect();
            expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
            await client.close();
            expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');
            const err = await connectPromise.catch(e => e);
            expect(err).to.exist;
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
          return this.skip();
        }
        tokenFileEnvCache = process.env.OIDC_TOKEN_FILE;
      });

      afterEach(function () {
        process.env.OIDC_TOKEN_FILE = tokenFileEnvCache;
      });

      describe('when MongoClientAuthProviders is instantiated and token file read hangs', () => {
        it('the file read is interrupted by client.close()', async () => {
          await runScriptAndGetProcessInfo(
            'token-file-read',
            config,
            async function run({ MongoClient, uri, expect }) {
              const infiniteFile = '/dev/zero';
              process.env.OIDC_TOKEN_FILE = infiniteFile;
              const options = {
                authMechanismProperties: { ENVIRONMENT: 'test' },
                authMechanism: 'MONGODB-OIDC'
              };
              const client = new MongoClient(uri, options);
              client.connect();
              expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
              await client.close();
              expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');
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

        it('server selection timers are cleaned up by client.close()', metadata, async () => {
          const run = async function ({ MongoClient, uri, expect, sleep, mongodb, getTimerCount }) {
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
          await runScriptAndGetProcessInfo('timer-server-selection', config, run);
        });
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
              it(
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
                  await runScriptAndGetProcessInfo('timer-monitor-interval', config, run);
                }
              );
            });

            describe('after a heartbeat fails', () => {
              it(
                'the new monitor interval timer is cleaned up by client.close()',
                metadata,
                async () => {
                  const run = async function ({ MongoClient, expect, getTimerCount, once }) {
                    const heartbeatFrequencyMS = 2000;
                    const client = new MongoClient('mongodb://fakeUri', { heartbeatFrequencyMS });
                    const willBeHeartbeatFailed = once(client, 'serverHeartbeatFailed');
                    client.connect();
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
                  };
                  await runScriptAndGetProcessInfo('timer-heartbeat-failed-monitor', config, run);
                }
              );
            });
          });
        });

        describe('Monitoring Connection', () => {
          describe('Node.js resource: Socket', () => {
            it('no sockets remain after client.close()', metadata, async function () {
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
              await runScriptAndGetProcessInfo('socket-connection-monitoring', config, run);
            });
          });
        });

        describe('RTT Pinger', () => {
          describe('Node.js resource: Timer', () => {
            describe('after entering monitor streaming mode ', () => {
              it(
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
                  await runScriptAndGetProcessInfo('timer-rtt-monitor', config, run);
                }
              );
            });
          });

          describe('Connection', () => {
            describe('Node.js resource: Socket', () => {
              describe('when rtt monitoring is turned on', () => {
                it('no sockets remain after client.close()', metadata, async () => {
                  const run = async ({ MongoClient, uri, expect, getSockets, once, log }) => {
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
                      log({ ev: ev[0] });
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

                    log({ socketsAfterClose: getSockets() });
                    // upon close, assert rttPinger sockets are cleaned up
                    const activeSocketsAfterClose = activeSocketsAfterHeartbeat();
                    expect(activeSocketsAfterClose).to.have.lengthOf(0);
                  };

                  await runScriptAndGetProcessInfo('socket-connection-rtt-monitoring', config, run);
                });
              });
            });
          });
        });
      });

      describe('ConnectionPool', () => {
        describe('Node.js resource: minPoolSize timer', () => {
          describe('after new connection pool is created', () => {
            it('the minPoolSize timer is cleaned up by client.close()', async function () {
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
              await runScriptAndGetProcessInfo('timer-min-pool-size', config, run);
            });
          });
        });

        describe('Node.js resource: checkOut Timer', () => {
          describe('after new connection pool is created', () => {
            let utilClient;
            const waitQueueTimeoutMS = 1515;

            beforeEach(async function () {
              // configure failPoint
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

            it('the wait queue timer is cleaned up by client.close()', async function () {
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
              await runScriptAndGetProcessInfo('timer-check-out', config, run);
            });
          });
        });

        describe('Connection', () => {
          describe('Node.js resource: Socket', () => {
            describe('after a minPoolSize has been set on the ConnectionPool', () => {
              it('no sockets remain after client.close()', async function () {
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

                await runScriptAndGetProcessInfo('socket-minPoolSize', config, run);
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
          it('timers are cleaned up by client.close()', metadata, async () => {
            const run = async function ({ MongoClient, expect, getTimerCount }) {
              const SRV_CONNECTION_STRING = `mongodb+srv://test1.test.build.10gen.cc`;
              // 27018 localhost.test.build.10gen.cc.
              // 27017 localhost.test.build.10gen.cc.

              const client = new MongoClient(SRV_CONNECTION_STRING);
              await client.connect();
              // the current expected behavior is that _timeout is set to undefined until SRV polling starts
              // then _timeout is set to undefined again when SRV polling stops
              expect(client.topology.s.srvPoller._timeout).to.exist;
              await client.close();
              expect(getTimerCount()).to.equal(0);
            };
            await runScriptAndGetProcessInfo('timer-srv-poller', config, run);
          });
        });
      });
    });
  });

  describe('ClientSession (Implicit)', () => {
    describe('Server resource: LSID/ServerSession', () => {
      describe('after a clientSession is implicitly created and used', () => {
        it.skip('the server-side ServerSession is cleaned up by client.close()', async function () {});
      });
    });

    describe('Server resource: Transactions', () => {
      describe('after a clientSession is implicitly created and used', () => {
        it.skip('the server-side transaction is cleaned up by client.close()', async function () {});
      });
    });
  });

  describe('ClientSession (Explicit)', () => {
    describe('Server resource: LSID/ServerSession', () => {
      describe('after a clientSession is created and used', () => {
        it.skip('the server-side ServerSession is cleaned up by client.close()', async function () {});
      });
    });

    describe('Server resource: Transactions', () => {
      describe('after a clientSession is created and used', () => {
        it.skip('the server-side transaction is cleaned up by client.close()', async function () {});
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
          it('the file read is interrupted by client.close()', metadata, async () => {
            await runScriptAndGetProcessInfo(
              'tls-file-read-auto-encryption',
              config,
              async function run({ MongoClient, uri, expect, mongodb }) {
                const infiniteFile = '/dev/zero';

                const kmsProviders = mongodb.BSON.EJSON.parse(process.env.CSFLE_KMS_PROVIDERS);
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
        it.skip('no sockets remain after client.close()', metadata, async () => {});
      });
    });
  });

  describe('Server resource: Cursor', () => {
    describe('after cursors are created', () => {
      it.skip('all active server-side cursors are closed by client.close()', async function () {});
    });
  });
});
