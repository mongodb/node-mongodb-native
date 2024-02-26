import * as process from 'node:process';

import { expect } from 'chai';
import * as http from 'http';
import { performance } from 'perf_hooks';
import * as sinon from 'sinon';

import { MongoAWSError, type MongoClient, MongoDBAWS, MongoServerError } from '../../mongodb';

function awsSdk() {
  try {
    return require('@aws-sdk/credential-providers');
  } catch {
    return null;
  }
}

describe('MONGODB-AWS', function () {
  let awsSdkPresent;
  let client: MongoClient;

  beforeEach(function () {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI || MONGODB_URI.indexOf('MONGODB-AWS') === -1) {
      this.currentTest.skipReason = 'requires MONGODB_URI to contain MONGODB-AWS auth mechanism';
      return this.skip();
    }

    const { MONGODB_AWS_SDK = 'unset' } = process.env;
    expect(
      ['true', 'false'],
      `Always inform the AWS tests if they run with or without the SDK (MONGODB_AWS_SDK=${MONGODB_AWS_SDK})`
    ).to.include(MONGODB_AWS_SDK);

    awsSdkPresent = !!awsSdk();
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

  it('should allow empty string in authMechanismProperties.AWS_SESSION_TOKEN to override AWS_SESSION_TOKEN environment variable', function () {
    client = this.configuration.newClient(this.configuration.url(), {
      authMechanismProperties: { AWS_SESSION_TOKEN: '' }
    });
    expect(client)
      .to.have.nested.property('options.credentials.mechanismProperties.AWS_SESSION_TOKEN')
      .that.equals('');
  });

  it('should not throw an exception when aws token is missing', async function () {
    client = this.configuration.newClient(process.env.MONGODB_URI, {
      authMechanismProperties: { AWS_SESSION_TOKEN: '' }
    });
    const result = await client
      .db('aws')
      .collection('aws_test')
      .estimatedDocumentCount()
      .catch(error => error);

    expect(result).to.not.be.instanceOf(MongoServerError);
    expect(result).to.be.a('number');
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
          credentialProvider = awsSdk();
          return AWS_WEB_IDENTITY_TOKEN_FILE.length === 0 || credentialProvider == null;
        };

        beforeEach(function () {
          shouldSkip = envCheck();
          if (shouldSkip) {
            this.skipReason = 'only relevant to AssumeRoleWithWebIdentity with SDK installed';
            return this.skip();
          }

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

          MongoDBAWS.credentialProvider = {
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
          MongoDBAWS.credentialProvider = credentialProvider;
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
