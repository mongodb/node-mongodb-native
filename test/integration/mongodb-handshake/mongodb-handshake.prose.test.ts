import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Connection,
  getFAASEnv,
  Int32,
  LEGACY_HELLO_COMMAND,
  type MongoClient
} from '../../mongodb';
import { sleep } from '../../tools/utils';

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
      sinon
        .stub(Connection.prototype, 'command')
        .callsFake(async function (ns, cmd, options, responseType) {
          // @ts-expect-error: sinon will place wrappedMethod there
          const command = Connection.prototype.command.wrappedMethod.bind(this);
          if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
            return stub();
          }
          return command(ns, cmd, options, responseType);

          async function stub() {
            stubCalled = true;
            const response = await command(ns, cmd, options, responseType);
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
    sinon.restore();
  });

  describe('Test 1: Test that the driver updates metadata', function () {
    let initialClientMetadata;
    let updatedClientMetadata;

    const tests = [
      { testCase: 1, name: 'framework', version: '2.0', platform: 'Framework Platform' },
      { testCase: 2, name: 'framework', version: '2.0' },
      { testCase: 3, name: 'framework', platform: 'Framework Platform' },
      { testCase: 4, name: 'framework' }
    ];

    for (const { testCase, name, version, platform } of tests) {
      context(`Case: ${testCase}`, function () {
        // 1. Create a `MongoClient` instance with the following:
        //     - `maxIdleTimeMS` set to `1ms`
        //     - Wrapping library metadata:
        //         | Field    | Value            |
        //         | -------- | ---------------- |
        //         | name     | library          |
        //         | version  | 1.2              |
        //         | platform | Library Platform |
        // 2. Send a `ping` command to the server and verify that the command succeeds.
        // 3. Save intercepted `client` document as `initialClientMetadata`.
        // 4. Wait 5ms for the connection to become idle.
        beforeEach(async function () {
          client = this.configuration.newClient(
            {},
            {
              maxIdleTimeMS: 1,
              driverInfo: { name: 'library', version: '1.2', platform: 'Library Platform' }
            }
          );

          sinon
            .stub(Connection.prototype, 'command')
            .callsFake(async function (ns, cmd, options, responseType) {
              // @ts-expect-error: sinon will place wrappedMethod on the command method.
              const command = Connection.prototype.command.wrappedMethod.bind(this);

              if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
                if (!initialClientMetadata) {
                  initialClientMetadata = cmd.client;
                } else {
                  updatedClientMetadata = cmd.client;
                }
              }
              return command(ns, cmd, options, responseType);
            });

          await client.db('test').command({ ping: 1 });
          await sleep(5);
        });

        it('appends the metadata', async function () {
          // 1. Append the `DriverInfoOptions` from the selected test case to the `MongoClient` metadata.
          // 2. Send a `ping` command to the server and verify:
          // - The command succeeds.
          // - The framework metadata is appended to the existing `DriverInfoOptions` in the `client.driver` fields of the `hello`
          // command, with values separated by a pipe `|`.
          client.appendMetadata({ name, version, platform });
          await client.db('test').command({ ping: 1 });

          // Since we have our own driver metadata getting added, we really want to just
          // assert that the last driver info values are appended at the end.
          expect(updatedClientMetadata.driver.name).to.match(/^.*\|framework$/);
          expect(updatedClientMetadata.driver.version).to.match(
            new RegExp(`^.*\\|${version ? version : '1.2'}$`)
          );
          expect(updatedClientMetadata.platform).to.match(
            new RegExp(`^.*\\|${platform ? platform : 'Library Platform'}$`)
          );
          // - All other subfields in the client document remain unchanged from initialClientMetadata.
          // (Note os is the only one getting set in these tests)
          expect(updatedClientMetadata.os).to.deep.equal(initialClientMetadata.os);
        });
      });
    }
  });

  describe('Test 2: Multiple Successive Metadata Updates', function () {
    let initialClientMetadata;
    let updatedClientMetadata;

    const tests = [
      { testCase: 1, name: 'framework', version: '2.0', platform: 'Framework Platform' },
      { testCase: 2, name: 'framework', version: '2.0' },
      { testCase: 3, name: 'framework', platform: 'Framework Platform' },
      { testCase: 4, name: 'framework' }
    ];

    for (const { testCase, name, version, platform } of tests) {
      context(`Case: ${testCase}`, function () {
        // 1. Create a `MongoClient` instance with the following:
        //     - `maxIdleTimeMS` set to `1ms`
        // 2. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
        //         | Field    | Value            |
        //         | -------- | ---------------- |
        //         | name     | library          |
        //         | version  | 1.2              |
        //         | platform | Library Platform |
        // 3. Send a `ping` command to the server and verify that the command succeeds.
        // 4. Save intercepted `client` document as `updatedClientMetadata`.
        // 5. Wait 5ms for the connection to become idle.
        beforeEach(async function () {
          client = this.configuration.newClient({}, { maxIdleTimeMS: 1 });
          client.appendMetadata({ name: 'library', version: '1.2', platform: 'Library Platform' });

          sinon
            .stub(Connection.prototype, 'command')
            .callsFake(async function (ns, cmd, options, responseType) {
              // @ts-expect-error: sinon will place wrappedMethod on the command method.
              const command = Connection.prototype.command.wrappedMethod.bind(this);

              if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
                if (!initialClientMetadata) {
                  initialClientMetadata = cmd.client;
                } else {
                  updatedClientMetadata = cmd.client;
                }
              }
              return command(ns, cmd, options, responseType);
            });

          await client.db('test').command({ ping: 1 });
          await sleep(5);
        });

        it('appends the metadata', async function () {
          // 1. Append the `DriverInfoOptions` from the selected test case to the `MongoClient` metadata.
          // 2. Send a `ping` command to the server and verify:
          // - The command succeeds.
          // - The framework metadata is appended to the existing `DriverInfoOptions` in the `client.driver` fields of the `hello`
          // command, with values separated by a pipe `|`.
          client.appendMetadata({ name, version, platform });
          await client.db('test').command({ ping: 1 });

          // Since we have our own driver metadata getting added, we really want to just
          // assert that the last driver info values are appended at the end.
          expect(updatedClientMetadata.driver.name).to.match(/^.*\|framework$/);
          expect(updatedClientMetadata.driver.version).to.match(
            new RegExp(`^.*\\|${version ? version : '1.2'}$`)
          );
          expect(updatedClientMetadata.platform).to.match(
            new RegExp(`^.*\\|${platform ? platform : 'Library Platform'}$`)
          );
          // - All other subfields in the client document remain unchanged from initialClientMetadata.
          // (Note os is the only one getting set in these tests)
          expect(updatedClientMetadata.os).to.deep.equal(initialClientMetadata.os);
        });

        it('does not append duplicate metadata for the same name and version', async function () {
          client.appendMetadata({ name, version, platform });
          client.appendMetadata({ name, version, platform });
          await client.db('test').command({ ping: 1 });
          expect(updatedClientMetadata.driver.name).to.not.contain('|framework|framework');
        });

        it('appends metadata when the version differs', async function () {
          client.appendMetadata({ name, version: '0.0', platform });
          await client.db('test').command({ ping: 1 });
          expect(updatedClientMetadata.driver.name).to.not.contain('0.0');
        });
      });
    }
  });
});
