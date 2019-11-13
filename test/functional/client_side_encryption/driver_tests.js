'use strict';

const crypto = require('crypto');
const BSON = require('bson');
const bson = new BSON();
const chai = require('chai');
const expect = chai.expect;
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;
chai.use(require('chai-subset'));

describe('Client Side Encryption Functional', function() {
  // See if we can run these tests
  if (process.env.AWS_ACCESS_KEY_ID == null || process.env.AWS_SECRET_ACCESS_KEY == null) {
    console.log('skipping Client Side Encryption Corpus tests due to lack of AWS credentials');
    return;
  }

  let mongodbClientEncryption;
  try {
    mongodbClientEncryption = require('mongodb-client-encryption')(require('../../../index'));
  } catch (e) {
    console.log(
      'skipping Client Side Encryption Functional tests due to inability to load mongodb-client-encryption'
    );
    return;
  }

  const dataDbName = 'db';
  const dataCollName = 'coll';
  const keyVaultDbName = 'admin';
  const keyVaultCollName = 'datakeys';
  const keyVaultNamespace = `${keyVaultDbName}.${keyVaultCollName}`;

  describe('BSON Options', function() {
    beforeEach(function() {
      this.client = this.configuration.newClient({}, { useUnifiedTopology: true });

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

      const kmsProviders = {
        local: {
          key: crypto.randomBytes(96)
        }
      };
      return this.client
        .connect()
        .then(() => {
          encryption = new mongodbClientEncryption.ClientEncryption(this.client, {
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
              useUnifiedTopology: true,
              autoEncryption: {
                keyVaultNamespace,
                kmsProviders
              }
            }
          );
          return this.encryptedClient.connect();
        });
    });

    afterEach(function() {
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

      it(name, function() {
        const data = {
          a: 12,
          b: new BSON.Int32(12),
          c: new BSON.Long(12),
          d: new BSON.Double(12),
          e: /[A-Za-z0-9]*/,
          f: new BSON.BSONRegExp('[A-Za-z0-9]*'),
          g: undefined
        };

        const expected = bson.deserialize(bson.serialize(data, bsonOptions), bsonOptions);

        const coll = this.encryptedClient.db(dataDbName).collection(dataCollName);
        return Promise.resolve()
          .then(() => coll.insertOne(data, bsonOptions))
          .then(result => coll.findOne({ _id: result.insertedId }, bsonOptions))
          .then(actual => expect(actual).to.containSubset(expected));
      });
    });
  });
});
