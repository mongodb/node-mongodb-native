'use strict';
const BSON = require('bson');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const { dropCollection, APMEventCollector } = require('../shared');

const { EJSON } = BSON;
const { LEGACY_HELLO_COMMAND, MongoCryptError } = require('../../mongodb');
const { MongoServerError, MongoServerSelectionError, MongoClient } = require('../../mongodb');
const { getEncryptExtraOptions } = require('../../tools/utils');

const {
  externalSchema
} = require('../../spec/client-side-encryption/external/external-schema.json');
/* eslint-disable no-restricted-modules */
const { ClientEncryption } = require('../../../src/client-side-encryption/client_encryption');
const { getCSFLEKMSProviders } = require('../../csfle-kms-providers');
const { AlpineTestConfiguration } = require('../../tools/runner/config');

const getKmsProviders = (localKey, kmipEndpoint, azureEndpoint, gcpEndpoint) => {
  const result = getCSFLEKMSProviders();
  if (localKey) {
    result.local = { key: localKey };
  }
  result.kmip = {
    endpoint: kmipEndpoint || 'localhost:5698'
  };

  if (result.azure && azureEndpoint) {
    result.azure.identityPlatformEndpoint = azureEndpoint;
  }

  if (result.gcp && gcpEndpoint) {
    result.gcp.endpoint = gcpEndpoint;
  }

  return result;
};

const noop = () => {};
const metadata = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=4.2.0',
    topology: '!load-balanced'
  }
};

const eeMetadata = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=7.0.0',
    topology: ['replicaset', 'sharded']
  }
};

// Tests for the ClientEncryption type are not included as part of the YAML tests.

// In the prose tests LOCAL_MASTERKEY refers to the following base64:

// .. code:: javascript

