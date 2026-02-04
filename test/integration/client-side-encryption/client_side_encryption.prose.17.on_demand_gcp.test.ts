import { expect } from 'chai';
import { env } from 'process';

import { Binary } from '../../mongodb';
import { ClientEncryption } from '../../mongodb';

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

  it(
    'Case 1: Failure',
    {
      requires: {
        predicate: () =>
          env.EXPECTED_GCPKMS_OUTCOME !== 'failure'
            ? 'This test is supposed to run in the environment where failure is expected'
            : true
      }
    },
    async function () {
      const error = await clientEncryption
        .createDataKey('gcp', dataKeyOptions)
        .catch(error => error);
      // GaxiosError: Unsuccessful response status code. Request failed with status code 404
      expect(error).to.be.instanceOf(Error);
      expect(error).property('code', 404);
    }
  );

  it(
    'Case 2: Success',
    {
      requires: {
        predicate: () =>
          env.EXPECTED_GCPKMS_OUTCOME !== 'success'
            ? 'This test is supposed to run in the environment where success is expected'
            : true
      }
    },
    async function () {
      const dk = await clientEncryption.createDataKey('gcp', dataKeyOptions);
      expect(dk).to.be.instanceOf(Binary);
    }
  );
});
