import * as process from 'node:process';

import { expect } from 'chai';
import * as http from 'http';
import { performance } from 'perf_hooks';
import * as sinon from 'sinon';

import {
  type AWSCredentials,
  type CommandOptions,
  type Document,
  MongoAWSError,
  type MongoClient,
  type MongoDBNamespace,
  type MongoDBResponseConstructor,
  MongoMissingCredentialsError,
  MongoMissingDependencyError,
  MongoServerError
} from '../../../src';
import { refreshKMSCredentials } from '../../../src/client-side-encryption/providers';
import { AWSSDKCredentialProvider } from '../../../src/cmap/auth/aws_temporary_credentials';
import { aws4Sign } from '../../../src/cmap/auth/aws4';
import { MongoDBAWS } from '../../../src/cmap/auth/mongodb_aws';
import { Connection } from '../../../src/cmap/connection';
import { setDifference } from '../../../src/utils';

const isMongoDBAWSAuthEnvironment = (process.env.MONGODB_URI ?? '').includes('MONGODB-AWS');

describe('MONGODB-AWS', function () {
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

  context('when the AWS SDK is present', function () {
    it('should authorize when successfully authenticated', async function () {
      client = this.configuration.newClient(process.env.MONGODB_URI); // use the URI built by the test environment

      const result = await client
        .db('aws')
        .collection('aws_test')
        .estimatedDocumentCount()
        .catch(error => error);

      expect(result).to.not.be.instanceOf(MongoServerError);
      expect(result).to.be.a('number');
    });

    describe('ConversationId', function () {
      let commandStub: sinon.SinonStub<
        [
          ns: MongoDBNamespace,
          command: Document,
          options?: CommandOptions,
          responseType?: MongoDBResponseConstructor
        ],
        Promise<any>
      >;

      let saslStartResult, saslContinue;

      beforeEach(function () {
        // spy on connection.command, filter for saslStart and saslContinue commands
        commandStub = sinon.stub(Connection.prototype, 'command').callsFake(async function (
          ns: MongoDBNamespace,
          command: Document,
          options: CommandOptions,
          responseType?: MongoDBResponseConstructor
        ) {
          if (command.saslContinue != null) {
            saslContinue = { ...command };
          }

          const result = await commandStub.wrappedMethod.call(
            this,
            ns,
            command,
            options,
            responseType
          );

          if (command.saslStart != null) {
            // Modify the result of the saslStart to check if the saslContinue uses it
            result.conversationId = 999;
            saslStartResult = { ...result };
          }

          return result;
        });
      });

      afterEach(function () {
        commandStub.restore();
        sinon.restore();
      });

      it('should use conversationId returned by saslStart in saslContinue', async function () {
        client = this.configuration.newClient(process.env.MONGODB_URI); // use the URI built by the test environment

        const err = await client
          .db('aws')
          .collection('aws_test')
          .estimatedDocumentCount()
          .catch(e => e);

        // Expecting the saslContinue to fail since we changed the conversationId
        expect(err).to.be.instanceof(MongoServerError);
        expect(err.message).to.match(/Mismatched conversation id/);

        expect(saslStartResult).to.not.be.undefined;
        expect(saslContinue).to.not.be.undefined;

        expect(saslStartResult).to.have.property('conversationId', 999);

        expect(saslContinue)
          .to.have.property('conversationId')
          .equal(saslStartResult.conversationId);
      });
    });

    it('should allow empty string in authMechanismProperties.AWS_SESSION_TOKEN to override AWS_SESSION_TOKEN environment variable', function () {
      client = this.configuration.newClient(this.configuration.url(), {
        authMechanismProperties: { AWS_SESSION_TOKEN: '' }
      });
      expect(client)
        .to.have.nested.property('options.credentials.mechanismProperties.AWS_SESSION_TOKEN')
        .that.equals('');
    });

    it('should store a MongoDBAWS provider instance per client', async function () {
      client = this.configuration.newClient(process.env.MONGODB_URI);

      await client
        .db('aws')
        .collection('aws_test')
        .estimatedDocumentCount()
        .catch(error => error);

      expect(client).to.have.nested.property('s.authProviders');
      const provider = client.s.authProviders.getOrCreateProvider('MONGODB-AWS', {});
      expect(provider).to.be.instanceOf(MongoDBAWS);
    });

    describe('with missing aws token', () => {
      let awsSessionToken: string | undefined;

      beforeEach(() => {
        awsSessionToken = process.env.AWS_SESSION_TOKEN;
        delete process.env.AWS_SESSION_TOKEN;
      });

      afterEach(() => {
        if (awsSessionToken != null) {
          process.env.AWS_SESSION_TOKEN = awsSessionToken;
        }
      });

      it('should not throw an exception when aws token is missing', async function () {
        client = this.configuration.newClient(process.env.MONGODB_URI);

        const result = await client
          .db('aws')
          .collection('aws_test')
          .estimatedDocumentCount()
          .catch(error => error);

        // We check only for the MongoMissingCredentialsError
        // and do check for the MongoServerError as the error or numeric result
        // that can be returned depending on different types of environments
        // getting credentials from different sources.
        expect(result).to.not.be.instanceOf(MongoMissingCredentialsError);
      });
    });

    describe('EC2 with missing credentials', () => {
      let client;

      beforeEach(function () {
        if (!process.env.IS_EC2) {
          this.currentTest.skipReason = 'requires an AWS EC2 environment';
          this.skip();
        }
        sinon.stub(http, 'request').callsFake(function (...args) {
          // We pass in a legacy object that has the same properties as a URL
          // but it is not an instanceof URL.
          expect(args[0]).to.be.an('object');
          if (typeof args[0] === 'object') {
            args[0].hostname = 'www.example.com';
            args[0].port = '81';
          }
          return http.request.wrappedMethod.apply(this, args);
        });
      });

      afterEach(async () => {
        sinon.restore();
        await client?.close();
      });

      it('should respect the default timeout of 10000ms', async function () {
        const config = this.configuration;
        client = config.newClient(process.env.MONGODB_URI, { authMechanism: 'MONGODB-AWS' }); // use the URI built by the test environment
        const startTime = performance.now();

        const caughtError = await client
          .db()
          .command({ ping: 1 })
          .catch(error => error);

        const endTime = performance.now();
        const timeTaken = endTime - startTime;
        expect(caughtError).to.be.instanceOf(MongoAWSError);
        expect(caughtError)
          .property('message')
          .match(/(timed out after)|(Could not load credentials)/);
        // Credentials provider from the SDK does not allow to configure the timeout
        // and defaults to 2 seconds - so we ensure this timeout happens below 12s
        // instead of the 10s-12s range previously.
        expect(timeTaken).to.be.below(12000);
      });
    });

    // This test verifies that our AWS SigV4 signing works correctly with real AWS credentials.
    // This is done by calculating a signature, then using it to make a real request to the AWS STS service.
    // There are two tests here: one for permanent credentials, and one for session credentials.
    // Permanent credentials are tested by Evergreen task "aws-latest-auth-test-run-aws-auth-test-with-aws-credentials-as-environment-variables"
    // Session credentials are tested by Evergreen task "aws-latest-auth-test-run-aws-auth-test-with-aws-credentials-and-session-token-as-environment-variables"
    describe('AwsSigV4 works with SDK credentials', function () {
      let credentials: AWSCredentials;

      beforeEach(async function () {
        const sdk = AWSSDKCredentialProvider.awsSDK;
        if ('kModuleError' in sdk) {
          this.skipReason = 'AWS SDK not installed';
          this.skip();
        } else {
          credentials = await sdk.fromNodeProviderChain()();
        }
      });

      const testSigning = async creds => {
        const host = 'sts.amazonaws.com';
        const body = 'Action=GetCallerIdentity&Version=2011-06-15';
        const headers: {
          'Content-Type': 'application/x-www-form-urlencoded';
          'Content-Length': number;
          'X-MongoDB-Server-Nonce': string;
          'X-MongoDB-GS2-CB-Flag': 'n';
        } = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': body.length,
          'X-MongoDB-Server-Nonce': 'fakenonce',
          'X-MongoDB-GS2-CB-Flag': 'n'
        };
        const signed = await aws4Sign(
          {
            method: 'POST',
            host,
            path: '/',
            region: 'us-east-1',
            service: 'sts',
            headers: headers,
            body,
            date: new Date()
          },
          creds
        );

        const authorization = signed.headers.Authorization;
        const xAmzDate = signed.headers['X-Amz-Date'];

        const fetchHeaders = new Headers();
        for (const [key, value] of Object.entries(headers)) {
          fetchHeaders.append(key, value.toString());
        }
        if (credentials && credentials.sessionToken) {
          fetchHeaders.append('X-Amz-Security-Token', credentials.sessionToken);
        }
        fetchHeaders.append('Authorization', authorization);
        fetchHeaders.append('X-Amz-Date', xAmzDate);
        const response = await fetch('https://sts.amazonaws.com', {
          method: 'POST',
          headers: fetchHeaders,
          body
        });
        const text = await response.text();

        expect(response.status).to.equal(200);
        expect(response.statusText).to.equal('OK');
        expect(text).to.match(
          /<GetCallerIdentityResponse xmlns="https:\/\/sts.amazonaws.com\/doc\/2011-06-15\/">/
        );
      };

      describe('when using premanent credentials', function () {
        beforeEach(async function () {
          if ('sessionToken' in credentials && credentials.sessionToken) {
            this.skipReason = 'permanent credentials not found in the environment';
            this.skip();
          }
        });

        it('signs requests correctly', async function () {
          await testSigning(credentials);
        });
      });

      describe('when using session credentials', function () {
        beforeEach(async function () {
          if (!('sessionToken' in credentials) || !credentials.sessionToken) {
            this.skipReason = 'session credentials not found in the environment';
            this.skip();
          }
        });

        it('signs requests correctly', async function () {
          await testSigning(credentials);
        });
      });
    });
  });

  describe('when using AssumeRoleWithWebIdentity', () => {
    const tests = [
      {
        ctx: 'when no AWS region settings are set',
        title: 'uses the default region',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: undefined,
          AWS_REGION: undefined
        },
        calledWith: []
      },
      {
        ctx: 'when only AWS_STS_REGIONAL_ENDPOINTS is set',
        title: 'uses the default region',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: 'regional',
          AWS_REGION: undefined
        },
        calledWith: []
      },
      {
        ctx: 'when only AWS_REGION is set',
        title: 'uses the default region',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: undefined,
          AWS_REGION: 'us-west-2'
        },
        calledWith: []
      },
      {
        ctx: 'when AWS_STS_REGIONAL_ENDPOINTS is set to regional and region is legacy',
        title: 'uses the region from the environment',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: 'regional',
          AWS_REGION: 'us-west-2'
        },
        calledWith: [{ clientConfig: { region: 'us-west-2' } }]
      },
      {
        ctx: 'when AWS_STS_REGIONAL_ENDPOINTS is set to regional and region is new',
        title: 'uses the region from the environment',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: 'regional',
          AWS_REGION: 'sa-east-1'
        },
        calledWith: [{ clientConfig: { region: 'sa-east-1' } }]
      },
      {
        ctx: 'when AWS_STS_REGIONAL_ENDPOINTS is set to legacy and region is legacy',
        title: 'uses the region from the environment',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: 'legacy',
          AWS_REGION: 'us-west-2'
        },
        calledWith: []
      },
      {
        ctx: 'when AWS_STS_REGIONAL_ENDPOINTS is set to legacy and region is new',
        title: 'uses the default region',
        env: {
          AWS_STS_REGIONAL_ENDPOINTS: 'legacy',
          AWS_REGION: 'sa-east-1'
        },
        calledWith: []
      }
    ];

    for (const test of tests) {
      context(test.ctx, () => {
        let credentialProvider;
        let storedEnv;
        let calledArguments;
        let shouldSkip = false;
        let numberOfFromNodeProviderChainCalls;

        const envCheck = () => {
          const { AWS_WEB_IDENTITY_TOKEN_FILE = '' } = process.env;
          return AWS_WEB_IDENTITY_TOKEN_FILE.length === 0;
        };

        beforeEach(function () {
          shouldSkip = envCheck();
          if (shouldSkip) {
            this.skipReason = 'only relevant to AssumeRoleWithWebIdentity with SDK installed';
            return this.skip();
          }

          credentialProvider = AWSSDKCredentialProvider.awsSDK;

          storedEnv = process.env;
          if (test.env.AWS_STS_REGIONAL_ENDPOINTS === undefined) {
            delete process.env.AWS_STS_REGIONAL_ENDPOINTS;
          } else {
            process.env.AWS_STS_REGIONAL_ENDPOINTS = test.env.AWS_STS_REGIONAL_ENDPOINTS;
          }
          if (test.env.AWS_REGION === undefined) {
            delete process.env.AWS_REGION;
          } else {
            process.env.AWS_REGION = test.env.AWS_REGION;
          }

          numberOfFromNodeProviderChainCalls = 0;

          // @ts-expect-error We intentionally access a protected variable.
          AWSSDKCredentialProvider._awsSDK = {
            fromNodeProviderChain(...args) {
              calledArguments = args;
              numberOfFromNodeProviderChainCalls += 1;
              return credentialProvider.fromNodeProviderChain(...args);
            }
          };

          client = this.configuration.newClient(process.env.MONGODB_URI);
        });

        afterEach(() => {
          if (shouldSkip) {
            return;
          }
          if (typeof storedEnv.AWS_STS_REGIONAL_ENDPOINTS === 'string') {
            process.env.AWS_STS_REGIONAL_ENDPOINTS = storedEnv.AWS_STS_REGIONAL_ENDPOINTS;
          }
          if (typeof storedEnv.AWS_STS_REGIONAL_ENDPOINTS === 'string') {
            process.env.AWS_REGION = storedEnv.AWS_REGION;
          }
          // @ts-expect-error We intentionally access a protected variable.
          AWSSDKCredentialProvider._awsSDK = credentialProvider;
          calledArguments = [];
        });

        it(test.title, async function () {
          const result = await client
            .db('aws')
            .collection('aws_test')
            .estimatedDocumentCount()
            .catch(error => error);

          expect(result).to.not.be.instanceOf(MongoServerError);
          expect(result).to.be.a('number');

          expect(calledArguments).to.deep.equal(test.calledWith);
        });

        it('fromNodeProviderChain called once', async function () {
          await client.close();
          await client.connect();
          await client
            .db('aws')
            .collection('aws_test')
            .estimatedDocumentCount()
            .catch(error => error);

          expect(numberOfFromNodeProviderChainCalls).to.be.eql(1);
        });
      });
    }
  });

  describe('AWS KMS Credential Fetching', function () {
    context('when the AWS SDK is not installed', function () {
      beforeEach(function () {
        AWSSDKCredentialProvider.awsSDK['kModuleError'] = new MongoMissingDependencyError(
          'Missing dependency @aws-sdk/credential-providers',
          {
            cause: new Error(),
            dependencyName: '@aws-sdk/credential-providers'
          }
        );
      });

      afterEach(function () {
        delete AWSSDKCredentialProvider.awsSDK['kModuleError'];
      });

      it('fetching AWS KMS credentials throws an error', async function () {
        const result = await refreshKMSCredentials({ aws: {} }).catch(e => e);

        expect(result).to.be.instanceof(MongoAWSError);
        expect(result.message).to.match(/credential-providers/);
      });
    });

    context('when the AWS SDK is installed', function () {
      context('when a credential provider is not provided', function () {
        it('KMS credentials are successfully fetched.', async function () {
          const { aws } = await refreshKMSCredentials({ aws: {} });

          expect(aws).to.have.property('accessKeyId');
          expect(aws).to.have.property('secretAccessKey');
        });
      });

      context('when a credential provider is provided', function () {
        let credentialProvider;
        let providerCount = 0;

        beforeEach(function () {
          const provider = AWSSDKCredentialProvider.awsSDK;
          credentialProvider = async () => {
            providerCount++;
            return await provider.fromNodeProviderChain().apply();
          };
        });

        it('KMS credentials are successfully fetched.', async function () {
          const { aws } = await refreshKMSCredentials({ aws: {} }, { aws: credentialProvider });

          expect(aws).to.have.property('accessKeyId');
          expect(aws).to.have.property('secretAccessKey');
          expect(providerCount).to.be.greaterThan(0);
        });
      });

      it('does not return any extra keys for the `aws` credential provider', async function () {
        const { aws } = await refreshKMSCredentials({ aws: {} });

        const keys = new Set(Object.keys(aws ?? {}));
        const allowedKeys = ['accessKeyId', 'secretAccessKey', 'sessionToken'];

        expect(
          Array.from(setDifference(keys, allowedKeys)),
          'received an unexpected key in the response refreshing KMS credentials'
        ).to.deep.equal([]);
      });
    });
  });
});
