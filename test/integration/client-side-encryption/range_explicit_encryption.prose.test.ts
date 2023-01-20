import { EJSON } from 'bson';
import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { Document, Double, Long, MongoClient } from '../../../src';

const getKmsProviders = () => {
  const result = EJSON.parse(process.env.CSFLE_KMS_PROVIDERS || '{}') as unknown as {
    local: unknown;
  };

  return { local: result.local };
};

const metaData = {
  requires: {
    clientSideEncryption: true,

    // The Range Explicit Encryption tests require MongoDB server 6.2+. The tests must not run against a standalone.
    mongodb: '>=6.2.0',
    topology: !'standalone'
  }
};

/**
 * a comparitor function to sort two documents by their _id
 */
function byId(a, b) {
  if (a._id > b._id) return 1;
  if (a._id < b._id) return -1;
  return 0;
}

const prepareOptions = opts =>
  EJSON.parse(EJSON.stringify(opts, { relaxed: false }), {
    relaxed: false
  });

const dataTypes = [
  {
    type: 'DoubleNoPrecision',
    rangeOptions: prepareOptions({ sparsity: { $numberLong: '1' } }),
    factory: value => new Double(value)
  },
  {
    type: 'DoublePrecision',
    rangeOptions: prepareOptions({
      min: { $numberDouble: '0' },
      max: { $numberDouble: '200' },
      sparsity: { $numberLong: '1' },
      precision: 2
    }),
    factory: value => new Double(value)
  },
  {
    type: 'Date',
    rangeOptions: prepareOptions({
      min: { $date: { $numberLong: '0' } },
      max: { $date: { $numberLong: '200' } },
      sparsity: { $numberLong: '1' }
    }),
    factory: value => new Date(value)
  },
  {
    type: 'Int',
    rangeOptions: prepareOptions({
      min: { $numberInt: '0' },
      max: { $numberInt: '200' },
      sparsity: { $numberLong: '1' }
    }),
    factory: value => value
  },
  {
    type: 'Long',
    rangeOptions: prepareOptions({
      min: { $numberLong: '0' },
      max: { $numberLong: '200' },
      sparsity: { $numberLong: '1' }
    }),
    factory: value => Long.fromNumber(value)
  }
];

const basePath = '/test/spec/client-side-encryption/etc/data';

const readEncryptedFieldsFile = (dataType: string): Promise<string> =>
  readFile(join(__dirname, '../../..', basePath, `range-encryptedFields-${dataType}.json`), {
    encoding: 'utf8'
  });