//   Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk
describe('Client Side Encryption Prose Tests', metadata, function () {
  const dataDbName = 'db';
  const dataCollName = 'coll';
  const dataNamespace = `${dataDbName}.${dataCollName}`;
  const keyVaultDbName = 'keyvault';
  const keyVaultCollName = 'datakeys';
  const keyVaultNamespace = `${keyVaultDbName}.${keyVaultCollName}`;

  const LOCAL_KEY = Buffer.from(
    'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
    'base64'
  );

  describe('Data key and double encryption', function () {
    // Data key and double encryption
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // First, perform the setup.
    beforeEach(function () {
      // 1. Create a MongoClient without encryption enabled (referred to as ``client``). Enable command monitoring to listen for command_started events.
      this.client = this.configuration.newClient({}, { monitorCommands: true });

      this.commandStartedEvents = new APMEventCollector(this.client, 'commandStarted', {
        exclude: [LEGACY_HELLO_COMMAND]
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
          // 2. Using ``client``, drop the collections ``keyvault.datakeys`` and ``db.coll``.
          .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
          .then(() => dropCollection(this.client.db(keyVaultDbName), keyVaultCollName))
          // 3. Create the following:
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
            this.clientEncryption = new ClientEncryption(this.client, {
              kmsProviders: getKmsProviders(),
              keyVaultNamespace,
              extraOptions: getEncryptExtraOptions()
            });
          })
          .then(() => {
            this.clientEncrypted = this.configuration.newClient(
              {},
              {
                autoEncryption: {
                  keyVaultNamespace,
                  kmsProviders: getKmsProviders(),
                  extraOptions: getEncryptExtraOptions(),
                  schemaMap
                }
              }
            );
            return this.clientEncrypted.connect();
          })
      );
    });

    afterEach(function () {
      if (this.commandStartedEvents) {
        this.commandStartedEvents.teardown();
        this.commandStartedEvents = undefined;
      }
      return Promise.resolve()
        .then(() => this.clientEncrypted && this.clientEncrypted.close())
        .then(() => this.client && this.client.close());
    });

    it('should work for local KMS provider', metadata, function () {
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

    it('should work for aws KMS provider', metadata, function () {
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

    it('should error on an attempt to double-encrypt a value', metadata, function () {
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

  // TODO(NODE-4000): We cannot implement these tests according to spec b/c the tests require a
  // connect-less client. So instead we are implementing the tests via APM,
  // and confirming that the externalClient is firing off keyVault requests during
  // encrypted operations
  describe('External Key Vault Test', function () {
    function loadExternal(file) {
      return EJSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../spec/client-side-encryption/external', file))
      );
    }

    const externalKey = loadExternal('external-key.json');
    const externalSchema = loadExternal('external-schema.json');

    beforeEach(function () {
      this.client = this.configuration.newClient();

      // 1. Create a MongoClient without encryption enabled (referred to as ``client``).
      return (
        this.client
          .connect()
          // 2. Using ``client``, drop the collections ``keyvault.datakeys`` and ``db.coll``.
          //    Insert the document `external/external-key.json <../external/external-key.json>`_ into ``keyvault.datakeys``.
          .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
          .then(() => dropCollection(this.client.db(keyVaultDbName), keyVaultCollName))
          .then(() => {
            return this.client
              .db(keyVaultDbName)
              .collection(keyVaultCollName)
              .insertOne(externalKey, { writeConcern: { w: 'majority' } });
          })
      );
    });

    afterEach(function () {
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
        function () {
          return (
            Promise.resolve()
              .then(() => {
                //    If ``withExternalKeyVault == true``, configure both objects with an external key vault client. The external client MUST connect to the same
                //    MongoDB cluster that is being tested against, except it MUST use the username ``fake-user`` and password ``fake-pwd``.
                this.externalClient = this.configuration.newClient(
                  // this.configuration.url('fake-user', 'fake-pwd'),
                  // TODO: Do this properly
                  {},
                  { monitorCommands: true }
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
              // 3. Create the following:
              //    - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
              //    - A ``ClientEncryption`` object (referred to as ``client_encryption``)
              //    Configure both objects with the ``local`` KMS providers as follows:
              //    .. code:: javascript
              //       { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
              //    Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.
              //    Configure ``client_encrypted`` to use the schema `external/external-schema.json <../external/external-schema.json>`_  for ``db.coll`` by setting a schema map like: ``{ "db.coll": <contents of external-schema.json>}``
              .then(() => {
                const options = {
                  bson: BSON,
                  keyVaultNamespace,
                  kmsProviders: getKmsProviders(LOCAL_KEY),
                  extraOptions: getEncryptExtraOptions()
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
                // 4. Use ``client_encrypted`` to insert the document ``{"encrypted": "test"}`` into ``db.coll``.
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
                // 5. Use ``client_encryption`` to explicitly encrypt the string ``"test"`` with key ID ``LOCALAAAAAAAAAAAAAAAAA==`` and deterministic algorithm.
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

  describe('BSON size limits and batch splitting', function () {
    function loadLimits(file) {
      return EJSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../spec/client-side-encryption/limits', file))
      );
    }

    const limitsSchema = loadLimits('limits-schema.json');
    const limitsKey = loadLimits('limits-key.json');
    const limitsDoc = loadLimits('limits-doc.json');

    let hasRunFirstTimeSetup = false;

    beforeEach(async function () {
      if (hasRunFirstTimeSetup) {
        // Even though we have to use a beforeEach here
        // We still only want the following code to be run *once*
        // before all the tests that follow
        return;
      }
      hasRunFirstTimeSetup = true;
      // First, perform the setup.

      // 1. Create a MongoClient without encryption enabled (referred to as ``client``).
      this.client = this.configuration.newClient();

      await this.client
        .connect()
        // 2. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `limits/limits-schema.json <../limits/limits-schema.json>`_.
        .then(() => dropCollection(this.client.db(dataDbName), dataCollName))
        .then(() => {
          return this.client.db(dataDbName).createCollection(dataCollName, {
            validator: { $jsonSchema: limitsSchema }
          });
        })
        // 3. Using ``client``, drop the collection ``keyvault.datakeys``. Insert the document `limits/limits-key.json <../limits/limits-key.json>`_
        .then(() => dropCollection(this.client.db(keyVaultDbName), keyVaultCollName))
        .then(() => {
          return this.client
            .db(keyVaultDbName)
            .collection(keyVaultCollName)
            .insertOne(limitsKey, { writeConcern: { w: 'majority' } });
        });
    });

    beforeEach(function () {
      // 4. Create a MongoClient configured with auto encryption (referred to as ``client_encrypted``)
      //    Configure with the ``local`` KMS provider as follows:
      //    .. code:: javascript
      //       { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
      //    Configure with the ``keyVaultNamespace`` set to ``keyvault.datakeys``.
      this.clientEncrypted = this.configuration.newClient(
        {},
        {
          monitorCommands: true,
          autoEncryption: {
            keyVaultNamespace,
            kmsProviders: getKmsProviders(LOCAL_KEY),
            extraOptions: getEncryptExtraOptions()
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

    afterEach(function () {
      if (this.commandStartedEvents) {
        this.commandStartedEvents.teardown();
        this.commandStartedEvents = undefined;
      }
      if (this.clientEncrypted) {
        return this.clientEncrypted.close();
      }
    });

    afterEach(function () {
      return this.client && this.client.close();
    });

    // Using ``client_encrypted`` perform the following operations:

    function repeatedChar(char, length) {
      return Array.from({ length })
        .map(() => char)
        .join('');
    }

    const testCases = [
      // 1. Insert ``{ "_id": "over_2mib_under_16mib", "unencrypted": <the string "a" repeated 2097152 times> }``.
      //    Expect this to succeed since this is still under the ``maxBsonObjectSize`` limit.
      {
        description: 'should succeed for over_2mib_under_16mib',
        docs: () => [{ _id: 'over_2mib_under_16mib', unencrypted: repeatedChar('a', 2097152) }],
        expectedEvents: [{ commandName: 'insert' }]
      },
      // 2. Insert the document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``
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
      // 3. Bulk insert the following:
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
      // 4. Bulk insert the following:
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
      // 5. Insert ``{ "_id": "under_16mib", "unencrypted": <the string "a" repeated 16777216 - 2000 times>``.
      //    Expect this to succeed since this is still (just) under the ``maxBsonObjectSize`` limit.
      {
        description: 'should succeed for under_16mib',
        docs: () => [{ _id: 'under_16mib', unencrypted: repeatedChar('a', 16777216 - 2000) }],
        expectedEvents: [{ commandName: 'insert' }]
      },
      // 6. Insert the document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_16mib", "unencrypted": < the string "a" repeated (16777216 - 2000) times > }``
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
      it(testCase.description, metadata, function () {
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

  describe('Views are prohibited', function () {
    beforeEach(function () {
      // First, perform the setup.

      // 1. Create a MongoClient without encryption enabled (referred to as ``client``).
      this.client = this.configuration.newClient();

      // 2. Using client, drop and create a view named db.view with an empty pipeline.
      // E.g. using the command { "create": "view", "viewOn": "coll" }.
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

    afterEach(function () {
      return this.client && this.client.close();
    });

    beforeEach(function () {
      // 3. Create a MongoClient configured with auto encryption (referred to as client_encrypted)
      // Configure with the local KMS provider
      this.clientEncrypted = this.configuration.newClient(
        {},
        {
          autoEncryption: {
            keyVaultNamespace,
            kmsProviders: getKmsProviders(LOCAL_KEY),
            extraOptions: getEncryptExtraOptions()
          }
        }
      );

      return this.clientEncrypted.connect();
    });

    afterEach(function () {
      return this.clientEncrypted && this.clientEncrypted.close();
    });

    // 4. Using client_encrypted, attempt to insert a document into db.view.
    // Expect an exception to be thrown containing the message: "cannot auto encrypt a view".
    it('should error when inserting into a view with autoEncryption', metadata, function () {
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

  describe('Corpus Test', function () {
    it('runs in a separate suite', () => {
      expect(() =>
        fs.statSync(path.resolve(__dirname, './client_side_encryption.prose.06.corpus.test.ts'))
      ).not.to.throw();
    });
  });

  describe('Custom Endpoint Test', function () {
    // Data keys created with AWS KMS may specify a custom endpoint to contact (instead of the default endpoint derived from the AWS region).

    beforeEach(function () {
      // 1. Create a ``ClientEncryption`` object (referred to as ``client_encryption``)
      //    Configure with ``aws`` KMS providers as follows:
      //    .. code:: javascript
      //       {
      //           "aws": { <AWS credentials> }
      //       }
      //    Configure with ``keyVaultNamespace`` set to ``keyvault.datakeys``, and a default MongoClient as the ``keyVaultClient``.
      this.client = this.configuration.newClient();

      const customKmsProviders = getKmsProviders();
      customKmsProviders.azure.identityPlatformEndpoint = 'login.microsoftonline.com:443';
      customKmsProviders.gcp.endpoint = 'oauth2.googleapis.com:443';

      const invalidKmsProviders = getKmsProviders();
      invalidKmsProviders.azure.identityPlatformEndpoint = 'doesnotexist.invalid:443';
      invalidKmsProviders.gcp.endpoint = 'doesnotexist.invalid:443';
      invalidKmsProviders.kmip.endpoint = 'doesnotexist.local:5698';

      return this.client.connect().then(() => {
        this.clientEncryption = new ClientEncryption(this.client, {
          bson: BSON,
          keyVaultNamespace,
          kmsProviders: customKmsProviders,
          tlsOptions: {
            kmip: {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            }
          },
          extraOptions: getEncryptExtraOptions()
        });

        this.clientEncryptionInvalid = new ClientEncryption(this.client, {
          keyVaultNamespace,
          kmsProviders: invalidKmsProviders,
          tlsOptions: {
            kmip: {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            }
          },
          extraOptions: getEncryptExtraOptions()
        });
      });
    });

    afterEach(function () {
      return this.client && this.client.close();
    });

    const testCases = [
      {
        description: '1. aws: no custom endpoint',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
        },
        succeed: true
      },
      {
        description: '2. aws: custom endpoint',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-1.amazonaws.com'
        },
        succeed: true
      },
      {
        description: '3. aws: custom endpoint with port',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-1.amazonaws.com:443'
        },
        succeed: true
      },
      {
        description: '4. aws: custom endpoint with bad url',
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
        description: '5. aws: custom endpoint that does not match region',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'kms.us-east-2.amazonaws.com'
        },
        succeed: false,
        errorValidator: err => {
          expect(err).to.be.an.instanceOf(Error);
        }
      },
      {
        description: '6. aws: custom endpoint with parse error',
        provider: 'aws',
        masterKey: {
          region: 'us-east-1',
          key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
          endpoint: 'doesnotexist.invalid'
        },
        succeed: false,
        errorValidator: err => {
          // Expect this to fail with a network exception indicating failure to resolve "doesnotexist.invalid".
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/KMS request failed/);
        }
      },
      {
        description: '7. azure: custom endpoint',
        provider: 'azure',
        masterKey: {
          keyVaultEndpoint: 'key-vault-csfle.vault.azure.net',
          keyName: 'key-name-csfle'
        },
        succeed: true,
        checkAgainstInvalid: true
      },
      {
        description: '8. gcp: custom endpoint',
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
        description: '9. gcp: invalid custom endpoint',
        provider: 'gcp',
        masterKey: {
          projectId: 'devprod-drivers',
          location: 'global',
          keyRing: 'key-ring-csfle',
          keyName: 'key-name-csfle',
          endpoint: 'doesnotexist.invalid:443'
        },
        succeed: false,
        errorValidator: err => {
          // Expect this to fail with a network exception indicating failure to resolve "doesnotexist.invalid".
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/Invalid KMS response/);
        }
      },
      {
        description: '10. kmip: no custom endpoint',
        provider: 'kmip',
        masterKey: {
          keyId: '1'
        },
        succeed: true,
        checkAgainstInvalid: true
      },
      {
        description: '11. kmip: custom endpoint',
        provider: 'kmip',
        masterKey: {
          keyId: '1',
          endpoint: 'localhost:5698'
        },
        succeed: true
      },
      {
        description: '12. kmip: invalid custom endpoint',
        provider: 'kmip',
        masterKey: {
          keyId: '1',
          endpoint: 'doesnotexist.local:5698'
        },
        succeed: false,
        errorValidator: err => {
          expect(err)
            .to.be.an.instanceOf(Error)
            .and.to.have.property('message')
            .that.matches(/KMS request failed/);
        }
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, metadata, function () {
        // Call `client_encryption.createDataKey()` with <provider> as the provider and the following masterKey:
        // .. code:: javascript
        //    {
        //      ...
        //    }
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
                  .to.match(/KMS request failed/);
              }
            )
          );
        }

        return Promise.all(promises);
      });
    });
  });

  describe('Bypass spawning mongocryptd', function () {
    describe('via mongocryptdBypassSpawn', function () {
      let clientEncrypted;
      // Create a MongoClient configured with auto encryption
      // Configure the required options. use the `local` KMS provider as follows:
      // ```javascript
      // { "local" : {"key": <base64 decoding of LOCAL_MASTERKEY>} }
      // ```
      // configure with the `keyVaultNamespace` set to `keyvault.datakeys`
      // configure with `client_encrypted` to use the schema `external/external-schema.json` for
      // `db.coll` by setting a schema map like `{"db.coll": <contents of external-schema.json }`
      beforeEach(async function () {
        if (this.configuration instanceof AlpineTestConfiguration) {
          this.currentTest.skipReason =
            'alpine tests cannot spawn mongocryptds or use the crypt_shared.';
          this.skip();
        }

        clientEncrypted = this.configuration.newClient(
          {},
          {
            // Configure the required options. use the `local` KMS provider as follows:
            // ```javascript
            // { "local" : {"key": <base64 decoding of LOCAL_MASTERKEY>} }
            // ```
            // configure with the `keyVaultNamespace` set to `keyvault.datakeys`
            // configure with `client_encrypted` to use the schema `external/external-schema.json` for
            // `db.coll` by setting a schema map like `{"db.coll": <contents of external-schema.json }`
            autoEncryption: {
              keyVaultNamespace,
              kmsProviders: { local: { key: LOCAL_KEY } },
              schemaMap: { dataNamespace: externalSchema },
              // Configure the following `extraOptions`
              // {
              //    "mongocryptdBypassSpawn": true
              //    "mongocryptdURI": "mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000",
              //    "mongocryptdSpawnArgs": [ "--pidfilepath=bypass-spawning-mongocryptd.pid", "--port=27021"]
              // }
              extraOptions: {
                mongocryptdBypassSpawn: true,
                mongocryptdURI: 'mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000',
                mongocryptdSpawnArgs: [
                  '--pidfilepath=bypass-spawning-mongocryptd.pid',
                  '--port=27021'
                ],
                cryptSharedLibSearchPaths: []
              }
            }
          }
        );
      });

      beforeEach('precondition: the shared library must NOT be loaded', function () {
        const { cryptSharedLibPath } = getEncryptExtraOptions();
        if (cryptSharedLibPath) {
          this.currentTest.skipReason =
            'test requires that the shared library NOT is present, but CRYPT_SHARED_LIB_PATH is set.';
          this.skip();
        }
        // the presence of the shared library can only be reliably determine after
        // libmongocrypt has been initialized, and can be detected with the
        // cryptSharedLibVersionInfo getter on the autoEncrypter.
        expect(!!clientEncrypted.autoEncrypter.cryptSharedLibVersionInfo).to.be.false;
      });

      afterEach(async function () {
        await clientEncrypted?.close();
      });

      it('does not spawn mongocryptd', metadata, async function () {
        // Use client_encrypted to insert the document {"encrypted": "test"} into db.coll.
        // Expect a server selection error propagated from the internal MongoClient failing to connect to mongocryptd on port 27021.
        const insertError = await clientEncrypted
          .db(dataDbName)
          .collection(dataCollName)
          .insertOne({ encrypted: 'test' })
          .catch(e => e);

        expect(insertError).to.be.instanceOf(MongoServerSelectionError);

        expect(insertError, 'Error must contain ECONNREFUSED').to.satisfy(
          error =>
            /ECONNREFUSED/.test(error.message) ||
            !!error.cause?.cause?.errors?.every(e => e.code === 'ECONNREFUSED')
        );
      });
    });

    describe('via bypassAutoEncryption', function () {
      let clientEncrypted;
      let client;
      // Create a MongoClient configured with auto encryption
      // Configure the required options. use the `local` KMS provider as follows:
      // ```javascript
      // { "local" : {"key": <base64 decoding of LOCAL_MASTERKEY>} }
      // ```
      // configure with the `keyVaultNamespace` set to `keyvault.datakeys`
      // configure with bypassAutoEncryption=true.
      // `db.coll` by setting a schema map like `{"db.coll": <contents of external-schema.json }`
      beforeEach(async function () {
        clientEncrypted = this.configuration.newClient(
          {},
          {
            // Configure the required options. use the `local` KMS provider as follows:
            // ```javascript
            // { "local" : {"key": <base64 decoding of LOCAL_MASTERKEY>} }
            // ```
            // configure with the `keyVaultNamespace` set to `keyvault.datakeys`
            // Configure with bypassAutoEncryption=true.
            autoEncryption: {
              keyVaultNamespace,
              bypassAutoEncryption: true,
              kmsProviders: { local: { key: LOCAL_KEY } },
              extraOptions: {
                // Configure the following extraOptions
                // ```javascript
                // {
                //    "mongocryptdSpawnArgs": [ "--pidfilepath=bypass-spawning-mongocryptd.pid", "--port=27021"]
                // }
                //```
                mongocryptdSpawnArgs: [
                  '--pidfilepath=bypass-spawning-mongocryptd.pid',
                  '--port=27021'
                ]
              }
            }
          }
        );

        // Use client_encrypted to insert the document {"unencrypted": "test"} into db.coll.
        await clientEncrypted.connect();
        const insertResult = await clientEncrypted
          .db(dataDbName)
          .collection(dataCollName)
          .insertOne({ unencrypted: 'test' });

        // Expect this to succeed.
        expect(insertResult).to.have.property('insertedId');
      });

      beforeEach('precondition: the shared library must NOT be loaded', function () {
        const { cryptSharedLibPath } = getEncryptExtraOptions();
        if (cryptSharedLibPath) {
          this.currentTest.skipReason =
            'test requires that the shared library NOT is present, but CRYPT_SHARED_LIB_PATH is set.';
          this.skip();
        }
        // the presence of the shared library can only be reliably determine after
        // libmongocrypt has been initialized, and can be detected with the
        // cryptSharedLibVersionInfo getter on the autoEncrypter.
        expect(!!clientEncrypted.autoEncrypter.cryptSharedLibVersionInfo).to.be.false;
      });

      afterEach(async function () {
        await clientEncrypted?.close();
        await client?.close();
      });

      // Validate that mongocryptd was not spawned. Create a MongoClient to localhost:27021
      // (or whatever was passed via --port) with serverSelectionTimeoutMS=1000. Run a handshake
      // command and ensure it fails with a server selection timeout.
      it('does not spawn mongocryptd', metadata, async function () {
        client = new MongoClient('mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000');
        const error = await client.connect().catch(e => e);

        expect(error, 'Error MUST be a MongoServerSelectionError error').to.be.instanceOf(
          MongoServerSelectionError
        );
        expect(error, 'Error MUST contain ECONNREFUSED information').to.satisfy(
          error =>
            /ECONNREFUSED/.test(error.message) ||
            !!error.cause?.cause?.errors?.every(e => e.code === 'ECONNREFUSED')
        );
      });
    });

    describe('via loading shared library', function () {
      let clientEncrypted;
      let client;

      beforeEach(function () {
        const { cryptSharedLibPath } = getEncryptExtraOptions();
        if (!cryptSharedLibPath) {
          this.currentTest.skipReason =
            'test requires that the shared library is present, but CRYPT_SHARED_LIB_PATH is unset.';
          this.skip();
        }
      });

      // Setup
      beforeEach(async function () {
        const { cryptSharedLibPath } = getEncryptExtraOptions();
        // 1. Create a MongoClient configured with auto encryption (referred to as `client_encrypted`)
        clientEncrypted = this.configuration.newClient(
          {},
          {
            // 2. Configure the required options. use the `local` KMS provider as follows:
            // ```javascript
            // { "local" : {"key": <base64 decoding of LOCAL_MASTERKEY>} }
            // ```
            // configure with the `keyVaultNamespace` set to `keyvault.datakeys`
            // configure with `client_encrypted` to use the schema `external/external-schema.json` for
            // `db.coll` by setting a schema map like `{"db.coll": <contents of external-schema.json }`
            autoEncryption: {
              keyVaultNamespace,
              kmsProviders: { local: { key: LOCAL_KEY } },
              // Configure the following `extraOptions`
              // {
              //    "mongocryptdURI": "mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000",
              //    "mongocryptdSpawnArgs": [ "--pidfilepath=bypass-spawning-mongocryptd.pid", "--port=27021"],
              //    "cryptSharedLibPath": "<path to shared library>",
              //    "cryptSharedRequired": true
              // }
              extraOptions: {
                mongocryptdURI: 'mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000',
                mongocryptdSpawnArgs: [
                  '--pidfilepath=bypass-spawning-mongocryptd.pid',
                  '--port=27021'
                ],
                cryptdSharedLibRequired: true,
                cryptSharedLibPath
              },
              schemaMap: externalSchema
            }
          }
        );
        // 3. Use `client_encrypted` to insert the document `{"unencrypted": "test"}` into `db.coll`
        // expect this to succeed
        await clientEncrypted.connect();
        const insertResult = await clientEncrypted
          .db(dataDbName)
          .collection(dataCollName)
          .insertOne({ unencrypted: 'test' });
        expect(insertResult).to.have.property('insertedId');
      });

      afterEach(async function () {
        await clientEncrypted?.close();
        await client?.close();
      });

      // 4. Validate that mongocryptd was not spawned. Create a MongoClient to localhost:27021 (or
      // whatever was passed via `--port` with serverSelectionTimeoutMS=1000.) Run a handshake
      // command and ensure it fails with a server selection timeout
      it('should not spawn mongocryptd', metadata, async function () {
        client = new MongoClient('mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000');
        const error = await client.connect().catch(e => e);
        expect(error).to.be.instanceOf(MongoServerSelectionError, /'Server selection timed out'/i);
      });
    });
  });

  /**
   * - Create client encryption no tls
   * - Create client encryption with tls
   * - Create client encryption expired
   * - Create client encryption invalid hostname
   */
  context('KMS TLS Options Tests', metadata, function () {
    let clientNoTls;
    let clientWithTls;
    let clientWithTlsExpired;
    let clientWithInvalidHostname;
    let clientEncryptionNoTls;
    let clientEncryptionWithTls;
    let clientEncryptionWithTlsExpired;
    let clientEncryptionWithInvalidHostname;
    let clientEncryptionWithNames;
    let keyvaultClient;

    beforeEach(async function () {
      const tlsCaOptions = {
        aws: {
          tlsCAFile: process.env.CSFLE_TLS_CA_FILE
        },
        azure: {
          tlsCAFile: process.env.CSFLE_TLS_CA_FILE
        },
        gcp: {
          tlsCAFile: process.env.CSFLE_TLS_CA_FILE
        },
        kmip: {
          tlsCAFile: process.env.CSFLE_TLS_CA_FILE
        }
      };
      const clientNoTlsOptions = {
        keyVaultNamespace,
        kmsProviders: getKmsProviders(null, null, '127.0.0.1:9002', '127.0.0.1:9002'),
        tlsOptions: tlsCaOptions,
        extraOptions: getEncryptExtraOptions()
      };
      const clientWithTlsOptions = {
        keyVaultNamespace,
        kmsProviders: getKmsProviders(null, null, '127.0.0.1:9002', '127.0.0.1:9002'),
        tlsOptions: {
          aws: {
            tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
            tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
          },
          azure: {
            tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
            tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
          },
          gcp: {
            tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
            tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
          },
          kmip: {
            tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
            tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
          }
        },
        extraOptions: getEncryptExtraOptions()
      };
      const clientWithTlsExpiredOptions = {
        keyVaultNamespace,
        kmsProviders: getKmsProviders(null, '127.0.0.1:9000', '127.0.0.1:9000', '127.0.0.1:9000'),
        tlsOptions: tlsCaOptions,
        extraOptions: getEncryptExtraOptions()
      };
      const clientWithInvalidHostnameOptions = {
        keyVaultNamespace,
        kmsProviders: getKmsProviders(null, '127.0.0.1:9001', '127.0.0.1:9001', '127.0.0.1:9001'),
        tlsOptions: tlsCaOptions,
        extraOptions: getEncryptExtraOptions()
      };

      switch (this.currentTest.title) {
        case 'should fail with no TLS':
          clientNoTls = this.configuration.newClient({}, { autoEncryption: clientNoTlsOptions });
          clientEncryptionNoTls = new ClientEncryption(clientNoTls, {
            ...clientNoTlsOptions,
            bson: BSON
          });
          await clientNoTls.connect();
          break;
        case 'should succeed with valid TLS options':
          clientWithTls = this.configuration.newClient(
            {},
            { autoEncryption: clientWithTlsOptions }
          );
          clientEncryptionWithTls = new ClientEncryption(clientWithTls, {
            ...clientWithTlsOptions,
            bson: BSON
          });
          await clientWithTls.connect();
          break;
        case 'should fail with an expired certificate':
          clientWithTlsExpired = this.configuration.newClient(
            {},
            { autoEncryption: clientWithTlsExpiredOptions }
          );
          clientEncryptionWithTlsExpired = new ClientEncryption(clientWithTlsExpired, {
            ...clientWithTlsExpiredOptions,
            bson: BSON
          });
          await clientWithTlsExpired.connect();
          break;
        case 'should fail with an invalid hostname':
          clientWithInvalidHostname = this.configuration.newClient(
            {},
            { autoEncryption: clientWithInvalidHostnameOptions }
          );
          clientEncryptionWithInvalidHostname = new ClientEncryption(clientWithInvalidHostname, {
            ...clientWithInvalidHostnameOptions,
            bson: BSON
          });
          await clientWithInvalidHostname.connect();
          break;
        case 'Named AWS':
        case 'Named Azure':
        case 'Named GCP':
        case 'Named KMIP':
          break;
        default:
          throw new Error('unexpected test case: ' + this.currentTest.title);
      }
    });

    afterEach(async function () {
      const allClients = [
        clientNoTls,
        clientWithTls,
        clientWithTlsExpired,
        clientWithInvalidHostname,
        keyvaultClient
      ];
      for (const client of allClients) {
        if (client) {
          await client.close();
        }
      }
    });

    // Case 1.
    context('Case 1: AWS', metadata, function () {
      const masterKey = {
        region: 'us-east-1',
        key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
        endpoint: '127.0.0.1:9002'
      };
      const masterKeyExpired = { ...masterKey, endpoint: '127.0.0.1:9000' };
      const masterKeyInvalidHostname = { ...masterKey, endpoint: '127.0.0.1:9001' };

      it('should fail with no TLS', metadata, async function () {
        try {
          await clientEncryptionNoTls.createDataKey('aws', { masterKey });
          expect.fail('it must fail with no tls');
        } catch (e) {
          // Expect an error indicating TLS handshake failed.
          expect(e.cause.message).to.include('certificate required');
        }
      });

      it('should succeed with valid TLS options', metadata, async function () {
        try {
          await clientEncryptionWithTls.createDataKey('aws', { masterKey });
          expect.fail('it must fail to parse response');
        } catch (e) {
          // Expect an error from libmongocrypt with a message containing the string: "parse error".
          // This implies TLS handshake succeeded.
          expect(e.message).to.include('parse error');
        }
      });

      it('should fail with an expired certificate', async function () {
        try {
          await clientEncryptionWithTlsExpired.createDataKey('aws', {
            masterKey: masterKeyExpired
          });
          expect.fail('it must fail with invalid certificate');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an expired certificate.
          expect(e.cause.message).to.include('certificate has expired');
        }
      });

      it('should fail with an invalid hostname', metadata, async function () {
        try {
          await clientEncryptionWithInvalidHostname.createDataKey('aws', {
            masterKey: masterKeyInvalidHostname
          });
          expect.fail('it must fail with invalid hostnames');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an invalid hostname.
          expect(e.cause.message).to.include('does not match certificate');
        }
      });
    });

    // Case 2.
    context('Case 2: Azure', metadata, function () {
      const masterKey = {
        keyVaultEndpoint: 'doesnotexist.local',
        keyName: 'foo'
      };

      it.skip('should fail with no TLS', metadata, async function () {
        try {
          await clientEncryptionNoTls.createDataKey('azure', { masterKey });
          expect.fail('it must fail with no tls');
        } catch (e) {
          //Expect an error indicating TLS handshake failed.
          expect(e.cause.message).to.include('certificate required');
        }
      }).skipReason = 'TODO(NODE-6861): fix flaky test';

      it('should succeed with valid TLS options', metadata, async function () {
        try {
          await clientEncryptionWithTls.createDataKey('azure', { masterKey });
          expect.fail('it must fail with HTTP 404');
        } catch (e) {
          // Expect an error from libmongocrypt with a message containing the string: "HTTP status=404".
          // This implies TLS handshake succeeded.
          expect(e.message).to.include('HTTP status=404');
        }
      });

      it('should fail with an expired certificate', async function () {
        try {
          await clientEncryptionWithTlsExpired.createDataKey('azure', { masterKey });
          expect.fail('it must fail with expired certificates');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an expired certificate.
          expect(e.cause.message).to.include('certificate has expired');
        }
      });

      it('should fail with an invalid hostname', metadata, async function () {
        try {
          await clientEncryptionWithInvalidHostname.createDataKey('azure', { masterKey });
          expect.fail('it must fail with invalid hostnames');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an invalid hostname.
          expect(e.cause.message).to.include('does not match certificate');
        }
      });
    });

    // Case 3.
    context('Case 3: GCP', metadata, function () {
      const masterKey = {
        projectId: 'foo',
        location: 'bar',
        keyRing: 'baz',
        keyName: 'foo'
      };

      it('should fail with no TLS', metadata, async function () {
        try {
          await clientEncryptionNoTls.createDataKey('gcp', { masterKey });
          expect.fail('it must fail with no tls');
        } catch (e) {
          //Expect an error indicating TLS handshake failed.
          expect(e.cause.message).to.include('certificate required');
        }
      });

      it('should succeed with valid TLS options', metadata, async function () {
        try {
          await clientEncryptionWithTls.createDataKey('gcp', { masterKey });
          expect.fail('it must fail with HTTP 404');
        } catch (e) {
          // Expect an error from libmongocrypt with a message containing the string: "HTTP status=404".
          // This implies TLS handshake succeeded.
          expect(e.message).to.include('HTTP status=404');
        }
      });

      it('should fail with an expired certificate', async function () {
        try {
          await clientEncryptionWithTlsExpired.createDataKey('gcp', { masterKey });
          expect.fail('it must fail with expired certificates');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an expired certificate.
          expect(e.cause.message).to.include('certificate has expired');
        }
      });

      it('should fail with an invalid hostname', metadata, async function () {
        try {
          await clientEncryptionWithInvalidHostname.createDataKey('gcp', { masterKey });
          expect.fail('it must fail with invalid hostnames');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an invalid hostname.
          expect(e.cause.message).to.include('does not match certificate');
        }
      });
    });

    // Case 4.
    context('Case 4: KMIP', metadata, function () {
      const masterKey = {};

      it('should fail with no TLS', metadata, async function () {
        const e = await clientEncryptionNoTls.createDataKey('kmip', { masterKey }).catch(e => e);
        //Expect an error indicating TLS handshake failed.
        expect(e.cause.message).to.match(/before secure TLS connection|handshake/);
      });

      it('should succeed with valid TLS options', metadata, async function () {
        const keyId = await clientEncryptionWithTls.createDataKey('kmip', { masterKey });
        // expect success
        expect(keyId).to.be.an('object');
      });

      it('should fail with an expired certificate', async function () {
        try {
          await clientEncryptionWithTlsExpired.createDataKey('kmip', { masterKey });
          expect.fail('it must fail with expired certificates');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an expired certificate.
          expect(e.cause.message).to.include('certificate has expired');
        }
      });

      it('should fail with an invalid hostname', metadata, async function () {
        try {
          await clientEncryptionWithInvalidHostname.createDataKey('kmip', { masterKey });
          expect.fail('it must fail with invalid hostnames');
        } catch (e) {
          // Expect an error indicating TLS handshake failed due to an invalid hostname.
          expect(e.cause.message).to.include('does not match certificate');
        }
      });
    });

    context(
      'Case 5: `tlsDisableOCSPEndpointCheck` is permitted',
      metadata,
      function () {}
    ).skipReason = 'TODO(NODE-4840): Node does not support any OCSP options';

    context('Case 6: named KMS providers apply TLS options', function () {
      afterEach(() => keyvaultClient?.close());
      beforeEach(async function () {
        const shouldSkip = this.configuration.filters.ClientSideEncryptionFilter.filter({
          metadata: {
            requires: {
              // 6.0.1 includes libmongocrypt 1.10.
              clientSideEncryption: '>=6.0.1'
            }
          }
        });
        if (typeof shouldSkip === 'string') {
          this.currentTest.skipReason = shouldSkip;
          this.skip();
        }
        const providers = getKmsProviders();
        keyvaultClient = this.configuration.newClient();

        clientEncryptionWithNames = new ClientEncryption(keyvaultClient, {
          kmsProviders: {
            'aws:no_client_cert': {
              accessKeyId: providers.aws.accessKeyId,
              secretAccessKey: providers.aws.secretAccessKey
            },
            'azure:no_client_cert': {
              tenantId: providers.azure.tenantId,
              clientId: providers.azure.clientId,
              clientSecret: providers.azure.clientId,
              identityPlatformEndpoint: '127.0.0.1:9002'
            },
            'gcp:no_client_cert': {
              email: providers.gcp.email,
              privateKey: providers.gcp.privateKey,
              endpoint: '127.0.0.1:9002'
            },
            'kmip:no_client_cert': {
              endpoint: '127.0.0.1:5698'
            },
            'aws:with_tls': {
              accessKeyId: providers.aws.accessKeyId,
              secretAccessKey: providers.aws.secretAccessKey
            },
            'azure:with_tls': {
              tenantId: providers.azure.tenantId,
              clientId: providers.azure.clientId,
              clientSecret: providers.azure.clientId,
              identityPlatformEndpoint: '127.0.0.1:9002'
            },
            'gcp:with_tls': {
              email: providers.gcp.email,
              privateKey: providers.gcp.privateKey,
              endpoint: '127.0.0.1:9002'
            },
            'kmip:with_tls': {
              endpoint: '127.0.0.1:5698'
            }
          },
          tlsOptions: {
            'aws:no_client_cert': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE
            },
            'azure:no_client_cert': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE
            },
            'gcp:no_client_cert': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE
            },
            'kmip:no_client_cert': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE
            },
            'aws:with_tls': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            },
            'azure:with_tls': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            },
            'gcp:with_tls': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            },
            'kmip:with_tls': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            }
          },
          keyVaultNamespace: 'db.keys'
        });
      });
      it('Named AWS', async function () {
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:no_client_cert" as the provider and the following masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('aws:no_client_cert', {
              masterKey: {
                region: 'us-east-1',
                key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
                endpoint: '127.0.0.1:9002'
              }
            })
            .catch(e => e);

          // Expect an error indicating TLS handshake failed.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error.cause).to.match(/tlsv13 alert certificate required/);
        }
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:with_tls" as the provider and the same masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('aws:with_tls', {
              masterKey: {
                region: 'us-east-1',
                key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0',
                endpoint: '127.0.0.1:9002'
              }
            })
            .catch(e => e);

          // Expect an error from libmongocrypt with a message containing the string: "parse error". This implies TLS handshake succeeded.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error).to.match(/parse error/);
        }
      });

      it('Named Azure', async function () {
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:no_client_cert" as the provider and the following masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('azure:no_client_cert', {
              masterKey: { keyVaultEndpoint: 'doesnotexist.local', keyName: 'foo' }
            })
            .catch(e => e);

          // Expect an error indicating TLS handshake failed.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error.cause).to.match(/tlsv13 alert certificate required/);
        }
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:with_tls" as the provider and the same masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('azure:with_tls', {
              masterKey: { keyVaultEndpoint: 'doesnotexist.local', keyName: 'foo' }
            })
            .catch(e => e);

          // Expect an error from libmongocrypt with a message containing the string: "parse error". This implies TLS handshake succeeded.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error).to.match(/HTTP status=404/);
        }
      });

      it('Named GCP', async function () {
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:no_client_cert" as the provider and the following masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('gcp:no_client_cert', {
              masterKey: { projectId: 'foo', location: 'bar', keyRing: 'baz', keyName: 'foo' }
            })
            .catch(e => e);

          // Expect an error indicating TLS handshake failed.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error.cause).to.match(/tlsv13 alert certificate required/);
        }
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:with_tls" as the provider and the same masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('gcp:with_tls', {
              masterKey: { projectId: 'foo', location: 'bar', keyRing: 'baz', keyName: 'foo' }
            })
            .catch(e => e);

          // Expect an error from libmongocrypt with a message containing the string: "parse error". This implies TLS handshake succeeded.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error).to.match(/HTTP status=404/);
        }
      });

      it('Named KMIP', async function () {
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:no_client_cert" as the provider and the following masterKey.
          const error = await clientEncryptionWithNames
            .createDataKey('kmip:no_client_cert', {
              masterKey: {}
            })
            .catch(e => e);

          // Expect an error indicating TLS handshake failed.
          expect(error).to.be.instanceof(MongoCryptError);
          expect(error.cause).to.match(/handshake|before secure TLS connection was established/);
        }
        {
          // Call `client_encryption_with_names.createDataKey()` with "aws:with_tls" as the provider and the same masterKey.
          await clientEncryptionWithNames.createDataKey('kmip:with_tls', {
            masterKey: {}
          });

          // Expect success.
        }
      });
    });
  });

  context('12. Explicit Encryption', eeMetadata, function () {
    const data = path.join(__dirname, '..', '..', 'spec', 'client-side-encryption', 'etc', 'data');
    let encryptedFields;
    let key1Document;
    let key1Id;
    let setupClient;
    let keyVaultClient;
    let clientEncryption;
    let encryptedClient;

    beforeEach(async function () {
      // Load the file encryptedFields.json as encryptedFields.
      encryptedFields = EJSON.parse(
        await fs.promises.readFile(path.join(data, 'encryptedFields.json')),
        { relaxed: false }
      );
      // Load the file key1-document.json as key1Document.
      key1Document = EJSON.parse(
        await fs.promises.readFile(path.join(data, 'keys', 'key1-document.json')),
        { relaxed: false }
      );
      // Read the "_id" field of key1Document as key1ID.
      key1Id = key1Document._id;
      setupClient = this.configuration.newClient();
      // Drop and create the collection db.explicit_encryption using encryptedFields as an option.
      const db = setupClient.db('db');
      await dropCollection(db, 'explicit_encryption', { encryptedFields });
      await db.createCollection('explicit_encryption', { encryptedFields });
      // Drop and create the collection keyvault.datakeys.
      const kdb = setupClient.db('keyvault');
      await dropCollection(kdb, 'datakeys');
      await kdb.createCollection('datakeys');
      // Insert key1Document in keyvault.datakeys with majority write concern.
      await kdb.collection('datakeys').insertOne(key1Document, { writeConcern: { w: 'majority' } });
      // Create a MongoClient named keyVaultClient.
      keyVaultClient = this.configuration.newClient();
      // Create a ClientEncryption object named clientEncryption with these options:
      //   ClientEncryptionOpts {
      //      keyVaultClient: <keyVaultClient>;
      //      keyVaultNamespace: "keyvault.datakeys";
      //      kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
      //   }
      clientEncryption = new ClientEncryption(keyVaultClient, {
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: getKmsProviders(LOCAL_KEY),
        bson: BSON,
        extraOptions: getEncryptExtraOptions()
      });
      // Create a MongoClient named ``encryptedClient`` with these ``AutoEncryptionOpts``:
      //   AutoEncryptionOpts {
      //     keyVaultNamespace: "keyvault.datakeys";
      //     kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } },
      //     bypassQueryAnalysis: true
      //   }
      encryptedClient = this.configuration.newClient(
        {},
        {
          autoEncryption: {
            bypassQueryAnalysis: true,
            keyVaultNamespace: 'keyvault.datakeys',
            kmsProviders: getKmsProviders(LOCAL_KEY),
            extraOptions: getEncryptExtraOptions()
          }
        }
      );
    });

    afterEach(async function () {
      await setupClient.close();
      await keyVaultClient.close();
      await encryptedClient.close();
    });

    context('Case 1: can insert encrypted indexed and find', eeMetadata, function () {
      let insertPayload;
      let findPayload;

      beforeEach(async function () {
        // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
        // class EncryptOpts {
        //   keyId : <key1ID>
        //   algorithm: "Indexed",
        // }
        // Store the result in insertPayload.
        insertPayload = await clientEncryption.encrypt('encrypted indexed value', {
          keyId: key1Id,
          algorithm: 'Indexed',
          contentionFactor: 0
        });
        // Use encryptedClient to insert the document { "encryptedIndexed": <insertPayload> }
        // into db.explicit_encryption.
        await encryptedClient.db('db').collection('explicit_encryption').insertOne({
          encryptedIndexed: insertPayload
        });
        // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
        // class EncryptOpts {
        //    keyId : <key1ID>
        //    algorithm: "Indexed",
        //    queryType: Equality
        // }
        // Store the result in findPayload.
        findPayload = await clientEncryption.encrypt('encrypted indexed value', {
          keyId: key1Id,
          algorithm: 'Indexed',
          queryType: 'equality',
          contentionFactor: 0
        });
      });

      it('returns the decrypted value', async function () {
        // Use encryptedClient to run a "find" operation on the db.explicit_encryption
        // collection with the filter { "encryptedIndexed": <findPayload> }.
        // Assert one document is returned containing the field
        // { "encryptedIndexed": "encrypted indexed value" }.
        const collection = encryptedClient.db('db').collection('explicit_encryption');
        const result = await collection.findOne({ encryptedIndexed: findPayload });
        expect(result).to.have.property('encryptedIndexed', 'encrypted indexed value');
      });
    });

    context(
      'Case 2: can insert encrypted indexed and find with non-zero contention',
      eeMetadata,
      function () {
        let findPayload;
        let findPayload2;

        beforeEach(async function () {
          for (let i = 0; i < 10; i++) {
            // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
            // class EncryptOpts {
            //    keyId : <key1ID>
            //    algorithm: "Indexed",
            //    contentionFactor: 10
            // }
            // Store the result in insertPayload.
            const insertPayload = await clientEncryption.encrypt('encrypted indexed value', {
              keyId: key1Id,
              algorithm: 'Indexed',
              contentionFactor: 10
            });
            // Use encryptedClient to insert the document { "encryptedIndexed": <insertPayload> }
            // into db.explicit_encryption.
            await encryptedClient.db('db').collection('explicit_encryption').insertOne({
              encryptedIndexed: insertPayload
            });
            // Repeat the above steps 10 times to insert 10 total documents.
            // The insertPayload must be regenerated each iteration.
          }
          // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
          // class EncryptOpts {
          //    keyId : <key1ID>
          //    algorithm: "Indexed",
          //    queryType: Equality
          // }
          // Store the result in findPayload.
          findPayload = await clientEncryption.encrypt('encrypted indexed value', {
            keyId: key1Id,
            algorithm: 'Indexed',
            queryType: 'equality',
            contentionFactor: 0
          });
          // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
          // class EncryptOpts {
          //    keyId : <key1ID>
          //    algorithm: "Indexed",
          //    queryType: Equality,
          //    contentionFactor: 10
          // }
          // Store the result in findPayload2.
          findPayload2 = await clientEncryption.encrypt('encrypted indexed value', {
            keyId: key1Id,
            algorithm: 'Indexed',
            queryType: 'equality',
            contentionFactor: 10
          });
        });

        it('returns less than the total documents with no contention', async function () {
          // Use encryptedClient to run a "find" operation on the db.explicit_encryption
          // collection with the filter { "encryptedIndexed": <findPayload> }.
          // Assert less than 10 documents are returned. 0 documents may be returned.
          // Assert each returned document contains the field
          // { "encryptedIndexed": "encrypted indexed value" }.
          const collection = encryptedClient.db('db').collection('explicit_encryption');
          const result = await collection.find({ encryptedIndexed: findPayload }).toArray();
          expect(result.length).to.be.below(10);
          for (const doc of result) {
            expect(doc).to.have.property('encryptedIndexed', 'encrypted indexed value');
          }
        });

        it('returns all documents with contention', async function () {
          // Use encryptedClient to run a "find" operation on the db.explicit_encryption
          // collection with the filter { "encryptedIndexed": <findPayload2> }.
          // Assert 10 documents are returned. Assert each returned document contains the
          // field { "encryptedIndexed": "encrypted indexed value" }.
          const collection = encryptedClient.db('db').collection('explicit_encryption');
          const result = await collection.find({ encryptedIndexed: findPayload2 }).toArray();
          expect(result.length).to.equal(10);
          for (const doc of result) {
            expect(doc).to.have.property('encryptedIndexed', 'encrypted indexed value');
          }
        });
      }
    );

    context('Case 3: can insert encrypted unindexed', eeMetadata, function () {
      let insertPayload;

      beforeEach(async function () {
        // Use clientEncryption to encrypt the value "encrypted unindexed value" with these EncryptOpts:
        // class EncryptOpts {
        //    keyId : <key1ID>
        //    algorithm: "Unindexed"
        // }
        // Store the result in insertPayload.
        insertPayload = await clientEncryption.encrypt('encrypted unindexed value', {
          keyId: key1Id,
          algorithm: 'Unindexed'
        });
        // Use encryptedClient to insert the document { "_id": 1, "encryptedUnindexed": <insertPayload> }
        // into db.explicit_encryption.
        await encryptedClient.db('db').collection('explicit_encryption').insertOne({
          _id: 1,
          encryptedUnindexed: insertPayload
        });
      });

      it('returns unindexed documents', async function () {
        // Use encryptedClient to run a "find" operation on the db.explicit_encryption
        // collection with the filter { "_id": 1 }.
        // Assert one document is returned containing the field
        // { "encryptedUnindexed": "encrypted unindexed value" }.
        const collection = encryptedClient.db('db').collection('explicit_encryption');
        const result = await collection.findOne({ _id: 1 });
        expect(result).to.have.property('encryptedUnindexed', 'encrypted unindexed value');
      });
    });

    context('Case 4: can roundtrip encrypted indexed', eeMetadata, function () {
      let payload;

      beforeEach(async function () {
        // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
        // class EncryptOpts {
        //    keyId : <key1ID>
        //    algorithm: "Indexed",
        // }
        // Store the result in payload.
        payload = await clientEncryption.encrypt('encrypted indexed value', {
          keyId: key1Id,
          algorithm: 'Indexed',
          contentionFactor: 0
        });
      });

      it('decrypts the value', async function () {
        // Use clientEncryption to decrypt payload. Assert the returned value
        // equals "encrypted indexed value".
        const result = await clientEncryption.decrypt(payload);
        expect(result).equals('encrypted indexed value');
      });
    });

    context('Case 5: can roundtrip encrypted unindexed', eeMetadata, function () {
      let payload;

      beforeEach(async function () {
        // Use clientEncryption to encrypt the value "encrypted unindexed value" with these EncryptOpts:
        // class EncryptOpts {
        //    keyId : <key1ID>
        //    algorithm: "Unindexed",
        // }
        // Store the result in payload.
        payload = await clientEncryption.encrypt('encrypted unindexed value', {
          keyId: key1Id,
          algorithm: 'Unindexed'
        });
      });

      it('decrypts the value', async function () {
        // Use clientEncryption to decrypt payload. Assert the returned value
        // equals "encrypted unindexed value".
        const result = await clientEncryption.decrypt(payload);
        expect(result).equals('encrypted unindexed value');
      });
    });
  });

  context('13. Unique Index on keyAltNames', function () {
    let client, clientEncryption, setupKeyId;

    beforeEach(async function () {
      // Create a MongoClient object (referred to as client).
      client = this.configuration.newClient();
      await client.connect();

      // Using client, drop the collection keyvault.datakeys.
      await client
        .db('keyvault')
        .dropCollection('datakeys')
        .catch(() => null);

      await client
        .db('keyvault')
        .collection('datakeys')
        .createIndex(
          { keyAltNames: 1 },
          {
            unique: true,
            partialFilterExpression: { keyAltNames: { $exists: true } },
            writeConcern: { w: 'majority' }
          }
        );

      // Create a ClientEncryption object (referred to as client_encryption) with client set as the keyVaultClient.
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: getKmsProviders(),
        extraOptions: getEncryptExtraOptions()
      });

      // Using client_encryption, create a data key with a local KMS provider and the keyAltName "def".
      setupKeyId = await clientEncryption.createDataKey('local', {
        keyAltNames: ['def']
      });
    });

    afterEach(async () => {
      clientEncryption = null;
      setupKeyId = null;
      await client.close();
    });

    context('Case 1', metadata, function () {
      it('createDataKey() handles duplicate key errors on the keyvault collection', async function () {
        // 1. Use client_encryption to create a new local data key with a keyAltName "abc" and assert the operation does not fail.
        await clientEncryption.createDataKey('local', {
          keyAltNames: ['abc']
        });

        // 2. Repeat Step 1 and assert the operation fails due to a duplicate key server error (error code 11000).
        const resultStep2 = await clientEncryption
          .createDataKey('local', {
            keyAltNames: ['abc']
          })
          .catch(e => e);
        expect(
          resultStep2,
          'Error in step 2) expected clientEncryption.createDataKey to throw duplicate key error but it did not'
        ).to.be.instanceof(MongoServerError);
        expect(resultStep2).have.property('code', 11000);

        // 3. Use client_encryption to create a new local data key with a keyAltName "def" and assert the operation fails due to a duplicate key server error (error code 11000).
        const resultStep3 = await clientEncryption
          .createDataKey('local', {
            keyAltNames: ['def']
          })
          .catch(e => e);
        expect(
          resultStep3,
          'Error in step 3) expected clientEncryption.createDataKey to throw duplicate key error but it did not'
        ).to.be.instanceof(MongoServerError);
        expect(resultStep3).have.property('code', 11000);
      });
    });

    context('Case 2', metadata, function () {
      it('addKeyAltName() handles duplicate key errors on the keyvault collection', async function () {
        // 1. Use client_encryption to create a new local data key and assert the operation does not fail.
        const _id = await clientEncryption.createDataKey('local');

        // 2. Use client_encryption to add a keyAltName "abc" to the key created in Step 1 and assert the operation does not fail.
        await clientEncryption.addKeyAltName(_id, 'abc');

        // 3. Repeat Step 2, assert the operation does not fail, and assert the returned key document contains the keyAltName "abc" added in Step 2.
        const resultStep3 = await clientEncryption.addKeyAltName(_id, 'abc');
        expect(resultStep3).to.have.property('keyAltNames').to.include('abc');

        // 4. Use client_encryption to add a keyAltName "def" to the key created in Step 1 and assert the operation fails due to a duplicate key server error (error code 11000).
        const resultStep4 = await clientEncryption.addKeyAltName(_id, 'def').catch(e => e);
        expect(
          resultStep4,
          'Error in step 4) expected clientEncryption.addKeyAltName to throw duplicate key error but it did not'
        ).to.be.instanceof(MongoServerError);
        expect(resultStep4).to.have.property('code', 11000);

        // 5. Use client_encryption to add a keyAltName "def" to the existing key, assert the operation does not fail, and assert the returned key document contains the keyAltName "def" added during Setup.
        const resultStep5 = await clientEncryption.addKeyAltName(setupKeyId, 'def');
        expect(resultStep5).to.have.property('keyAltNames').to.include('def');
      });
    });
  });

  context('16. Rewrap', function () {
    const masterKeys = {
      aws: {
        region: 'us-east-1',
        key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
      },
      azure: {
        keyVaultEndpoint: 'key-vault-csfle.vault.azure.net',
        keyName: 'key-name-csfle'
      },
      gcp: {
        projectId: 'devprod-drivers',
        location: 'global',
        keyRing: 'key-ring-csfle',
        keyName: 'key-name-csfle'
      },
      kmip: {},
      local: undefined
    };
    /** @type {import('../../mongodb').MongoClient} */
    let client1;
    /** @type {import('../../mongodb').MongoClient} */
    let client2;

    describe('Case 1: Rewrap with separate ClientEncryption', function () {
      /**
       * Run the following test case for each pair of KMS providers (referred to as ``srcProvider`` and ``dstProvider``).
       * Include pairs where ``srcProvider`` equals ``dstProvider``.
       */
      function* generateTestCombinations() {
        const providers = Object.keys(masterKeys);
        for (const srcProvider of providers) {
          for (const dstProvider of providers) {
            yield { srcProvider, dstProvider };
          }
        }
      }

      beforeEach(function () {
        client1 = this.configuration.newClient();
        client2 = this.configuration.newClient();
      });

      afterEach(async function () {
        await client1.close();
        await client2.close();
      });

      for (const { srcProvider, dstProvider } of generateTestCombinations()) {
        it(
          `should rewrap data key from ${srcProvider} to ${dstProvider}`,
          metadata,
          async function () {
            client1.mongoLogger?.trace('client', 'dropping datakeys collection');

            // Step 1. Drop the collection ``keyvault.datakeys``
            await client1
              .db('keyvault')
              .dropCollection('datakeys')
              .catch(() => null);

            client1.mongoLogger?.trace('client', 'dropped datakeys collection');

            // Step 2. Create a ``ClientEncryption`` object named ``clientEncryption1``
            const clientEncryption1 = new ClientEncryption(client1, {
              keyVaultNamespace: 'keyvault.datakeys',
              kmsProviders: getKmsProviders(),
              tlsOptions: {
                kmip: {
                  tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
                  tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
                }
              },
              extraOptions: getEncryptExtraOptions(),
              bson: BSON
            });

            client1.mongoLogger?.trace('client', 'clientEncryption1.createDataKey started');

            // Step 3. Call ``clientEncryption1.createDataKey`` with ``srcProvider``
            const keyId = await clientEncryption1.createDataKey(srcProvider, {
              masterKey: masterKeys[srcProvider]
            });

            client1.mongoLogger?.trace('client', 'clientEncryption1.createDataKey finished');
            client1.mongoLogger?.trace('client', 'clientEncryption1.encrypt started');

            // Step 4. Call ``clientEncryption1.encrypt`` with the value "test"
            const cipherText = await clientEncryption1.encrypt('test', {
              keyId,
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
            });

            client1.mongoLogger?.trace('client', 'clientEncryption1.encrypt finished');

            // Step 5. Create a ``ClientEncryption`` object named ``clientEncryption2``
            const clientEncryption2 = new ClientEncryption(client2, {
              keyVaultNamespace: 'keyvault.datakeys',
              kmsProviders: getKmsProviders(),
              tlsOptions: {
                kmip: {
                  tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
                  tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
                }
              },
              extraOptions: getEncryptExtraOptions(),
              bson: BSON
            });

            client2.mongoLogger?.trace('client', 'clientEncryption2.rewrapManyDataKey started');

            // Step 6. Call ``clientEncryption2.rewrapManyDataKey`` with an empty ``filter``
            const rewrapManyDataKeyResult = await clientEncryption2.rewrapManyDataKey(
              {},
              {
                provider: dstProvider,
                masterKey: masterKeys[dstProvider]
              }
            );

            client2.mongoLogger?.trace('client', 'clientEncryption2.rewrapManyDataKey finished');

            expect(rewrapManyDataKeyResult).to.have.property('bulkWriteResult');
            expect(rewrapManyDataKeyResult.bulkWriteResult).to.have.property('modifiedCount', 1);

            client1.mongoLogger?.trace('client', 'clientEncryption1.decrypt started');

            // 7. Call ``clientEncryption1.decrypt`` with the ``ciphertext``. Assert the return value is "test".
            const decryptResult1 = await clientEncryption1.decrypt(cipherText);
            expect(decryptResult1).to.equal('test');

            client1.mongoLogger?.trace('client', 'clientEncryption1.decrypt finished');
            client2.mongoLogger?.trace('client', 'clientEncryption2.decrypt started');

            // 8. Call ``clientEncryption2.decrypt`` with the ``ciphertext``. Assert the return value is "test".
            const decryptResult2 = await clientEncryption2.decrypt(cipherText);
            expect(decryptResult2).to.equal('test');

            client2.mongoLogger?.trace('client', 'clientEncryption2.decrypt finished');
          }
        );
      }
    });

    describe('Case 2: RewrapManyDataKeyOpts.provider is not optional', function () {
      let client;
      let clientEncryption;

      // 1. Create a ``ClientEncryption`` object named ``clientEncryption`` with these options:
      //    class ClientEncryptionOpts {
      //       keyVaultClient: <new MongoClient>,
      //       keyVaultNamespace: "keyvault.datakeys",
      //       kmsProviders: <all KMS providers>,
      before(function () {
        client = this.configuration.newClient();
        clientEncryption = new ClientEncryption(client, {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: getKmsProviders(),
          extraOptions: getEncryptExtraOptions(),
          bson: BSON
        });
      });

      after(async function () {
        await client?.close();
      });

      // 2. Call ``clientEncryption.rewrapManyDataKey`` with an empty ``filter`` and these options:
      //    class RewrapManyDataKeyOpts {
      //       masterKey: {}
      //    }
      // Assert that `clientEncryption.rewrapManyDataKey` raises a client error indicating that the
      // required ``RewrapManyDataKeyOpts.provider`` field is missing.
      context('when provider field is missing', function () {
        it('raises an error', async function () {
          const error = await clientEncryption
            .rewrapManyDataKey({}, { masterKey: {} })
            .catch(error => error);
          expect(error.message).to.include('expected UTF-8 provider');
        });
      });
    });
  });
});
