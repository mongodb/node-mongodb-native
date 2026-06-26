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

// Cases 8-9: DRIVERS-3470 regression, requires server 9.0+ and libmongocrypt 1.19.0+.
const metadataCiDiGA: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=9.0.0',
    topology: '!single',
    libmongocrypt: '>=1.19.0'
  }
};

// Cases 10-11: DRIVERS-3470 regression for substring. TODO(NODE-7623): skip 9.0+.
const metadataCiDiSubstring: MongoDBMetadataUI = {
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
  let autoEncryptedClient: MongoClient;

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
      await dropAndCreateCollection(
        'db.prefix-suffix-ci-di',
        await loadFLEDataFile('encryptedFields-prefix-suffix-ci-di.json')
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
    await dropAndCreateCollection(
      'db.substring-ci-di',
      await loadFLEDataFile('encryptedFields-substring-ci-di.json')
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

    autoEncryptedClient = this.configuration.newClient(
      {},
      {
        autoEncryption: {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: { local: getCSFLEKMSProviders().local }
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
      autoEncryptedClient.close(),
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

  it(
    'Case 8: can find an auto-encrypted case-insensitively indexed document by prefix and suffix',
    metadataCiDiGA,
    async function () {
      await autoEncryptedClient
        .db('db')
        .collection<{ encryptedText: string }>('prefix-suffix-ci-di')
        .insertOne({ encryptedText: 'BingQiLin' }, { writeConcern: { w: 'majority' } });

      const encryptedBing = await clientEncryption.encrypt('bing', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: false,
          diacriticSensitive: false,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      const byPrefix = {
        $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedBing } }
      };
      const { _id: _id1, __safeContent__: _s1, ...byPrefixResult } = await explicitEncryptedClient
        .db('db')
        .collection<{ encryptedText: Binary; __safeContent__: unknown }>('prefix-suffix-ci-di')
        .findOne(byPrefix);
      expect(byPrefixResult).to.deep.equal({ encryptedText: 'BingQiLin' });

      const encryptedLin = await clientEncryption.encrypt('lin', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'suffix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: false,
          diacriticSensitive: false,
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      const bySuffix = {
        $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedLin } }
      };
      const { _id: _id2, __safeContent__: _s2, ...bySuffixResult } = await explicitEncryptedClient
        .db('db')
        .collection<{ encryptedText: Binary; __safeContent__: unknown }>('prefix-suffix-ci-di')
        .findOne(bySuffix);
      expect(bySuffixResult).to.deep.equal({ encryptedText: 'BingQiLin' });
    }
  );

  it(
    'Case 9: can find an auto-encrypted diacritic-insensitively indexed document by prefix and suffix',
    metadataCiDiGA,
    async function () {
      await autoEncryptedClient
        .db('db')
        .collection<{ encryptedText: string }>('prefix-suffix-ci-di')
        .insertOne({ encryptedText: 'cafébarbäz' }, { writeConcern: { w: 'majority' } });

      const encryptedCafe = await clientEncryption.encrypt('cafe', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'prefix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: false,
          diacriticSensitive: false,
          prefix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      const byPrefix = {
        $expr: { $encStrStartsWith: { input: '$encryptedText', prefix: encryptedCafe } }
      };
      const { _id: _id1, __safeContent__: _s1, ...byPrefixResult } = await explicitEncryptedClient
        .db('db')
        .collection<{ encryptedText: Binary; __safeContent__: unknown }>('prefix-suffix-ci-di')
        .findOne(byPrefix);
      expect(byPrefixResult).to.deep.equal({ encryptedText: 'cafébarbäz' });

      const encryptedBaz = await clientEncryption.encrypt('baz', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'suffix',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: false,
          diacriticSensitive: false,
          suffix: { strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      const bySuffix = {
        $expr: { $encStrEndsWith: { input: '$encryptedText', suffix: encryptedBaz } }
      };
      const { _id: _id2, __safeContent__: _s2, ...bySuffixResult } = await explicitEncryptedClient
        .db('db')
        .collection<{ encryptedText: Binary; __safeContent__: unknown }>('prefix-suffix-ci-di')
        .findOne(bySuffix);
      expect(bySuffixResult).to.deep.equal({ encryptedText: 'cafébarbäz' });
    }
  );

  it(
    'Case 10: can find an auto-encrypted case-insensitively indexed document by substring',
    metadataCiDiSubstring,
    async function () {
      await autoEncryptedClient
        .db('db')
        .collection<{ encryptedText: string }>('substring-ci-di')
        .insertOne({ encryptedText: 'FooBarBaz' }, { writeConcern: { w: 'majority' } });

      const encryptedBar = await clientEncryption.encrypt('bar', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'substringPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: false,
          diacriticSensitive: false,
          substring: { strMaxLength: 10, strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      const filter = {
        $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedBar } }
      };
      const { _id, __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{ encryptedText: Binary; __safeContent__: unknown }>('substring-ci-di')
        .findOne(filter);
      expect(result).to.deep.equal({ encryptedText: 'FooBarBaz' });
    }
  );

  it(
    'Case 11: can find an auto-encrypted diacritic-insensitively indexed document by substring',
    metadataCiDiSubstring,
    async function () {
      await autoEncryptedClient
        .db('db')
        .collection<{ encryptedText: string }>('substring-ci-di')
        .insertOne({ encryptedText: 'foocafébaz' }, { writeConcern: { w: 'majority' } });

      const encryptedCafe = await clientEncryption.encrypt('cafe', {
        keyId: keyId1,
        algorithm: 'String',
        queryType: 'substringPreview',
        contentionFactor: 0,
        stringOptions: {
          caseSensitive: false,
          diacriticSensitive: false,
          substring: { strMaxLength: 10, strMaxQueryLength: 10, strMinQueryLength: 2 }
        }
      });

      const filter = {
        $expr: { $encStrContains: { input: '$encryptedText', substring: encryptedCafe } }
      };
      const { _id, __safeContent__, ...result } = await explicitEncryptedClient
        .db('db')
        .collection<{ encryptedText: Binary; __safeContent__: unknown }>('substring-ci-di')
        .findOne(filter);
      expect(result).to.deep.equal({ encryptedText: 'foocafébaz' });
    }
  );
});
