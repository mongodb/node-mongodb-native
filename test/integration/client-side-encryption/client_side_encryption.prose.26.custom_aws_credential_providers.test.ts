import { expect } from 'chai';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { AWSSDKCredentialProvider, Binary, MongoClient } from '../../mongodb';
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
    keyVaultClient = this.configuration.newClient(process.env.MONGODB_UR);
    credentialProvider = AWSSDKCredentialProvider.awsSDK;
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

  // Ensure a valid AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are present in the environment.
  // Create a MongoClient named setupClient.
  // Create a ClientEncryption object with the following options:
  // class ClientEncryptionOpts {
  //   keyVaultClient: <setupClient>,
  //   keyVaultNamespace: "keyvault.datakeys",
  //   kmsProviders: { "aws": {} },
  //   credentialProviders: { "aws": <object/function that returns valid credentials from the secrets manager> }
  // }
  // Use the client encryption to create a datakey using the "aws" KMS provider. This should successfully load
  // and use the AWS credentials that were provided by the secrets manager for the remote provider. Assert the
  // datakey was created and that the custom credential provider was called at least once.
  context(
    'Case 4: ClientEncryption with credentialProviders and valid environment variables',
    metadata,
    function () {
      let clientEncryption;
      let providerCount = 0;
      let previousAccessKey;
      let previousSecretKey;

      beforeEach(function () {
        previousAccessKey = process.env.AWS_ACCESS_KEY_ID;
        previousSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        process.env.AWS_ACCESS_KEY_ID = process.env.FLE_AWS_KEY;
        process.env.AWS_SECRET_ACCESS_KEY = process.env.FLE_AWS_SECRET;

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

      afterEach(function () {
        process.env.AWS_ACCESS_KEY_ID = previousAccessKey;
        process.env.AWS_SECRET_ACCESS_KEY = previousSecretKey;
      });

      it('is successful', metadata, async function () {
        const dk = await clientEncryption.createDataKey('aws', { masterKey });
        expect(dk).to.be.instanceOf(Binary);
        expect(providerCount).to.be.greaterThan(0);
      });
    }
  );
});
