import { expect } from 'chai';
const fs = require('fs');
import * as tls from 'tls';
import { once } from 'events';

const { ClientEncryption } = require('../../../src/client-side-encryption/client_encryption');

describe('kmsRequest', function () {
  context('when server closes connection without an error', function () {
    const endpoint = 'https://localhost:5699';
    const provider = 'kmip';
    const kmsProviders = { kmip: { endpoint } };
    const keyVaultNamespace = 'encryption._keyVault';
    let tlsOptions;
    let serverThatClosesOnHandshake;
    let client;
    let clientEncrypted;
    let db;

    before(async function () {
      const serverKey = fs.readFileSync(`${__dirname}/ssl/server-key.pem`);
      const serverCrt = fs.readFileSync(`${__dirname}/ssl/server-crt.pem`);
      const ca = fs.readFileSync(`${__dirname}/ssl/ca.pem`);
      const clientKey = fs.readFileSync(`${__dirname}/ssl/client.pem`);

      tlsOptions = {
        tlsCAFile: ca,
        tlsCertificateKeyFile: clientKey,
        requestCert: true,
        rejectUnauthorized: false
      };

      const autoEncryption = {
        keyVaultNamespace,
        kmsProviders,
        tlsOptions: { [provider]: tlsOptions },
        explicitEncryptionOnly: true,
      };

      // Start fake server.
      serverThatClosesOnHandshake = tls.createServer({
        key: serverKey,
        cert: serverCrt,
        ca: [ca]
      }, (socket) => {
        socket.end();
      });
      serverThatClosesOnHandshake.listen(5699);
      await once(serverThatClosesOnHandshake, 'listening');

      client = this.configuration.newClient();
      await client.connect();

      db = client.db('automatic_data_encryption_keys');
      await db.dropDatabase().catch(() => null);

      clientEncrypted = this.configuration.newClient({}, { autoEncryption });
      await clientEncrypted.connect();
    });

    afterEach(() => {
      serverThatClosesOnHandshake.close();
      client.close();
      clientEncrypted.close();
    });

    it('kmsRequest rejects with kms request closed error', async function () {
      try {
        const clientEncryption = new ClientEncryption(client, {
          keyVaultNamespace,
          kmsProviders,
          tlsOptions
        });
        const masterKey = {};
        const dataKeyId = await clientEncryption.createDataKey(provider, {
          masterKey,
          keyAltNames: ['0703-dataKe6']
        });
        console.log('dataKeyId----------------------');
        console.log(dataKeyId);
        console.log('----------------------');
      } catch (err) {
        console.log('err----------------------');
        console.log(err);
        console.log('----------------------');
        expect(err.name).to.equal('MongoCryptError');
        expect(err.message).to.include('KMS request closed');
        return;
      } finally {
        client.close();
        clientEncrypted.close();
      }
    });
  });
});