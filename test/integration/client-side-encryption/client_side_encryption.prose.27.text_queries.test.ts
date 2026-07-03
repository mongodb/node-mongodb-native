/* https://github.com/mongodb/specifications/blob/master/source/client-side-encryption/tests/README.md#27-string-explicit-encryption */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Binary, type Document, EJSON } from 'bson';
import { expect } from 'chai';
import * as semver from 'semver';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { ClientEncryption, type MongoClient, MongoDBCollectionNamespace } from '../../mongodb';

// Cases 1-4: prefix/suffix require server 9.0+ (SERVER-123416) and libmongocrypt 1.19.0+ (MONGOCRYPT-870).
const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=9.0.0',
    topology: '!single',
    libmongocrypt: '>=1.19.0'
  }
};

// Cases 1-4 preview: prefixPreview/suffixPreview removed in server 9.0.0 (SERVER-123416).
const metadataPreview: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=8.2.0 <9.0.0',
    topology: '!single',
    libmongocrypt: '>=1.19.1'
  }
};

// Cases 5-6: substring requires server 9.0+ (SERVER-123416) and libmongocrypt 1.20.0+.
const metadataSubstring: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=9.0.0',
    topology: '!single',
    libmongocrypt: '>=1.20.0'
  }
};

// Cases 5-6 preview: substringPreview removed in server 9.0.0 (SERVER-123416).
const metadataSubstringPreview: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=8.2.0 <9.0.0',
    topology: '!single',
    libmongocrypt: '>=1.18.1'
  }
};

const loadFLEDataFile = async (filename: string) =>
  EJSON.parse(
    await readFile(join(__dirname, '../../spec/client-side-encryption/etc/data', filename), {
      encoding: 'utf-8'
    }),
    { relaxed: false }
  );

