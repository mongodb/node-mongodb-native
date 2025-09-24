import { expect } from 'chai';

import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { MongoCryptCreateEncryptedCollectionError } from '../../../src/client-side-encryption/errors';
import {
  getCSFLEKMSProviders,
  kmsCredentialsPresent,
  missingKeys
} from '../../csfle-kms-providers';
import { Collection } from '../../../src/collection';
import { MongoServerError } from '../../../src/error';
import { Db } from '../../../src/db';

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=7.0.0',
    topology: '!single'
  }
} as const;

const documentValidationFailureCode = 121;
const typeMismatchCode = 14;

describe('21. Automatic Data Encryption Keys', () => {
  let db: Db;
  let clientEncryption;
  let client;

  const runProseTestsFor = provider => {
    const masterKey = {
      aws: {
        region: 'us-east-1',
        key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
      },
      local: null
    }[provider];
    beforeEach(async function () {
      client = this.configuration.newClient();

      if (!kmsCredentialsPresent) {
        if (this.currentTest) {
          this.currentTest.skipReason =
            'This test requires FLE environment variables.  Missing keys: ' + missingKeys;
        }
        return this.currentTest?.skip();
      }

      const { aws, local } = getCSFLEKMSProviders();

      clientEncryption = new ClientEncryption(client, {
        keyVaultClient: client,
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: { aws, local }
      });

      db = client.db('automatic_data_encryption_keys');
      await db.dropDatabase().catch(() => null);
    });

    afterEach(async function () {
      await db?.dropDatabase().catch(() => null);
      await client?.close();
    });

    it('Case 1: Simple Creation and Validation', metadata, async () => {
      const createCollectionOptions = {
        encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: null }] }
      };

      const { collection } = await clientEncryption.createEncryptedCollection(db, 'testing1', {
        provider,
        createCollectionOptions,
        masterKey
      });

      expect(collection).to.be.instanceOf(Collection);
      expect(collection.namespace).to.equal('automatic_data_encryption_keys.testing1');

      const result = await collection.insertOne({ ssn: '123-45-6789' }).catch(error => error);
      expect(result).to.be.instanceOf(MongoServerError);
      expect(result).to.have.property('code', documentValidationFailureCode);
    });

    it('Case 2: Missing encryptedFields', metadata, async () => {
      const createCollectionOptions = {};

      const result = await clientEncryption
        .createEncryptedCollection(db, 'testing1', {
          provider,
          createCollectionOptions,
          masterKey
        })
        .catch(error => error);

      expect(result).to.be.instanceOf(TypeError);
    });

    it('Case 3: Invalid keyId', metadata, async () => {
      const createCollectionOptions = {
        encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: false }] }
      };

      const result = await clientEncryption
        .createEncryptedCollection(db, 'testing1', {
          provider,
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

    it('Case 4: Insert encrypted value', metadata, async () => {
      const createCollectionOptions = {
        encryptedFields: { fields: [{ path: 'ssn', bsonType: 'string', keyId: null }] }
      };

      const { collection, encryptedFields } = await clientEncryption.createEncryptedCollection(
        db,
        'testing1',
        {
          provider,
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
      expect(result).to.have.nested.property(
        'errInfo.details.schemaRulesNotSatisfied[0].propertiesNotSatisfied[0].propertyName',
        'ssn'
      );
    });
  };

  for (const provider of ['local', 'aws']) {
    context(`${provider}`, () => {
      runProseTestsFor(provider);
    });
  }
});
