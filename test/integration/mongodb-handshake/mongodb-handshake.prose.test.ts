import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Connection,
  getFAASEnv,
  Int32,
  LEGACY_HELLO_COMMAND,
  type MongoClient
} from '../../mongodb';

type EnvironmentVariables = Array<[string, string]>;

function stubEnv(env: EnvironmentVariables) {
  let cachedEnv: NodeJS.ProcessEnv;
  before(function () {
    cachedEnv = process.env;
    process.env = {
      ...process.env,
      ...Object.fromEntries(env)
    };
  });

  after(function () {
    process.env = cachedEnv;
  });
}

describe('Handshake Prose Tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });

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
    context(name, function () {
      stubEnv(env);

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

  context('Test 9: Valid container and FaaS provider', function () {
    stubEnv([
      ['AWS_EXECUTION_ENV', 'AWS_Lambda_java8'],
      ['AWS_REGION', 'us-east-2'],
      ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '1024'],
      ['KUBERNETES_SERVICE_HOST', '1']
    ]);

    it('runs a hello successfully', async function () {
      client = this.configuration.newClient({
        // if the handshake is not truncated, the `hello`s fail and the client does
        // not connect.  Lowering the server selection timeout causes the tests
        // to fail more quickly in that scenario.
        serverSelectionTimeoutMS: 3000
      });
      await client.connect();
    });

    it('includes both container and FAAS provider information in the client metadata', async function () {
      client = this.configuration.newClient();
      await client.connect();
      expect(client.topology?.s.options.extendedMetadata).to.exist;
      const { env } = await client.topology.s.options.extendedMetadata;

      expect(env).to.deep.equal({
        region: 'us-east-2',
        name: 'aws.lambda',
        memory_mb: new Int32(1024),
        container: { orchestrator: 'kubernetes' }
      });
    });
  });

  context(`Test 2: Test that the driver accepts an arbitrary auth mechanism`, function () {
    let stubCalled = false;
    beforeEach(() => {
      // Mock the server response in a way that saslSupportedMechs array in the hello command response contains an arbitrary string.
      sinon.stub(Connection.prototype, 'command').callsFake(async function (ns, cmd, options) {
        // @ts-expect-error: sinon will place wrappedMethod there
        const command = Connection.prototype.command.wrappedMethod.bind(this);
        if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
          return stub();
        }
        return command(ns, cmd, options);

        async function stub() {
          stubCalled = true;
          const response = await command(ns, cmd, options);
          return {
            ...response,
            saslSupportedMechs: [...(response.saslSupportedMechs ?? []), 'random string']
          };
        }
      });
    });

    afterEach(() => sinon.restore());

    it('no error is thrown', { requires: { auth: 'enabled' } }, async function () {
      // Create and connect a Connection object that connects to the server that returns the mocked response.
      // Assert that no error is raised.
      client = this.configuration.newClient();
      await client.connect();
      await client.db('foo').collection('bar').insertOne({ name: 'john doe' });

      expect(stubCalled).to.be.true;
      await client.close();
    });
  });
});

describe('Client Metadata Update Prose Tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });
});
