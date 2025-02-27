import { expect } from 'chai';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { AWSTemporaryCredentialProvider, Binary } from '../../mongodb';

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true
  }
} as const;

const masterKey = {
  region: 'us-east-1',
  key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
};

const isMongoDBAWSAuthEnvironment = (process.env.MONGODB_URI ?? '').includes('MONGODB-AWS');

describe('25. Custom AWS Credential Providers', metadata, () => {
  let keyVaultClient;
  let credentialProvider;

  beforeEach(async function () {
    this.currentTest.skipReason = !isMongoDBAWSAuthEnvironment
      ? 'Test must run in an AWS auth testing environment'
      : !AWSTemporaryCredentialProvider.isAWSSDKInstalled
        ? 'This test must run in an environment where the AWS SDK is installed.'
        : undefined;
    this.currentTest?.skipReason && this.skip();

    keyVaultClient = this.configuration.newClient(process.env.MONGODB_UR);
    // @ts-expect-error We intentionally access a protected variable.
    credentialProvider = AWSTemporaryCredentialProvider.awsSDK;
  });

  afterEach(async () => {
    await keyVaultClient?.close();
  });

  context(
    'Case 1: Explicit encryption with credentials and custom credential provider',
    function () {
      it('throws an error', function () {
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
        }).to.throw();
      });
    }
  );

  context('Case 2: Explicit encryption with custom credential provider', function () {
    let clientEncryption;

    beforeEach(function () {
      clientEncryption = new ClientEncryption(keyVaultClient, {
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: { aws: {} },
        credentialProviders: { aws: credentialProvider.fromNodeProviderChain() }
      });
    });

    it('is successful', async function () {
      const dk = await clientEncryption.createDataKey('aws', masterKey);
      expect(dk).to.be.instanceOf(Binary);
    });
  });

  context('Case 3: Automatic encryption with different custom providers', function () {
    let client;

    beforeEach(function () {
      client = this.configuration.newClient(process.env.MONGODB_URI, {
        authMechanismProperties: {
          AWS_CREDENTIAL_PROVIDER: credentialProvider.fromNodeProviderChain()
        },
        autoEncryption: {
          keyVaultNamespace: 'keyvault.datakeys',
          kmsProviders: { aws: {} },
          credentialProviders: {
            aws: async () => {
              return {
                accessKeyId: process.env.FLE_AWS_KEY,
                secretAccessKey: process.env.FLE_AWS_SECRET
              };
            }
          }
        }
      });
    });

    afterEach(async function () {
      await client?.close();
    });

    it('is successful', async function () {
      const result = await client.db('test').collection('test').insertOne({ n: 1 });
      expect(result.ok).to.equal(1);
    });
  });
});
