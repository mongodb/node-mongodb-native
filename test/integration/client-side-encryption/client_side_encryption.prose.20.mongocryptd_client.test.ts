import { expect } from 'chai';
import { once } from 'events';
import { createServer, type Server } from 'net';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { type MongoClient } from '../../mongodb';
import { ClientSideEncryptionFilter } from '../../tools/runner/filters/client_encryption_filter';
import { getEncryptExtraOptions } from '../../tools/utils';

describe('20. Bypass creating mongocryptd client when shared library is loaded', function () {
  let server: Server;
  let hasConnection = false;
  let client: MongoClient;

  beforeEach(function () {
    if (!ClientSideEncryptionFilter.cryptShared) {
      this.currentTest.skipReason =
        'test requires that the crypt shared be loaded into the current process.';
      this.skip();
    }

    // Start a new thread (referred to as listenerThread)
    // On listenerThread, create a TcpListener on 127.0.0.1 endpoint and port 27021. Start the listener and wait for establishing connections. If any connection is established, then signal about this to the main thread.
    // Drivers MAY pass a different port if they expect their testing infrastructure to be using port 27021. Pass a port that should be free.
    // In Node, we don't need to create a separate thread for the server.
    server = createServer({});
    server.listen(27021);
    server.on('connection', () => (hasConnection = true));

    // Create a MongoClient configured with auto encryption (referred to as client_encrypted)
    // Configure the required options. Use the local KMS provider as follows:
    // { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }
    // Configure with the keyVaultNamespace set to keyvault.datakeys.
    // Configure the following extraOptions:
    // {
    //   "mongocryptdURI": "mongodb://localhost:27021/?serverSelectionTimeoutMS=1000"
    // }
    client = this.configuration.newClient(
      {},
      {
        autoEncryption: {
          kmsProviders: { local: getCSFLEKMSProviders().local },
          keyVaultNamespace: 'keyvault.datakeys',
          extraOptions: {
            cryptSharedLibPath: getEncryptExtraOptions().cryptSharedLibPath,
            mongocryptdURI: 'mongodb://localhost:27021'
          }
        }
      }
    );
  });

  afterEach(async function () {
    server && (await once(server.close(), 'close'));
    await client?.close();
  });

  it(
    'does not create or use a mongocryptd client when the shared library is loaded',
    {
      requires: {
        clientSideEncryption: true
      }
    },
    async function () {
      // Use client_encrypted to insert the document {"unencrypted": "test"} into db.coll.
      await client.db('db').collection('coll').insertOne({ unencrypted: 'test' });

      // Expect no signal from listenerThread.
      expect(hasConnection).to.be.false;

      // Note: this assertion is not in the spec test.  However, unlike other drivers, Node's client
      // does not connect when instantiated.  So, we won't receive any TCP connections to the
      // server unless the mongocryptd client is only instantiated.  This assertion captures the
      // spirit of this test, causing it to fail if we do instantiate a client.  I left the
      // TCP server in, although it isn't necessary for Node's test, just because its nice to have
      // in case Node's client behavior ever changes.
      expect(client.autoEncrypter._mongocryptdClient).to.be.undefined;
    }
  );
});
