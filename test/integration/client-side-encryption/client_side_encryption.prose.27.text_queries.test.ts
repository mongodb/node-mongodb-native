/* https://github.com/mongodb/specifications/blob/master/source/client-side-encryption/tests/README.md#27-string-explicit-encryption */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Binary, type Document, EJSON } from 'bson';
import { expect } from 'chai';
import * as semver from 'semver';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { ClientEncryption, type MongoClient, MongoDBCollectionNamespace } from '../../mongodb';

// Cases 1-4 GA: GA prefix/suffix requires server 9.0+ (SERVER-123416) and libmongocrypt 1.19.0+ (MONGOCRYPT-870).
const metadataGA: MongoDBMetadataUI = {
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

// TODO(NODE-7623): substringPreview contention validation broken on MongoDB 9.0+ (SERVER-91887).
const metadataSubstring: MongoDBMetadataUI = {
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
    await dropAndCreateCollection(
      'db.substring',
      await loadFLEDataFile('encryptedFields-substring.json')
    );
    keyDocument1 = await loadFLEDataFile('keys/key1-document.json');
    keyId1 = keyDocument1._id;

    await dropAndCreateCollection('keyvault.datakeys');
    await utilClient
      .db('keyvault')
      .collection('datakeys')
      .insertOne(keyDocument1, { writeConcern: { w: 'majority' } });

    keyVaultClient = this.configuration.newClient();

    clientEncryption = new ClientEncryption(keyVaultClient, {
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: { local: getCSFLEKMSProviders().local }
    });

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

    const encryptedPrefixSuffix = await clientEncryption.encrypt('foobarbaz', {
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
        .insertOne(
          { _id: 0, encryptedText: encryptedPrefixSuffix },
          { writeConcern: { w: 'majority' } }
        );
    } else {
      await explicitEncryptedClient
        .db('db')
        .collection<{ _id: number; encryptedText: Binary }>('prefix-suffix-preview')
        .insertOne(
          { _id: 0, encryptedText: encryptedPrefixSuffix },
          { writeConcern: { w: 'majority' } }
        );
    }

    const encryptedSubstring = await clientEncryption.encrypt('foobarbaz', {
      keyId: keyId1,
      algorithm: 'String',
      contentionFactor: 0,
      stringOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        substring: { strMaxLength: 10, strMaxQueryLength: 10, strMinQueryLength: 2 }
      }
    });

    await explicitEncryptedClient
      .db('db')
      .collection<{ _id: number; encryptedText: Binary }>('substring')
      .insertOne(
        { _id: 0, encryptedText: encryptedSubstring },
        { writeConcern: { w: 'majority' } }
      );
  });

  afterEach(async function () {
    await Promise.allSettled([
      utilClient.close(),
      explicitEncryptedClient.close(),
      keyVaultClient.close()
    ]);
  });

  it('Case 1 (GA): can find a document by prefix', metadataGA, async function () {
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

    const filter = {
      $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedFoo } }
    };
    const { __safeContent__, ...result } = await explicitEncryptedClient
      .db('db')
      .collection<{ _id: number; encryptedText: Binary; __safeContent__: unknown }>('prefix-suffix')
      .findOne(filter);

    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 1 (preview): can find a document by prefix', metadataPreview, async function () {
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

    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 2 (GA): can find a document by suffix', metadataGA, async function () {
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

    const filter = {
      $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedBaz } }
    };
    const { __safeContent__, ...result } = await explicitEncryptedClient
      .db('db')
      .collection<{ _id: number; encryptedText: Binary; __safeContent__: unknown }>('prefix-suffix')
      .findOne(filter);

    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 2 (preview): can find a document by suffix', metadataPreview, async function () {
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

    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 3 (GA): assert no document found by prefix', metadataGA, async function () {
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

    const filter = {
      $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedBaz } }
    };
    expect(await explicitEncryptedClient.db('db').collection('prefix-suffix').findOne(filter)).to.be
      .null;
  });

  it('Case 3 (preview): assert no document found by prefix', metadataPreview, async function () {
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

    const filter = {
      $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedBaz } }
    };
    expect(
      await explicitEncryptedClient.db('db').collection('prefix-suffix-preview').findOne(filter)
    ).to.be.null;
  });

  it('Case 4 (GA): assert no document found by suffix', metadataGA, async function () {
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

    const filter = {
      $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedFoo } }
    };
    expect(await explicitEncryptedClient.db('db').collection('prefix-suffix').findOne(filter)).to.be
      .null;
  });

  it('Case 4 (preview): assert no document found by suffix', metadataPreview, async function () {
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

    const filter = {
      $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedFoo } }
    };
    expect(
      await explicitEncryptedClient.db('db').collection('prefix-suffix-preview').findOne(filter)
    ).to.be.null;
  });

  it('Case 5: can find a document by substring', metadataSubstring, async function () {
    const encryptedBar = await clientEncryption.encrypt('bar', {
      keyId: keyId1,
      algorithm: 'String',
      queryType: 'substringPreview',
      contentionFactor: 0,
      stringOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        substring: { strMaxLength: 10, strMaxQueryLength: 10, strMinQueryLength: 2 }
      }
    });

    const filter = {
      $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedBar } }
    };
    const { __safeContent__, ...result } = await explicitEncryptedClient
      .db('db')
      .collection<{ _id: number; encryptedText: Binary; __safeContent__: unknown }>('substring')
      .findOne(filter);

    expect(result).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });

  it('Case 6: assert no document found by substring', metadataSubstring, async function () {
    const encryptedQux = await clientEncryption.encrypt('qux', {
      keyId: keyId1,
      algorithm: 'String',
      queryType: 'substringPreview',
      contentionFactor: 0,
      stringOptions: {
        caseSensitive: true,
        diacriticSensitive: true,
        substring: { strMaxLength: 10, strMaxQueryLength: 10, strMinQueryLength: 2 }
      }
    });

    const filter = {
      $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedQux } }
    };
    expect(await explicitEncryptedClient.db('db').collection('substring').findOne(filter)).to.be
      .null;
  });

  it('Case 7: assert contentionFactor is required', metadataGA, async function () {
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
