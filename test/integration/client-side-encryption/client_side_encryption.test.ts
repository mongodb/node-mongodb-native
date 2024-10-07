import { expect } from 'chai';

import { MongoOperationTimeoutError, MongoServerError } from '../../mongodb';
import { type FailPoint } from '../../tools/utils';

describe('Auto Encryption (Integration)', function () {
  describe('CSOT', function () {
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
});