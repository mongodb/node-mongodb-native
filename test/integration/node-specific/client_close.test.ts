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
            const client = new MongoClient(uri, { tlsCertificateKeyFile: infiniteFile });
            client.connect();
            expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
            await client.close();
            expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');
          }
        );
      });
    });
  });

  describe('Node.js resource: .dockerenv file access', () => {
    describe('when client is connecting and fs.access stalls while accessing .dockerenv file', () => {
      it('the file access is not interrupted by client.close()', async function () {}).skipReason =
        'TODO(NODE-6624): Align Client.Close Test Cases with Finalized Design';
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
        it('server selection timers are cleaned up by client.close()', async () => {});
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
              it('monitor interval timer is cleaned up by client.close()', async () => {});
            });

            describe('after a heartbeat fails', () => {
              it('the new monitor interval timer is cleaned up by client.close()', async () => {});
            });
          });
        });

        describe('Connection Monitoring', () => {
          describe('Node.js resource: Socket', () => {
            it('no sockets remain after client.close()', metadata, async function () {});
          });

          describe('Server resource: connection thread', () => {
            it('no connection threads remain after client.close()', metadata, async () => {});
          });
        });

        describe('RTT Pinger', () => {
          describe('Node.js resource: Timer', () => {
            describe('after entering monitor streaming mode ', () => {
              it('the rtt pinger timer is cleaned up by client.close()', async () => {
                // helloReply has a topologyVersion defined
              });
            });
          });

          describe('Connection', () => {
            describe('Node.js resource: Socket', () => {
              describe('when rtt monitoring is turned on', () => {
                it('no sockets remain after client.close()', async () => {});
              });
            });

            describe('Server resource: connection thread', () => {
              describe('when rtt monitoring is turned on', () => {
                it('no server-side connection threads remain after client.close()', async () => {});
              });
            });
          });
        });
      });

      describe('ConnectionPool', () => {
        describe('Node.js resource: minPoolSize timer', () => {
          describe('after new connection pool is created', () => {
            it('the minPoolSize timer is cleaned up by client.close()', async () => {});
          });
        });

        describe('Node.js resource: checkOut Timer', () => {
          // waitQueueTimeoutMS
          describe('after new connection pool is created', () => {
            it('the wait queue timer is cleaned up by client.close()', async () => {});
          });
        });

        describe('Connection', () => {
          describe('Node.js resource: Socket', () => {
            describe('after a connection is checked out', () => {
              it('no sockets remain after client.close()', async () => {});
            });

            describe('after a minPoolSize has been set on the ConnectionPool', () => {
              it('no sockets remain after client.close()', async () => {});
            });
          });

          describe('Server-side resource: Connection thread', () => {
            describe('after a connection is checked out', () => {
              it('no connection threads remain after client.close()', async () => {});
            });

            describe('after a minPoolSize has been set on the ConnectionPool', () => {
              it('no connection threads remain after client.close()', async () => {});
            });
          });
        });
      });
    });

    describe('SrvPoller', () => {
      describe('Node.js resource: Timer', () => {
        describe('after SRVPoller is created', () => {
          it('timers are cleaned up by client.close()', async () => {});
        });
      });
    });
  });

  describe('ClientSession (Implicit)', () => {
    describe('Server resource: LSID/ServerSession', () => {
      describe('after a clientSession is implicitly created and used', () => {
        it('the server-side ServerSession is cleaned up by client.close()', async function () {});
      });
    });

    describe('Server resource: Transactions', () => {
      describe('after a clientSession is implicitly created and used', () => {
        it('the server-side transaction is cleaned up by client.close()', async function () {});
      });
    });
  });

  describe('ClientSession (Explicit)', () => {
    describe('Server resource: LSID/ServerSession', () => {
      describe('after a clientSession is created and used', () => {
        it('the server-side ServerSession is cleaned up by client.close()', async function () {});
      });
    });

    describe('Server resource: Transactions', () => {
      describe('after a clientSession is created and used', () => {
        it('the server-side transaction is cleaned up by client.close()', async function () {});
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
              async function run({ MongoClient, uri, expect, ClientEncryption, BSON }) {
                const infiniteFile = '/dev/zero';

                const kmsProviders = BSON.EJSON.parse(process.env.CSFLE_KMS_PROVIDERS);
                const masterKey = {
                  region: 'us-east-1',
                  key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
                };
                const provider = 'aws';

                const keyVaultClient = new MongoClient(uri);
                await keyVaultClient.connect();
                await keyVaultClient.db('keyvault').collection('datakeys');

                const clientEncryption = new ClientEncryption(keyVaultClient, {
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
        it('no sockets remain after client.close()', metadata, async () => {});
      });
    });
  });

  describe('ClientEncryption', () => {
    describe('KMS Request', () => {
      describe('Node.js resource: TLS file read', () => {
        describe('when KMSRequest reads an infinite TLS file read', () => {
          it('the file read is interrupted by client.close()', async () => {
            await runScriptAndGetProcessInfo(
              'tls-file-read-client-encryption',
              config,
              async function run({ MongoClient, uri, expect, ClientEncryption, BSON }) {
                const infiniteFile = '/dev/zero';
                const kmsProviders = BSON.EJSON.parse(process.env.CSFLE_KMS_PROVIDERS);
                const masterKey = {
                  region: 'us-east-1',
                  key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
                };
                const provider = 'aws';

                const keyVaultClient = new MongoClient(uri);
                await keyVaultClient.connect();

                await keyVaultClient.db('keyvault').collection('datakeys');
                const clientEncryption = new ClientEncryption(keyVaultClient, {
                  keyVaultNamespace: 'keyvault.datakeys',
                  kmsProviders,
                  tlsOptions: { aws: { tlsCAFile: infiniteFile } }
                });

                const dataKeyPromise = clientEncryption.createDataKey(provider, { masterKey });

                expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');

                await keyVaultClient.close();

                expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');

                const err = await dataKeyPromise.catch(e => e);
                expect(err).to.exist;
                expect(err.errmsg).to.contain('Error in KMS response');
              }
            );
          });
        });
      });

      describe('Node.js resource: Socket', () => {
        it('no sockets remain after client.close()', async () => {});
      });
    });
  });

  describe('Server resource: Cursor', () => {
    describe('after cursors are created', () => {
      it('all active server-side cursors are closed by client.close()', async function () {});
    });
  });
});
