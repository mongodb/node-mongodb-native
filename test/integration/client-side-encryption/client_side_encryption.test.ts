import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { StateMachine } from '../../../src/client-side-encryption/state_machine';
import {
  BSON,
  Connection,
  CSOTTimeoutContext,
  MongoOperationTimeoutError,
  MongoServerError
} from '../../mongodb';
import { type FailPoint, sleep } from '../../tools/utils';
import { createTimerSandbox } from '../../unit/timer_sandbox';

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
        context('when provided timeoutContext and command hangs', function () {
          let encryptedClient;

          beforeEach(async function () {
            encryptedClient = this.configuration.newClient(
              {},
              {
                autoEncryption: {
                  extraOptions: {
                    mongocryptdBypassSpawn: true,
                    mongocryptdURI: 'mongodb://localhost:27017/db?serverSelectionTimeoutMS=1000',
                    mongocryptdSpawnArgs: [
                      '--pidfilepath=bypass-spawning-mongocryptd.pid',
                      '--port=27017'
                    ]
                  },
                  keyVaultNamespace: 'admin.datakeys',
                  kmsProviders: {
                    aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                    local: { key: Buffer.alloc(96) }
                  }
                },
                timeoutMS: 500
              }
            );
            await encryptedClient.connect();

            const stub = sinon
              // @ts-expect-error accessing private method
              .stub(Connection.prototype, 'sendCommand')
              .callsFake(async function* (...args) {
                await sleep(1000);
                yield* stub.wrappedMethod.call(this, ...args);
              });
          });

          afterEach(async function () {
            await encryptedClient?.close();
            sinon.restore();
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
          let clock: sinon.SinonFakeTimers;
          let timerSandbox: sinon.SinonSandbox;
          let sleep;

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
            timerSandbox = createTimerSandbox();
            clock = sinon.useFakeTimers();
            sleep = promisify(setTimeout);
            const stub = sinon
              // @ts-expect-error accessing private method
              .stub(Connection.prototype, 'sendCommand')
              .callsFake(async function* (...args) {
                await sleep(1000);
                yield* stub.wrappedMethod.call(this, ...args);
              });
          });

          afterEach(async function () {
            if (clock) {
              timerSandbox.restore();
              clock.restore();
              clock = undefined;
            }
            await encryptedClient?.close();
          });

          it('the command should not fail due to a timeout error within 30 seconds', async function () {
            const sleepingFn = async () => {
              await sleep(30000);
              throw Error('Slept for 30s');
            };

            const err$ = Promise.all([
              stateMachine.markCommand(encryptedClient, 'test.test', BSON.serialize({ ping: 1 })),
              sleepingFn()
            ]).catch(e => e);
            clock.tick(30000);
            const err = await err$;
            expect(err.message).to.equal('Slept for 30s');
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
