import { BSON, EJSON } from 'bson';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';

import { ClientEncryption } from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';
import { dropCollection } from '../shared';
import { getKmsProviders } from './client_side_encryption.prose.test';

const LOCAL_KEY = Buffer.from(
  'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
  'base64'
);

const eeMetadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=7.0.0',
    topology: ['replicaset', 'sharded']
  }
};

// TODO(NODE-7623): Case 2 explicitly inserts with contentionFactor:10 into a collection
// configured with contention:0; SERVER-91887 now rejects this mismatch on 9.0+.
const eeMetadataPre90: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=7.0.0 <9.0.0',
    topology: ['replicaset', 'sharded']
  }
};

describe('12. Explicit Encryption', eeMetadata, function () {
  const data = path.join(__dirname, '..', '..', 'spec', 'client-side-encryption', 'etc', 'data');
  let encryptedFields;
  let key1Document;
  let key1Id;
  let setupClient;
  let keyVaultClient;
  let clientEncryption;
  let encryptedClient;

  beforeEach(async function () {
    // Load the file encryptedFields.json as encryptedFields.
    encryptedFields = EJSON.parse(
      await fs.readFile(path.join(data, 'encryptedFields.json'), 'utf8'),
      { relaxed: false }
    );
    // Load the file key1-document.json as key1Document.
    key1Document = EJSON.parse(
      await fs.readFile(path.join(data, 'keys', 'key1-document.json'), 'utf8'),
      { relaxed: false }
    );
    // Read the "_id" field of key1Document as key1ID.
    key1Id = key1Document._id;
    setupClient = this.configuration.newClient();
    // Drop and create the collection db.explicit_encryption using encryptedFields as an option.
    const db = setupClient.db('db');
    await dropCollection(db, 'explicit_encryption', { encryptedFields });
    await db.createCollection('explicit_encryption', { encryptedFields });
    // Drop and create the collection keyvault.datakeys.
    const kdb = setupClient.db('keyvault');
    await dropCollection(kdb, 'datakeys');
    await kdb.createCollection('datakeys');
    // Insert key1Document in keyvault.datakeys with majority write concern.
    await kdb.collection('datakeys').insertOne(key1Document, { writeConcern: { w: 'majority' } });
    // Create a MongoClient named keyVaultClient.
    keyVaultClient = this.configuration.newClient();
    // Create a ClientEncryption object named clientEncryption with these options:
    //   ClientEncryptionOpts {
    //      keyVaultClient: <keyVaultClient>;
    //      keyVaultNamespace: "keyvault.datakeys";
    //      kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
    //   }
    clientEncryption = new ClientEncryption(keyVaultClient, {
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: getKmsProviders(LOCAL_KEY),
      bson: BSON,
      extraOptions: getEncryptExtraOptions()
    });
    // Create a MongoClient named ``encryptedClient`` with these ``AutoEncryptionOpts``:
    //   AutoEncryptionOpts {
    //     keyVaultNamespace: "keyvault.datakeys";
    //     kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } },
    //     bypassQueryAnalysis: true
    //   }
    encryptedClient = this.configuration.newClient(
      {},
      {
        autoEncryption: {
          bypassQueryAnalysis: true,
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: getKmsProviders(LOCAL_KEY),
          extraOptions: getEncryptExtraOptions()
        }
      }
    );
  });

  afterEach(async function () {
    await setupClient.close();
    await keyVaultClient.close();
    await encryptedClient.close();
  });

  context('Case 1: can insert encrypted indexed and find', eeMetadata, function () {
    let insertPayload;
    let findPayload;

    beforeEach(async function () {
      // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
      // class EncryptOpts {
      //   keyId : <key1ID>
      //   algorithm: "Indexed",
      // }
      // Store the result in insertPayload.
      insertPayload = await clientEncryption.encrypt('encrypted indexed value', {
        keyId: key1Id,
        algorithm: 'Indexed',
        contentionFactor: 0
      });
      // Use encryptedClient to insert the document { "encryptedIndexed": <insertPayload> }
      // into db.explicit_encryption.
      await encryptedClient.db('db').collection('explicit_encryption').insertOne({
        encryptedIndexed: insertPayload
      });
      // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
      // class EncryptOpts {
      //    keyId : <key1ID>
      //    algorithm: "Indexed",
      //    queryType: Equality
      // }
      // Store the result in findPayload.
      findPayload = await clientEncryption.encrypt('encrypted indexed value', {
        keyId: key1Id,
        algorithm: 'Indexed',
        queryType: 'equality',
        contentionFactor: 0
      });
    });

    it('returns the decrypted value', async function () {
      // Use encryptedClient to run a "find" operation on the db.explicit_encryption
      // collection with the filter { "encryptedIndexed": <findPayload> }.
      // Assert one document is returned containing the field
      // { "encryptedIndexed": "encrypted indexed value" }.
      const collection = encryptedClient.db('db').collection('explicit_encryption');
      const result = await collection.findOne({ encryptedIndexed: findPayload });
      expect(result).to.have.property('encryptedIndexed', 'encrypted indexed value');
    });
  });

  context(
    'Case 2: can insert encrypted indexed and find with non-zero contention',
    eeMetadataPre90,
    function () {
      let findPayload;
      let findPayload2;

      beforeEach(async function () {
        for (let i = 0; i < 10; i++) {
          // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
          // class EncryptOpts {
          //    keyId : <key1ID>
          //    algorithm: "Indexed",
          //    contentionFactor: 10
          // }
          // Store the result in insertPayload.
          const insertPayload = await clientEncryption.encrypt('encrypted indexed value', {
            keyId: key1Id,
            algorithm: 'Indexed',
            contentionFactor: 10
          });
          // Use encryptedClient to insert the document { "encryptedIndexed": <insertPayload> }
          // into db.explicit_encryption.
          await encryptedClient.db('db').collection('explicit_encryption').insertOne({
            encryptedIndexed: insertPayload
          });
          // Repeat the above steps 10 times to insert 10 total documents.
          // The insertPayload must be regenerated each iteration.
        }
        // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
        // class EncryptOpts {
        //    keyId : <key1ID>
        //    algorithm: "Indexed",
        //    queryType: Equality
        // }
        // Store the result in findPayload.
        findPayload = await clientEncryption.encrypt('encrypted indexed value', {
          keyId: key1Id,
          algorithm: 'Indexed',
          queryType: 'equality',
          contentionFactor: 0
        });
        // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
        // class EncryptOpts {
        //    keyId : <key1ID>
        //    algorithm: "Indexed",
        //    queryType: Equality,
        //    contentionFactor: 10
        // }
        // Store the result in findPayload2.
        findPayload2 = await clientEncryption.encrypt('encrypted indexed value', {
          keyId: key1Id,
          algorithm: 'Indexed',
          queryType: 'equality',
          contentionFactor: 10
        });
      });

      it('returns less than the total documents with no contention', async function () {
        // Use encryptedClient to run a "find" operation on the db.explicit_encryption
        // collection with the filter { "encryptedIndexed": <findPayload> }.
        // Assert less than 10 documents are returned. 0 documents may be returned.
        // Assert each returned document contains the field
        // { "encryptedIndexed": "encrypted indexed value" }.
        const collection = encryptedClient.db('db').collection('explicit_encryption');
        const result = await collection.find({ encryptedIndexed: findPayload }).toArray();
        expect(result.length).to.be.below(10);
        for (const doc of result) {
          expect(doc).to.have.property('encryptedIndexed', 'encrypted indexed value');
        }
      });

      it('returns all documents with contention', async function () {
        // Use encryptedClient to run a "find" operation on the db.explicit_encryption
        // collection with the filter { "encryptedIndexed": <findPayload2> }.
        // Assert 10 documents are returned. Assert each returned document contains the
        // field { "encryptedIndexed": "encrypted indexed value" }.
        const collection = encryptedClient.db('db').collection('explicit_encryption');
        const result = await collection.find({ encryptedIndexed: findPayload2 }).toArray();
        expect(result.length).to.equal(10);
        for (const doc of result) {
          expect(doc).to.have.property('encryptedIndexed', 'encrypted indexed value');
        }
      });
    }
  );

  context('Case 3: can insert encrypted unindexed', eeMetadata, function () {
    let insertPayload;

    beforeEach(async function () {
      // Use clientEncryption to encrypt the value "encrypted unindexed value" with these EncryptOpts:
      // class EncryptOpts {
      //    keyId : <key1ID>
      //    algorithm: "Unindexed"
      // }
      // Store the result in insertPayload.
      insertPayload = await clientEncryption.encrypt('encrypted unindexed value', {
        keyId: key1Id,
        algorithm: 'Unindexed'
      });
      // Use encryptedClient to insert the document { "_id": 1, "encryptedUnindexed": <insertPayload> }
      // into db.explicit_encryption.
      await encryptedClient.db('db').collection('explicit_encryption').insertOne({
        _id: 1,
        encryptedUnindexed: insertPayload
      });
    });

    it('returns unindexed documents', async function () {
      // Use encryptedClient to run a "find" operation on the db.explicit_encryption
      // collection with the filter { "_id": 1 }.
      // Assert one document is returned containing the field
      // { "encryptedUnindexed": "encrypted unindexed value" }.
      const collection = encryptedClient.db('db').collection('explicit_encryption');
      const result = await collection.findOne({ _id: 1 });
      expect(result).to.have.property('encryptedUnindexed', 'encrypted unindexed value');
    });
  });

  context('Case 4: can roundtrip encrypted indexed', eeMetadata, function () {
    let payload;

    beforeEach(async function () {
      // Use clientEncryption to encrypt the value "encrypted indexed value" with these EncryptOpts:
      // class EncryptOpts {
      //    keyId : <key1ID>
      //    algorithm: "Indexed",
      // }
      // Store the result in payload.
      payload = await clientEncryption.encrypt('encrypted indexed value', {
        keyId: key1Id,
        algorithm: 'Indexed',
        contentionFactor: 0
      });
    });

    it('decrypts the value', async function () {
      // Use clientEncryption to decrypt payload. Assert the returned value
      // equals "encrypted indexed value".
      const result = await clientEncryption.decrypt(payload);
      expect(result).equals('encrypted indexed value');
    });
  });

  context('Case 5: can roundtrip encrypted unindexed', eeMetadata, function () {
    let payload;

    beforeEach(async function () {
      // Use clientEncryption to encrypt the value "encrypted unindexed value" with these EncryptOpts:
      // class EncryptOpts {
      //    keyId : <key1ID>
      //    algorithm: "Unindexed",
      // }
      // Store the result in payload.
      payload = await clientEncryption.encrypt('encrypted unindexed value', {
        keyId: key1Id,
        algorithm: 'Unindexed'
      });
    });

    it('decrypts the value', async function () {
      // Use clientEncryption to decrypt payload. Assert the returned value
      // equals "encrypted unindexed value".
      const result = await clientEncryption.decrypt(payload);
      expect(result).equals('encrypted unindexed value');
    });
  });
});
