import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { BSON, type Document, type MongoClient } from '../../mongodb';
import { type TestConfiguration } from '../../tools/runner/config';
import { getEncryptExtraOptions } from '../../tools/utils';

const defaultMetadata: MongoDBMetadataUI = {
  requires: {
    topology: '!single',
    clientSideEncryption: '>=6.3.0',
    mongodb: '>=7.0.0'
  }
};

const readFixture = async (name: string) =>
  BSON.EJSON.parse(
    await fs.readFile(
      path.resolve(__dirname, `../../spec/client-side-encryption/etc/data/lookup/${name}`),
      'utf8'
    )
  );

const newEncryptedClient = ({ configuration }: { configuration: TestConfiguration }) =>
  configuration.newClient(
    {},
    {
      writeConcern: { w: 'majority' },
      autoEncryption: {
        keyVaultNamespace: 'db.keyvault',
        kmsProviders: { local: getCSFLEKMSProviders().local },
        extraOptions: getEncryptExtraOptions()
      }
    }
  );

describe('$lookup support', defaultMetadata, function () {
  before(async function () {
    const mochaTest = { metadata: defaultMetadata };

    if (!this.configuration.filters.MongoDBVersionFilter.filter(mochaTest)) {
      return;
    }

    if (!this.configuration.filters.MongoDBTopologyFilter.filter(mochaTest)) {
      return;
    }

    if (!this.configuration.filters.ClientSideEncryptionFilter.filter(mochaTest)) {
      return;
    }

    let unencryptedClient: MongoClient, encryptedClient: MongoClient;
    try {
      /**
       * Create an encrypted MongoClient configured with:
       *
       * ```txt
       *   AutoEncryptionOpts(
       *       keyVaultNamespace="db.keyvault",
       *       kmsProviders={"local": { "key": "<base64 decoding of LOCAL_MASTERKEY>" }}
       *   )
       * ```
       */
      encryptedClient = newEncryptedClient(this);

      /** Drop database db. */
      await encryptedClient.db('db').dropDatabase();

      /** Insert `key-doc.json` into db.keyvault. */
      const keyDoc = await readFixture('key-doc.json');
      await encryptedClient.db('db').collection('keyvault').insertOne(keyDoc);

      /**
       * Create the following collections:
       * ```
       *   db.csfle with options: { "validator": { "$jsonSchema": "<schema-csfle.json>"}}.
       *   db.csfle2 with options: { "validator": { "$jsonSchema": "<schema-csfle2.json>"}}.
       *   db.qe with options: { "encryptedFields": "<schema-qe.json>"}.
       *   db.qe2 with options: { "encryptedFields": "<schema-qe2.json>"}.
       *   db.no_schema with no options.
       *   db.no_schema2 with no options.
       * ```
       */
      const collections = [
        {
          name: 'csfle',
          options: { validator: { $jsonSchema: await readFixture('schema-csfle.json') } },
          document: { csfle: 'csfle' }
        },
        {
          name: 'csfle2',
          options: { validator: { $jsonSchema: await readFixture('schema-csfle2.json') } },
          document: { csfle2: 'csfle2' }
        },
        {
          name: 'qe',
          options: { encryptedFields: await readFixture('schema-qe.json') },
          document: { qe: 'qe' }
        },
        {
          name: 'qe2',
          options: { encryptedFields: await readFixture('schema-qe2.json') },
          document: { qe2: 'qe2' }
        },
        {
          name: 'no_schema',
          options: {},
          document: { no_schema: 'no_schema' }
        },
        {
          name: 'no_schema2',
          options: {},
          document: { no_schema2: 'no_schema2' }
        }
      ];

      for (const { name, options } of collections) {
        await encryptedClient.db('db').createCollection(name, options);
      }

      /** Create an unencrypted MongoClient. */
      unencryptedClient = this.configuration.newClient({}, { writeConcern: { w: 'majority' } });

      /**
       * ```
       * {"csfle": "csfle"} into db.csfle
       * Use the unencrypted client to retrieve it. Assert the csfle field is BSON binary.
       * {"csfle2": "csfle2"} into db.csfle2
       * Use the unencrypted client to retrieve it. Assert the csfle2 field is BSON binary.
       * {"qe": "qe"} into db.qe
       * Use the unencrypted client to retrieve it. Assert the qe field is BSON binary.
       * {"qe2": "qe2"} into db.qe2
       * Use the unencrypted client to retrieve it. Assert the qe2 field is BSON binary.
       * {"no_schema": "no_schema"} into db.no_schema
       * {"no_schema2": "no_schema2"} into db.no_schema2
       * ```
       */
      for (const { name, document } of collections) {
        const { insertedId } = await encryptedClient.db('db').collection(name).insertOne(document);

        if (name.startsWith('no_')) continue;

        expect(await unencryptedClient.db('db').collection(name).findOne(insertedId))
          .to.have.property(Object.keys(document)[0])
          .that.has.property('_bsontype', 'Binary');
      }
    } finally {
      await unencryptedClient?.close();
      await encryptedClient?.close();
    }
  });

  const test = function (
    title: string,
    collName: string,
    pipeline: Document[],
    expected: Document | RegExp,
    metadata?: MongoDBMetadataUI
  ) {
    describe(title.slice(0, title.indexOf(':')), function () {
      let client: MongoClient;

      beforeEach(async function () {
        client = newEncryptedClient(this);
      });

      afterEach(async function () {
        await client.close();
      });

      it(title.slice(title.indexOf(':') + 1).trim(), metadata ?? defaultMetadata, async () => {
        const collection = client.db('db').collection(collName);
        const actual = await collection
          .aggregate(pipeline)
          .toArray()
          .catch(error => error);

        const expectedError = expected instanceof RegExp;

        if (expectedError) {
          expect(actual).to.be.instanceOf(Error);
          if (!expected.test(actual.message)) {
            throw actual;
          }
        } else if (actual instanceof Error) {
          throw actual;
        } else {
          expect(actual).to.have.lengthOf(1);
          expect(actual[0]).to.deep.equal(expected);
        }
      });
    });
  };

  test(
    'Case 1: db.csfle joins db.no_schema',
    'csfle',
    [
      { $match: { csfle: 'csfle' } },
      {
        $lookup: {
          from: 'no_schema',
          as: 'matched',
          pipeline: [{ $match: { no_schema: 'no_schema' } }, { $project: { _id: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    { csfle: 'csfle', matched: [{ no_schema: 'no_schema' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 2: db.qe joins db.no_schema',
    'qe',
    [
      { $match: { qe: 'qe' } },
      {
        $lookup: {
          from: 'no_schema',
          as: 'matched',
          pipeline: [
            { $match: { no_schema: 'no_schema' } },
            { $project: { _id: 0, __safeContent__: 0 } }
          ]
        }
      },
      { $project: { _id: 0, __safeContent__: 0 } }
    ],
    { qe: 'qe', matched: [{ no_schema: 'no_schema' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 3: db.no_schema joins db.csfle',
    'no_schema',
    [
      { $match: { no_schema: 'no_schema' } },
      {
        $lookup: {
          from: 'csfle',
          as: 'matched',
          pipeline: [{ $match: { csfle: 'csfle' } }, { $project: { _id: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    { no_schema: 'no_schema', matched: [{ csfle: 'csfle' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 4: db.no_schema joins db.qe',
    'no_schema',
    [
      { $match: { no_schema: 'no_schema' } },
      {
        $lookup: {
          from: 'qe',
          as: 'matched',
          pipeline: [{ $match: { qe: 'qe' } }, { $project: { _id: 0, __safeContent__: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    { no_schema: 'no_schema', matched: [{ qe: 'qe' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 5: db.csfle joins db.csfle2',
    'csfle',
    [
      { $match: { csfle: 'csfle' } },
      {
        $lookup: {
          from: 'csfle2',
          as: 'matched',
          pipeline: [{ $match: { csfle2: 'csfle2' } }, { $project: { _id: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    { csfle: 'csfle', matched: [{ csfle2: 'csfle2' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 6: db.qe joins db.qe2',
    'qe',
    [
      { $match: { qe: 'qe' } },
      {
        $lookup: {
          from: 'qe2',
          as: 'matched',
          pipeline: [{ $match: { qe2: 'qe2' } }, { $project: { _id: 0, __safeContent__: 0 } }]
        }
      },
      { $project: { _id: 0, __safeContent__: 0 } }
    ],
    { qe: 'qe', matched: [{ qe2: 'qe2' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 7: db.no_schema joins db.no_schema2',
    'no_schema',
    [
      { $match: { no_schema: 'no_schema' } },
      {
        $lookup: {
          from: 'no_schema2',
          as: 'matched',
          pipeline: [{ $match: { no_schema2: 'no_schema2' } }, { $project: { _id: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    { no_schema: 'no_schema', matched: [{ no_schema2: 'no_schema2' }] },
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 8: db.csfle joins db.qe',
    'csfle',
    [
      { $match: { csfle: 'qe' } },
      {
        $lookup: {
          from: 'qe',
          as: 'matched',
          pipeline: [{ $match: { qe: 'qe' } }, { $project: { _id: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    /not supported/i,
    { requires: { ...defaultMetadata.requires, mongodb: '>=8.1.0' } }
  );

  test(
    'Case 9: test error with <8.1',
    'csfle',
    [
      { $match: { csfle: 'csfle' } },
      {
        $lookup: {
          from: 'no_schema',
          as: 'matched',
          pipeline: [{ $match: { no_schema: 'no_schema' } }, { $project: { _id: 0 } }]
        }
      },
      { $project: { _id: 0 } }
    ],
    /Upgrade/i,
    { requires: { ...defaultMetadata.requires, mongodb: '>=7.0.0 <8.1.0' } }
  );
});
