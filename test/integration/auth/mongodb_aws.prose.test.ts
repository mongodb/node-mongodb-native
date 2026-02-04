import { expect } from 'chai';
import * as process from 'process';

import { AWSSDKCredentialProvider, type MongoClient, MongoServerError } from '../../mongodb';
const isMongoDBAWSAuthEnvironment = (process.env.MONGODB_URI ?? '').includes('MONGODB-AWS');

describe('MONGODB-AWS Prose Tests', function () {
  let client: MongoClient;

  beforeEach(function () {
    if (!isMongoDBAWSAuthEnvironment) {
      this.currentTest.skipReason = 'requires MONGODB_URI to contain MONGODB-AWS auth mechanism';
      return this.skip();
    }
  });

  afterEach(async () => {
    await client?.close();
  });

  // NOTE: Logic for scenarios 1-6 is handled via the evergreen variant configs.
  // Scenarios 1-6 from the previous section with a user provided AWS_CREDENTIAL_PROVIDER auth mechanism
  // property. This credentials MAY be obtained from the default credential provider from the AWS SDK.
  // If the default provider does not cover all scenarios above, those not covered MAY be skipped.
  // In these tests the driver MUST also assert that the user provided credential provider was called
  // in each test. This may be via a custom function or object that wraps the calls to the custom provider
  // and asserts that it was called at least once. For test scenarios where the drivers tools scripts put
  // the credentials in the MONGODB_URI, drivers MAY extract the credentials from the URI and return the AWS
  // credentials directly from the custom provider instead of using the AWS SDK default provider.
  context('1. Custom Credential Provider Authenticates', function () {
    let providerCount = 0;

    it('authenticates with a user provided credentials provider', async function () {
      const credentialProvider = AWSSDKCredentialProvider.awsSDK;
      const provider = async () => {
        providerCount++;
        return await credentialProvider.fromNodeProviderChain().apply();
      };
      client = this.configuration.newClient(process.env.MONGODB_URI, {
        authMechanismProperties: {
          AWS_CREDENTIAL_PROVIDER: provider
        }
      });

      const result = await client
        .db('aws')
        .collection('aws_test')
        .estimatedDocumentCount()
        .catch(error => error);

      expect(result).to.not.be.instanceOf(MongoServerError);
      expect(result).to.be.a('number');
      expect(providerCount).to.be.greaterThan(0);
    });
  });

  context('2. Custom Credential Provider Authentication Precedence', function () {
    // Run this test in an environment with AWS credentials configured as environment variables
    // (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN)
    // Create a MongoClient configured to use AWS auth. Example: mongodb://localhost:27017/?authMechanism=MONGODB-AWS.
    // Configure a custom credential provider to pass valid AWS credentials. The provider must track if it was called.
    // Expect authentication to succeed and the custom credential provider was called.
    context('Case 2: Custom Provider Takes Precedence Over Environment Variables', function () {
      let providerCount = 0;
      let provider;

      beforeEach(function () {
        if (client?.options.credentials.username || !process.env.AWS_ACCESS_KEY_ID) {
          this.skipReason = 'Test only runs when credentials are present in the environment';
          return this.skip();
        }
        const credentialProvider = AWSSDKCredentialProvider.awsSDK;
        provider = async () => {
          providerCount++;
          return await credentialProvider.fromNodeProviderChain().apply();
        };
      });

      it('authenticates with a user provided credentials provider', async function () {
        client = this.configuration.newClient(process.env.MONGODB_URI, {
          authMechanismProperties: {
            AWS_CREDENTIAL_PROVIDER: provider
          }
        });

        const result = await client
          .db('aws')
          .collection('aws_test')
          .estimatedDocumentCount()
          .catch(error => error);

        expect(result).to.not.be.instanceOf(MongoServerError);
        expect(result).to.be.a('number');
        expect(providerCount).to.be.greaterThan(0);
      });
    });
  });
});
