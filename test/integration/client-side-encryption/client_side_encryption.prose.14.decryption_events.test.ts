import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import {
  Binary,
  BSON,
  type CommandFailedEvent,
  type CommandSucceededEvent,
  type MongoClient,
  MongoNetworkError
} from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,
    topology: '!load-balanced'
  }
};

const LOCAL_KEY = Buffer.from(
  'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
  'base64'
);

describe('14. Decryption Events', metadata, function () {
  let setupClient: MongoClient;
  let clientEncryption;
  let keyId: Binary;
  let cipherText: Binary;
  let malformedCiphertext: Binary;
  let encryptedClient: MongoClient;
  let aggregateSucceeded: CommandSucceededEvent | undefined;
  let aggregateFailed: CommandFailedEvent | undefined;

  beforeEach(async function () {
    // Create a MongoClient named ``setupClient``.
    setupClient = this.configuration.newClient();
    // Drop and create the collection ``db.decryption_events``.
    const db = setupClient.db('db');
    await setupClient
      .db('db')
      .collection('decryption_events')
      .deleteMany({})
      .catch(() => null);
    await db.dropCollection('decryption_events').catch(() => null);
    await db.createCollection('decryption_events');
    // Create a ClientEncryption object named ``clientEncryption`` with these options:
    //   ClientEncryptionOpts {
    //     keyVaultClient: <setupClient>,
    //     keyVaultNamespace: "keyvault.datakeys",
    //     kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
    //   }
    clientEncryption = new ClientEncryption(setupClient, {
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: { local: { key: LOCAL_KEY } },
      bson: BSON,
      extraOptions: getEncryptExtraOptions()
    });
    // Create a data key with the "local" KMS provider.
    // Storing the result in a variable named ``keyID``.
    keyId = await clientEncryption.createDataKey('local');
    // Use ``clientEncryption`` to encrypt the string "hello" with the following ``EncryptOpts``:
    //   EncryptOpts {
    //     keyId: <keyID>,
    //     algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
    //   }
    // Store the result in a variable named ``ciphertext``.
    cipherText = await clientEncryption.encrypt('hello', {
      keyId: keyId,
      algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
    });
    // Copy ``ciphertext`` into a variable named ``malformedCiphertext``. Change the
    // last byte to a different value. This will produce an invalid HMAC tag.
    const buffer = Buffer.from(cipherText.buffer);
    const lastByte = buffer.readUInt8(buffer.length - 1);
    const replacementByte = lastByte === 0 ? 1 : 0;
    buffer.writeUInt8(replacementByte, buffer.length - 1);
    malformedCiphertext = new Binary(buffer, 6);

    // Create a MongoClient named ``encryptedClient`` with these ``AutoEncryptionOpts``:
    //   AutoEncryptionOpts {
    //     keyVaultNamespace: "keyvault.datakeys";
    //     kmsProviders: { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
    //   }
    // Configure ``encryptedClient`` with "retryReads=false".
    encryptedClient = this.configuration.newClient(
      {},
      {
        writeConcern: { w: 'majority' },
        retryReads: false,
        monitorCommands: true,
        autoEncryption: {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: { local: { key: LOCAL_KEY } },
          extraOptions: getEncryptExtraOptions()
        }
      }
    );
    // Register a listener for CommandSucceeded events on ``encryptedClient``.
    encryptedClient.on('commandSucceeded', event => {
      if (event.commandName === 'aggregate') {
        aggregateSucceeded = event;
      }
    });
    // The listener must store the most recent CommandFailedEvent error for the "aggregate" command.
    encryptedClient.on('commandFailed', event => {
      if (event.commandName === 'aggregate') {
        aggregateFailed = event;
      }
    });
  });

  afterEach(async function () {
    aggregateSucceeded = undefined;
    aggregateFailed = undefined;
    await setupClient
      .db('db')
      .collection('decryption_events')
      .deleteMany({})
      .catch(() => null);
    await setupClient.close();
    await encryptedClient.close();
  });

  context('Case 1: Command Error', metadata, function () {
    beforeEach(async function () {
      // Use ``setupClient`` to configure the following failpoint:
      //    {
      //         "configureFailPoint": "failCommand",
      //         "mode": {
      //             "times": 1
      //         },
      //         "data": {
      //             "errorCode": 123,
      //             "failCommands": [
      //                 "aggregate"
      //             ]
      //         }
      //     }
      await setupClient
        .db()
        .admin()
        .command({
          configureFailPoint: 'failCommand',
          mode: {
            times: 1
          },
          data: {
            errorCode: 123,
            failCommands: ['aggregate']
          }
        });
    });

    it('expects an error and a command failed event', async function () {
      // Use ``encryptedClient`` to run an aggregate on ``db.decryption_events``.
      // Expect an exception to be thrown from the command error. Expect a CommandFailedEvent.
      const collection = encryptedClient.db('db').collection('decryption_events');

      const error = await collection
        .aggregate([])
        .toArray()
        .catch(error => error);

      expect(error).to.have.property('code', 123);
      expect(aggregateFailed).to.have.nested.property('failure.code', 123);
    });
  });

  context('Case 2: Network Error', metadata, function () {
    beforeEach(async function () {
      // Use ``setupClient`` to configure the following failpoint:
      //    {
      //         "configureFailPoint": "failCommand",
      //         "mode": {
      //             "times": 1
      //         },
      //         "data": {
      //             "errorCode": 123,
      //             "closeConnection": true,
      //             "failCommands": [
      //                 "aggregate"
      //             ]
      //         }
      //     }
      await setupClient
        .db()
        .admin()
        .command({
          configureFailPoint: 'failCommand',
          mode: {
            times: 1
          },
          data: {
            errorCode: 123,
            closeConnection: true,
            failCommands: ['aggregate']
          }
        });
    });

    it('expects an error and a command failed event', async function () {
      // Use ``encryptedClient`` to run an aggregate on ``db.decryption_events``.
      // Expect an exception to be thrown from the network error. Expect a CommandFailedEvent.
      const collection = encryptedClient.db('db').collection('decryption_events');

      const error = await collection
        .aggregate([])
        .toArray()
        .catch(error => error);

      expect(error).to.be.instanceOf(MongoNetworkError);
      expect(aggregateFailed).to.have.nested.property('failure.message').to.include('closed');
    });
  });

  context('Case 3: Decrypt Error', metadata, function () {
    it('errors on decryption but command succeeds', async function () {
      // Use ``encryptedClient`` to insert the document ``{ "encrypted": <malformedCiphertext> }``
      // into ``db.decryption_events``.
      // Use ``encryptedClient`` to run an aggregate on ``db.decryption_events``.
      // Expect an exception to be thrown from the decryption error.
      // Expect a CommandSucceededEvent. Expect the CommandSucceededEvent.reply
      // to contain BSON binary for the field
      // ``cursor.firstBatch.encrypted``.
      const collection = encryptedClient.db('db').collection('decryption_events');
      await collection.insertOne(
        { encrypted: malformedCiphertext },
        { writeConcern: { w: 'majority' } }
      );

      /// Verify the malformedCiphertext was inserted with a plain client
      const docs = await setupClient.db('db').collection('decryption_events').find({}).toArray();
      expect(docs).to.have.lengthOf(1);
      expect(docs).to.have.deep.nested.property('[0].encrypted', malformedCiphertext);

      const error = await collection
        .aggregate([])
        .toArray()
        .catch(error => error);

      expect(error).to.have.property('message').to.include('HMAC validation failure');
      expect(aggregateSucceeded)
        .to.have.nested.property('reply.cursor.firstBatch[0].encrypted')
        .to.be.instanceOf(Binary);
    });
  });

  context('Case 4: Decrypt Success', metadata, function () {
    it('succeeds on decryption and command succeeds', async function () {
      // Use ``encryptedClient`` to insert the document ``{ "encrypted": <ciphertext> }``
      // into ``db.decryption_events``.
      // Use ``encryptedClient`` to run an aggregate on ``db.decryption_events``.
      // Expect no exception.
      // Expect a CommandSucceededEvent. Expect the CommandSucceededEvent.reply
      // to contain BSON binary for the field ``cursor.firstBatch.encrypted``.
      const collection = encryptedClient.db('db').collection('decryption_events');
      await collection.insertOne({ encrypted: cipherText });

      const result = await collection.aggregate([]).toArray();

      expect(result).to.have.nested.property('[0].encrypted', 'hello');
      expect(aggregateSucceeded)
        .to.have.nested.property('reply.cursor.firstBatch[0].encrypted')
        .to.be.instanceOf(Binary);
    });
  });
});
