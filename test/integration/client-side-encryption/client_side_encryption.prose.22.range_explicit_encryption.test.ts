import { EJSON } from 'bson';
import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { Decimal128, Document, Double, Long, MongoClient } from '../../../src';
import { installNodeDNSWorkaroundHooks } from '../../tools/runner/hooks/configuration';

const getKmsProviders = () => {
  const result = EJSON.parse(process.env.CSFLE_KMS_PROVIDERS || '{}') as unknown as {
    local: unknown;
  };

  return { local: result.local };
};

const metaData: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,

    // The Range Explicit Encryption tests require MongoDB server 6.2+. The tests must not run against a standalone.
    mongodb: '>=6.2.0',
    topology: '!single'
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
  }) as any as Document;

const dataTypes: ReadonlyArray<{
  type:
    | 'DecimalNoPrecision'
    | 'DecimalPrecision'
    | 'DoubleNoPrecision'
    | 'DoublePrecision'
    | 'Long'
    | 'Int'
    | 'Date';
  rangeOptions: Document;
  factory: (number) => unknown;
}> = [
  {
    type: 'DecimalNoPrecision',
    rangeOptions: prepareOptions({
      sparsity: { $numberLong: '1' }
    }),
    factory: value => new Decimal128(value.toString())
  },
  {
    type: 'DecimalPrecision',
    rangeOptions: prepareOptions({
      min: { $numberDecimal: '0' },
      max: { $numberDecimal: '200' },
      sparsity: { $numberLong: '1' },
      precision: 2
    }),
    factory: value => new Decimal128(value.toString())
  },
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

describe('Range Explicit Encryption', function () {
  installNodeDNSWorkaroundHooks();

  let clientEncryption;
  let keyId;
  let keyVaultClient;
  let encryptedClient;
  let encryptedZero;
  let encryptedSix;
  let encryptedThirty;
  let encryptedTwoHundred;
  let compareNumericValues;
  for (const { type: dataType, rangeOptions, factory } of dataTypes) {
    context(`datatype ${dataType}`, async function () {
      beforeEach(async function () {
        compareNumericValues = function (value: unknown, expected: number): void {
          if (dataType === 'DoubleNoPrecision' || dataType === 'DoublePrecision') {
            expect(value).to.equal(expected);
          } else if (dataType === 'Long') {
            expect(value).to.equal(expected);
          } else {
            expect(value).to.deep.equal(factory(expected));
          }
        };
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

        encryptedClient = this.configuration.newClient(
          {},
          { autoEncryption: autoEncryptionOptions }
        );

        const opts = {
          keyId,
          algorithm: 'RangePreview',
          contentionFactor: 0,
          rangeOptions // TODO: is this the correct place to encrypt with rangeOpts?
        };

        encryptedZero = await clientEncryption.encrypt(factory(0), opts);
        encryptedSix = await clientEncryption.encrypt(factory(6), opts);
        encryptedThirty = await clientEncryption.encrypt(factory(30), opts);
        encryptedTwoHundred = await clientEncryption.encrypt(factory(200), opts);

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
        const insertedPayload = await clientEncryption.encrypt(factory(6), {
          keyId,
          algorithm: 'RangePreview',
          contentionFactor: 0,
          rangeOptions
        });

        const result = await clientEncryption.decrypt(insertedPayload, { promoteValues: false });
        compareNumericValues(result, 6);
      });

      it('Case 2: can find encrypted range and return the maximum', metaData, async function () {
        const query = {
          $and: [
            { 'encrypted<Type>': { $gte: factory(6) } },
            { 'encrypted<Type>': { $lte: factory(200) } }
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

        const expected = [
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
        ];

        expect(result).to.have.lengthOf(expected.length);

        for (let i = 0; i < expected.length; ++i) {
          const doc = result[i];
          const expectedDoc = expected[i];
          expect(doc).to.have.property('_id', expectedDoc['_id']);
          compareNumericValues(doc[key], expectedDoc[key]);
        }
      });

      it('Case 3: can find encrypted range and return the minimum', metaData, async function () {
        const query = {
          $and: [
            { 'encrypted<Type>': { $gte: factory(0) } },
            { 'encrypted<Type>': { $lte: factory(6) } }
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

        const expected = [
          {
            [key]: 0,
            _id: 0
          },
          {
            [key]: 6,
            _id: 1
          }
        ];

        expect(result).to.have.lengthOf(expected.length);

        for (let i = 0; i < expected.length; ++i) {
          const doc = result[i];
          const expectedDoc = expected[i];
          expect(doc).to.have.property('_id', expectedDoc['_id']);
          compareNumericValues(doc[key], expectedDoc[key]);
        }
      });

      it('Case 4: can find encrypted range with an open range query', metaData, async function () {
        const query = {
          $and: [{ 'encrypted<Type>': { $gt: factory(30) } }]
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

        expect(result).to.have.lengthOf(1);

        expect(result[0]).to.have.property('_id', 3);
        compareNumericValues(result[0][key], 200);
      });

      it('Case 5: can run an aggregation expression inside $expr', metaData, async function () {
        const query = { $and: [{ $lt: ['$encrypted<Type>', factory(30)] }] };

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

        const expected = [
          {
            [key]: 0,
            _id: 0
          },
          {
            [key]: 6,
            _id: 1
          }
        ];

        expect(result).to.have.lengthOf(expected.length);

        for (let i = 0; i < expected.length; ++i) {
          const doc = result[i];
          const expectedDoc = expected[i];
          expect(doc).to.have.property('_id', expectedDoc['_id']);
          compareNumericValues(doc[key], expectedDoc[key]);
        }
      });

      it(
        'Case 6: encrypting a document greater than the maximum errors',
        metaData,
        async function () {
          if (dataType === 'DoubleNoPrecision' || dataType === 'DecimalNoPrecision') {
            this.test.skipReason =
              'Case 6 does not apply to DoubleNoPrecision or DecimalNoPrecision';
            this.skip();
          }
          const resultOrError = await clientEncryption
            .encrypt(factory(201), {
              keyId,
              algorithm: 'RangePreview',
              contentionFactor: 0,
              rangeOptions
            })
            .catch(e => e);

          expect(resultOrError).to.be.instanceOf(
            this.configuration.mongodbClientEncryption.MongoCryptError
          );
        }
      );

      it('Case 7: encrypting a document of a different type errors', metaData, async function () {
        if (dataType === 'DoubleNoPrecision' || dataType === 'DecimalNoPrecision') {
          this.test.skipReason = 'Case 7 does not apply to DoubleNoPrecision or DecimalNoPrecision';
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

        expect(resultOrError).to.be.instanceOf(
          this.configuration.mongodbClientEncryption.MongoCryptError
        );
      });

      it(
        'Case 8: setting precision errors if the type is not a double',
        metaData,
        async function () {
          if (
            [
              'DoubleNoPrecision',
              'DecimalNoPrecision',
              'DoublePrecision',
              'DecimalNoPrecision'
            ].includes(dataType)
          )
            if (dataType === 'DoubleNoPrecision' || dataType === 'DoublePrecision') {
              this.test.skipReason =
                'Case 8 does not apply to the following dataTypes: ' +
                [
                  'DoubleNoPrecision',
                  'DecimalNoPrecision',
                  'DoublePrecision',
                  'DecimalNoPrecision'
                ].join(', ');
              this.skip();
            }

          const options = {
            min: 0,
            max: 200,
            sparsity: new Long(1),
            precision: 2
          };

          const resultOrError = await clientEncryption
            .encrypt(factory(6), {
              keyId,
              algorithm: 'RangePreview',
              contentionFactor: 0,
              rangeOptions: options
            })
            .catch(e => e);

          expect(resultOrError).to.be.instanceOf(TypeError);
        }
      );
    });
  }
});
