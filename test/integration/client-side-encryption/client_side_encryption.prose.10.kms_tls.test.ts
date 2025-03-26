import { expect } from 'chai';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { ClientEncryption, type MongoClient } from '../../mongodb';

const metadata: MongoDBMetadataUI = {
  requires: {
    os: '!win32',
    topology: '!load-balanced',
    mongodb: '>=4.2.0'
  }
};

describe('10. KMS TLS Tests', function () {
  const keyVaultNamespace = 'keyvault.datakeys';
  const masterKeyBase = {
    region: 'us-east-1',
    key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
  };

  let client: MongoClient;
  let clientEncryption: ClientEncryption;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();

    clientEncryption = new ClientEncryption(client, {
      keyVaultNamespace,
      kmsProviders: { aws: getCSFLEKMSProviders().aws },
      tlsOptions: {
        aws: {
          tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
          tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
        }
      }
    });
  });

  afterEach(async function () {
    await client.close();
  });

  it('should fail with an expired certificate', metadata, async function () {
    const masterKey = { ...masterKeyBase, endpoint: '127.0.0.1:9000' };

    const error = await clientEncryption.createDataKey('aws', { masterKey }).then(
      () => null,
      error => error
    );

    expect(error).to.exist;
    expect(error, error.stack).to.have.property('cause').that.is.instanceOf(Error);
    expect(error.cause.message, error.stack).to.include('certificate has expired');
  });

  it('should fail with an invalid hostname', metadata, async function () {
    const masterKey = { ...masterKeyBase, endpoint: '127.0.0.1:9001' };

    const error = await clientEncryption.createDataKey('aws', { masterKey }).then(
      () => null,
      error => error
    );

    expect(error).to.exist;
    expect(error, error.stack).to.have.property('cause').that.is.instanceOf(Error);
    expect(error.cause.message, error.stack).to.include('does not match certificate');
  });
});
