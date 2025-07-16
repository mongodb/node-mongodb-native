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

    server = createServer({});
    server.listen(27021);
    server.on('connection', () => (hasConnection = true));

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
      await client.db('db').collection('coll').insertOne({ unencrypted: 'test' });
      expect(hasConnection).to.be.false;

      expect(client.autoEncrypter._mongocryptdClient).to.be.undefined;
    }
  );
});
