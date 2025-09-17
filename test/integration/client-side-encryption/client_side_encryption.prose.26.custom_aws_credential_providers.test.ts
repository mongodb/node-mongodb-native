import { expect } from 'chai';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { AWSTemporaryCredentialProvider, Binary, MongoClient } from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,
    topology: '!load-balanced'
  }
} as const;

const masterKey = {
  region: 'us-east-1',
  key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
};

describe('26. Custom AWS Credential Providers', metadata, () => {
  let keyVaultClient;
  let credentialProvider;

  beforeEach(async function () {
    this.currentTest.skipReason = !AWSTemporaryCredentialProvider.isAWSSDKInstalled
      ? 'This test must run in an environment where the AWS SDK is installed.'
      : undefined;
    this.currentTest?.skipReason && this.skip();

    keyVaultClient = this.configuration.newClient(process.env.MONGODB_UR);
    credentialProvider = AWSTemporaryCredentialProvider.awsSDK;
  });

  afterEach(async () => {
    await keyVaultClient?.close();
  });

  context(
    'Case 1: ClientEncryption with credentialProviders and incorrect kmsProviders',
    metadata,
    function () {
      it('throws an error', metadata, function () {
        expect(() => {
          new ClientEncryption(keyVaultClient, {
            keyVaultNamespace: 'keyvault.datakeys',
            kmsProviders: {
              aws: {
                accessKeyId: process.env.FLE_AWS_KEY,
                secretAccessKey: process.env.FLE_AWS_SECRET
              }
            },
            credentialProviders: { aws: credentialProvider.fromNodeProviderChain() }
          });
        }).to.throw(/Can only provide a custom AWS credential provider/);
      });
    }
  );

  context('Case 2: ClientEncryption with credentialProviders works', metadata, function () {
    let clientEncryption;
    let providerCount = 0;

    beforeEach(function () {
      const options = {
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: { aws: {} },
        credentialProviders: {
          aws: async () => {
            providerCount++;
            return {
              accessKeyId: process.env.FLE_AWS_KEY,
              secretAccessKey: process.env.FLE_AWS_SECRET
            };
          }
        },
        extraOptions: getEncryptExtraOptions()
      };
      clientEncryption = new ClientEncryption(keyVaultClient, options);
    });

    it('is successful', metadata, async function () {
      const dk = await clientEncryption.createDataKey('aws', { masterKey });
      expect(dk).to.be.instanceOf(Binary);
      expect(providerCount).to.be.greaterThan(0);
    });
  });

  context(
    'Case 3: AutoEncryptionOpts with credentialProviders and incorrect kmsProviders',
    metadata,
    function () {
      it('throws an error', metadata, function () {
        expect(() => {
          new MongoClient('mongodb://127.0.0.1:27017', {
            autoEncryption: {
              keyVaultNamespace: 'keyvault.datakeys',
              kmsProviders: {
                aws: {
                  accessKeyId: process.env.FLE_AWS_KEY,
                  secretAccessKey: process.env.FLE_AWS_SECRET
                }
              },
              credentialProviders: { aws: credentialProvider.fromNodeProviderChain() }
            }
          });
        }).to.throw(/Can only provide a custom AWS credential provider/);
      });
    }
  );
});
