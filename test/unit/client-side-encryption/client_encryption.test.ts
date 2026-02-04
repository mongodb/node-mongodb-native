import { Binary } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  MongoCryptCreateDataKeyError,
  MongoCryptCreateEncryptedCollectionError
} from '../../mongodb';
import { ClientEncryption, MongoClient } from '../../mongodb';

class MockClient {
  options: any;
  s: { options: any };

  constructor(options?: any) {
    this.options = { options: options || {} };
    this.s = { options: this.options };
  }
  db(dbName) {
    return {
      async createCollection(name, options) {
        return { namespace: `${dbName}.${name}`, options };
      }
    };
  }
}

describe('ClientEncryption', function () {
  this.timeout(12000);

  it('should provide the libmongocrypt version', function () {
    expect(ClientEncryption.libmongocryptVersion).to.be.a('string');
  });

  describe('constructor', () => {
    describe('_timeoutMS', () => {
      const LOCAL_MASTERKEY = Buffer.from(
        'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
        'base64'
      );
      context('when timeoutMS is provided in ClientEncryptionOptions and client', function () {
        it('sets clientEncryption._timeoutMS to ClientEncryptionOptions.timeoutMS value', function () {
          const client = new MongoClient('mongodb://a/', { timeoutMS: 100 });
          const clientEncryption = new ClientEncryption(client, {
            keyVaultNamespace: 'keyvault.datakeys',
            kmsProviders: { local: { key: LOCAL_MASTERKEY } },
            timeoutMS: 500
          });
          expect(clientEncryption._timeoutMS).to.equal(500);
        });
      });

      context('when timeoutMS is only provided in ClientEncryptionOptions', function () {
        it('sets clientEncryption._timeoutMS to ClientEncryptionOptions.timeoutMS value', function () {
          const client = new MongoClient('mongodb://a/');
          const clientEncryption = new ClientEncryption(client, {
            keyVaultNamespace: 'keyvault.datakeys',
            kmsProviders: { local: { key: LOCAL_MASTERKEY } },
            timeoutMS: 500
          });
          expect(clientEncryption._timeoutMS).to.equal(500);
        });
      });

      context('when timeoutMS is only provided in client', function () {
        it('sets clientEncryption._timeoutMS to client.timeoutMS value', function () {
          const client = new MongoClient('mongodb://a/', { timeoutMS: 100 });
          const clientEncryption = new ClientEncryption(client, {
            keyVaultNamespace: 'keyvault.datakeys',
            kmsProviders: { local: { key: LOCAL_MASTERKEY } }
          });
          expect(clientEncryption._timeoutMS).to.equal(100);
        });
      });
    });
  });

  describe('createEncryptedCollection()', () => {
    let clientEncryption;
    const client = new MockClient();
    let db;
    const collectionName = 'secure';

    beforeEach(async function () {
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders: { local: { key: Buffer.alloc(96, 0) } }
      });

      db = client.db('createEncryptedCollectionDb');
    });

    afterEach(async () => {
      sinon.restore();
    });

    context('validates input', () => {
      it('throws TypeError if options are omitted', async () => {
        const error = await clientEncryption
          .createEncryptedCollection(db, collectionName)
          .catch(error => error);
        expect(error)
          .to.be.instanceOf(TypeError)
          .to.match(/provider/);
      });

      it('throws TypeError if options.createCollectionOptions are omitted', async () => {
        const error = await clientEncryption
          .createEncryptedCollection(db, collectionName, {})
          .catch(error => error);
        expect(error)
          .to.be.instanceOf(TypeError)
          .to.match(/encryptedFields/);
      });

      it('throws TypeError if options.createCollectionOptions.encryptedFields are omitted', async () => {
        const error = await clientEncryption
          .createEncryptedCollection(db, collectionName, { createCollectionOptions: {} })
          .catch(error => error);
        expect(error)
          .to.be.instanceOf(TypeError)
          .to.match(/Cannot read properties/);
      });
    });

    context('when options.encryptedFields.fields is not an array', () => {
      it('does not generate any encryption keys', async () => {
        const createCollectionSpy = sinon.spy(db, 'createCollection');
        const createDataKeySpy = sinon.spy(clientEncryption, 'createDataKey');
        await clientEncryption.createEncryptedCollection(db, collectionName, {
          createCollectionOptions: { encryptedFields: { fields: 'not an array' } }
        });

        expect(createDataKeySpy.callCount).to.equal(0);
        const options = createCollectionSpy.getCall(0).args[1];
        expect(options).to.deep.equal({
          encryptedFields: { fields: 'not an array' },
          timeoutMS: undefined
        });
      });
    });

    context('when options.encryptedFields.fields elements are not objects', () => {
      it('they are passed along to createCollection', async () => {
        const createCollectionSpy = sinon.spy(db, 'createCollection');
        const keyId = new Binary(Buffer.alloc(16, 0));
        const createDataKeyStub = sinon.stub(clientEncryption, 'createDataKey').resolves(keyId);
        await clientEncryption.createEncryptedCollection(db, collectionName, {
          createCollectionOptions: {
            encryptedFields: { fields: ['not an array', { keyId: null }, { keyId: {} }] }
          }
        });

        expect(createDataKeyStub.callCount).to.equal(1);
        const options = createCollectionSpy.getCall(0).args[1];
        expect(options).to.deep.equal({
          encryptedFields: { fields: ['not an array', { keyId: keyId }, { keyId: {} }] },
          timeoutMS: undefined
        });
      });
    });

    it('only passes options.masterKey to createDataKey', async () => {
      const masterKey = Symbol('key');
      const createDataKey = sinon
        .stub(clientEncryption, 'createDataKey')
        .resolves(new Binary(Buffer.alloc(16, 0)));
      const result = await clientEncryption.createEncryptedCollection(db, collectionName, {
        provider: 'aws',
        createCollectionOptions: { encryptedFields: { fields: [{}] } },
        masterKey
      });
      expect(result).to.have.property('collection');
      expect(createDataKey).to.have.been.calledOnceWithExactly('aws', {
        masterKey,
        timeoutContext: undefined
      });
    });

    context('when createDataKey rejects', () => {
      const customErrorEvil = new Error('evil!');
      const customErrorGood = new Error('good!');
      const keyId = new Binary(Buffer.alloc(16, 0), 4);
      const createCollectionOptions = {
        encryptedFields: { fields: [{}, {}, { keyId: 'cool id!' }, {}] }
      };
      const createDataKeyRejection = async () => {
        const stub = sinon.stub(clientEncryption, 'createDataKey');
        stub.onCall(0).resolves(keyId);
        stub.onCall(1).rejects(customErrorEvil);
        stub.onCall(2).rejects(customErrorGood);
        stub.onCall(4).resolves(keyId);

        const error = await clientEncryption
          .createEncryptedCollection(db, collectionName, {
            provider: 'local',
            createCollectionOptions
          })
          .catch(error => error);

        // At least make sure the function did not succeed
        expect(error).to.be.instanceOf(Error);

        return error;
      };

      it('throws MongoCryptCreateDataKeyError', async () => {
        const error = await createDataKeyRejection();
        expect(error).to.be.instanceOf(MongoCryptCreateDataKeyError);
      });

      it('thrown error has a cause set to the first error that was thrown from createDataKey', async () => {
        const error = await createDataKeyRejection();
        expect(error.cause).to.equal(customErrorEvil);
        expect(error.message).to.include(customErrorEvil.message);
      });

      it('thrown error contains partially filled encryptedFields.fields', async () => {
        const error = await createDataKeyRejection();
        expect(error.encryptedFields).property('fields').that.is.an('array');
        expect(error.encryptedFields.fields).to.have.lengthOf(
          createCollectionOptions.encryptedFields.fields.length
        );
        expect(error.encryptedFields.fields).to.have.nested.property('[0].keyId', keyId);
        expect(error.encryptedFields.fields).to.not.have.nested.property('[1].keyId');
        expect(error.encryptedFields.fields).to.have.nested.property('[2].keyId', 'cool id!');
      });
    });

    context('when createCollection rejects', () => {
      const customError = new Error('evil!');
      const keyId = new Binary(Buffer.alloc(16, 0), 4);
      const createCollectionRejection = async () => {
        const stubCreateDataKey = sinon.stub(clientEncryption, 'createDataKey');
        stubCreateDataKey.onCall(0).resolves(keyId);
        stubCreateDataKey.onCall(1).resolves(keyId);
        stubCreateDataKey.onCall(2).resolves(keyId);

        sinon.stub(db, 'createCollection').rejects(customError);

        const createCollectionOptions = {
          encryptedFields: { fields: [{}, {}, { keyId: 'cool id!' }] }
        };
        const error = await clientEncryption
          .createEncryptedCollection(db, collectionName, {
            provider: 'local',
            createCollectionOptions
          })
          .catch(error => error);

        // At least make sure the function did not succeed
        expect(error).to.be.instanceOf(Error);

        return error;
      };

      it('throws MongoCryptCreateEncryptedCollectionError', async () => {
        const error = await createCollectionRejection();
        expect(error).to.be.instanceOf(MongoCryptCreateEncryptedCollectionError);
      });

      it('thrown error has a cause set to the error that was thrown from createCollection', async () => {
        const error = await createCollectionRejection();
        expect(error.cause).to.equal(customError);
        expect(error.message).to.include(customError.message);
      });

      it('thrown error contains filled encryptedFields.fields', async () => {
        const error = await createCollectionRejection();
        expect(error.encryptedFields).property('fields').that.is.an('array');
        expect(error.encryptedFields.fields).to.have.nested.property('[0].keyId', keyId);
        expect(error.encryptedFields.fields).to.have.nested.property('[1].keyId', keyId);
        expect(error.encryptedFields.fields).to.have.nested.property('[2].keyId', 'cool id!');
      });
    });

    context('when there are nullish keyIds in the encryptedFields.fields array', function () {
      it('does not mutate the input fields array when generating data keys', async () => {
        const encryptedFields = Object.freeze({
          escCollection: 'esc',
          eccCollection: 'ecc',
          ecocCollection: 'ecoc',
          fields: Object.freeze([
            Object.freeze({ keyId: false }),
            Object.freeze({
              keyId: null,
              path: 'name',
              bsonType: 'int',
              queries: Object.freeze({ contentionFactor: 0 })
            }),
            null
          ])
        });

        const keyId = new Binary(Buffer.alloc(16, 0), 4);
        sinon.stub(clientEncryption, 'createDataKey').resolves(keyId);

        const { collection, encryptedFields: resultEncryptedFields } =
          await clientEncryption.createEncryptedCollection(db, collectionName, {
            provider: 'local',
            createCollectionOptions: {
              encryptedFields
            }
          });

        expect(collection).to.have.property('namespace', 'createEncryptedCollectionDb.secure');
        expect(encryptedFields, 'original encryptedFields should be unmodified').nested.property(
          'fields[0].keyId',
          false
        );
        expect(
          resultEncryptedFields,
          'encryptedFields created by helper should have replaced nullish keyId'
        ).nested.property('fields[1].keyId', keyId);
        expect(encryptedFields, 'original encryptedFields should be unmodified').nested.property(
          'fields[2]',
          null
        );
      });

      it('generates dataKeys for all null keyIds in the fields array', async () => {
        const encryptedFields = Object.freeze({
          escCollection: 'esc',
          eccCollection: 'ecc',
          ecocCollection: 'ecoc',
          fields: Object.freeze([
            Object.freeze({ keyId: null }),
            Object.freeze({ keyId: null }),
            Object.freeze({ keyId: null })
          ])
        });

        const keyId = new Binary(Buffer.alloc(16, 0), 4);
        sinon.stub(clientEncryption, 'createDataKey').resolves(keyId);

        const { collection, encryptedFields: resultEncryptedFields } =
          await clientEncryption.createEncryptedCollection(db, collectionName, {
            provider: 'local',
            createCollectionOptions: {
              encryptedFields
            }
          });

        expect(collection).to.have.property('namespace', 'createEncryptedCollectionDb.secure');
        expect(resultEncryptedFields.fields).to.have.lengthOf(3);
        expect(resultEncryptedFields.fields.filter(({ keyId }) => keyId === null)).to.have.lengthOf(
          0
        );
      });
    });
  });
});
