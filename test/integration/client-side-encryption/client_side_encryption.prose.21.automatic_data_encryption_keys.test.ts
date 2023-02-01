import { expect } from 'chai';
import { inspect } from 'util';

import { Collection, Db, MongoServerError } from '../../mongodb';
import { installNodeDNSWorkaroundHooks } from '../../tools/runner/hooks/configuration';

const metadata = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=6.0.0',
    topology: '!single'
  }
} as const;

const documentValidationFailureCode = 121;
const typeMismatchCode = 14;

const LOCAL_KEY = Buffer.from(
  'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
  'base64'
);

describe('21. Automatic Data Encryption Keys', metadata, () => {
  installNodeDNSWorkaroundHooks();

  let db: Db;
  let clientEncryption;
  let client;
  let MongoCryptCreateEncryptedCollectionError;

  const runProseTestsFor = ({ masterKey }) => {
    beforeEach(async function () {
      client = this.configuration.newClient();
      const {
        ClientEncryption,
        MongoCryptCreateEncryptedCollectionError: MongoCryptCreateEncryptedCollectionErrorCtor
      } = this.configuration.mongodbClientEncryption;
      MongoCryptCreateEncryptedCollectionError = MongoCryptCreateEncryptedCollectionErrorCtor;

      clientEncryption = new ClientEncryption(client, {
        keyVaultClient: client,
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: { local: { key: LOCAL_KEY } }
      });

      if (typeof clientEncryption.createEncryptedCollection !== 'function') {
        if (this.currentTest)
          this.currentTest.skipReason =
            'TODO I SHOULD NOT BE SKIPPED, INSTALL FLE VERSION WITH THIS API ' + '-'.repeat(400);
        this.test?.skip();
        return;
      }

      db = client.db('automatic_data_encryption_keys');
      await db.dropDatabase().catch(() => null);
    });

    afterEach(async function () {
      await db?.dropDatabase().catch(() => null);
      await client?.close();
    });

    it('Case 1: Simple Creation and Validation', async () => {
      const createCollectionOptions = {
        encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: null }] }
      };

      const { collection } = await clientEncryption.createEncryptedCollection(db, 'testing1', {
        provider: 'local',
        createCollectionOptions,
        masterKey
      });

      expect(collection).to.be.instanceOf(Collection);
      expect(collection.namespace).to.equal('automatic_data_encryption_keys.testing1');

      const result = await collection.insertOne({ ssn: '123-45-6789' }).catch(error => error);
      expect(result).to.be.instanceOf(MongoServerError);
      expect(result).to.have.property('code', documentValidationFailureCode);
    });

    it('Case 2: Missing encryptedFields', async () => {
      const createCollectionOptions = {};

      const result = await clientEncryption
        .createEncryptedCollection(db, 'testing1', {
          provider: 'local',
          createCollectionOptions,
          masterKey
        })
        .catch(error => error);

      expect(result).to.be.instanceOf(TypeError);
    });

    it('Case 3: Invalid keyId', async () => {
      const createCollectionOptions = {
        encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: false }] }
      };

      const result = await clientEncryption
        .createEncryptedCollection(db, 'testing1', {
          provider: 'local',
          createCollectionOptions,
          masterKey
        })
        .catch(error => error);

      expect(result).to.be.instanceOf(MongoCryptCreateEncryptedCollectionError);
      expect(result).nested.property('cause.code', typeMismatchCode);
      // BSON field 'create.encryptedFields.fields.keyId' is the wrong type 'bool', expected type 'binData'
      expect(result.cause.message)
        .to.match(/bool/i)
        .and.match(/binData/i)
        .and.match(/keyId/i);
    });

    it('Case 4: Insert encrypted value', async () => {
      const createCollectionOptions = {
        encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: null }] }
      };

      const { collection, encryptedFields } = await clientEncryption.createEncryptedCollection(
        db,
        'testing1',
        {
          provider: 'local',
          createCollectionOptions,
          masterKey
        }
      );

      expect(collection).to.be.instanceOf(Collection);
      expect(collection.namespace).to.equal('automatic_data_encryption_keys.testing1');

      const ssn = clientEncryption.encrypt('123-45-6789', {
        algorithm: 'Unindexed',
        keyId: encryptedFields.fields[0].keyId
      });

      const result = await collection.insertOne({ ssn }).catch(error => error);
      expect(result).to.be.instanceOf(MongoServerError);
      expect(result).to.have.property('code', documentValidationFailureCode);
    });
  };

  for (const kmsProviderOptions of [
    { masterKey: null },
    {
      masterKey: {
        region: 'us-east-1',
        key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
      }
    }
  ]) {
    context(`provider options ${inspect(kmsProviderOptions)}`, () => {
      runProseTestsFor(kmsProviderOptions);
    });
  }
});
