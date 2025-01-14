import * as process from 'node:process';

import { expect } from 'chai';
import * as http from 'http';
import { performance } from 'perf_hooks';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { refreshKMSCredentials } from '../../../src/client-side-encryption/providers';
import {
  AWSTemporaryCredentialProvider,
  type CommandOptions,
  Connection,
  type Document,
  MongoAWSError,
  type MongoClient,
  MongoDBAWS,
  type MongoDBNamespace,
  type MongoDBResponseConstructor,
  MongoError,
  MongoMissingCredentialsError,
  MongoServerError,
  setDifference
} from '../../mongodb';

const isMongoDBAWSAuthEnvironment = (process.env.MONGODB_URI ?? '').includes('MONGODB-AWS');

describe('MONGODB-AWS', function () {
  let awsSdkPresent;
  let client: MongoClient;

  beforeEach(function () {
    if (!isMongoDBAWSAuthEnvironment) {
      this.currentTest.skipReason = 'requires MONGODB_URI to contain MONGODB-AWS auth mechanism';
      return this.skip();
    }

    const { MONGODB_AWS_SDK = 'unset' } = process.env;
    expect(
      ['true', 'false'],
      `Always inform the AWS tests if they run with or without the SDK (MONGODB_AWS_SDK=${MONGODB_AWS_SDK})`
    ).to.include(MONGODB_AWS_SDK);

    awsSdkPresent = AWSTemporaryCredentialProvider.isAWSSDKInstalled;
    expect(
      awsSdkPresent,
      MONGODB_AWS_SDK === 'true'
        ? 'expected aws sdk to be installed'
        : 'expected aws sdk to not be installed'
    ).to.be[MONGODB_AWS_SDK];
  });

  afterEach(async () => {
    await client?.close();
  });

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
        if (command.saslStart != null || command.saslContinue != null) {
          console.log(command);
        }

        const result = await commandStub.wrappedMethod.call(
          this,
          ns,
          command,
          options,
          responseType
        );

        if (command.saslStart != null) {
          // Modify the result to check if the saslContinue uses it
          result.conversationId = 999;
          saslStartResult = { ...result };
        }
        if (command.saslContinue != null) {
          saslContinue = { ...command };
        }

        return result;
      });
    });

    afterEach(function () {
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
      expect(err).to.be.instanceof(MongoError);

      expect(saslStartResult).to.not.be.undefined;
      expect(saslContinue).to.not.be.undefined;

      expect(saslStartResult).to.have.property('conversationId', 999);

      expect(saslContinue).to.have.property('conversationId').equal(saslStartResult.conversationId);
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
    const provider = client.s.authProviders.getOrCreateProvider('MONGODB-AWS');
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
          return (
            AWS_WEB_IDENTITY_TOKEN_FILE.length === 0 ||
            !AWSTemporaryCredentialProvider.isAWSSDKInstalled
          );
        };

        beforeEach(function () {
          shouldSkip = envCheck();
          if (shouldSkip) {
            this.skipReason = 'only relevant to AssumeRoleWithWebIdentity with SDK installed';
            return this.skip();
          }

          // @ts-expect-error We intentionally access a protected variable.
          credentialProvider = AWSTemporaryCredentialProvider.awsSDK;

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
          AWSTemporaryCredentialProvider._awsSDK = {
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
          AWSTemporaryCredentialProvider._awsSDK = credentialProvider;
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
});

describe('AWS KMS Credential Fetching', function () {
  context('when the AWS SDK is not installed', function () {
    beforeEach(function () {
      this.currentTest.skipReason = !isMongoDBAWSAuthEnvironment
        ? 'Test must run in an AWS auth testing environment'
        : AWSTemporaryCredentialProvider.isAWSSDKInstalled
          ? 'This test must run in an environment where the AWS SDK is not installed.'
          : undefined;
      this.currentTest?.skipReason && this.skip();
    });
    it('fetching AWS KMS credentials throws an error', async function () {
      const error = await refreshKMSCredentials({ aws: {} }).catch(e => e);
      expect(error).to.be.instanceOf(MongoAWSError);
    });
  });

  context('when the AWS SDK is installed', function () {
    beforeEach(function () {
      this.currentTest.skipReason = !isMongoDBAWSAuthEnvironment
        ? 'Test must run in an AWS auth testing environment'
        : !AWSTemporaryCredentialProvider.isAWSSDKInstalled
          ? 'This test must run in an environment where the AWS SDK is installed.'
          : undefined;
      this.currentTest?.skipReason && this.skip();
    });
    it('KMS credentials are successfully fetched.', async function () {
      const { aws } = await refreshKMSCredentials({ aws: {} });

      expect(aws).to.have.property('accessKeyId');
      expect(aws).to.have.property('secretAccessKey');
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
