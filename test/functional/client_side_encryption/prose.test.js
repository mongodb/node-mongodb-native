'use strict';

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const EJSON = require('mongodb-extjson');
const getKmsProviders = localKey => {
  const result = EJSON.parse(process.env.CSFLE_KMS_PROVIDERS || 'NOT_PROVIDED');
  if (localKey) {
    result.local = { key: localKey };
  }

  return result;
};

const noop = () => {};

// Tests for the ClientEncryption type are not included as part of the YAML tests.

// In the prose tests LOCAL_MASTERKEY refers to the following base64:

// .. code:: javascript

//   Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

describe('Client Side Encryption Prose Tests', function() {
  const metadata = { requires: { clientSideEncryption: true, mongodb: '>=4.2.0' } };
  const dataDbName = 'db';
  const dataCollName = 'coll';
  const dataNamespace = `${dataDbName}.${dataCollName}`;
  const keyVaultDbName = 'keyvault';
  const keyVaultCollName = 'datakeys';
  const keyVaultNamespace = `${keyVaultDbName}.${keyVaultCollName}`;

  const shared = require('../shared');
  const dropCollection = shared.dropCollection;
  const APMEventCollector = shared.APMEventCollector;

  const LOCAL_KEY = Buffer.from(
    'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
    'base64'
  );

  describe('Data key and double encryption', function() {
    // Data key and double encryption
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // First, perform the setup.
    beforeEach(function() {
      const mongodbClientEncryption = this.configuration.mongodbClientEncryption;

      // #. Create a MongoClient without encryption enabled (referred to as ``client``). Enable command monitoring to listen for command_started events.
      this.client = this.configuration.newClient(
        {},
        { useNewUrlParser: true, useUnifiedTopology: true, monitorCommands: true }
      );

      this.commandStartedEvents = new APMEventCollector(this.client, 'commandStarted', {
        exclude: ['ismaster']
      });

      const schemaMap = {
        [dataNamespace]: {
          bsonType: 'object',
          properties: {
            encrypted_placeholder: {
              encrypt: {
                keyId: '/placeholder',
                bsonType: 'string',
                algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
              }
            }
          }
        }
      };

      return (
        Promise.resolve()
          .then(() => this.client.connect())
          // #. Using ``client``, drop the collections ``keyvault.datakeys`` and ``db.coll``.
          .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
          .then(() => dropCollection(this.client.db(keyVaultDbName), keyVaultCollName))
          // #. Create the following:
          //   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
          //   - A ``ClientEncryption`` object (referred to as ``client_encryption``)
          //   Configure both objects with ``aws`` and the ``local`` KMS providers as follows:
          //   .. code:: javascript
          //       {
          //           "aws": { <AWS credentials> },
          //           "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
          //       }
          //   Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.
          //   Configure the ``MongoClient`` with the following ``schema_map``:
          //   .. code:: javascript
          //       {
          //         "db.coll": {
          //           "bsonType": "object",
          //           "properties": {
          //             "encrypted_placeholder": {
          //               "encrypt": {
          //                 "keyId": "/placeholder",
          //                 "bsonType": "string",
          //                 "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
          //               }
          //             }
          //           }
          //         }
          //       }
          //   Configure ``client_encryption`` with the ``keyVaultClient`` of the previously created ``client``.
          .then(() => {
            this.clientEncryption = new mongodbClientEncryption.ClientEncryption(this.client, {
              kmsProviders: getKmsProviders(),
              keyVaultNamespace
            });
          })
          .then(() => {
            this.clientEncrypted = this.configuration.newClient(
              {},
              {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                autoEncryption: {
                  keyVaultNamespace,
                  kmsProviders: getKmsProviders(),
                  schemaMap
                }
              }
            );
            return this.clientEncrypted.connect();
          })
      );
    });

    afterEach(function() {
      if (this.commandStartedEvents) {
        this.commandStartedEvents.teardown();
        this.commandStartedEvents = undefined;
      }
      return Promise.resolve()
        .then(() => this.clientEncrypted && this.clientEncrypted.close())
        .then(() => this.client && this.client.close());
    });

    it('should work for local KMS provider', metadata, function() {
      let localDatakeyId;
      let localEncrypted;
      return Promise.resolve()
        .then(() => {
          // #. Call ``client_encryption.createDataKey()`` with the ``local`` KMS provider and keyAltNames set to ``["local_altname"]``.
          // - Expect a BSON binary with subtype 4 to be returned, referred to as ``local_datakey_id``.
          // - Use ``client`` to run a ``find`` on ``keyvault.datakeys`` by querying with the ``_id`` set to the ``local_datakey_id``.
          // - Expect that exactly one document is returned with the "masterKey.provider" equal to "local".
          // - Check that ``client`` captured a command_started event for the ``insert`` command containing a majority writeConcern.
          this.commandStartedEvents.clear();
          return this.clientEncryption
            .createDataKey('local', { keyAltNames: ['local_altname'] })
            .then(result => {
              localDatakeyId = result;
              expect(localDatakeyId).to.have.property('sub_type', 4);
            })
            .then(() => {
              return this.client
                .db(keyVaultDbName)
                .collection(keyVaultCollName)
                .find({ _id: localDatakeyId })
                .toArray();
            })
            .then(results => {
              expect(results)
                .to.have.a.lengthOf(1)
                .and.to.have.nested.property('0.masterKey.provider', 'local');
              expect(this.commandStartedEvents.events).to.containSubset([
                { commandName: 'insert', command: { writeConcern: { w: 'majority' } } }
              ]);
            });
        })
        .then(() => {
          // #. Call ``client_encryption.encrypt()`` with the value "hello local", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_id`` of ``local_datakey_id``.
          // - Expect the return value to be a BSON binary subtype 6, referred to as ``local_encrypted``.
          // - Use ``client_encrypted`` to insert ``{ _id: "local", "value": <local_encrypted> }`` into ``db.coll``.
          // - Use ``client_encrypted`` to run a find querying with ``_id`` of "local" and expect ``value`` to be "hello local".
          const coll = this.clientEncrypted.db(dataDbName).collection(dataCollName);
          return this.clientEncryption
            .encrypt('hello local', {
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
              keyId: localDatakeyId
            })
            .then(value => {
              localEncrypted = value;
              expect(localEncrypted).to.have.property('sub_type', 6);
            })
            .then(() => coll.insertOne({ _id: 'local', value: localEncrypted }))
            .then(() => coll.findOne({ _id: 'local' }))
            .then(result => {
              expect(result).to.have.property('value', 'hello local');
            });
        })
        .then(() => {
          // #. Call ``client_encryption.encrypt()`` with the value "hello local", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_alt_name`` of ``local_altname``.
          // - Expect the return value to be a BSON binary subtype 6. Expect the value to exactly match the value of ``local_encrypted``.
          return this.clientEncryption
            .encrypt('hello local', {
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
              keyId: localDatakeyId
            })
            .then(encrypted => {
              expect(encrypted).to.deep.equal(localEncrypted);
            });
        });
    });

    it('should work for aws KMS provider', metadata, function() {
      // Then, repeat the above tests with the ``aws`` KMS provider:
      let awsDatakeyId;
      let awsEncrypted;
      return Promise.resolve()
        .then(() => {
          // #. Call ``client_encryption.createDataKey()`` with the ``aws`` KMS provider, keyAltNames set to ``["aws_altname"]``, and ``masterKey`` as follows:
          //    .. code:: javascript
          //       {
          //         region: "us-east-1",
          //         key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0"
          //       }
          //    - Expect a BSON binary with subtype 4 to be returned, referred to as ``aws_datakey_id``.
          //    - Use ``client`` to run a ``find`` on ``keyvault.datakeys`` by querying with the ``_id`` set to the ``aws_datakey_id``.
          //    - Expect that exactly one document is returned with the "masterKey.provider" equal to "aws".
          //    - Check that ``client`` captured a command_started event for the ``insert`` command containing a majority writeConcern.
          this.commandStartedEvents.clear();
          const masterKey = {
            region: 'us-east-1',
            key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
          };
          return this.clientEncryption
            .createDataKey('aws', { masterKey, keyAltNames: ['aws_altname'] })
            .then(result => {
              awsDatakeyId = result;
              expect(awsDatakeyId).to.have.property('sub_type', 4);
            })
            .then(() => {
              return this.client
                .db(keyVaultDbName)
                .collection(keyVaultCollName)
                .find({ _id: awsDatakeyId })
                .toArray();
            })
            .then(results => {
              expect(results)
                .to.have.a.lengthOf(1)
                .and.to.have.nested.property('0.masterKey.provider', 'aws');
              expect(this.commandStartedEvents.events).to.containSubset([
                { commandName: 'insert', command: { writeConcern: { w: 'majority' } } }
              ]);
            });
        })
        .then(() => {
          // #. Call ``client_encryption.encrypt()`` with the value "hello aws", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_id`` of ``aws_datakey_id``.
          //    - Expect the return value to be a BSON binary subtype 6, referred to as ``aws_encrypted``.
          //    - Use ``client_encrypted`` to insert ``{ _id: "aws", "value": <aws_encrypted> }`` into ``db.coll``.
          //    - Use ``client_encrypted`` to run a find querying with ``_id`` of "aws" and expect ``value`` to be "hello aws".
          const coll = this.clientEncrypted.db(dataDbName).collection(dataCollName);
          return this.clientEncryption
            .encrypt('hello aws', {
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
              keyId: awsDatakeyId
            })
            .then(value => {
              awsEncrypted = value;
              expect(awsEncrypted).to.have.property('sub_type', 6);
            })
            .then(() => coll.insertOne({ _id: 'aws', value: awsEncrypted }))
            .then(() => coll.findOne({ _id: 'aws' }))
            .then(result => {
              expect(result).to.have.property('value', 'hello aws');
            });
        })
        .then(() => {
          // #. Call ``client_encryption.encrypt()`` with the value "hello aws", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_alt_name`` of ``aws_altname``.
          //    - Expect the return value to be a BSON binary subtype 6. Expect the value to exactly match the value of ``aws_encrypted``.
          return this.clientEncryption
            .encrypt('hello aws', {
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
              keyId: awsDatakeyId
            })
            .then(encrypted => {
              expect(encrypted).to.deep.equal(awsEncrypted);
            });
        });
    });

    it('should error on an attempt to double-encrypt a value', metadata, function() {
      // Then, run the following final tests:
      // #. Test explicit encrypting an auto encrypted field.
      //    - Use ``client_encrypted`` to attempt to insert ``{ "encrypted_placeholder": (local_encrypted) }``
      //    - Expect an exception to be thrown, since this is an attempt to auto encrypt an already encrypted value.
      return Promise.resolve()
        .then(() => this.clientEncryption.createDataKey('local'))
        .then(keyId =>
          this.clientEncryption.encrypt('hello double', {
            keyId,
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
          })
        )
        .then(encrypted =>
          this.clientEncrypted
            .db(dataDbName)
            .collection(dataCollName)
            .insertOne({ encrypted_placeholder: encrypted })
            .then(
              () => {
                throw new Error('Expected double-encryption to fail, but it has succeeded');
              },
              err => {
                expect(err).to.be.an.instanceOf(Error);
              }
            )
        );
    });
  });

  describe('Custom Endpoint', function() {
    // Data keys created with AWS KMS may specify a custom endpoint to contact (instead of the default endpoint derived from the AWS region).

    beforeEach(function() {
      // 1. Create a ``ClientEncryption`` object (referred to as ``client_encryption``)
      //    Configure with ``aws`` KMS providers as follows:
      //    .. code:: javascript
      //       {
      //           "aws": { <AWS credentials> }
      //       }
      //    Configure with ``keyVaultNamespace`` set to ``keyvault.datakeys``, and a default MongoClient as the ``keyVaultClient``.
      this.client = this.configuration.newClient(
        {},
        { useNewUrlParser: true, useUnifiedTopology: true }
      );

      const customKmsProviders = getKmsProviders();
      customKmsProviders.azure.identityPlatformEndpoint = 'login.microsoftonline.com:443';
      customKmsProviders.gcp.endpoint = 'oauth2.googleapis.com:443';

      const invalidKmsProviders = getKmsProviders();
      invalidKmsProviders.azure.identityPlatformEndpoint = 'example.com:443';
      invalidKmsProviders.gcp.endpoint = 'example.com:443';

      return this.client.connect().then(() => {
        const mongodbClientEncryption = this.configuration.mongodbClientEncryption;
        this.clientEncryption = new mongodbClientEncryption.ClientEncryption(this.client, {
          keyVaultNamespace,
          kmsProviders: customKmsProviders
        });

        this.clientEncryptionInvalid = new mongodbClientEncryption.ClientEncryption(this.client, {
          keyVaultNamespace,
          kmsProviders: invalidKmsProviders
        });
      });
    });

    afterEach(function() {
      return this.client && this.client.close();
    });

    const testCases = [
      {
        description: 'no custom endpoint',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
        },
        succeed: true
      },
      {
        description: 'custom endpoint',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-1.amazonaws.com'
        },
        succeed: true
      },
      {
        description: 'custom endpoint with port',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-1.amazonaws.com:443'
        },
        succeed: true
      },
      {
        description: 'custom endpoint with bad url',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-1.amazonaws.com:12345'
        },
        succeed: false,
        errorValidator: err => {
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/KMS request failed/);
        }
      },
      {
        description: 'custom endpoint that does not match region',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-2.amazonaws.com'
        },
        succeed: false,
        errorValidator: err => {
          //    Expect this to fail with an exception with a message containing the string: "us-east-1"
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/us-east-1/);
        }
      },
      {
        description: 'custom endpoint with parse error',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'example.com'
        },
        succeed: false,
        errorValidator: err => {
          //    Expect this to fail with an exception with a message containing the string: "parse error"
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/parse error/);
        }
      },
      {
        description: 'azure custom endpoint',
        provider: 'azure',
        masterKey: {
          keyVaultEndpoint: 'key-vault-csfle.vault.azure.net',
          keyName: 'key-name-csfle'
        },
        succeed: true,
        checkAgainstInvalid: true
      },
      {
        description: 'gcp custom endpoint',
        provider: 'gcp',
        masterKey: {
          projectId: 'devprod-drivers',
          location: 'global',
          keyRing: 'key-ring-csfle',
          keyName: 'key-name-csfle',
          endpoint: 'cloudkms.googleapis.com:443'
        },
        succeed: true,
        checkAgainstInvalid: true
      },
      {
        description: 'gcp invalid custom endpoint',
        provider: 'gcp',
        masterKey: {
          projectId: 'devprod-drivers',
          location: 'global',
          keyRing: 'key-ring-csfle',
          keyName: 'key-name-csfle',
          endpoint: 'example.com:443'
        },
        succeed: false,
        errorValidator: err => {
          //    Expect this to fail with an exception with a message containing the string: "parse error"
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/Invalid KMS response/);
        }
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, metadata, function() {
        // 2. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:
        // .. code:: javascript
        //    {
        //      ...
        //    }
        // Expect this to succeed. Use the returned UUID of the key to explicitly encrypt and decrypt the string "test" to validate it works.
        const masterKey = testCase.masterKey;

        const promises = [];
        promises.push(
          this.clientEncryption.createDataKey(testCase.provider, { masterKey }).then(
            keyId => {
              if (!testCase.succeed) {
                throw new Error('Expected test case to fail to create data key, but it succeeded');
              }
              return this.clientEncryption
                .encrypt('test', {
                  keyId,
                  algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
                })
                .then(encrypted => this.clientEncryption.decrypt(encrypted))
                .then(result => {
                  expect(result).to.equal('test');
                });
            },
            err => {
              if (testCase.succeed) {
                throw err;
              }
              if (!testCase.errorValidator) {
                throw new Error('Invalid Error validator');
              }

              testCase.errorValidator(err);
            }
          )
        );

        if (testCase.checkAgainstInvalid) {
          promises.push(
            this.clientEncryptionInvalid.createDataKey(testCase.provider, { masterKey }).then(
              () => {
                throw new Error('Expected test case to fail to create data key, but it succeeded');
              },
              err => {
                expect(err)
                  .property('message')
                  .to.match(/parse error/);
              }
            )
          );
        }

        return Promise.all(promises);
      });
    });
  });

  describe('BSON size limits and batch splitting', function() {
    const fs = require('fs');
    const path = require('path');
    const EJSON = require('mongodb-extjson');
    function loadLimits(file) {
      return EJSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../spec/client-side-encryption/limits', file))
      );
    }

    const limitsSchema = loadLimits('limits-schema.json');
    const limitsKey = loadLimits('limits-key.json');
    const limitsDoc = loadLimits('limits-doc.json');

    before(function() {
      // First, perform the setup.

      // #. Create a MongoClient without encryption enabled (referred to as ``client``).
      this.client = this.configuration.newClient(
        {},
        { useNewUrlParser: true, useUnifiedTopology: true }
      );

      return (
        this.client
          .connect()
          // #. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `limits/limits-schema.json <../limits/limits-schema.json>`_.
          .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
          .then(() => {
            return this.client.db(dataDbName).createCollection(dataCollName, {
              validator: { $jsonSchema: limitsSchema }
            });
          })
          // #. Using ``client``, drop the collection ``keyvault.datakeys``. Insert the document `limits/limits-key.json <../limits/limits-key.json>`_
          .then(() => dropCollection(this.client.db(keyVaultDbName), keyVaultCollName))
          .then(() => {
            return this.client
              .db(keyVaultDbName)
              .collection(keyVaultCollName)
              .insertOne(limitsKey, { w: 'majority' });
          })
      );
    });

    beforeEach(function() {
      // #. Create a MongoClient configured with auto encryption (referred to as ``client_encrypted``)
      //    Configure with the ``local`` KMS provider as follows:
      //    .. code:: javascript
      //       { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
      //    Configure with the ``keyVaultNamespace`` set to ``keyvault.datakeys``.
      this.clientEncrypted = this.configuration.newClient(
        {},
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          monitorCommands: true,
          autoEncryption: {
            keyVaultNamespace,
            kmsProviders: getKmsProviders(LOCAL_KEY)
          }
        }
      );
      return this.clientEncrypted.connect().then(() => {
        this.encryptedColl = this.clientEncrypted.db(dataDbName).collection(dataCollName);
        this.commandStartedEvents = new APMEventCollector(this.clientEncrypted, 'commandStarted', {
          include: ['insert']
        });
      });
    });

    afterEach(function() {
      if (this.commandStartedEvents) {
        this.commandStartedEvents.teardown();
        this.commandStartedEvents = undefined;
      }
      if (this.clientEncrypted) {
        return this.clientEncrypted.close();
      }
    });

    after(function() {
      return this.client && this.client.close();
    });

    // Using ``client_encrypted`` perform the following operations:

    function repeatedChar(char, length) {
      return Array.from({ length })
        .map(() => char)
        .join('');
    }

    const testCases = [
      // #. Insert ``{ "_id": "over_2mib_under_16mib", "unencrypted": <the string "a" repeated 2097152 times> }``.
      //    Expect this to succeed since this is still under the ``maxBsonObjectSize`` limit.
      {
        description: 'should succeed for over_2mib_under_16mib',
        docs: () => [{ _id: 'over_2mib_under_16mib', unencrypted: repeatedChar('a', 2097152) }],
        expectedEvents: [{ commandName: 'insert' }]
      },
      // #. Insert the document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``
      //    Note: limits-doc.json is a 1005 byte BSON document that encrypts to a ~10,000 byte document.
      //    Expect this to succeed since after encryption this still is below the normal maximum BSON document size.
      //    Note, before auto encryption this document is under the 2 MiB limit. After encryption it exceeds the 2 MiB limit, but does NOT exceed the 16 MiB limit.
      {
        description: 'should succeed for encryption_exceeds_2mib',
        docs: () => [
          Object.assign({}, limitsDoc, {
            _id: 'encryption_exceeds_2mib',
            unencrypted: repeatedChar('a', 2097152 - 2000)
          })
        ],
        expectedEvents: [{ commandName: 'insert' }]
      },
      // #. Bulk insert the following:
      //    - ``{ "_id": "over_2mib_1", "unencrypted": <the string "a" repeated (2097152) times> }``
      //    - ``{ "_id": "over_2mib_2", "unencrypted": <the string "a" repeated (2097152) times> }``
      //    Expect the bulk write to succeed and split after first doc (i.e. two inserts occur). This may be verified using `command monitoring <https://github.com/mongodb/specifications/tree/master/source/command-monitoring/command-monitoring.rst>`_.
      {
        description: 'should succeed for bulk over_2mib',
        docs: () => [
          { _id: 'over_2mib_1', unencrypted: repeatedChar('a', 2097152) },
          { _id: 'over_2mib_2', unencrypted: repeatedChar('a', 2097152) }
        ],
        expectedEvents: [{ commandName: 'insert' }, { commandName: 'insert' }]
      },
      // #. Bulk insert the following:
      //    - The document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib_1", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``
      //    - The document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib_2", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``
      //    Expect the bulk write to succeed and split after first doc (i.e. two inserts occur). This may be verified using `command monitoring <https://github.com/mongodb/specifications/tree/master/source/command-monitoring/command-monitoring.rst>`_.
      {
        description: 'should succeed for bulk encryption_exceeds_2mib',
        docs: () => [
          Object.assign({}, limitsDoc, {
            _id: 'encryption_exceeds_2mib_1',
            unencrypted: repeatedChar('a', 2097152 - 2000)
          }),
          Object.assign({}, limitsDoc, {
            _id: 'encryption_exceeds_2mib_2',
            unencrypted: repeatedChar('a', 2097152 - 2000)
          })
        ],
        expectedEvents: [{ commandName: 'insert' }, { commandName: 'insert' }]
      },
      // #. Insert ``{ "_id": "under_16mib", "unencrypted": <the string "a" repeated 16777216 - 2000 times>``.
      //    Expect this to succeed since this is still (just) under the ``maxBsonObjectSize`` limit.
      {
        description: 'should succeed for under_16mib',
        docs: () => [{ _id: 'under_16mib', unencrypted: repeatedChar('a', 16777216 - 2000) }],
        expectedEvents: [{ commandName: 'insert' }]
      },
      // #. Insert the document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_16mib", "unencrypted": < the string "a" repeated (16777216 - 2000) times > }``
      //    Expect this to fail since encryption results in a document exceeding the ``maxBsonObjectSize`` limit.
      {
        description: 'should fail for encryption_exceeds_16mib',
        docs: () => [
          Object.assign({}, limitsDoc, {
            _id: 'encryption_exceeds_16mib',
            unencrypted: repeatedChar('a', 16777216 - 2000)
          })
        ],
        error: true
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, metadata, function() {
        return this.encryptedColl.insertMany(testCase.docs()).then(
          () => {
            if (testCase.error) {
              throw new Error('Expected this insert to fail, but it succeeded');
            }
            const expectedEvents = Array.from(testCase.expectedEvents);
            const actualEvents = pruneEvents(this.commandStartedEvents.events);

            expect(actualEvents)
              .to.have.a.lengthOf(expectedEvents.length)
              .and.to.containSubset(expectedEvents);
          },
          err => {
            if (!testCase.error) {
              throw err;
            }
          }
        );
      });
    });

    function pruneEvents(events) {
      return events.map(event => {
        // We are pruning out the bunch of repeating As, mostly
        // b/c an error failure will try to print 2mb of 'a's
        // and not have a good time.
        event.command = Object.assign({}, event.command);
        event.command.documents = event.command.documents.map(doc => {
          doc = Object.assign({}, doc);
          if (doc.unencrypted) {
            doc.unencrypted = "Lots of repeating 'a's";
          }
          return doc;
        });
        return event;
      });
    }
  });

  describe('Views are prohibited', function() {
    before(function() {
      // First, perform the setup.

      // #. Create a MongoClient without encryption enabled (referred to as ``client``).
      this.client = this.configuration.newClient(
        {},
        { useNewUrlParser: true, useUnifiedTopology: true }
      );

      return this.client
        .connect()
        .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
        .then(() => {
          return this.client.db(dataDbName).createCollection(dataCollName);
        })
        .then(() => {
          return this.client
            .db(dataDbName)
            .createCollection('view', { viewOn: dataCollName, pipeline: [] })
            .then(noop, noop);
        }, noop);
    });

    after(function() {
      return this.client && this.client.close();
    });

    beforeEach(function() {
      this.clientEncrypted = this.configuration.newClient(
        {},
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          autoEncryption: {
            keyVaultNamespace,
            kmsProviders: getKmsProviders(LOCAL_KEY)
          }
        }
      );

      return this.clientEncrypted.connect();
    });

    afterEach(function() {
      return this.clientEncrypted && this.clientEncrypted.close();
    });

    it('should error when inserting into a view with autoEncryption', metadata, function() {
      return this.clientEncrypted
        .db(dataDbName)
        .collection('view')
        .insertOne({ a: 1 })
        .then(
          () => {
            throw new Error('Expected insert to fail, but it succeeded');
          },
          err => {
            expect(err)
              .to.have.property('message')
              .that.matches(/cannot auto encrypt a view/);
          }
        );
    });
  });

  // TODO: We cannot implement these tests according to spec b/c the tests require a
  // connect-less client. So instead we are implementing the tests via APM,
  // and confirming that the externalClient is firing off keyVault requests during
  // encrypted operations
  describe('External Key Vault', function() {
    const fs = require('fs');
    const path = require('path');
    const EJSON = require('mongodb-extjson');
    function loadExternal(file) {
      return EJSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../spec/client-side-encryption/external', file))
      );
    }

    const externalKey = loadExternal('external-key.json');
    const externalSchema = loadExternal('external-schema.json');

    beforeEach(function() {
      this.client = this.configuration.newClient(
        {},
        { useNewUrlParser: true, useUnifiedTopology: true }
      );

      // #. Create a MongoClient without encryption enabled (referred to as ``client``).
      return (
        this.client
          .connect()
          // #. Using ``client``, drop the collections ``keyvault.datakeys`` and ``db.coll``.
          //    Insert the document `external/external-key.json <../external/external-key.json>`_ into ``keyvault.datakeys``.
          .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
          .then(() => dropCollection(this.client.db(keyVaultDbName), keyVaultCollName))
          .then(() => {
            return this.client
              .db(keyVaultDbName)
              .collection(keyVaultCollName)
              .insertOne(externalKey, { w: 'majority' });
          })
      );
    });

    afterEach(function() {
      if (this.commandStartedEvents) {
        this.commandStartedEvents.teardown();
        this.commandStartedEvents = undefined;
      }
      return Promise.resolve()
        .then(() => this.externalClient && this.externalClient.close())
        .then(() => this.clientEncrypted && this.clientEncrypted.close())
        .then(() => this.client && this.client.close());
    });

    function defineTest(withExternalKeyVault) {
      it(
        `should work ${withExternalKeyVault ? 'with' : 'without'} external key vault`,
        metadata,
        function() {
          const ClientEncryption = this.configuration.mongodbClientEncryption.ClientEncryption;
          return (
            Promise.resolve()
              .then(() => {
                //    If ``withExternalKeyVault == true``, configure both objects with an external key vault client. The external client MUST connect to the same
                //    MongoDB cluster that is being tested against, except it MUST use the username ``fake-user`` and password ``fake-pwd``.
                this.externalClient = this.configuration.newClient(
                  // this.configuration.url('fake-user', 'fake-pwd'),
                  // TODO: Do this properly
                  {},
                  { useNewUrlParser: true, useUnifiedTopology: true, monitorCommands: true }
                );

                this.commandStartedEvents = new APMEventCollector(
                  this.externalClient,
                  'commandStarted',
                  {
                    include: ['find']
                  }
                );
                return this.externalClient.connect();
              })
              // #. Create the following:
              //    - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
              //    - A ``ClientEncryption`` object (referred to as ``client_encryption``)
              //    Configure both objects with the ``local`` KMS providers as follows:
              //    .. code:: javascript
              //       { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
              //    Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.
              //    Configure ``client_encrypted`` to use the schema `external/external-schema.json <../external/external-schema.json>`_  for ``db.coll`` by setting a schema map like: ``{ "db.coll": <contents of external-schema.json>}``
              .then(() => {
                const options = {
                  keyVaultNamespace,
                  kmsProviders: getKmsProviders(LOCAL_KEY)
                };

                if (withExternalKeyVault) {
                  options.keyVaultClient = this.externalClient;
                }

                this.clientEncryption = new ClientEncryption(
                  this.client,
                  Object.assign({}, options)
                );
                this.clientEncrypted = this.configuration.newClient(
                  {},
                  {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                    autoEncryption: Object.assign({}, options, {
                      schemaMap: {
                        'db.coll': externalSchema
                      }
                    })
                  }
                );
                return this.clientEncrypted.connect();
              })
              .then(() => {
                // #. Use ``client_encrypted`` to insert the document ``{"encrypted": "test"}`` into ``db.coll``.
                //    If ``withExternalKeyVault == true``, expect an authentication exception to be thrown. Otherwise, expect the insert to succeed.
                this.commandStartedEvents.clear();
                return this.clientEncrypted
                  .db(dataDbName)
                  .collection(dataCollName)
                  .insertOne({ encrypted: 'test' })
                  .then(() => {
                    if (withExternalKeyVault) {
                      expect(this.commandStartedEvents.events).to.containSubset([
                        {
                          commandName: 'find',
                          databaseName: keyVaultDbName,
                          command: { find: keyVaultCollName }
                        }
                      ]);
                    } else {
                      expect(this.commandStartedEvents.events).to.not.containSubset([
                        {
                          commandName: 'find',
                          databaseName: keyVaultDbName,
                          command: { find: keyVaultCollName }
                        }
                      ]);
                    }
                  });
                // TODO: Do this in the spec-compliant way using bad auth credentials
                // .then(
                //   () => {
                //     if (withExternalKeyVault) {
                //       throw new Error(
                //         'expected insert to fail with authentication error, but it passed'
                //       );
                //     }
                //   },
                //   err => {
                //     if (!withExternalKeyVault) {
                //       throw err;
                //     }
                //     expect(err).to.be.an.instanceOf(Error);
                //   }
                // );
              })
              .then(() => {
                // #. Use ``client_encryption`` to explicitly encrypt the string ``"test"`` with key ID ``LOCALAAAAAAAAAAAAAAAAA==`` and deterministic algorithm.
                //    If ``withExternalKeyVault == true``, expect an authentication exception to be thrown. Otherwise, expect the insert to succeed.
                this.commandStartedEvents.clear();
                return this.clientEncryption
                  .encrypt('test', {
                    keyId: externalKey._id,
                    algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
                  })
                  .then(() => {
                    if (withExternalKeyVault) {
                      expect(this.commandStartedEvents.events).to.containSubset([
                        {
                          commandName: 'find',
                          databaseName: keyVaultDbName,
                          command: { find: keyVaultCollName }
                        }
                      ]);
                    } else {
                      expect(this.commandStartedEvents.events).to.not.containSubset([
                        {
                          commandName: 'find',
                          databaseName: keyVaultDbName,
                          command: { find: keyVaultCollName }
                        }
                      ]);
                    }
                  });
                // TODO: Do this in the spec-compliant way using bad auth credentials
                // .then(
                //   () => {
                //     if (withExternalKeyVault) {
                //       throw new Error(
                //         'expected insert to fail with authentication error, but it passed'
                //       );
                //     }
                //   },
                //   err => {
                //     if (!withExternalKeyVault) {
                //       throw err;
                //     }
                //     expect(err).to.be.an.instanceOf(Error);
                //   }
                // );
              })
          );
        }
      );
    }
    // Run the following tests twice, parameterized by a boolean ``withExternalKeyVault``.
    defineTest(true);
    defineTest(false);
  });
});
