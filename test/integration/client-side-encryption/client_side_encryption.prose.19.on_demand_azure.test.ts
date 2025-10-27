import { expect } from 'chai';
import { env } from 'process';

import { Binary } from '../../../src';
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { MongoCryptAzureKMSRequestError } from '../../../src/client-side-encryption/errors';

const dataKeyOptions = {
  masterKey: {
    keyVaultEndpoint: 'https://drivers-2411-keyvault.vault.azure.net/',
    keyName: 'drivers-2411-keyname'
  }
};

describe('19. On-demand Azure Credentials', () => {
  let clientEncryption;
  let keyVaultClient;

  beforeEach(async function () {
    keyVaultClient = this.configuration.newClient();

    if (typeof env.AZUREKMS_VMNAME === 'string') {
      // If azure cloud env is present then EXPECTED_AZUREKMS_OUTCOME MUST be set
      expect(
        env.EXPECTED_AZUREKMS_OUTCOME,
        `EXPECTED_AZUREKMS_OUTCOME must be 'success' or 'failure'`
      )
        .to.be.a('string')
        .that.satisfies(s => s === 'success' || s === 'failure');
    }

    clientEncryption = new ClientEncryption(keyVaultClient, {
      keyVaultClient,
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: { azure: {} }
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
          env.EXPECTED_AZUREKMS_OUTCOME !== 'failure'
            ? 'This test is supposed to run in the environment where failure is expected'
            : true
      }
    },
    async function () {
      const error = await clientEncryption
        .createDataKey('azure', dataKeyOptions)
        .catch(error => error);
      expect(error).to.be.instanceOf(MongoCryptAzureKMSRequestError);
    }
  );

  it(
    'Case 2: Success',
    {
      requires: {
        predicate: () =>
          env.EXPECTED_AZUREKMS_OUTCOME !== 'success'
            ? 'This test is supposed to run in the environment where success is expected'
            : true
      }
    },
    async function () {
      const dk = await clientEncryption.createDataKey('azure', dataKeyOptions);
      expect(dk).to.be.instanceOf(Binary);
    }
  );
});
