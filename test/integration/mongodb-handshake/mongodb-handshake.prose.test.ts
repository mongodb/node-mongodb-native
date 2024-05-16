import { expect } from 'chai';

import { getFAASEnv, type MongoClient } from '../../mongodb';

describe('Handshake Prose Tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });
  type EnvironmentVariables = Array<[string, string]>;
  const tests: Array<{
    context: string;
    expectedProvider: string | undefined;
    env: EnvironmentVariables;
  }> = [
    {
      context: '1. Valid AWS',
      expectedProvider: 'aws.lambda',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['AWS_REGION', 'us-east-2'],
        ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '1024']
      ]
    },
    {
      context: '2. Valid Azure',
      expectedProvider: 'azure.func',
      env: [['FUNCTIONS_WORKER_RUNTIME', 'node']]
    },
    {
      context: '3. Valid GCP',
      expectedProvider: 'gcp.func',
      env: [
        ['K_SERVICE', 'servicename'],
        ['FUNCTION_MEMORY_MB', '1024'],
        ['FUNCTION_TIMEOUT_SEC', '60'],
        ['FUNCTION_REGION', 'us-central1']
      ]
    },
    {
      context: '4. Valid Vercel',
      expectedProvider: 'vercel',
      env: [
        ['VERCEL', '1'],
        ['VERCEL_REGION', 'cdg1']
      ]
    },
    {
      expectedProvider: undefined,
      context: '5. Invalid - multiple providers',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['FUNCTIONS_WORKER_RUNTIME', 'node']
      ]
    },
    {
      expectedProvider: 'aws.lambda',
      context: '6. Invalid - long string',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['AWS_REGION', 'a'.repeat(1024)]
      ]
    },
    {
      expectedProvider: 'aws.lambda',
      context: '7. Invalid - wrong types',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'big']
      ]
    },
    {
      expectedProvider: undefined,
      context: '8. Invalid - AWS_EXECUTION_ENV does not start with "AWS_Lambda_"',
      env: [['AWS_EXECUTION_ENV', 'EC2']]
    }
  ];
  for (const { context: name, env, expectedProvider } of tests) {
    describe(name, function () {
      before(() => {
        for (const [key, value] of env) {
          process.env[key] = value;
        }
      });

      after(() => {
        for (const [key] of env) {
          delete process.env[key];
        }
      });

      it(`metadata confirmation test for ${name}`, function () {
        expect(getFAASEnv()?.get('name')).to.equal(
          expectedProvider,
          'determined the wrong cloud provider'
        );
      });

      it('runs a hello successfully', async function () {
        client = this.configuration.newClient({
          // if the handshake is not truncated, the `hello`s fail and the client does
          // not connect.  Lowering the server selection timeout causes the tests
          // to fail more quickly in that scenario.
          serverSelectionTimeoutMS: 3000
        });
        await client.connect();
      });
    });
  }
});
