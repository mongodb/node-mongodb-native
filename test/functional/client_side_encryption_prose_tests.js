'use strict';

const mongodb = require('../../index');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

// Tests for the ClientEncryption type are not included as part of the YAML tests.

// In the prose tests LOCAL_MASTERKEY refers to the following base64:

// .. code:: javascript

//   Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

describe(
  'Client Side Encryption Prose Tests',
  { requires: { clientSideEncryption: true } },
  function() {
    const dataDbName = 'db';
    const dataCollName = 'coll';
    const dataNamespace = `${dataDbName}.${dataCollName}`;
    const keyVaultDbName = 'admin';
    const keyVaultCollName = 'datakeys';
    const keyVaultNamespace = `${keyVaultDbName}.${keyVaultCollName}`;
    const kmsProviders = {
      aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
      local: {
        key: Buffer.from(
          'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
          'base64'
        )
      }
    };

    const noop = () => {};

    describe('Data key and double encryption', function() {
      // Data key and double encryption
      // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // First, perform the setup.
      beforeEach(function() {
        const mongodbClientEncryption = require('mongodb-client-encryption')(mongodb);

        // #. Create a MongoClient without encryption enabled (referred to as ``client``). Enable command monitoring to listen for command_started events.
        this.client = this.configuration.newClient(
          {},
          { useNewUrlParser: true, useUnifiedTopology: true, monitorCommands: true }
        );

        this.commandStartedEvents = [];
        this.client.on('commandStarted', e => {
          if (!e.ismaster) {
            this.commandStartedEvents.push(e);
          }
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
            // #. Using ``client``, drop the collections ``admin.datakeys`` and ``db.coll``.
            .then(() => this.client.db(dataDbName).dropCollection(dataCollName))
            .catch(noop)
            .then(() => this.client.db(keyVaultDbName).dropCollection(keyVaultCollName))
            .catch(noop)
            // #. Create the following:
            //   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
            //   - A ``ClientEncryption`` object (referred to as ``client_encryption``)
            //   Configure both objects with ``aws`` and the ``local`` KMS providers as follows:
            //   .. code:: javascript
            //       {
            //           "aws": { <AWS credentials> },
            //           "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
            //       }
            //   Configure both objects with ``keyVaultNamespace`` set to ``admin.datakeys``.
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
                kmsProviders,
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
                    kmsProviders,
                    schemaMap
                  }
                }
              );
              return this.clientEncrypted.connect();
            })
        );
      });

      afterEach(function() {
        this.commandStartedEvents = [];
        return Promise.resolve()
          .then(() => this.clientEncrypted && this.clientEncrypted.close())
          .then(() => this.client && this.client.close());
      });

      it('should work for local KMS provider', function() {
        let localDatakeyId;
        let localEncrypted;
        return Promise.resolve()
          .then(() => {
            // #. Call ``client_encryption.createDataKey()`` with the ``local`` KMS provider and keyAltNames set to ``["local_altname"]``.
            // - Expect a BSON binary with subtype 4 to be returned, referred to as ``local_datakey_id``.
            // - Use ``client`` to run a ``find`` on ``admin.datakeys`` by querying with the ``_id`` set to the ``local_datakey_id``.
            // - Expect that exactly one document is returned with the "masterKey.provider" equal to "local".
            // - Check that ``client`` captured a command_started event for the ``insert`` command containing a majority writeConcern.
            this.commandStartedEvents = [];
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
                expect(this.commandStartedEvents).to.containSubset([
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

      it('should work for aws KMS provider', function() {
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
            //    - Use ``client`` to run a ``find`` on ``admin.datakeys`` by querying with the ``_id`` set to the ``aws_datakey_id``.
            //    - Expect that exactly one document is returned with the "masterKey.provider" equal to "aws".
            //    - Check that ``client`` captured a command_started event for the ``insert`` command containing a majority writeConcern.
            this.commandStartedEvents = [];
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
                expect(this.commandStartedEvents).to.containSubset([
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

      it('should error on an attempt to double-encrypt a value', function() {
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
          .then(encrypted => {
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
              );
          });
      });
    });
  }
);
