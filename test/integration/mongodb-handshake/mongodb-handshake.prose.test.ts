import { expect } from 'chai';
import * as process from 'process';
import * as sinon from 'sinon';

import { type ClientMetadata, type DriverInfo, Int32, type MongoClient } from '../../mongodb';
import { Connection, getFAASEnv, isDriverInfoEqual, LEGACY_HELLO_COMMAND } from '../../mongodb';
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
      expect(client.topology?.s.options.metadata).to.exist;
      const { env } = await client.topology.s.options.metadata;

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
      });
    }
  });

  describe('Test 3: Multiple Successive Metadata Updates with Duplicate Data', function () {
    const originalDriverInfo = { name: 'library', version: '1.2', platform: 'Library Platform' };
    let initialClientMetadata: ClientMetadata;
    let updatedClientMetadata: ClientMetadata;

    let client: MongoClient;

    // | Case | Name      | Version | Platform           |
    // | ---- | --------- | ------- | ------------------ |
    // | 1    | library   | 1.2     | Library Platform   |
    // | 2    | framework | 1.2     | Library Platform   |
    // | 3    | library   | 2.0     | Library Platform   |
    // | 4    | library   | 1.2     | Framework Platform |
    // | 5    | framework | 2.0     | Library Platform   |
    // | 6    | framework | 1.2     | Framework Platform |
    // | 7    | library   | 2.0     | Framework Platform |
    const tests = [
      { testCase: 1, name: 'library', version: '1.2', platform: 'Library Platform' },
      { testCase: 2, name: 'framework', version: '1.2', platform: 'Library Platform' },
      { testCase: 3, name: 'library', version: '2.0', platform: 'Library Platform' },
      { testCase: 4, name: 'library', version: '1.2', platform: 'Framework Platform' },
      { testCase: 5, name: 'framework', version: '2.0', platform: 'Library Platform' },
      { testCase: 6, name: 'framework', version: '1.2', platform: 'Framework Platform' },
      { testCase: 7, name: 'library', version: '2.0', platform: 'Framework Platform' }
    ];

    for (const { testCase, ...driverInfo } of tests) {
      context(`Case ${testCase}: ${JSON.stringify(driverInfo)}`, function () {
        // 1. Create a `MongoClient` instance with:
        //     - `maxIdleTimeMS` set to `1ms`
        // 2. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
        //     | Field    | Value            |
        //     | -------- | ---------------- |
        //     | name     | library          |
        //     | version  | 1.2              |
        //     | platform | Library Platform |
        // 3. Send a `ping` command to the server and verify that the command succeeds.
        // 4. Save intercepted `client` document as `updatedClientMetadata`.
        // 5. Wait 5ms for the connection to become idle.
        beforeEach(async function () {
          client = this.configuration.newClient(this.configuration.url(), {
            maxIdleTimeMS: 1,
            serverApi: this.configuration.serverApi
          });
          client.appendMetadata(originalDriverInfo);

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

        afterEach(async function () {
          await client.close();
        });

        it('metadata is updated correctly, if necessary', async function () {
          // 1. Append the `DriverInfoOptions` from the selected test case to the `MongoClient` metadata.
          client.appendMetadata(driverInfo);

          // 2. Send a `ping` command to the server and verify:
          //     - The command succeeds.
          await client.db('test').command({ ping: 1 });

          // - The framework metadata is appended to the existing `DriverInfoOptions` in the `client.driver` fields of the `hello`
          //     command, with values separated by a pipe `|`.  To simplify assertions in these tests, strip out the default driver info
          //     that is automatically added by the driver (ex: `metadata.name.split('|').slice(1).join('|')`).

          // - If the test case's DriverInfo is identical to the driver info from setup step 2 (test case 1):
          //     - Assert metadata.name is equal to `library`
          //     - Assert metadata.version is equal to `1.2`
          //     - Assert metadata.platform is equal to `LibraryPlatform`
          // - Otherwise:
          //     - Assert metadata.name is equal to `library|<name>`
          //     - Assert metadata.version is equal to `1.2|<version>`
          //     - Assert metadata.platform is equal to `LibraryPlatform|<platform>`
          const { driver, platform, ...updatedRest } = updatedClientMetadata;
          const { driver: _driver, platform: _platform, ...originalRest } = initialClientMetadata;

          const extractParts = (s: string) => s.split('|').slice(1).join('|');

          const actual = {
            name: extractParts(driver.name),
            version: extractParts(driver.version),
            platform: extractParts(platform)
          };

          const expected = isDriverInfoEqual(driverInfo, originalDriverInfo)
            ? originalDriverInfo
            : {
                name: `library|${driverInfo.name}`,
                platform: `Library Platform|${driverInfo.platform}`,
                version: `1.2|${driverInfo.version}`
              };

          expect(actual).to.deep.equal(expected);

          // All other subfields in the `client` document remain unchanged from `updatedClientMetadata`.
          expect(updatedRest).to.deep.equal(originalRest);
        });
      });
    }
  });

  describe('Test 4: Multiple Metadata Updates with Duplicate Data', function () {
    let initialClientMetadata: ClientMetadata;
    let updatedClientMetadata: ClientMetadata;
    let client: MongoClient;

    afterEach(async function () {
      await client.close();
    });

    it('does not append duplicate metdata', async function () {
      // 1. Create a `MongoClient` instance with:
      //     - `maxIdleTimeMS` set to `1ms`

      client = this.configuration.newClient(
        {},
        {
          maxIdleTimeMS: 1,
          serverApi: this.configuration.serverApi
        }
      );
      // 2. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
      //   | Field    | Value            |
      //   | -------- | ---------------- |
      //   | name     | library          |
      //   | version  | 1.2              |
      //   | platform | Library Platform |

      client.appendMetadata({
        name: 'library',
        version: '1.2',
        platform: 'Library Platform'
      });

      // 3. Send a `ping` command to the server and verify that the command succeeds.
      await client.db('test').command({ ping: 1 });

      // 4. Wait 5ms for the connection to become idle.
      await sleep(5);

      // 5. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
      //   | Field    | Value              |
      //   | -------- | ------------------ |
      //   | name     | framework          |
      //   | version  | 2.0                |
      //   | platform | Framework Platform |
      client.appendMetadata({
        name: 'framework',
        version: '2.0',
        platform: 'Framework Platform'
      });

      // 6. Send a `ping` command to the server and verify that the command succeeds.
      // 7. Save intercepted `client` document as `clientMetadata`.
      // 11. Save intercepted `client` document as `updatedClientMetadata`.
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

      // 8. Wait 5ms for the connection to become idle.
      await sleep(5);

      // 9. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
      //     | Field    | Value            |
      //     | -------- | ---------------- |
      //     | name     | library          |
      //     | version  | 1.2              |
      //     | platform | Library Platform |
      client.appendMetadata({
        name: 'library',
        version: '1.2',
        platform: 'Library Platform'
      });

      // 10. Send a `ping` command to the server and verify that the command succeeds.
      await client.db('test').command({ ping: 1 });

      // 12. Assert that `clientMetadata` is identical to `updatedClientMetadata`.
      expect(updatedClientMetadata).to.deep.equal(initialClientMetadata);
    });
  });

  describe('Test 5: Metadata is not appended if identical to initial metadata', function () {
    let initialClientMetadata: ClientMetadata;
    let updatedClientMetadata: ClientMetadata;
    let client: MongoClient;

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
      // 1. Create a `MongoClient` instance with:
      //     - `maxIdleTimeMS` set to `1ms`
      //     - `driverInfo` set to the following:
      //     | Field    | Value            |
      //     | -------- | ---------------- |
      //     | name     | library          |
      //     | version  | 1.2              |
      //     | platform | Library Platform |
      client = this.configuration.newClient(this.configuration.url(), {
        maxIdleTimeMS: 1,
        serverApi: this.configuration.serverApi,
        driverInfo: { name: 'library', version: '1.2', platform: 'Library Platform' }
      });

      // 2. Send a `ping` command to the server and verify that the command succeeds.
      // 3. Save intercepted `client` document as `clientMetadata`.
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

      // 4. Wait 5ms for the connection to become idle.
      await sleep(5);
    });

    afterEach(async function () {
      await client.close();
    });

    it('does not append the duplicate metadata', async function () {
      // 5. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
      //     | Field    | Value            |
      //     | -------- | ---------------- |
      //     | name     | library          |
      //     | version  | 1.2              |
      //     | platform | Library Platform |
      client.appendMetadata({ name: 'library', version: '1.2', platform: 'Library Platform' });

      // 6. Send a `ping` command to the server and verify that the command succeeds.
      // 7. Save intercepted `client` document as `updatedClientMetadata`.
      await client.db('test').command({ ping: 1 });

      // 8. Assert that `clientMetadata` is identical to `updatedClientMetadata`.
      expect(initialClientMetadata).to.deep.equal(updatedClientMetadata);
    });
  });

  describe('Test 6: Metadata is not appended if identical to initial metadata (separated by non-identical metadata)', function () {
    let clientMetadata: ClientMetadata;
    let updatedClientMetadata: ClientMetadata;
    let client: MongoClient;

    afterEach(async function () {
      await client.close();
    });

    it('does not append duplicate metdaata', async function () {
      // 1. Create a `MongoClient` instance with:
      //     - `maxIdleTimeMS` set to `1ms`
      //     - `driverInfo` set to the following:
      //     | Field    | Value            |
      //     | -------- | ---------------- |
      //     | name     | library          |
      //     | version  | 1.2              |
      //     | platform | Library Platform |

      client = this.configuration.newClient(this.configuration.url(), {
        maxIdleTimeMS: 1,
        driverInfo: {
          name: 'library',
          version: '1.2',
          platform: 'Library Platform'
        },
        serverApi: this.configuration.serverApi
      });

      // 2. Send a `ping` command to the server and verify that the command succeeds.
      await client.db('test').command({ ping: 1 });

      // 3. Wait 5ms for the connection to become idle.
      await sleep(5);

      // 4. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
      //   | Field    | Value              |
      //   | -------- | ------------------ |
      //   | name     | framework          |
      //   | version  | 2.0                |
      //   | platform | Framework Platform |
      client.appendMetadata({
        name: 'framework',
        version: '2.0',
        platform: 'Framework Platform'
      });

      // 5. Send a `ping` command to the server and verify that the command succeeds.
      // 6. Save intercepted `client` document as `clientMetadata`.
      // 10. Save intercepted `client` document as `updatedClientMetadata`.
      sinon
        .stub(Connection.prototype, 'command')
        .callsFake(async function (ns, cmd, options, responseType) {
          // @ts-expect-error: sinon will place wrappedMethod on the command method.
          const command = Connection.prototype.command.wrappedMethod.bind(this);

          if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
            if (!clientMetadata) {
              clientMetadata = cmd.client;
            } else {
              updatedClientMetadata = cmd.client;
            }
          }
          return command(ns, cmd, options, responseType);
        });

      await client.db('test').command({ ping: 1 });

      // 7. Wait 5ms for the connection to become idle.
      await sleep(5);

      // 8. Append the following `DriverInfoOptions` to the `MongoClient` metadata:
      //     | Field    | Value            |
      //     | -------- | ---------------- |
      //     | name     | library          |
      //     | version  | 1.2              |
      //     | platform | Library Platform |
      client.appendMetadata({
        name: 'library',
        version: '1.2',
        platform: 'Library Platform'
      });

      // 9. Send a `ping` command to the server and verify that the command succeeds.
      await client.db('test').command({ ping: 1 });

      // 11. Assert that `clientMetadata` is identical to `updatedClientMetadata`.
      expect(updatedClientMetadata).to.deep.equal(clientMetadata);
    });
  });

  describe('Test 7: Empty strings are considered unset when appending duplicate metadata', function () {
    let initialClientMetadata: ClientMetadata;
    let updatedClientMetadata: ClientMetadata;
    let client: MongoClient;

    afterEach(async function () {
      await client.close();
      initialClientMetadata = undefined;
      updatedClientMetadata = undefined;
    });

    const driverInfos: Array<{
      initial: DriverInfo;
      appended: DriverInfo;
    }> = [
      {
        initial: {
          name: undefined,
          version: '1.2',
          platform: 'Library Platform'
        },
        appended: {
          name: '',
          version: '1.2',
          platform: 'Library Platform'
        }
      },
      {
        initial: {
          name: 'library',
          version: undefined,
          platform: 'Library Platform'
        },
        appended: {
          name: 'library',
          version: '',
          platform: 'Library Platform'
        }
      },
      {
        initial: {
          name: 'library',
          version: '1.2',
          platform: undefined
        },
        appended: {
          name: 'library',
          version: '1.2',
          platform: ''
        }
      }
    ];

    for (const [metadata, index] of driverInfos.map((infos, i) => [infos, i] as const)) {
      describe(`Test ${index + 1}`, function () {
        it('does not appended duplicate metadata', async function () {
          // 1. Create a `MongoClient` instance with:
          // - `maxIdleTimeMS` set to `1ms`
          client = this.configuration.newClient(this.configuration.url(), {
            maxIdleTimeMS: 1,
            serverApi: this.configuration.serverApi
          });

          // 2. Append the `DriverInfoOptions` from the selected test case from the initial metadata section.
          client.appendMetadata(metadata.initial);

          // 3. Send a `ping` command to the server and verify that the command succeeds.
          // 4. Save intercepted `client` document as `initialClientMetadata`.
          // 8. Store the response as `updatedClientMetadata`.
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

          // 5. Wait 5ms for the connection to become idle.
          await sleep(5);

          // 6. Append the `DriverInfoOptions` from the selected test case from the appended metadata section.
          client.appendMetadata(metadata.appended);

          // 7. Send a `ping` command to the server and verify the command succeeds.
          await client.db('test').command({ ping: 1 });

          // 9. Assert that `initialClientMetadata` is identical to `updatedClientMetadata`.
          expect(updatedClientMetadata).to.deep.equal(initialClientMetadata);
        });
      });
    }
  });

  describe('Test 8: Empty strings are considered unset when appending metadata identical to initial metadata', function () {
    let initialClientMetadata: ClientMetadata;
    let updatedClientMetadata: ClientMetadata;
    let client: MongoClient;

    afterEach(async function () {
      await client.close();
      initialClientMetadata = undefined;
      updatedClientMetadata = undefined;
    });

    const driverInfos: Array<{
      initial: DriverInfo;
      appended: DriverInfo;
    }> = [
      {
        initial: {
          name: undefined,
          version: '1.2',
          platform: 'Library Platform'
        },
        appended: {
          name: '',
          version: '1.2',
          platform: 'Library Platform'
        }
      },
      {
        initial: {
          name: 'library',
          version: undefined,
          platform: 'Library Platform'
        },
        appended: {
          name: 'library',
          version: '',
          platform: 'Library Platform'
        }
      },
      {
        initial: {
          name: 'library',
          version: '1.2',
          platform: undefined
        },
        appended: {
          name: 'library',
          version: '1.2',
          platform: ''
        }
      }
    ];

    for (const [metadata, index] of driverInfos.map((infos, i) => [infos, i] as const)) {
      describe(`Test ${index + 1}`, function () {
        it('does not appended duplicate metadata', async function () {
          // 1. Create a `MongoClient` instance with:
          //   - `maxIdleTimeMS` set to `1ms`
          //   - `driverInfo` set to the `DriverInfoOptions` from the selected test case from the initial metadata section.
          client = this.configuration.newClient(this.configuration.url(), {
            maxIdleTimeMS: 1,
            serverApi: this.configuration.serverApi,
            driverInfo: metadata.initial
          });

          // 2. Send a `ping` command to the server and verify that the command succeeds.
          // 3. Save intercepted `client` document as `initialClientMetadata`.
          // 7. Store the response as `updatedClientMetadata`.
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

          // 4. Wait 5ms for the connection to become idle.
          await sleep(5);

          // 5. Append the `DriverInfoOptions` from the selected test case from the appended metadata section.
          client.appendMetadata(metadata.appended);

          // 6. Send a `ping` command to the server and verify the command succeeds.
          await client.db('test').command({ ping: 1 });

          // 8. Assert that `initialClientMetadata` is identical to `updatedClientMetadata`.
          expect(updatedClientMetadata).to.deep.equal(initialClientMetadata);
        });
      });
    }
  });
});
