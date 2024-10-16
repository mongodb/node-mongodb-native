import { expect } from 'chai';

import { ClientEncryption, type MongoClient, MongoOperationTimeoutError } from '../../mongodb';
import { type FailPoint } from '../../tools/utils';

describe('Client-Side Encryption (Integration)', function () {
  describe('CSOT', function () {
    describe('Explicit Encryption', function () {
      describe.only('#createEncryptedCollection', function () {
        let keyVaultClient: MongoClient;
        let internalClient: MongoClient;
        let clientEncryption: ClientEncryption;
        const LOCAL_MASTERKEY = Buffer.from(
          'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
          'base64'
        );

        beforeEach(async function () {
          internalClient = this.configuration.newClient();
          await internalClient.connect();
          await internalClient.db('keyvault').createCollection('datakeys');
          keyVaultClient = this.configuration.newClient({}, { timeoutMS: 100 });
          clientEncryption = new ClientEncryption(keyVaultClient, {
            keyVaultNamespace: 'keyvault.datakeys',
            kmsProviders: { local: { key: LOCAL_MASTERKEY } }
          });
          await internalClient
            .db()
            .admin()
            .command({
              configureFailPoint: 'failCommand',
              mode: {
                times: 1
              },
              data: {
                failCommands: ['create'],
                blockConnection: true,
                blockTimeMS: 0
              }
            } as FailPoint);
        });

        afterEach(async function () {
          await internalClient
            .db()
            .admin()
            .command({
              configureFailPoint: 'failCommand',
              mode: 'off'
            } as FailPoint);
          await internalClient.close();
          await keyVaultClient.close();
        });

        it(
          'times out due to timeoutMS',
          {
            requires: {
              // clientSideEncryption: true,
              mongodb: '>=7.0.0',
              topology: '!single'
            }
          },
          async function () {
            const createCollectionOptions = {
              encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: null }] }
            };

            const err = await clientEncryption
              .createEncryptedCollection(internalClient.db('db'), 'collName', {
                provider: 'local',
                createCollectionOptions,
                masterKey: { local: LOCAL_MASTERKEY }
              })
              .catch(err => err);

            expect(err).to.be.instanceOf(MongoOperationTimeoutError);
          }
        );
      });
    });
  });
});
