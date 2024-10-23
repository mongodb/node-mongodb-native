import { EJSON } from 'bson';
import { expect } from 'chai';
import { test } from 'mocha';
import {
  ClientEncryption,
  Double,
  Int32,
  type MongoClient,
  type MongoClientOptions
} from 'mongodb';
import { type Connection, createConnection, Schema, SchemaTypes } from 'mongoose';

const getKmsProviders = () => {
  const result = EJSON.parse(process.env.CSFLE_KMS_PROVIDERS || '{}') as unknown as {
    local: unknown;
  };

  return { local: result.local };
};

describe('Range Explicit Encryption', function () {
  let client: MongoClient;

  let utilClient: MongoClient;
  let ce: ClientEncryption;

  let encryptedFields;
  let connection: Connection;

  beforeEach(async function () {
    utilClient = this.configuration.newClient();
    ce = new ClientEncryption(utilClient, {
      keyVaultNamespace: 'data.keys',
      kmsProviders: getKmsProviders()
    });
    const db = utilClient.db('encrypted');
    await db.dropDatabase();

    encryptedFields = (
      await ce.createEncryptedCollection(db, 'patents', {
        provider: 'local',
        createCollectionOptions: {
          encryptedFields: {
            fields: [
              {
                path: 'ssn',
                bsonType: 'string',
                queries: { queryType: 'equality' }
              }
            ]
          }
        }
      })
    ).encryptedFields;
  });

  afterEach(async function () {
    await Promise.allSettled([client?.close(), utilClient?.close(), connection?.close()]);
  });

  test('basic auto encryption with mongoose test', async function () {
    const options: MongoClientOptions = {
      autoEncryption: {
        encryptedFieldsMap: {
          'encrypted.patents': encryptedFields
        },
        kmsProviders: getKmsProviders(),
        keyVaultNamespace: 'data.keys'
      }
    };

    const schema = new EncryptedSchema(
      {
        name: String,
        age: BigInt,
        ssn: String
      },
      { collection: 'patents' }
    );
    schema.add({ name: String });

    connection = createConnection(this.configuration.url(), {
      ...options,
      dbName: 'encrypted'
    });

    const Patent = connection.model('Patent', schema);

    const patent = new Patent({
      name: 'bailey',
      age: 23n,
      ssn: '123412341'
    });
    await patent.save();

    await Patent.find();
  });

  test('test with populate', async function () {
    const options: MongoClientOptions = {
      autoEncryption: {
        extraOptions: {
          cryptSharedLibPath: process.env['CRYPT_SHARED_LIB_PATH=']
        },
        encryptedFieldsMap: {
          'encrypted.patents': encryptedFields
        },
        kmsProviders: getKmsProviders(),
        keyVaultNamespace: 'data.keys'
      }
    };

    const schema = new Schema(
      {
        name: String,
        age: BigInt,
        ssn: String
      },
      { collection: 'patents' }
    );

    const schemaWithReference = new Schema({
      reference: { type: SchemaTypes.ObjectId, ref: 'Patent' }
    });
    connection = createConnection(this.configuration.url(), {
      ...options,
      dbName: 'encrypted'
    });

    await connection.asPromise();
    const Patent = connection.model('Patent', schema);
    const Reference = connection.model('Reference', schemaWithReference);
    const patent = new Patent({
      name: 'bailey',
      age: 23n,
      ssn: '123412341'
    });
    await patent.save();

    expect(patent._id._bsontype).to.equal('ObjectId');

    const reference = new Reference({
      reference: patent._id
    });
    await reference.save();

    const result = await Reference.findOne({ _id: reference._id }).populate('reference').exec();
    expect(result.reference?.toObject()).to.contain({
      // ignore the _id, __v and the __safecontent__ fields
      name: 'bailey',
      age: 23n,

      // notably decrypted
      ssn: '123412341'
    });
  });

  test('test with indexes', async function () {
    const options: MongoClientOptions = {
      autoEncryption: {
        encryptedFieldsMap: {
          'encrypted.patents': encryptedFields
        },
        kmsProviders: getKmsProviders(),
        keyVaultNamespace: 'data.keys'
      }
    };

    const schema = new Schema(
      {
        name: String,
        age: BigInt,
        ssn: String
      },
      { collection: 'patents' }
    );

    schema.index({
      name: 1
    });

    connection = createConnection(this.configuration.url(), {
      ...options,
      dbName: 'encrypted'
    });

    const Patent = connection.model('Patent', schema);
    await Patent.init();

    const indexes = await Patent.listIndexes();
    expect(indexes).to.have.lengthOf(3);
    const definedIndex = indexes.find(index => index.name === 'name_1');
    expect(definedIndex).to.exist;
  });

  test.only('test with autoCreate', async function () {
    const options: MongoClientOptions = {
      autoEncryption: {
        encryptedFieldsMap: {
          'encrypted.patents_autocreate': {
            fields: [
              {
                path: 'ssn',
                bsonType: 'string',
                queries: { queryType: 'equality' },
                keyId: await ce.createDataKey('local')
              }
            ]
          }
        },
        kmsProviders: getKmsProviders(),
        keyVaultNamespace: 'data.keys'
      }
    };

    connection = createConnection(this.configuration.url(), {
      ...options,
      dbName: 'encrypted'
    });

    await connection.asPromise();

    const collections = (await connection.listCollections()).map(coll => coll.name);
    expect(collections.toSorted()).to.deep.equal([
      'enxcol_.patents.ecoc',
      'enxcol_.patents.esc',
      'patents'
    ]);
  });

  test('example numeric flexibility issue', async function () {
    connection = createConnection(this.configuration.url(), {
      dbName: 'encrypted'
    });

    await connection.asPromise();

    const schema = new Schema(
      {
        number: Number
      },
      { collection: 'Models' }
    );

    const Model = connection.model('Model', schema);

    const doc1 = new Model({ number: 0.5 });
    const doc2 = new Model({ number: 1.0 });

    await doc1.save();
    await doc2.save();

    const documents = await utilClient
      .db('encrypted')
      .collection('Models')
      .find({}, { sort: { number: 1 }, projection: { _id: 0, number: 1 }, promoteValues: false })
      .toArray();

    expect(documents).to.deep.equal([{ number: new Double(0.5) }, { number: new Int32(1.0) }]);
  });
});
