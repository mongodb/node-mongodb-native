import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { StateMachine } from '../../../src/client-side-encryption/state_machine';
import { BSON, Connection, CSOTTimeoutContext, MongoOperationTimeoutError } from '../../mongodb';
import { type FailPoint, sleep } from '../../tools/utils';

describe('Client-Side Encryption (Integration)', function () {
  describe('CSOT', { requires: { mongodb: '>=4.2' } }, function () {
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
              blockConnection: true,
              blockTimeMS: 2000
            }
          } as FailPoint);
      });

      afterEach(async function () {
        await setupClient
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'off'
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
                keyVaultNamespace: 'data.datakeys',
                kmsProviders: {
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
                  local: { key: Buffer.alloc(96) }
                }
              }
            }
          );
        });

        afterEach(async function () {
          encryptedClient.close();
        });

        it('the command should not fail', async function () {
          const err = await encryptedClient
            .db('test')
            .collection('test')
            .aggregate([])
            .toArray()
            .catch(e => e);
          expect(err).to.deep.equal([]);
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
                blockConnection: true,
                blockTimeMS: 2000
              }
            } as FailPoint);
        });

        afterEach(async function () {
          await setupClient
            .db()
            .admin()
            .command({
              configureFailPoint: 'failCommand',
              mode: 'off'
            } as FailPoint);
          await setupClient.close();
        });

        context('when provided timeoutContext and command hangs', function () {
          let encryptedClient;

          beforeEach(async function () {
            encryptedClient = this.configuration.newClient(
              {},
              {
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
            encryptedClient = this.configuration.newClient();
            await encryptedClient.connect();
          });

          afterEach(async function () {
            await encryptedClient?.close();
          });

          it('the command should fail due to a server error', async function () {
            const err = await stateMachine
              .fetchKeys(encryptedClient, 'test.test', BSON.serialize({ a: 1 }))
              .catch(e => e);
            expect(err).to.deep.equal([]);
          });
        });
      });
    });
  });
});
