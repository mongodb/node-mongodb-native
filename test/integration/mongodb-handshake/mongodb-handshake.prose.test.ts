import { expect } from 'chai';

import { determineCloudProvider, FAASProvider, MongoClient } from '../../mongodb';

context('FAAS Environment Prose Tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });

  type EnvironmentVariables = Array<[string, string]>;
  const tests: Array<{
    context: string;
    expectedProvider: FAASProvider;
    env: EnvironmentVariables;
  }> = [
    {
      context: '1. Valid AWS',
      expectedProvider: 'aws',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['AWS_REGION', 'us-east-2'],
        ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '1024']
      ]
    },
    {
      context: '2. Valid Azure',
      expectedProvider: 'azure',
      env: [['FUNCTIONS_WORKER_RUNTIME', 'node']]
    },
    {
      context: '3. Valid GCP',
      expectedProvider: 'gcp',
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
        ['VERCEL_URL', '*.vercel.app'],
        ['VERCEL_REGION', 'cdg1']
      ]
    },
    {
      expectedProvider: 'none',
      context: '5. Invalid - multiple providers',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['FUNCTIONS_WORKER_RUNTIME', 'node']
      ]
    },
    {
      expectedProvider: 'aws',
      context: '6. Invalid - long string',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['AWS_REGION', 'a'.repeat(1024)]
      ]
    },
    {
      expectedProvider: 'aws',
      context: '7. Invalid - wrong types',
      env: [
        ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
        ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'big']
      ]
    }
  ];

  for (const { context: name, env, expectedProvider } of tests) {
    context(name, function () {
      before(() => {
        for (const [key, value] of env) {
          process.env[key] = value;
        }
      });
      after(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [key, _] of env) {
          delete process.env[key];
        }
      });

      before(`metadata confirmation test for ${name}`, function () {
        expect(determineCloudProvider()).to.equal(
          expectedProvider,
          'determined the wrong cloud provider'
        );
      });

      it('runs a hello successfully', async function () {
        client = this.configuration.newClient({ serverSelectionTimeoutMS: 3000 });
        await client.connect();
      });
    });
  }
});