describe('27. String Explicit Encryption', function () {
  let keyDocument1: Document;
  let keyId1: Binary;
  let utilClient: MongoClient;
  let keyVaultClient: MongoClient;
  let clientEncryption: ClientEncryption;
  let explicitEncryptedClient: MongoClient;

  beforeEach(async function () {
    utilClient = this.configuration.newClient();
    const isServer9OrAbove = semver.satisfies(this.configuration.version, '>=9.0.0');

    // Using QE CreateCollection() and Collection.Drop(), drop and create the following collections
    // with majority write concern:
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

    // - `db.prefix-suffix` using the `encryptedFields` option set to the contents of
    //   encryptedFields-prefix-suffix.json. This step requires server 9.0.0+.
    // - `db.prefix-suffix-preview` using the `encryptedFields` option set to the contents of
    //   encryptedFields-prefix-suffix-preview.json. This step requires server pre-9.0.0.
    if (isServer9OrAbove) {
      await dropAndCreateCollection(
        'db.prefix-suffix',
        await loadFLEDataFile('encryptedFields-prefix-suffix.json')
      );
    } else {
      await dropAndCreateCollection(
        'db.prefix-suffix-preview',
        await loadFLEDataFile('encryptedFields-prefix-suffix-preview.json')
      );
    }

    // - `db.substring` using the `encryptedFields` option set to the contents of
    //   encryptedFields-substring.json. This step requires server 9.0.0+.
    // - `db.substring-preview` using the `encryptedFields` option set to the contents of
    //   encryptedFields-substring-preview.json. This step requires server pre-9.0.0.
    if (isServer9OrAbove) {
      await dropAndCreateCollection(
        'db.substring',
        await loadFLEDataFile('encryptedFields-substring.json')
      );
    } else {
      await dropAndCreateCollection(
        'db.substring-preview',
        await loadFLEDataFile('encryptedFields-substring-preview.json')
      );
    }

    // Load the file key1-document.json as `key1Document`.
    keyDocument1 = await loadFLEDataFile('keys/key1-document.json');

    // Read the `"_id"` field of `key1Document` as `key1ID`.
    keyId1 = keyDocument1._id;

    // Drop and create the collection `keyvault.datakeys`.
    await dropAndCreateCollection('keyvault.datakeys');

    // Insert `key1Document` in `keyvault.datakeys` with majority write concern.
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
      kmsProviders: { local: getCSFLEKMSProviders().local }
    });

    // Create a MongoClient named `explicitEncryptedClient` with these `AutoEncryptionOpts`:
    // class AutoEncryptionOpts {
    //    keyVaultNamespace: "keyvault.datakeys",
    //    kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } },
    //    bypassQueryAnalysis: true,
    // }
    explicitEncryptedClient = this.configuration.newClient(
      {},
      {
        autoEncryption: {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: { local: getCSFLEKMSProviders().local },
          bypassQueryAnalysis: true
        }
      }
    );

    // Use `clientEncryption` to encrypt the string `"foobarbaz"` with the following `EncryptOpts`:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
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
    // Use `explicitEncryptedClient` to insert the following document into `db.prefix-suffix`
    // (if created) and `db.prefix-suffix-preview` (if created) with majority write concern:
    // { "_id": 0, "encryptedText": <encrypted 'foobarbaz'> }
    {
      const encryptedText = await clientEncryption.encrypt('foobarbaz', {
        keyId: keyId1,
        algorithm: 'String',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 },
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });
      if (isServer9OrAbove) {
        await explicitEncryptedClient
          .db('db')
          .collection<{ _id: number; encryptedText: Binary }>('prefix-suffix')
          .insertOne({ _id: 0, encryptedText }, { writeConcern: { w: 'majority' } });
      } else {
        await explicitEncryptedClient
          .db('db')
          .collection<{ _id: number; encryptedText: Binary }>('prefix-suffix-preview')
          .insertOne({ _id: 0, encryptedText }, { writeConcern: { w: 'majority' } });
      }
    }

    // Use `clientEncryption` to encrypt the string `"foobarbaz"` with the following `EncryptOpts`:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       substring: SubstringOpts {
    //        strMaxLength: 10,
    //        strMaxQueryLength: 6,
    //        strMinQueryLength: 2,
    //       }
    //    },
    // }
    // Use `explicitEncryptedClient` to insert the following document into `db.substring`
    // (if created) and `db.substring-preview` (if created) with majority write concern:
    // { "_id": 0, "encryptedText": <encrypted 'foobarbaz'> }
    {
      const encryptedText = await clientEncryption.encrypt('foobarbaz', {
        keyId: keyId1,
        algorithm: 'String',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          substring: { strMaxLength: 10, strMaxQueryLength: 6, strMinQueryLength: 2 }
        }
      });
      if (isServer9OrAbove) {
        await explicitEncryptedClient
          .db('db')
          .collection<{ _id: number; encryptedText: Binary }>('substring')
          .insertOne({ _id: 0, encryptedText }, { writeConcern: { w: 'majority' } });
      } else {
        await explicitEncryptedClient
          .db('db')
          .collection<{ _id: number; encryptedText: Binary }>('substring-preview')
          .insertOne({ _id: 0, encryptedText }, { writeConcern: { w: 'majority' } });
      }
    }
  });

  afterEach(async function () {
    await Promise.allSettled([
      utilClient.close(),
      explicitEncryptedClient.close(),
      keyVaultClient.close()
    ]);
  });

  // Run this case multiple times with the following sets of parameters:
  // - `queryType=prefix` and `collection=prefix-suffix`
  //     - Require server 9.0.0+ and libmongocrypt 1.19.0+.
  // - `queryType=prefixPreview` and `collection=prefix-suffix-preview`
  //     - Require server pre-9.0.0 and libmongocrypt 1.19.1+.
  context('Case 1: can find a document by prefix', function () {
    // `queryType=prefix` and `collection=prefix-suffix`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "prefix",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('prefix', metadata, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"foo"` with the following `EncryptOpts`:
      const encryptedFoo = await clientEncryption.encrypt('foo', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrStartsWith: {input: '$encryptedText', prefix: <encrypted 'foo'>} } }
      const filter = {
        $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedFoo } }
      };
      const { __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{
          _id: number;
          encryptedText: Binary;
          __safeContent__: unknown;
        }>('prefix-suffix')
        .findOne(filter);

      // Assert the following document is returned:
      // { "_id": 0, "encryptedText": "foobarbaz" }
      expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
    });

    // `queryType=prefixPreview` and `collection=prefix-suffix-preview`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "prefixPreview",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('prefixPreview', metadataPreview, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"foo"` with the following `EncryptOpts`:
      const encryptedFoo = await clientEncryption.encrypt('foo', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefixPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrStartsWith: {input: '$encryptedText', prefix: <encrypted 'foo'>} } }
      const filter = {
        $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedFoo } }
      };
      const { __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{
          _id: number;
          encryptedText: Binary;
          __safeContent__: unknown;
        }>('prefix-suffix-preview')
        .findOne(filter);

      // Assert the following document is returned:
      // { "_id": 0, "encryptedText": "foobarbaz" }
      expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
    });
  });

  // Run this case multiple times with the following sets of parameters:
  // - `queryType=suffix` and `collection=prefix-suffix`
  //     - Require server 9.0.0+ and libmongocrypt 1.19.0+.
  // - `queryType=suffixPreview` and `collection=prefix-suffix-preview`
  //     - Require server pre-9.0.0 and libmongocrypt 1.19.1+.
  context('Case 2: can find a document by suffix', function () {
    // `queryType=suffix` and `collection=prefix-suffix`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "suffix",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       suffix: SuffixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('suffix', metadata, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"baz"` with the following `EncryptOpts`:
      const encryptedBaz = await clientEncryption.encrypt('baz', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'suffix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrEndsWith: {input: '$encryptedText', suffix: <encrypted 'baz'>} } }
      const filter = {
        $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedBaz } }
      };
      const { __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{
          _id: number;
          encryptedText: Binary;
          __safeContent__: unknown;
        }>('prefix-suffix')
        .findOne(filter);

      // Assert the following document is returned:
      // { "_id": 0, "encryptedText": "foobarbaz" }
      expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
    });

    // `queryType=suffixPreview` and `collection=prefix-suffix-preview`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "suffixPreview",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       suffix: SuffixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('suffixPreview', metadataPreview, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"baz"` with the following `EncryptOpts`:
      const encryptedBaz = await clientEncryption.encrypt('baz', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'suffixPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrEndsWith: {input: '$encryptedText', suffix: <encrypted 'baz'>} } }
      const filter = {
        $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedBaz } }
      };
      const { __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{
          _id: number;
          encryptedText: Binary;
          __safeContent__: unknown;
        }>('prefix-suffix-preview')
        .findOne(filter);

      // Assert the following document is returned:
      // { "_id": 0, "encryptedText": "foobarbaz" }
      expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
    });
  });

  // Run this case multiple times with the following sets of parameters:
  // - `queryType=prefix` and `collection=prefix-suffix`
  //     - Require server 9.0.0+ and libmongocrypt 1.19.0+.
  // - `queryType=prefixPreview` and `collection=prefix-suffix-preview`
  //     - Require server pre-9.0.0 and libmongocrypt 1.19.1+.
  context('Case 3: assert no document found by prefix', function () {
    // `queryType=prefix` and `collection=prefix-suffix`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "prefix",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('prefix', metadata, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"baz"` with the following `EncryptOpts`:
      const encryptedBaz = await clientEncryption.encrypt('baz', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrStartsWith: {input: '$encryptedText', prefix: <encrypted 'baz'>} } }
      const filter = {
        $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedBaz } }
      };

      // Assert that no documents are returned.
      expect(await explicitEncryptedClient.db('db').collection('prefix-suffix').findOne(filter)).to
        .be.null;
    });

    // `queryType=prefixPreview` and `collection=prefix-suffix-preview`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "prefixPreview",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('prefixPreview', metadataPreview, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"baz"` with the following `EncryptOpts`:
      const encryptedBaz = await clientEncryption.encrypt('baz', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefixPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrStartsWith: {input: '$encryptedText', prefix: <encrypted 'baz'>} } }
      const filter = {
        $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedBaz } }
      };

      // Assert that no documents are returned.
      expect(
        await explicitEncryptedClient.db('db').collection('prefix-suffix-preview').findOne(filter)
      ).to.be.null;
    });
  });

  // Run this case multiple times with the following sets of parameters:
  // - `queryType=suffix` and `collection=prefix-suffix`
  //     - Require server 9.0.0+ and libmongocrypt 1.19.0+.
  // - `queryType=suffixPreview` and `collection=prefix-suffix-preview`
  //     - Require server pre-9.0.0 and libmongocrypt 1.19.1+.
  context('Case 4: assert no document found by suffix', function () {
    // `queryType=suffix` and `collection=prefix-suffix`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "suffix",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       suffix: SuffixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('suffix', metadata, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"foo"` with the following `EncryptOpts`:
      const encryptedFoo = await clientEncryption.encrypt('foo', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'suffix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrEndsWith: {input: '$encryptedText', suffix: <encrypted 'foo'>} } }
      const filter = {
        $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedFoo } }
      };

      // Assert that no documents are returned.
      expect(await explicitEncryptedClient.db('db').collection('prefix-suffix').findOne(filter)).to
        .be.null;
    });

    // `queryType=suffixPreview` and `collection=prefix-suffix-preview`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "suffixPreview",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       suffix: SuffixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    it('suffixPreview', metadataPreview, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"foo"` with the following `EncryptOpts`:
      const encryptedFoo = await clientEncryption.encrypt('foo', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'suffixPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrEndsWith: {input: '$encryptedText', suffix: <encrypted 'foo'>} } }
      const filter = {
        $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedFoo } }
      };

      // Assert that no documents are returned.
      expect(
        await explicitEncryptedClient.db('db').collection('prefix-suffix-preview').findOne(filter)
      ).to.be.null;
    });
  });

  // Run this case multiple times with the following sets of parameters:
  // - `queryType=substring` and `collection=substring`
  //     - Require server 9.0.0+ and libmongocrypt 1.20.0+.
  // - `queryType=substringPreview` and `collection=substring-preview`
  //     - Require server pre-9.0.0 and libmongocrypt 1.18.1+.
  context('Case 5: can find a document by substring', function () {
    // `queryType=substring` and `collection=substring`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "substring",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       substring: SubstringOpts {
    //        strMaxLength: 10,
    //        strMaxQueryLength: 6,
    //        strMinQueryLength: 2,
    //       }
    //    },
    // }
    it('substring', metadataSubstring, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"bar"` with the following `EncryptOpts`:
      const encryptedBar = await clientEncryption.encrypt('bar', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'substring',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          substring: { strMaxLength: 10, strMaxQueryLength: 6, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrContains: {input: '$encryptedText', substring: <encrypted 'bar'>} } }
      const filter = {
        $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedBar } }
      };
      const { __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{ _id: number; encryptedText: Binary; __safeContent__: unknown }>('substring')
        .findOne(filter);

      // Assert the following document is returned:
      // { "_id": 0, "encryptedText": "foobarbaz" }
      expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
    });

    // `queryType=substringPreview` and `collection=substring-preview`
    it('substringPreview', metadataSubstringPreview, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"bar"` with the following `EncryptOpts`:
      const encryptedBar = await clientEncryption.encrypt('bar', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'substringPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          substring: { strMaxLength: 10, strMaxQueryLength: 6, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrContains: {input: '$encryptedText', substring: <encrypted 'bar'>} } }
      const filter = {
        $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedBar } }
      };
      const { __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{
          _id: number;
          encryptedText: Binary;
          __safeContent__: unknown;
        }>('substring-preview')
        .findOne(filter);

      // Assert the following document is returned:
      // { "_id": 0, "encryptedText": "foobarbaz" }
      expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
    });
  });

  // Run this case multiple times with the following sets of parameters:
  // - `queryType=substring` and `collection=substring`
  //     - Require server 9.0.0+ and libmongocrypt 1.20.0+.
  // - `queryType=substringPreview` and `collection=substring-preview`
  //     - Require server pre-9.0.0 and libmongocrypt 1.18.1+.
  context('Case 6: assert no document found by substring', function () {
    // `queryType=substring` and `collection=substring`
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "substring",
    //    contentionFactor: 0,
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       substring: SubstringOpts {
    //        strMaxLength: 10,
    //        strMaxQueryLength: 6,
    //        strMinQueryLength: 2,
    //       }
    //    },
    // }
    it('substring', metadataSubstring, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"qux"` with the following `EncryptOpts`:
      const encryptedQux = await clientEncryption.encrypt('qux', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'substring',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          substring: { strMaxLength: 10, strMaxQueryLength: 6, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrContains: {input: '$encryptedText', substring: <encrypted 'qux'>} } }
      const filter = {
        $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedQux } }
      };

      // Assert that no documents are returned.
      expect(await explicitEncryptedClient.db('db').collection('substring').findOne(filter)).to.be
        .null;
    });

    // `queryType=substringPreview` and `collection=substring-preview`
    it('substringPreview', metadataSubstringPreview, async function () {
      // Use `clientEncryption.encrypt()` to encrypt the string `"qux"` with the following `EncryptOpts`:
      const encryptedQux = await clientEncryption.encrypt('qux', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'substringPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          substring: { strMaxLength: 10, strMaxQueryLength: 6, strMinQueryLength: 2 }
        }
      });

      // Use `explicitEncryptedClient` to run a "find" operation on the `db.<collection>` collection
      // with the following filter:
      // { $expr: { $encStrContains: {input: '$encryptedText', substring: <encrypted 'qux'>} } }
      const filter = {
        $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedQux } }
      };

      // Assert that no documents are returned.
      expect(await explicitEncryptedClient.db('db').collection('substring-preview').findOne(filter))
        .to.be.null;
    });
  });

  it('Case 7: assert contentionFactor is required', metadata, async function () {
    // Use `clientEncryption.encrypt()` to encrypt the string `"foo"` with the following `EncryptOpts`:
    // class EncryptOpts {
    //    keyId : <key1ID>,
    //    algorithm: "String",
    //    queryType: "prefix",
    //    stringOpts: StringOpts {
    //       caseSensitive: true,
    //       diacriticSensitive: true,
    //       prefix: PrefixOpts {
    //         strMaxQueryLength: 10,
    //         strMinQueryLength: 2,
    //      }
    //    },
    // }
    // Expect an error from libmongocrypt with a message containing the string:
    // "contention factor is required for string algorithm".
    const error = await clientEncryption
      .encrypt('foo', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefix',
        stringOptions: {
          caseSensitive: true,
          diacriticSensitive: true,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      })
      .catch(e => e);

    expect(error).to.match(/contention factor is required for string algorithm/);
  });
});
