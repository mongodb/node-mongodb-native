import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Binary, type Document, EJSON } from 'bson';
import { expect } from 'chai';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { ClientEncryption, type MongoClient, MongoDBCollectionNamespace } from '../../mongodb';
const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=8.2.0',
    topology: '!single',
    libmongocrypt: '>=1.15.1'
  }
};

const loadFLEDataFile = async (filename: string) =>
  EJSON.parse(
    await readFile(join(__dirname, '../../spec/client-side-encryption/etc/data', filename), {
      encoding: 'utf-8'
    }),
    { relaxed: false }
  );

describe('27. Text Explicit Encryption', function () {
  let keyDocument1: Document;
  let keyId1: Binary;
  let utilClient: MongoClient;
  let keyVaultClient: MongoClient;
  let clientEncryption: ClientEncryption;
  let encryptedClient: MongoClient;

  beforeEach(async function () {
    utilClient = this.configuration.newClient();

    // Using QE CreateCollection() and Collection.Drop(), drop and create the following collections with majority write concern:
    // - db.prefix-suffix using the encryptedFields option set to the contents of encryptedFields-prefix-suffix.json
    // - db.substring using the encryptedFields option set to the contents of encryptedFields-substring.json
    async function dropAndCreateCollection(ns: string, encryptedFields?: Document) {
      const { db, collection } = MongoDBCollectionNamespace.fromString(ns);
      await utilClient.db(db).dropCollection(collection, {
        writeConcern: { w: 'majority' },
        encryptedFields
      });
      await utilClient.db(db).createCollection(collection, {
        writeConcern: { w: 'majority' },
        encryptedFields
      });
    }

    await dropAndCreateCollection(
      'db.prefix-suffix',
      await loadFLEDataFile('encryptedFields-prefix-suffix.json')
    );
    await dropAndCreateCollection(
      'db.substring',
      await loadFLEDataFile('encryptedFields-substring.json')
    );
    // Load the file key1-document.json as key1Document.
    keyDocument1 = await loadFLEDataFile('keys/key1-document.json');

    // Read the "_id" field of key1Document as key1ID.
    keyId1 = keyDocument1._id;

    // Drop and create the collection keyvault.datakeys with majority write concern.
    await dropAndCreateCollection('keyvault.datakeys');

    // Insert `key1Document` in `keyvault.datakeys` with majority write concern with majority write concern.
    await utilClient
      .db('keyvault')
      .collection('datakeys')
      .insertOne(keyDocument1, { writeConcern: { w: 'majority' } });

    // Create a MongoClient named `keyVaultClient`.
    keyVaultClient = this.configuration.newClient();

    // Create a ClientEncryption object named `clientEncryption` with these options:
    // class ClientEncryptionOpts {
    //    keyVaultClient: <keyVaultClient>,
    //    keyVaultNamespace: "keyvault.datakeys",
    //    kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } },
    // }
    clientEncryption = new ClientEncryption(keyVaultClient, {
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: {
        local: getCSFLEKMSProviders().local
      }
    });

    // Create a MongoClient named `encryptedClient` with these `AutoEncryptionOpts`:
    // class AutoEncryptionOpts {
    //    keyVaultNamespace: "keyvault.datakeys",
    //    kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } },
    //    bypassQueryAnalysis: true,
    // }
    encryptedClient = this.configuration.newClient(
      {},
      {
        autoEncryption: {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: {
            local: getCSFLEKMSProviders().local
          },
          bypassQueryAnalysis: true
        }
      }
    );

    {
      // Use `clientEncryption` to encrypt the string `"foobarbaz"` with the following `EncryptOpts`:
      // class EncryptOpts {
      //    keyId : <key1ID>,
      //    algorithm: "TextPreview",
      //    contentionFactor: 0,
      //    textOpts: TextOpts {
      //       caseSensitive: true,
      //       diacriticSensitive: true,
      //       prefix: PrefixOpts {
      //         strMaxQueryLength: 10,
      //         strMinQueryLength: 2,
      //       },
      //       suffix: SuffixOpts {
      //         strMaxQueryLength: 10,
      //         strMinQueryLength: 2,
      //       },
      //    },
      // }
      const encryptedText = await clientEncryption.encrypt('foobarbaz', {
        keyId: keyId1,
        algorithm: 'TextPreview',
        contentionFactor: 0,
        textOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: {
            strMaxQueryLength: 10,
            strMinQueryLength: 2
          },
          suffix: {
            strMaxQueryLength: 10,
            strMinQueryLength: 2
          }
        }
      });

      // Use `encryptedClient` to insert the following document into `db.prefix-suffix` with majority write concern:
      // { "_id": 0, "encryptedText": <encrypted 'foobarbaz'> }
      await encryptedClient
        .db('db')
        .collection<{ _id: number; encryptedText: Binary }>('prefix-suffix')
        .insertOne(
          {
            _id: 0,
            encryptedText
          },
          { writeConcern: { w: 'majority' } }
        );
    }

    {
      // Use `clientEncryption` to encrypt the string `"foobarbaz"` with the following `EncryptOpts`:
      // class EncryptOpts {
      //    keyId : <key1ID>,
      //    algorithm: "TextPreview",
      //    contentionFactor: 0,
      //    textOpts: TextOpts {
      //       caseSensitive: true,
      //       diacriticSensitive: true,
      //       substring: SubstringOpts {
      //        strMaxLength: 10,
      //        strMaxQueryLength: 10,
      //        strMinQueryLength: 2,
      //       }
      //    },
      // }
      const encryptedText = await clientEncryption.encrypt('foobarbaz', {
        keyId: keyId1,
        algorithm: 'TextPreview',
        contentionFactor: 0,
        textOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          substring: {
            strMaxLength: 10,
            strMaxQueryLength: 10,
            strMinQueryLength: 2
          }
        }
      });

      // Use `encryptedClient` to insert the following document into `db.substring` with majority write concern:
      // { "_id": 0, "encryptedText": <encrypted 'foobarbaz'> }
      await encryptedClient
        .db('db')
        .collection<{ _id: number; encryptedText: Binary }>('substring')
        .insertOne(
          {
            _id: 0,
            encryptedText
          },
          { writeConcern: { w: 'majority' } }
        );
    }
  });

  afterEach(async function () {
    await Promise.allSettled([utilClient.close(), encryptedClient.close(), keyVaultClient.close()]);
  });

  it('Case 1: can find a document by prefix', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "foo" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "prefixPreview",
    //    contentionFactor: 0,
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    const encryptedFoo = await clientEncryption.encrypt('foo', {
      keyId: keyId1,
      algorithm: 'TextPreview',
      queryType: 'prefixPreview',
      contentionFactor: 0,
      textOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        prefix: {
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    });

    // Use encryptedClient to run a "find" operation on the db.prefix-suffix collection with the following filter:
    // { $expr: { $encStrStartsWith: {input: '$encryptedText', prefix: <encrypted 'foo'>} } }

    const filter = {
      $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedFoo } }
    };

    const { __safeContent__, ...result } = await encryptedClient
      .db('db')
      .collection<{
        _id: number;
        encryptedText: Binary;
        __safeContent__: any;
      }>('prefix-suffix')
      .findOne(filter);

    // Assert the following document is returned:
    // { "_id": 0, "encryptedText": "foobarbaz" }
    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 2: can find a document by suffix', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "baz" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "suffixPreview",
    //    contentionFactor: 0,
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       suffix: SuffixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    const encryptedBaz = await clientEncryption.encrypt('baz', {
      keyId: keyId1,
      algorithm: 'TextPreview',
      queryType: 'suffixPreview',
      contentionFactor: 0,
      textOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        suffix: {
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    });

    // Use encryptedClient to run a "find" operation on the db.prefix-suffix collection with the following filter:
    // { $expr: { $encStrEndsWith: {input: '$encryptedText', suffix: <encrypted 'baz'>} } }
    const filter = {
      $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedBaz } }
    };

    const { __safeContent__, ...result } = await encryptedClient
      .db('db')
      .collection<{
        _id: number;
        encryptedText: Binary;
        __safeContent__: any;
      }>('prefix-suffix')
      .findOne(filter);

    // Assert the following document is returned:
    // { "_id": 0, "encryptedText": "foobarbaz" }
    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 3: assert no document found by prefix', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "baz" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "prefixPreview",
    //    contentionFactor: 0,
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    const encryptedBaz = await clientEncryption.encrypt('baz', {
      keyId: keyId1,
      algorithm: 'TextPreview',
      queryType: 'prefixPreview',
      contentionFactor: 0,
      textOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        prefix: {
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    });

    // Use encryptedClient to run a "find" operation on the db.prefix-suffix collection with the following filter:
    // { $expr: { $encStrStartsWith: {input: '$encryptedText', prefix: <encrypted 'baz'>} } }
    // Assert that no documents are returned.
    const filter = {
      $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedBaz } }
    };
    expect(await encryptedClient.db('db').collection('prefix-suffix').findOne(filter)).to.be.null;
  });

  it('Case 4: assert no document found by suffix', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "foo" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "suffixPreview",
    //    contentionFactor: 0,
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       suffix: SuffixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    const encryptedFoo = await clientEncryption.encrypt('foo', {
      keyId: keyId1,
      algorithm: 'TextPreview',
      queryType: 'suffixPreview',
      contentionFactor: 0,
      textOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        suffix: {
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    });

    const filter = {
      $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedFoo } }
    };

    const result = await encryptedClient
      .db('db')
      .collection<{
        _id: number;
        encryptedText: Binary;
        __safeContent__: any;
      }>('prefix-suffix')
      .findOne(filter);
    expect(result).to.be.null;
  });

  it('Case 5: can find a document by substring', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "bar" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "substringPreview",
    //    contentionFactor: 0,
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       substring: SubstringOpts {
    //        strMaxLength: 10,
    //        strMaxQueryLength: 10,
    //        strMinQueryLength: 2,
    //       }
    //    },
    // }
    const encryptedFoo = await clientEncryption.encrypt('bar', {
      keyId: keyId1,
      algorithm: 'TextPreview',
      queryType: 'substringPreview',
      contentionFactor: 0,
      textOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        substring: {
          strMaxLength: 10,
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    });

    // Use encryptedClient to run a "find" operation on the db.substring collection with the following filter:
    // { $expr: { $encStrContains: {input: '$encryptedText', substring: <encrypted 'bar'>} } }
    const filter = {
      $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedFoo } }
    };

    const { __safeContent__, ...result } = await encryptedClient
      .db('db')
      .collection<{
        _id: number;
        encryptedText: Binary;
        __safeContent__: any;
      }>('substring')
      .findOne(filter);
    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 6: assert no document found by substring', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "bar" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "substringPreview",
    //    contentionFactor: 0,
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       substring: SubstringOpts {
    //        strMaxLength: 10,
    //        strMaxQueryLength: 10,
    //        strMinQueryLength: 2,
    //       }
    //    },
    // }
    const encryptedQux = await clientEncryption.encrypt('qux', {
      keyId: keyId1,
      algorithm: 'TextPreview',
      queryType: 'substringPreview',
      contentionFactor: 0,
      textOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        substring: {
          strMaxLength: 10,
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    });

    // Use encryptedClient to run a "find" operation on the db.substring collection with the following filter:
    // { $expr: { $encStrContains: {input: '$encryptedText', substring: <encrypted 'bar'>} } }
    const filter = {
      $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedQux } }
    };

    const result = await encryptedClient
      .db('db')
      .collection<{
        _id: number;
        encryptedText: Binary;
        __safeContent__: any;
      }>('substring')
      .findOne(filter);
    expect(result).to.be.null;
  });

  it('Case 7: assert contentionFactor is required', metadata, async function () {
    // Use clientEncryption.encrypt() to encrypt the string "foo" with the following EncryptOpts:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "TextPreview",
    //    queryType: "prefixPreview",
    //    textOpts: TextOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    // Expect an error from libmongocrypt with a message containing the string: "contention factor is required for textPreview algorithm".
    const error = await clientEncryption
      .encrypt('foo', {
        keyId: keyId1,
        algorithm: 'TextPreview',
        queryType: 'prefixPreview',
        textOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: {
            strMaxQueryLength: 10,
            strMinQueryLength: 2
          }
        }
      })
      .catch(e => e);

    expect(error).to.match(/contention factor is required for textPreview algorithm/);
  });
});
