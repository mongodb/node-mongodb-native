import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { StateMachine } from '../../../src/client-side-encryption/state_machine';
import {
  BSON,
  CSOTTimeoutContext,
  MongoOperationTimeoutError,
  MongoServerError
} from '../../mongodb';
import { type FailPoint } from '../../tools/utils';

describe('Client-Side Encryption (Integration)', function () {
  describe('CSOT', function () {
    describe('Auto encryption', function () {
      let setupClient;

      beforeEach(async function () {
        setupClient = this.configuration.newClient();
        await setupClient
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['aggregate'],
              errorCode: 89
            }
          } as FailPoint);
      });

      afterEach(async function () {
        await setupClient
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'off',
            data: {
              failCommands: ['aggregate'],
              errorCode: 89
            }
          } as FailPoint);
        await setupClient.close();
      });

      context('when client is provided timeoutMS and command hangs', function () {
        let encryptedClient;

        beforeEach(async function () {
          encryptedClient = this.configuration.newClient(
            {},
            {
              autoEncryption: {
                keyVaultNamespace: 'admin.datakeys',
                kmsProviders: {
                  aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                  local: { key: Buffer.alloc(96) }
                }
              },
              timeoutMS: 1000
            }
          );
          await encryptedClient.connect();
        });

        afterEach(async function () {
          await encryptedClient.close();
        });

        it('the command should fail due to a timeout error', async function () {
          const err = await encryptedClient
            .db('test')
            .collection('test')
            .aggregate([])
            .toArray()
            .catch(e => e);
          expect(err).to.be.instanceOf(MongoOperationTimeoutError);
        });
      });

      context('when client is not provided timeoutMS and command hangs', function () {
        let encryptedClient;
        beforeEach(async function () {
          encryptedClient = this.configuration.newClient(
            {},
            {
              autoEncryption: {
                keyVaultNamespace: 'admin.datakeys',
                kmsProviders: {
                  aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                  local: { key: Buffer.alloc(96) }
                }
              }
            }
          );
        });

        afterEach(async function () {
          encryptedClient.close();
        });

        it('the command should fail due to a server error', async function () {
          const err = await encryptedClient
            .db('test')
            .collection('test')
            .aggregate([])
            .toArray()
            .catch(e => e);
          expect(err).to.be.instanceOf(MongoServerError);
        });
      });
    });

    describe('State machine', function () {
      const stateMachine = new StateMachine({} as any);

      const timeoutContext = () => {
        return new CSOTTimeoutContext({
          timeoutMS: 500,
          serverSelectionTimeoutMS: 30000
        });
      };

      describe('#markCommand', function () {
        context.skip('when provided timeoutContext and command hangs', function () {
          let encryptedClient;
          let setupClient;

          beforeEach(async function () {
            encryptedClient = this.configuration.newClient(
              {},
              {
                autoEncryption: {
                  keyVaultNamespace: 'admin.datakeys',
                  kmsProviders: {
                    aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                    local: { key: Buffer.alloc(96) }
                  }
                },
                timeoutMS: 1000
              }
            );
            await encryptedClient.connect();
            setupClient = this.configuration.newClient();
            await setupClient
              .db()
              .admin()
              .command({
                configureFailPoint: 'failCommand',
                mode: 'alwaysOn',
                data: {
                  failCommands: ['ping'],
                  errorCode: 89
                }
              } as FailPoint);
          });

          afterEach(async function () {
            await encryptedClient?.close();
            await setupClient
              .db()
              .admin()
              .command({
                configureFailPoint: 'failCommand',
                mode: 'off',
                data: {
                  failCommands: ['ping'],
                  errorCode: 89
                }
              } as FailPoint);
            await setupClient.close();
          });

          it('the command should fail due to a timeout error', async function () {
            const err = await stateMachine
              .markCommand(
                encryptedClient,
                'test.test',
                BSON.serialize({ ping: 1 }),
                timeoutContext()
              )
              .catch(e => e);
            expect(err).to.be.instanceOf(MongoOperationTimeoutError);
          });
        });

        context('when not provided timeoutContext and command hangs', function () {
          let encryptedClient;
          let setupClient;

          beforeEach(async function () {
            encryptedClient = this.configuration.newClient(
              {},
              {
                autoEncryption: {
                  keyVaultNamespace: 'admin.datakeys',
                  kmsProviders: {
                    aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                    local: { key: Buffer.alloc(96) }
                  }
                }
              }
            );
            await encryptedClient.connect();
            setupClient = this.configuration.newClient();
            await setupClient
              .db()
              .admin()
              .command({
                configureFailPoint: 'failCommand',
                mode: 'alwaysOn',
                data: {
                  failCommands: ['ping'],
                  errorCode: 89
                }
              } as FailPoint);
          });

          afterEach(async function () {
            await encryptedClient?.close();
            await setupClient
              .db()
              .admin()
              .command({
                configureFailPoint: 'failCommand',
                mode: 'off',
                data: {
                  failCommands: ['ping'],
                  errorCode: 89
                }
              } as FailPoint);
            await setupClient.close();
          });

          it('the command should fail due to a server error', async function () {
            const err = await stateMachine
              .markCommand(encryptedClient, 'test.test', BSON.serialize({ ping: 1 }))
              .catch(e => e);
            expect(err).to.be.instanceOf(MongoServerError);
          });
        });
      });

      describe('#fetchKeys', function () {
        let setupClient;

        beforeEach(async function () {
          setupClient = this.configuration.newClient();
          await setupClient
            .db()
            .admin()
            .command({
              configureFailPoint: 'failCommand',
              mode: 'alwaysOn',
              data: {
                failCommands: ['find'],
                errorCode: 89
              }
            } as FailPoint);
        });

        afterEach(async function () {
          await setupClient
            .db()
            .admin()
            .command({
              configureFailPoint: 'failCommand',
              mode: 'off',
              data: {
                failCommands: ['find'],
                errorCode: 89
              }
            } as FailPoint);
          await setupClient.close();
        });

        context('when provided timeoutContext and command hangs', function () {
          let encryptedClient;

          beforeEach(async function () {
            encryptedClient = this.configuration.newClient(
              {},
              {
                autoEncryption: {
                  keyVaultNamespace: 'admin.datakeys',
                  kmsProviders: {
                    aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                    local: { key: Buffer.alloc(96) }
                  }
                },
                timeoutMS: 1000
              }
            );
            await encryptedClient.connect();
          });

          afterEach(async function () {
            await encryptedClient?.close();
          });

          it('the command should fail due to a timeout error', async function () {
            const err = await stateMachine
              .fetchKeys(encryptedClient, 'test.test', BSON.serialize({ a: 1 }), timeoutContext())
              .catch(e => e);
            expect(err).to.be.instanceOf(MongoOperationTimeoutError);
          });
        });

        context('when not provided timeoutContext and command hangs', function () {
          let encryptedClient;

          beforeEach(async function () {
            encryptedClient = this.configuration.newClient(
              {},
              {
                autoEncryption: {
                  keyVaultNamespace: 'admin.datakeys',
                  kmsProviders: {
                    aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                    local: { key: Buffer.alloc(96) }
                  }
                }
              }
            );
            await encryptedClient.connect();
          });

          afterEach(async function () {
            await encryptedClient?.close();
          });

          it('the command should fail due to a server error', async function () {
            const err = await stateMachine
              .fetchKeys(encryptedClient, 'test.test', BSON.serialize({ a: 1 }))
              .catch(e => e);
            expect(err).to.be.instanceOf(MongoServerError);
          });
        });
      });
    });
  });
});
