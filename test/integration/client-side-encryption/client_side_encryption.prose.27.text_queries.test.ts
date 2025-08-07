import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Binary, type Document, EJSON } from 'bson';
import { expect } from 'chai';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import {
  ClientEncryption,
  type ClientEncryptionEncryptOptions,
  type MongoClient
} from '../../mongodb';

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.4.0',
    mongodb: '>=8.2.0',
    topology: '!single'
  }
};

const loadFLEDataFile = (filename: string) =>
  readFile(join(__dirname, '../../spec/client-side-encryption/etc/data', filename), {
    encoding: 'utf-8'
  });

describe.only('27. Text Explicit Encryption', function () {
  let encryptedFields: Document;
  let keyDocument1: Document;
  let keyId1: Binary;
  let client: MongoClient;
  let keyVaultClient: MongoClient;
  let clientEncryption: ClientEncryption;
  let encryptedClient: MongoClient;
  let encryptOpts: ClientEncryptionEncryptOptions;

  beforeEach(async function () {
    encryptedFields = EJSON.parse(await loadFLEDataFile('encryptedFields-prefix-suffix.json'), {
      relaxed: false
    });
    keyDocument1 = EJSON.parse(await loadFLEDataFile('keys/key1-document.json'), {
      relaxed: false
    });

    keyId1 = keyDocument1._id;
    client = this.configuration.newClient();

    await client
      .db('db')
      .dropCollection('explicit_encryption', { writeConcern: { w: 'majority' }, encryptedFields });
    await client.db('db').createCollection('explicit_encryption', {
      writeConcern: { w: 'majority' },
      encryptedFields
    });

    // Drop and create the collection `keyvault.datakeys`.
    // Insert `key1Document` in `keyvault.datakeys` with majority write concern.
    await client.db('keyvault').dropCollection('datakeys', { writeConcern: { w: 'majority' } });
    await client.db('keyvault').createCollection('datakeys', { writeConcern: { w: 'majority' } });
    await client
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

    encryptOpts = {
      keyId: keyId1,
      contentionFactor: 0,
      algorithm: 'TextPreview',
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
        },
        substring: {
          strMaxLength: 10,
          strMaxQueryLength: 10,
          strMinQueryLength: 2
        }
      }
    };

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

    await encryptedClient
      .db('db')
      .collection<{ _id: number; encryptedText: Binary }>('explicit_encryption')
      .insertOne({
        _id: 0,
        encryptedText
      });
  });

  afterEach(async function () {
    await Promise.allSettled([client.close(), encryptedClient.close(), keyVaultClient.close()]);
  });

  it('works', async function () {
    const encryptedFoo = await clientEncryption.encrypt('foo', {
      keyId: keyId1,
      algorithm: 'TextPreview',
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

    const filter = {
      $expr: { $encStrStartsWith: { input: 'encryptedText', prefix: encryptedFoo } }
    };

    expect(
      await encryptedClient
        .db('db')
        .collection<{ _id: number; encryptedText: Binary }>('explicit_encryption')
        .findOne(filter)
    ).to.deep.equal({ _id: 0, encryptedText: 'foobarbaz' });
  });
});