describe.only('Range Explicit Encryption', function () {
  let clientEncryption;
  let keyId;
  let keyVaultClient;
  let encryptedClient;
  let encryptedZero;
  let encryptedSix;
  let encryptedThirty;
  let encryptedTwoHundred;
  for (const { type: dataType, rangeOptions, factory } of dataTypes) {
    context(`datatype ${dataType}`, async function () {
      beforeEach(async function () {
        const ClientEncryption = this.configuration.mongodbClientEncryption.ClientEncryption;
        const keyDocument1 = EJSON.parse(
          await readFile(join(__dirname, '../../../', basePath, 'keys', `key1-document.json`), {
            encoding: 'utf8'
          }),
          {
            relaxed: false
          }
        ) as unknown as Document;

        // confirm that this is an ObjectId
        keyId = keyDocument1._id;
        const encryptedFields = EJSON.parse(await readEncryptedFieldsFile(dataType), {
          relaxed: false
        }) as unknown as Document;

        const utilClient: MongoClient = await this.configuration.newClient().connect();

        await utilClient.db('db').dropDatabase();

        await utilClient
          .db('db')
          .dropCollection('explicit_encryption')
          .catch(e => {
            if (!/ns not found/.test(e.message)) {
              throw e;
            }
          });
        await utilClient.db('db').createCollection('explicit_encryption', {
          encryptedFields
        });

        await utilClient
          .db('keyvault')
          .dropCollection('datakeys')
          .catch(e => {
            if (!/ns not found/.test(e.message)) {
              throw e;
            }
          });

        await utilClient.db('keyvault').createCollection('datakeys');

        await utilClient
          .db('keyvault')
          .collection('datakeys')
          .insertOne(keyDocument1, { writeConcern: { w: 'majority' } });

        keyVaultClient = this.configuration.newClient();
        await keyVaultClient.connect();

        const clientEncryptionOpts = {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: getKmsProviders()
        };
        clientEncryption = new ClientEncryption(keyVaultClient, clientEncryptionOpts);

        const autoEncryptionOptions = {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: getKmsProviders(),
          bypassQueryAnalysis: true
        };

        encryptedClient = await this.configuration
          .newClient({}, { autoEncryption: autoEncryptionOptions })
          .connect();

        const opts = {
          keyId,
          algorithm: 'RangePreview',
          contentionFactor: 0,
          rangeOptions // TODO: is this the correct place to encrypt with rangeOpts?
        };

        encryptedZero = await clientEncryption.encrypt(factory(0), opts);
        encryptedSix = await clientEncryption.encrypt(typeFactory(dataType, 6), opts);
        encryptedThirty = await clientEncryption.encrypt(typeFactory(dataType, 30), opts);
        encryptedTwoHundred = await clientEncryption.encrypt(typeFactory(dataType, 200), opts);

        const key = `encrypted${dataType}`;
        await encryptedClient
          .db('db')
          .collection('explicit_encryption')
          .insertMany([
            {
              [key]: encryptedZero,
              _id: 0
            },
            {
              [key]: encryptedSix,
              _id: 1
            },
            {
              [key]: encryptedThirty,
              _id: 2
            },
            {
              [key]: encryptedTwoHundred,
              _id: 3
            }
          ]);

        await utilClient.close();
      });

      afterEach(async function () {
        await keyVaultClient.close();
        await encryptedClient.close();
      });

      it('Case 1: can decrypt a payload', metaData, async function () {
        const insertedPayload = await clientEncryption.encrypt(typeFactory(dataType, 6), {
          keyId,
          algorithm: 'RangePreview',
          contentionFactor: 0,
          rangeOptions
        });

        if (dataType !== 'Date') {
          expect(await clientEncryption.decrypt(insertedPayload)).to.equal(6);
        } else {
          const result = await clientEncryption.decrypt(insertedPayload);
          expect(result.getUTCMilliseconds()).to.equal(6);
        }
      });

      it('Case 2: can find encrypted range and return the maximum', metaData, async function () {
        const query = {
          $and: [
            { 'encrypted<Type>': { $gte: typeFactory(dataType, 6) } },
            { 'encrypted<Type>': { $lte: typeFactory(dataType, 200) } }
          ]
        };

        const findPayload = await clientEncryption.encryptExpression(query, {
          keyId,
          algorithm: 'RangePreview',
          queryType: 'rangePreview',
          contentionFactor: 0,
          rangeOptions
        });

        const key = `encrypted${dataType}`;
        const result = (
          await encryptedClient
            .db('db')
            .collection('explicit_encryption')
            .find(findPayload)
            .toArray()
        ).map(doc => ({ _id: doc._id, [key]: doc[key] }));

        result.sort(byId);

        if (dataType !== 'Date') {
          expect(result).to.deep.equal([
            {
              [key]: 6,
              _id: 1
            },
            {
              [key]: 30,
              _id: 2
            },
            {
              [key]: 200,
              _id: 3
            }
          ]);
        } else {
          const dateResult = result.map(doc => ({ ...doc, [key]: doc[key].getUTCMilliseconds() }));
          expect(dateResult).to.deep.equal([
            {
              [key]: 6,
              _id: 1
            },
            {
              [key]: 30,
              _id: 2
            },
            {
              [key]: 200,
              _id: 3
            }
          ]);
        }
      });

      it('Case 3: can find encrypted range and return the minimum', metaData, async function () {
        const query = {
          $and: [
            { 'encrypted<Type>': { $gte: typeFactory(dataType, 0) } },
            { 'encrypted<Type>': { $lte: typeFactory(dataType, 6) } }
          ]
        };

        const findPayload = await clientEncryption.encryptExpression(query, {
          keyId,
          algorithm: 'RangePreview',
          queryType: 'rangePreview',
          contentionFactor: 0,
          rangeOptions
        });

        const key = `encrypted${dataType}`;
        const result = (
          await encryptedClient
            .db('db')
            .collection('explicit_encryption')
            .find(findPayload)
            .toArray()
        ).map(doc => ({ _id: doc._id, [key]: doc[key] }));

        result.sort(byId);

        if (dataType !== 'Date') {
          expect(result).to.deep.equal([
            {
              [key]: 0,
              _id: 0
            },
            {
              [key]: 6,
              _id: 1
            }
          ]);
        } else {
          const dateResult = result.map(doc => ({ ...doc, [key]: doc[key].getUTCMilliseconds() }));
          expect(dateResult).to.deep.equal([
            {
              [key]: 0,
              _id: 0
            },
            {
              [key]: 6,
              _id: 1
            }
          ]);
        }
      });

      it('Case 4: can find encrypted range with an open range query', metaData, async function () {
        const query = {
          $and: [{ 'encrypted<Type>': { $gt: typeFactory(dataType, 30) } }]
        };

        const findPayload = await clientEncryption.encryptExpression(query, {
          keyId,
          algorithm: 'RangePreview',
          queryType: 'rangePreview',
          contentionFactor: 0,
          rangeOptions
        });

        const key = `encrypted${dataType}`;
        const result = (
          await encryptedClient
            .db('db')
            .collection('explicit_encryption')
            .find(findPayload)
            .toArray()
        ).map(doc => ({ _id: doc._id, [key]: doc[key] }));

        result.sort(byId);

        if (dataType !== 'Date') {
          expect(result).to.deep.equal([
            {
              [key]: 200,
              _id: 3
            }
          ]);
        } else {
          const dateResult = result.map(doc => ({ ...doc, [key]: doc[key].getUTCMilliseconds() }));
          expect(dateResult).to.deep.equal([
            {
              [key]: 200,
              _id: 3
            }
          ]);
        }
      });

      it('Case 5: can run an aggregation expression inside $expr', metaData, async function () {
        const query = { $and: [{ $lt: ['$encrypted<Type>', typeFactory(dataType, 30)] }] };

        const findPayload = await clientEncryption.encryptExpression(query, {
          keyId,
          algorithm: 'RangePreview',
          queryType: 'rangePreview',
          contentionFactor: 0,
          rangeOptions
        });

        const key = `encrypted${dataType}`;
        const result = (
          await encryptedClient
            .db('db')
            .collection('explicit_encryption')
            .find({ $expr: findPayload })
            .toArray()
        ).map(doc => ({ _id: doc._id, [key]: doc[key] }));

        result.sort(byId);

        if (dataType !== 'Date') {
          expect(result).to.deep.equal([
            {
              [key]: 0,
              _id: 0
            },
            {
              [key]: 6,
              _id: 1
            }
          ]);
        } else {
          const dateResult = result.map(doc => ({ ...doc, [key]: doc[key].getUTCMilliseconds() }));
          expect(dateResult).to.deep.equal([
            {
              [key]: 0,
              _id: 0
            },
            {
              [key]: 6,
              _id: 1
            }
          ]);
        }
      });

      it(
        'Case 6: encrypting a document greater than the maximum errors',
        metaData,
        async function () {
          if (dataType === 'DoubleNoPrecision') {
            this.test.skipReason = 'Case 6 does not apply to DoubleNoPrecision';
            this.skip();
          }
          const resultOrError = await clientEncryption
            .encrypt(typeFactory(dataType, 201), {
              keyId,
              algorithm: 'RangePreview',
              contentionFactor: 0,
              rangeOptions
            })
            .catch(e => e);

          expect(resultOrError).to.be.instanceOf(Error);
        }
      );

      it('Case 7: encrypting a document of a different type errors', metaData, async function () {
        if (dataType === 'DoubleNoPrecision') {
          this.test.skipReason = 'Case 7 does not apply to DoubleNoPrecision';
          this.skip();
        }

        const payload = (() => {
          if (dataType === 'Int') {
            return { encryptedInt: new Double(6) };
          } else {
            return { [`encrypted${dataType}`]: 6 };
          }
        })();

        const resultOrError = await clientEncryption
          .encrypt(payload, {
            keyId,
            algorithm: 'RangePreview',
            contentionFactor: 0,
            rangeOptions
          })
          .catch(e => e);

        expect(resultOrError).to.be.instanceOf(Error);
      });

      it(
        'Case 8: setting precision errors if the type is not a double',
        metaData,
        async function () {
          if (dataType === 'DoubleNoPrecision' || dataType === 'DoublePrecision') {
            this.test.skipReason = 'Case 8 does not apply to DoubleNoPrecision or DoublePrecision';
            this.skip();
          }

          const options = {
            min: 0,
            max: 200,
            sparsity: new Long(1),
            precision: 2
          };

          const resultOrError = await clientEncryption
            .encrypt(typeFactory(dataType, 6), {
              keyId,
              algorithm: 'RangePreview',
              contentionFactor: 0,
              rangeOptions: options
            })
            .catch(e => e);

          expect(resultOrError).to.be.instanceOf(Error);
        }
      );
    });
  }
});
