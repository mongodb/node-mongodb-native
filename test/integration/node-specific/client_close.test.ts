/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from 'chai';
import * as sinon from 'sinon';
import { MongoClient } from '../../mongodb';
import { type TestConfiguration } from '../../tools/runner/config';
import { runScriptAndGetProcessInfo } from './resource_tracking_script_builder';
import { sleep } from '../../tools/utils';
import { ConnectionPool, Timeout } from '../../mongodb';

describe.only('MongoClient.close() Integration', () => {
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
        it.only('server selection timers are cleaned up by client.close()', async () => {
            // note: this test is not called in a separate process since it requires stubbing internal class: Timeout
            const run = async function ({ MongoClient, uri, expect, sinon, sleep, getTimerCount }) {
              const serverSelectionTimeoutMS = 777;
              const client = new MongoClient(uri, { minPoolSize: 1, serverSelectionTimeoutMS });
              const timeoutStartedSpy = sinon.spy(Timeout, 'expires');
              let serverSelectionTimeoutStarted = false;

              // make server selection hang so check out timer isn't cleared and check that the timeout has started
              sinon.stub(Promise, 'race').callsFake(() => {
                serverSelectionTimeoutStarted = timeoutStartedSpy.getCalls().filter(r => r.args.includes(777)).flat().length > 0;
              });

              client.db('db').collection('collection').insertOne({ x: 1 }).catch(e => e);

              // don't allow entire checkout timer to elapse to ensure close is called mid-timeout
              await sleep(serverSelectionTimeoutMS / 2);
              expect(serverSelectionTimeoutStarted).to.be.true;

              await client.close();
              expect(getTimerCount()).to.equal(0);
            };

            const getTimerCount = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
            await run({ MongoClient, uri: config.uri, sleep, sinon, expect, getTimerCount});
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
              it('monitor interval timer is cleaned up by client.close()',  metadata, async function () {
                const run = async function ({ MongoClient, uri, expect, sleep, getTimerCount }) {
                  const heartbeatFrequencyMS = 2000;
                  const client = new MongoClient(uri, { heartbeatFrequencyMS });
                  let heartbeatHappened = false;
                  client.on('serverHeartbeatSucceeded', () => heartbeatHappened = true);
                  await client.connect();
                  await sleep(heartbeatFrequencyMS * 2.5);
                  expect(heartbeatHappened).to.be.true;

                  function getMonitorTimer(servers) {
                    for (const server of servers) {
                      return server[1]?.monitor.monitorId.timerId;
                    }
                  };
                  const servers = client.topology.s.servers;
                  expect(getMonitorTimer(servers)).to.exist;
                  await client.close();
                  expect(getMonitorTimer(servers)).to.not.exist;

                  expect(getTimerCount()).to.equal(0);
                };

                await runScriptAndGetProcessInfo('timer-monitor-interval', config, run);
              });
            });

            describe('after a heartbeat fails', () => {
              it.skip('the new monitor interval timer is cleaned up by client.close()', metadata, async () => {});
            });
          });
        });

        describe('Connection Monitoring', () => {
          describe('Node.js resource: Socket', () => {
            it('no sockets remain after client.close()', metadata, async function () {
              const run = async function ({ MongoClient, uri, expect }) {
                const client = new MongoClient(uri);
                await client.connect();

                // returns all active tcp endpoints
                const connectionMonitoringReport = () =>
                  process.report
                    .getReport()
                    .libuv.filter(r => r.type === 'tcp')
                    .map(r => r.remoteEndpoint);

                const servers = client.topology?.s.servers;
                // assert socket creation
                for (const server of servers) {
                  const { host, port } = server[1].s.description.hostAddress;
                  expect(connectionMonitoringReport()).to.deep.include({ host, port });
                }

                await client.close();

                // assert socket destruction
                for (const server of servers) {
                  const { host, port } = server[1].s.description.hostAddress;
                  expect(connectionMonitoringReport()).to.not.deep.include({ host, port });
                }
              };
              await runScriptAndGetProcessInfo('socket-connection-monitoring', config, run);
            });
          });
        });

        describe('RTT Pinger', () => {
          describe('Node.js resource: Timer', () => {
            describe('after entering monitor streaming mode ', () => {
              it('the rtt pinger timer is cleaned up by client.close()', metadata, async function () {
                const run = async function ({ MongoClient, uri, expect, sleep, getTimerCount }) {
                  const heartbeatFrequencyMS = 2000;
                  const client = new MongoClient(uri, {
                    serverMonitoringMode: 'stream',
                    heartbeatFrequencyMS
                  });
                  await client.connect();

                  let heartbeatHappened = false;
                  client.on('serverHeartbeatSucceeded', () => heartbeatHappened = true);
                  await sleep(heartbeatFrequencyMS * 2.5);
                  expect(heartbeatHappened).to.be.true;

                  function getRttTimer(servers) {
                    for (const server of servers) {
                      return server[1]?.monitor.rttPinger.monitorId;
                    }
                  };

                  const servers = client.topology.s.servers;
                  expect(getRttTimer(servers)).to.exist;

                  await client.close();
                  expect(getRttTimer(servers)).to.not.exist;

                  expect(getTimerCount()).to.equal(0);
                };

                await runScriptAndGetProcessInfo('timer-rtt-monitor', config, run);
              });
            });
          });

          describe('Connection', () => {
            describe('Node.js resource: Socket', () => {
              describe('when rtt monitoring is turned on', () => {
                it('no sockets remain after client.close()', metadata, async () => {
                  const run = async ({ MongoClient, uri, expect, sleep }) => {
                    const heartbeatFrequencyMS = 100;
                    const client = new MongoClient(uri, {
                      serverMonitoringMode: 'stream',
                      heartbeatFrequencyMS
                    });
                    await client.connect();

                    const activeSocketsReport = () =>
                      process.report.getReport().libuv.filter(r => r.type === 'tcp');

                    const socketsAddressesBeforeHeartbeat = activeSocketsReport().map(
                      r => r.address
                    );

                    const activeSocketsAfterHeartbeat = () =>
                      activeSocketsReport()
                        .filter(r => !socketsAddressesBeforeHeartbeat.includes(r.address))
                        .map(r => r.remoteEndpoint?.host + ':' + r.remoteEndpoint?.port);

                    // set of servers whose hearbeats have occurred
                    const heartbeatOccurredSet = new Set();

                    client.on('serverHeartbeatSucceeded', async ev =>
                      heartbeatOccurredSet.add(ev.connectionId)
                    );

                    // ensure there is enough time for the events to occur
                    await sleep(heartbeatFrequencyMS * 10);

                    // all servers should have had a heartbeat event and had a new socket created for rtt pinger
                    const servers = client.topology.s.servers;
                    for (const server of servers) {
                      expect(heartbeatOccurredSet).to.deep.contain(server[0]);
                      expect(activeSocketsAfterHeartbeat()).to.deep.contain(server[0]);
                    }

                    // close the client
                    await client.close();

                    // upon close, assert rttPinger sockets are cleaned up
                    const activeSocketsAfterClose = activeSocketsAfterHeartbeat();
                    expect(activeSocketsAfterClose).to.have.length(0);
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
                  for (const server of servers) {
                    return server[1].pool.minPoolSizeTimer;
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
          // waitQueueTimeoutMS
          describe('after new connection pool is created', () => {
            it('the wait queue timer is cleaned up by client.close()', async function () {
              // note: this test is not called in a separate process since it requires stubbing internal function
              const run = async function ({ MongoClient, uri, expect, sinon, sleep, getTimerCount }) {
                const waitQueueTimeoutMS = 999;
                const client = new MongoClient(uri, { minPoolSize: 1, waitQueueTimeoutMS });
                const timeoutStartedSpy = sinon.spy(Timeout, 'expires');
                let checkoutTimeoutStarted = false;

                // make waitQueue hang so check out timer isn't cleared and check that the timeout has started
                sinon.stub(ConnectionPool.prototype, 'processWaitQueue').callsFake(async () => {
                  checkoutTimeoutStarted = timeoutStartedSpy.getCalls().map(r => r.args).filter(r => r.includes(999)) ? true : false;
                });

                client.db('db').collection('collection').insertOne({ x: 1 }).catch(e => e);

                // don't allow entire checkout timer to elapse to ensure close is called mid-timeout
                await sleep(waitQueueTimeoutMS / 2);
                expect(checkoutTimeoutStarted).to.be.true;

                await client.close();
                expect(getTimerCount()).to.equal(0);
              };

              const getTimerCount = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
              await run({ MongoClient, uri: config.uri, sleep, sinon, expect, getTimerCount});
            });
          });
        });

        describe('Connection', () => {
          describe('Node.js resource: Socket', () => {
            describe('after a minPoolSize has been set on the ConnectionPool', () => {
              it('no sockets remain after client.close()', async function () {
                const run = async function ({ MongoClient, uri, expect }) {
                  const connectionMonitoringReport = () =>
                    process.report.getReport().libuv.filter(r => r.type === 'tcp');

                  // assert no sockets to start with
                  expect(connectionMonitoringReport()).to.have.length(0);
                  const options = { minPoolSize: 1 };
                  const client = new MongoClient(uri, options);
                  await client.connect();

                  // regardless of pool size: there should be a client connection socket for each server, and one monitor socket total
                  // with minPoolSize = 1, there should be one or more extra active sockets
                  expect(connectionMonitoringReport()).to.have.length.gte(
                    client.topology?.s.servers.size + 2
                  );

                  await client.close();

                  // assert socket clean-up
                  expect(connectionMonitoringReport()).to.have.length(0);
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
        // srv polling is not available for load-balanced mode
        const metadata: MongoDBMetadataUI = {
          requires: {
            topology: ['single', 'replicaset', 'sharded']
          }
        };
        describe('after SRVPoller is created', () => {
          it.skip('timers are cleaned up by client.close()', metadata, async () => {
            const run = async function ({ MongoClient, uri, expect, log, sinon, mongodb, getTimerCount }) {
              const dns = require('dns');

              sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
                throw { code: 'ENODATA' };
              });
              sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
                const formattedUri = mongodb.HostAddress.fromString(uri.split('//')[1]);
                return [
                  {
                    name: formattedUri.host,
                    port: formattedUri.port,
                    weight: 0,
                    priority: 0,
                    protocol: formattedUri.host.isIPv6 ? 'IPv6' : 'IPv4'
                  }
                ];
              });
              /* sinon.stub(mongodb, 'checkParentDomainMatch').callsFake(async () => {
                console.log('in here!!!');
              }); */

              const client = new MongoClient('mongodb+srv://localhost');
              await client.connect();
              await client.close();
              expect(getTimerCount()).to.equal(0);
              sinon.restore();
            };

            const getTimerCount = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
            // await run({ MongoClient, uri: config.uri, sleep, sinon, expect, mongodb, getTimerCount});
            await runScriptAndGetProcessInfo('srv-poller-timer', config, run);
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
          it('the file read is interrupted by client.close()', async () => {
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
