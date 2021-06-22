'use strict';

const crypto = require('crypto');
const BSON = require('bson');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

describe('Client Side Encryption Functional', function () {
  const dataDbName = 'db';
  const dataCollName = 'coll';
  const keyVaultDbName = 'keyvault';
  const keyVaultCollName = 'datakeys';
  const keyVaultNamespace = `${keyVaultDbName}.${keyVaultCollName}`;

  const metadata = {
    requires: {
      mongodb: '>=4.2.0',
      clientSideEncryption: true
    }
  };

  it('CSFLE_KMS_PROVIDERS should be valid EJSON', function () {
    if (process.env.CSFLE_KMS_PROVIDERS) {
      /**
       * The shape of CSFLE_KMS_PROVIDERS is as follows:
       *
       * interface CSFLE_kms_providers {
       *    aws: {
       *      accessKeyId: string;
       *      secretAccessKey: string;
       *   };
       *   azure: {
       *     tenantId: string;
       *     clientId: string;
       *     clientSecret: string;
       *   };
       *   gcp: {
       *     email: string;
       *     privateKey: string;
       *   };
       *   local: {
       *     // EJSON handle converting this, its actually the canonical -> { $binary: { base64: string; subType: string } }
       *     // **NOTE**: The dollar sign has to be escaped when using this as an ENV variable
       *     key: Binary;
       *   }
       * }
       */
      expect(() => BSON.EJSON.parse(process.env.CSFLE_KMS_PROVIDERS)).to.not.throw(SyntaxError);
    } else {
      this.skip();
    }
  });

  describe('BSON Options', function () {
    beforeEach(function () {
      this.client = this.configuration.newClient();

      const noop = () => {};
      function encryptSchema(keyId, bsonType) {
        return {
          encrypt: {
            bsonType,
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random',
            keyId: [keyId]
          }
        };
      }

      let encryption;
      let dataDb;
      let keyVaultDb;

      const mongodbClientEncryption = this.configuration.mongodbClientEncryption;
      const kmsProviders = this.configuration.kmsProviders('local', crypto.randomBytes(96));
      return this.client
        .connect()
        .then(() => {
          encryption = new mongodbClientEncryption.ClientEncryption(this.client, {
            bson: BSON,
            keyVaultNamespace,
            kmsProviders
          });
        })
        .then(() => (dataDb = this.client.db(dataDbName)))
        .then(() => (keyVaultDb = this.client.db(keyVaultDbName)))
        .then(() => dataDb.dropCollection(dataCollName).catch(noop))
        .then(() => keyVaultDb.dropCollection(keyVaultCollName).catch(noop))
        .then(() => keyVaultDb.createCollection(keyVaultCollName))
        .then(() => encryption.createDataKey('local'))
        .then(dataKey => {
          const $jsonSchema = {
            bsonType: 'object',
            properties: {
              a: encryptSchema(dataKey, 'int'),
              b: encryptSchema(dataKey, 'int'),
              c: encryptSchema(dataKey, 'long'),
              d: encryptSchema(dataKey, 'double')
            }
          };
          return dataDb.createCollection(dataCollName, {
            validator: { $jsonSchema }
          });
        })
        .then(() => {
          this.encryptedClient = this.configuration.newClient(
            {},
            {
              autoEncryption: {
                keyVaultNamespace,
                kmsProviders
              }
            }
          );
          return this.encryptedClient.connect();
        });
    });

    afterEach(function () {
      return Promise.resolve()
        .then(() => this.encryptedClient && this.encryptedClient.close())
        .then(() => this.client.close());
    });

    const testCases = [
      {},
      {
        promoteValues: true
      },
      {
        promoteValues: false
      },
      {
        promoteValues: true,
        promoteLongs: false
      },
      {
        promoteValues: true,
        promoteLongs: true
      },
      {
        bsonRegExp: true
      },
      {
        ignoreUndefined: true
      }
    ];

    testCases.forEach(bsonOptions => {
      const name = `should respect bson options ${JSON.stringify(bsonOptions)}`;

      it(name, metadata, function () {
        const data = {
          a: 12,
          b: new BSON.Int32(12),
          c: new BSON.Long(12),
          d: new BSON.Double(12),
          e: /[A-Za-z0-9]*/,
          f: new BSON.BSONRegExp('[A-Za-z0-9]*'),
          g: undefined
        };

        const expected = BSON.deserialize(BSON.serialize(data, bsonOptions), bsonOptions);

        const coll = this.encryptedClient.db(dataDbName).collection(dataCollName);
        return Promise.resolve()
          .then(() => coll.insertOne(data, bsonOptions))
          .then(result => coll.findOne({ _id: result.insertedId }, bsonOptions))
          .then(actual => expect(actual).to.containSubset(expected));
      });
    });
  });
});
