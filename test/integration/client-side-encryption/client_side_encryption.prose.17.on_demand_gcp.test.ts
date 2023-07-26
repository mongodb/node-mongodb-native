import { expect } from 'chai';
import { env } from 'process';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ClientEncryption } from '../../../src/client-side-encryption/clientEncryption';
import { Binary } from '../../mongodb';

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true
  }
} as const;

const dataKeyOptions = {
  masterKey: {
    projectId: 'devprod-drivers',
    location: 'global',
    keyRing: 'key-ring-csfle',
    keyName: 'key-name-csfle'
  }
};

describe('17. On-demand GCP Credentials', () => {
  let clientEncryption: import('mongodb-client-encryption').ClientEncryption;
  let keyVaultClient;

  beforeEach(async function () {
    keyVaultClient = this.configuration.newClient();

    if (typeof env.GCPKMS_GCLOUD === 'string') {
      // If Google cloud env is present then EXPECTED_GCPKMS_OUTCOME MUST be set
      expect(env.EXPECTED_GCPKMS_OUTCOME, `EXPECTED_GCPKMS_OUTCOME must be 'success' or 'failure'`)
        .to.be.a('string')
        .that.satisfies(s => s === 'success' || s === 'failure');
    }

    clientEncryption = new ClientEncryption(keyVaultClient, {
      keyVaultClient,
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: { gcp: {} }
    });
  });

  afterEach(async () => {
    await keyVaultClient?.close();
  });

  it('Case 1: Failure', metadata, async function () {
    if (env.EXPECTED_GCPKMS_OUTCOME !== 'failure') {
      this.skipReason = 'This test is supposed to run in the environment where failure is expected';
      this.skip();
    }

    const error = await clientEncryption.createDataKey('gcp', dataKeyOptions).catch(error => error);
    // GaxiosError: Unsuccessful response status code. Request failed with status code 404
    expect(error).to.be.instanceOf(Error);
    expect(error).property('code', '404');
  });

  it('Case 2: Success', metadata, async function () {
    if (env.EXPECTED_GCPKMS_OUTCOME !== 'success') {
      this.skipReason = 'This test is supposed to run in the environment where success is expected';
      this.skip();
    }

    const dk = await clientEncryption.createDataKey('gcp', dataKeyOptions);
    expect(dk).to.be.instanceOf(Binary);
  });
});
