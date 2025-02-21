import { expect } from 'chai';
import { readFileSync } from 'fs';
import * as sinon from 'sinon';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import {
  ClientEncryption,
  type DataKey
} from '../../../src/client-side-encryption/client_encryption';
/* eslint-disable @typescript-eslint/no-restricted-imports */
import { MongoCryptInvalidArgumentError } from '../../../src/client-side-encryption/errors';
/* eslint-disable @typescript-eslint/no-restricted-imports */
import { StateMachine } from '../../../src/client-side-encryption/state_machine';
import { Binary, type Collection, Int32, Long, type MongoClient, UUID } from '../../mongodb';

function readHttpResponse(path) {
  let data = readFileSync(path, 'utf8').toString();
  data = data.split('\n').join('\r\n');
  return Buffer.from(data, 'utf8');
}

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true
  }
};
describe('ClientEncryption integration tests', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();
    await client
      .db('client')
      .collection('encryption')
      .drop()
      .catch(() => null);
  });

  afterEach(async function () {
    await client?.close();
  });

  describe('stubbed stateMachine', function () {
    const sandbox = sinon.createSandbox();

    after(() => sandbox.restore());

    before(() => {
      // stubbed out for AWS unit testing below
      const MOCK_KMS_ENCRYPT_REPLY = readHttpResponse(
        `${__dirname}/../../unit/client-side-encryption/data/kms-encrypt-reply.txt`
      );
      sandbox.stub(StateMachine.prototype, 'kmsRequest').callsFake(request => {
        request.addResponse(MOCK_KMS_ENCRYPT_REPLY);
        return Promise.resolve();
      });
    });

    [
      {
        name: 'local',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      },
      {
        name: 'aws',
        kmsProviders: { aws: { accessKeyId: 'example', secretAccessKey: 'example' } },
        options: { masterKey: { region: 'region', key: 'cmk' } }
      }
    ].forEach(providerTest => {
      it(
        `should create a data key with the "${providerTest.name}" KMS provider`,
        metadata,
        async function () {
          const providerName = providerTest.name;
          const encryption = new ClientEncryption(client, {
            keyVaultNamespace: 'client.encryption',
            kmsProviders: providerTest.kmsProviders
          });

          const dataKeyOptions = providerTest.options || {};

          const dataKey = await encryption.createDataKey(providerName, dataKeyOptions);
          expect(dataKey).property('_bsontype', 'Binary');

          const doc = await client.db('client').collection('encryption').findOne({ _id: dataKey });
          expect(doc).to.have.property('masterKey');
          expect(doc.masterKey).property('provider', providerName);
        }
      );

      it(
        `should create a data key with the "${providerTest.name}" KMS provider (fixed key material)`,
        metadata,
        async function () {
          const providerName = providerTest.name;
          const encryption = new ClientEncryption(client, {
            keyVaultNamespace: 'client.encryption',
            kmsProviders: providerTest.kmsProviders
          });

          const dataKeyOptions = {
            ...providerTest.options,
            keyMaterial: new Binary(Buffer.alloc(96))
          };

          const dataKey = await encryption.createDataKey(providerName, dataKeyOptions);
          expect(dataKey).property('_bsontype', 'Binary');

          const doc = await client.db('client').collection('encryption').findOne({ _id: dataKey });
          expect(doc).to.have.property('masterKey');
          expect(doc.masterKey).property('provider', providerName);
        }
      );
    });

    it(
      `should create a data key with the local KMS provider (fixed key material, fixed key UUID)`,
      metadata,
      async function () {
        // 'Custom Key Material Test' prose spec test:
        const keyVaultColl = client.db('client').collection('encryption');
        const encryption = new ClientEncryption(client, {
          keyVaultNamespace: 'client.encryption',
          kmsProviders: {
            local: {
              key: 'A'.repeat(128) // the value here is not actually relevant
            }
          }
        });

        const dataKeyOptions = {
          keyMaterial: new Binary(
            Buffer.from(
              'xPTAjBRG5JiPm+d3fj6XLi2q5DMXUS/f1f+SMAlhhwkhDRL0kr8r9GDLIGTAGlvC+HVjSIgdL+RKwZCvpXSyxTICWSXTUYsWYPyu3IoHbuBZdmw2faM3WhcRIgbMReU5',
              'base64'
            )
          )
        };
        const dataKey = await encryption.createDataKey('local', dataKeyOptions);
        expect(dataKey._bsontype).to.equal('Binary');

        // Remove and re-insert with a fixed UUID to guarantee consistent output
        const doc = (
          await keyVaultColl.findOneAndDelete(
            { _id: dataKey },
            { writeConcern: { w: 'majority' }, includeResultMetadata: true }
          )
        ).value;
        doc._id = new Binary(Buffer.alloc(16), 4);
        await keyVaultColl.insertOne(doc, { writeConcern: { w: 'majority' } });

        const encrypted = await encryption.encrypt('test', {
          keyId: doc._id,
          algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
        });
        expect(encrypted._bsontype).to.equal('Binary');
        expect(encrypted.toString('base64')).to.equal(
          'AQAAAAAAAAAAAAAAAAAAAAACz0ZOLuuhEYi807ZXTdhbqhLaS2/t9wLifJnnNYwiw79d75QYIZ6M/aYC1h9nCzCjZ7pGUpAuNnkUhnIXM3PjrA=='
        );
      }
    );

    it('should fail to create a data key if keyMaterial is wrong', metadata, async function () {
      const encryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders: { local: { key: 'A'.repeat(128) } }
      });

      const dataKeyOptions = {
        keyMaterial: new Binary(Buffer.alloc(97))
      };
      const error = await encryption.createDataKey('local', dataKeyOptions).catch(error => error);
      expect(error.message).to.equal('keyMaterial should have length 96, but has length 97');
    });

    it(
      'should explicitly encrypt and decrypt with the "local" KMS provider',
      metadata,
      async function () {
        const encryption = new ClientEncryption(client, {
          keyVaultNamespace: 'client.encryption',
          kmsProviders: { local: { key: Buffer.alloc(96) } }
        });

        const dataKey = await encryption.createDataKey('local');

        const encryptOptions = {
          keyId: dataKey,
          algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
        };

        const encrypted = await encryption.encrypt('hello', encryptOptions);
        expect(encrypted._bsontype).to.equal('Binary');
        expect(encrypted.sub_type).to.equal(6);

        const decrypted = await encryption.decrypt(encrypted);
        expect(decrypted).to.equal('hello');
      }
    );

    it(
      'should explicitly encrypt and decrypt with the "local" KMS provider (promise)',
      metadata,
      async function () {
        const encryption = new ClientEncryption(client, {
          keyVaultNamespace: 'client.encryption',
          kmsProviders: { local: { key: Buffer.alloc(96) } }
        });

        const dataKey = await encryption.createDataKey('local');
        const encryptOptions = {
          keyId: dataKey,
          algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
        };

        const encrypted = await encryption.encrypt('hello', encryptOptions);
        expect(encrypted._bsontype).to.equal('Binary');
        expect(encrypted.sub_type).to.equal(6);

        const decrypted = await encryption.decrypt(encrypted);

        expect(decrypted).to.equal('hello');
      }
    );

    it(
      'should explicitly encrypt and decrypt with a re-wrapped local key',
      metadata,
      async function () {
        // Create new ClientEncryption instances to make sure
        // that we are actually using the rewrapped keys and not
        // something that has been cached.
        const newClientEncryption = () =>
          new ClientEncryption(client, {
            keyVaultNamespace: 'client.encryption',
            kmsProviders: { local: { key: 'A'.repeat(128) } }
          });

        const dataKey = await newClientEncryption().createDataKey('local');
        const encryptOptions = {
          keyId: dataKey,
          algorithm: 'Indexed',
          contentionFactor: 0
        };

        const encrypted = await newClientEncryption().encrypt('hello', encryptOptions);
        expect(encrypted._bsontype).to.equal('Binary');
        expect(encrypted.sub_type).to.equal(6);
        const rewrapManyDataKeyResult = await newClientEncryption().rewrapManyDataKey({});
        expect(rewrapManyDataKeyResult.bulkWriteResult.result.nModified).to.equal(1);
        const decrypted = await newClientEncryption().decrypt(encrypted);
        expect(decrypted).to.equal('hello');
      }
    );

    it('should not perform updates if no keys match', metadata, async function () {
      const clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders: { local: { key: 'A'.repeat(128) } }
      });

      const rewrapManyDataKeyResult = await clientEncryption.rewrapManyDataKey({ _id: 12345 });
      expect(rewrapManyDataKeyResult.bulkWriteResult).to.equal(undefined);
    });

    // TODO(NODE-3371): resolve KMS JSON response does not include string 'Plaintext'. HTTP status=200 error
    it.skip(
      'should explicitly encrypt and decrypt with the "aws" KMS provider',
      metadata,
      function (done) {
        const encryption = new ClientEncryption(client, {
          keyVaultNamespace: 'client.encryption',
          kmsProviders: { aws: { accessKeyId: 'example', secretAccessKey: 'example' } }
        });

        const dataKeyOptions = {
          masterKey: { region: 'region', key: 'cmk' }
        };

        encryption.createDataKey('aws', dataKeyOptions, (err, dataKey) => {
          expect(err).to.not.exist;

          const encryptOptions = {
            keyId: dataKey,
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
          };

          encryption.encrypt('hello', encryptOptions, (err, encrypted) => {
            expect(err).to.not.exist;
            expect(encrypted).to.have.property('v');
            expect(encrypted.v._bsontype).to.equal('Binary');
            expect(encrypted.v.sub_type).to.equal(6);

            encryption.decrypt(encrypted, (err, decrypted) => {
              expect(err).to.not.exist;
              expect(decrypted).to.equal('hello');
              done();
            });
          });
        });
      }
    ).skipReason =
      "TODO(NODE-3371): resolve KMS JSON response does not include string 'Plaintext'. HTTP status=200 error";
  });

  describe('encrypt()', function () {
    let clientEncryption;
    let completeOptions;
    let dataKey;

    beforeEach(async function () {
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      });

      dataKey = await clientEncryption.createDataKey('local', {
        name: 'local',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      });

      completeOptions = {
        algorithm: 'Range',
        contentionFactor: 0,
        rangeOptions: {
          min: new Long(0),
          max: new Long(10),
          sparsity: new Long(1)
        },
        keyId: dataKey
      };
    });

    context('when expressionMode is incorrectly provided as an argument', function () {
      it(
        'overrides the provided option with the correct value for expression mode',
        {
          requires: {
            clientSideEncryption: '>=6.1.0-alpha'
          }
        },
        async function () {
          const optionsWithExpressionMode = { ...completeOptions, expressionMode: true };
          const result = await clientEncryption.encrypt(new Long(0), optionsWithExpressionMode);

          expect(result).to.be.instanceof(Binary);
        }
      );
    });
  });

  describe('encryptExpression()', function () {
    let clientEncryption;
    let completeOptions;
    let dataKey;
    const expression = {
      $and: [{ someField: { $gt: 1 } }]
    };
    const metadata: MongoDBMetadataUI = {
      requires: {
        clientSideEncryption: '>=6.1.0-alpha'
      }
    };

    beforeEach(async function () {
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      });

      dataKey = await clientEncryption.createDataKey('local', {
        name: 'local',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      });

      completeOptions = {
        algorithm: 'Range',
        queryType: 'range',
        contentionFactor: 0,
        rangeOptions: {
          min: new Int32(0),
          max: new Int32(10),
          trimFactor: new Int32(1),
          sparsity: new Long(1)
        },
        keyId: dataKey
      };
    });

    it('throws if rangeOptions is not provided', metadata, async function () {
      expect(delete completeOptions.rangeOptions).to.be.true;
      const errorOrResult = await clientEncryption
        .encryptExpression(expression, completeOptions)
        .catch(e => e);

      expect(errorOrResult).to.be.instanceof(TypeError);
    });

    it('throws if algorithm is not provided', metadata, async function () {
      expect(delete completeOptions.algorithm).to.be.true;
      const errorOrResult = await clientEncryption
        .encryptExpression(expression, completeOptions)
        .catch(e => e);

      expect(errorOrResult).to.be.instanceof(TypeError);
    });

    it(`throws if algorithm does not equal 'range'`, metadata, async function () {
      completeOptions['algorithm'] = 'equality';
      const errorOrResult = await clientEncryption
        .encryptExpression(expression, completeOptions)
        .catch(e => e);

      expect(errorOrResult).to.be.instanceof(TypeError);
    });

    it(`works with any casing of 'range'`, metadata, async function () {
      completeOptions['algorithm'] = 'rAnGe';
      const result = await clientEncryption.encryptExpression(expression, completeOptions);

      expect(result.$and).to.exist;
    });

    context('when expressionMode is incorrectly provided as an argument', function () {
      it(
        'overrides the provided option with the correct value for expression mode',
        metadata,
        async function () {
          const optionsWithExpressionMode = { ...completeOptions, expressionMode: false };
          const result = await clientEncryption.encryptExpression(
            expression,
            optionsWithExpressionMode
          );

          expect(result).not.to.be.instanceof(Binary);
        }
      );
    });
  });

  describe('createDataKey()', () => {
    let clientEncryption;

    beforeEach(function () {
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      });
    });

    it('returns a UUID instance', async () => {
      const dataKey = await clientEncryption.createDataKey('local', {
        name: 'local',
        kmsProviders: { local: { key: Buffer.alloc(96) } }
      });

      expect(dataKey).to.be.instanceOf(UUID);
    });
  });

  describe('ClientEncryptionKeyAltNames', function () {
    let client: MongoClient;
    let clientEncryption: ClientEncryption;
    let collection: Collection<DataKey>;

    const kmsProviders = {
      local: { key: Buffer.alloc(96) }
    };

    beforeEach(function () {
      client = this.configuration.newClient();
      collection = client.db('client').collection('encryption');
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace: 'client.encryption',
        kmsProviders
      });
    });

    afterEach(async function () {
      await client?.close();
    });

    describe('errors', function () {
      for (const val of [42, 'hello', { keyAltNames: 'foobar' }, /foobar/]) {
        it(`should fail if typeof keyAltNames = ${typeof val}`, metadata, async function () {
          const error = await clientEncryption
            .createDataKey('local', {
              // @ts-expect-error Invalid type tests
              keyAltNames: val
            })
            .catch(error => error);
          expect(error).to.be.instanceOf(MongoCryptInvalidArgumentError);
        });
      }

      for (const val of [undefined, null, 42, { keyAltNames: 'foobar' }, ['foobar'], /foobar/]) {
        it(`should fail if typeof keyAltNames[x] = ${typeof val}`, metadata, async function () {
          const error = await clientEncryption
            .createDataKey('local', {
              // @ts-expect-error Invalid type tests
              keyAltNames: [val]
            })
            .catch(error => error);
          expect(error).to.be.instanceOf(MongoCryptInvalidArgumentError);
        });
      }
    });

    it('should create a key with keyAltNames', metadata, async function () {
      const dataKey = await clientEncryption.createDataKey('local', {
        keyAltNames: ['foobar']
      });
      const document = await collection.findOne({ keyAltNames: 'foobar' });
      expect(document).to.be.an('object');
      expect(document).to.have.property('keyAltNames').that.includes.members(['foobar']);
      expect(document).to.have.property('_id').that.deep.equals(dataKey);
    });

    it('should create a key with multiple keyAltNames', metadata, async function () {
      const dataKey = await clientEncryption.createDataKey('local', {
        keyAltNames: ['foobar', 'fizzbuzz']
      });
      const docs = await Promise.all([
        collection.findOne({ keyAltNames: 'foobar' }),
        collection.findOne({ keyAltNames: 'fizzbuzz' })
      ]);
      expect(docs).to.have.lengthOf(2);
      const doc1 = docs[0];
      const doc2 = docs[1];
      expect(doc1).to.be.an('object');
      expect(doc2).to.be.an('object');
      expect(doc1).to.have.property('keyAltNames').that.includes.members(['foobar', 'fizzbuzz']);
      expect(doc1).to.have.property('_id').that.deep.equals(dataKey);
      expect(doc2).to.have.property('keyAltNames').that.includes.members(['foobar', 'fizzbuzz']);
      expect(doc2).to.have.property('_id').that.deep.equals(dataKey);
    });

    it(
      'should be able to reference a key with `keyAltName` during encryption',
      metadata,
      async function () {
        const keyAltName = 'mySpecialKey';
        const algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic';

        const valueToEncrypt = 'foobar';

        const keyId = await clientEncryption.createDataKey('local', {
          keyAltNames: [keyAltName]
        });
        const encryptedValue = await clientEncryption.encrypt(valueToEncrypt, { keyId, algorithm });
        const encryptedValue2 = await clientEncryption.encrypt(valueToEncrypt, {
          keyAltName,
          algorithm
        });
        expect(encryptedValue).to.deep.equal(encryptedValue2);
      }
    );
  });
});
