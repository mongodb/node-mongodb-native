# MongoDB Node Driver Test Automation

This repo contains a test automation suite with a variety of tests. In this readme, you'll learn
about the types of tests and how to run them.

## Table of Contents

- [About the Tests](#about-the-tests)
- [Running the Tests Locally](#running-the-tests-locally)
- [Running the Tests in Evergreen](#running-the-tests-in-evergreen)
- [Using a Pre-Release Version of a Dependent Library](#using-a-pre-release-version-of-a-dependent-library)
- [Manually Testing the Driver](#manually-testing-the-driver)
- [Writing Tests](#writing-tests)
- [Testing with Special Environments](#testing-with-special-environments)

## About the Tests

All of our test automation is powered by the [Mocha test framework][mocha].

Some of the tests require a particular topology (e.g., standalone server, replica set, or sharded cluster). These tests
check the topology of the MongoDB server that is being used. If the topology does not match, the
tests will be skipped.

Below is a summary of the types of test automation in this repo.

| Type of Test            | Test Location       | About the Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | How to Run Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                    | `/test/unit`        | The unit tests test individual pieces of code, typically functions. These tests do **not** interact with a real database, so mocks are used instead. <br><br>The unit test directory mirrors the `/src` directory structure with test file names matching the source file names of the code they test.                                                                                                                                                                                          | `npm run check:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Integration             | `/test/integration` | The integration tests test that a given feature or piece of a feature is working as expected. These tests do **not** use mocks; instead, they interact with a real database. <br><br> The integration test directory follows the `test/spec` directory structure representing the different functional areas of the driver. <br><br> **Note:** The `.gitkeep` files are intentionally left to ensure that this directory structure is preserved even as the actual test files are moved around. | `npm run check:test`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Benchmark               | `/test/benchmarks`  | The benchmark tests report how long a designated set of tests take to run. They are used to measure performance.                                                                                                                                                                                                                                                                                                                                                                                | `npm run check:bench`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Specialized Environment | `/test/manual`      | The specalized environment tests are functional tests that require specialized environment setups in Evergreen. <br><br>**Note**: "manual" in the directory path does not refer to tests that should be run manually. These tests are automated. These tests have a special Evergreen configuration and run in isolation from the other tests.                                                                                                                                                  | There is no single script for running all of the specialized environment tests. Instead, you can run the appropriate script based on the specialized environment you want to use: <br>- `npm run check:atlas` to test Atlas <br>- `npm run check:adl` to test Atlas Data Lake <br>- `npm run check:ocsp` to test OCSP <br>- `npm run check:kerberos` to test Kerberos <br>- `npm run check:tls` to test TLS <br>- `npm run check:ldap` to test LDAP authorization |
| TypeScript Definition   | `/test/types`       | The TypeScript definition tests verify the type definitions are correct.                                                                                                                                                                                                                                                                                                                                                                                                                        | `npm run check:tsd`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GitHub Actions          | `/test/action`      | Tests that run as GitHub Actions such as dependency checking.                                                                                                                                                                                                                                                                                                                                                                                                                                   | Currently, only `npm run check:dependencies` but could be expanded to more in the future.                                                                                                                                                                                                                                                                                                                                                                          |
| Code Examples           | `/test/integration/node-specific/examples`    | Code examples that are also paired with tests that show they are working examples.                                                                                                                                                                                                                                                                                                                                                                                                              | Currently, `npm run check:lambda` to test the AWS Lambda example with default auth and `npm run check:lambda:aws` to test the AWS Lambda example with AWS auth.                                                                                                                                                                                                                                                                                                    |
| Explicit Resource Management           | `/test/explicit-resource-management`    | Tests that use explicit resource management with the driver's disposable resources.                                                                                                                                                                                                                                                                                                                                                                                                             | `bash .evergreen/run-resource-management-feature-integration.sh`                                                                                                                                                                                                                                                                                      |

### Spec Tests

All of the MongoDB drivers follow the same [specifications (specs)][driver-specs]. Each spec has tests associated with it. Some of the tests are prose (written, descriptive) tests, which must be implemented on a case-by-case basis by the developers on the driver teams. Other tests are written in a standardized form as YAML and converted to JSON, which can be read by the specialized spec test runners that are implemented in each driver.

The input test specifications are stored in `test/spec`.

The actual implementations of the spec tests can be unit tests or integration tests depending on the requirements, and they can be found in the corresponding test directory according to their type. Regardless of whether they are located in the `/unit` or `/integration` test directory, test files named `spec_name.spec.test` contain spec test implementations that use a standardized runner and `spec_name.prose.test` files contain prose test implementations.

## Running the Tests Locally

The easiest way to get started running the tests locally is to start a standalone server and run all of the tests.

Start a `mongod` standalone with our [cluster_setup.sh](tools/cluster_setup.sh) script:

```sh
./test/tools/cluster_setup.sh server
```

Then run the tests:

```sh
npm test
```

> **Note:** the command above will run a subset of the tests that work with the standalone server topology since the tests are being run against a standalone server.

The output will show how many tests passed, failed, and are pending. Tests that we have indicated should be skipped using `.skip()` will appear as pending in the test results. See [Mocha's documentation][mocha-skip] for more information.

In the following subsections, we'll dig into the details of running the tests.

### Testing With Authorization-Enabled

By default, the integration tests run with auth-enabled and the `cluster_setup.sh` script defaults to starting servers with auth-enabled. Tests can be run locally without auth by setting the environment
variable `AUTH` to the value of `noauth`.  This must be a two-step process of starting a server without auth-enabled and then running the tests without auth-enabled.

```shell
AUTH='noauth' ./test/tools/cluster_setup.sh <server>
AUTH='noauth' npm run check:test
```
### Testing Different MongoDB Topologies

As we mentioned earlier, the tests check the topology of the MongoDB server being used and run the tests associated with that topology. Tests that don't have a matching topology will be skipped.

In the steps above, we started a standalone server:

```sh
./test/tools/cluster_setup.sh server
```

You can use the same [cluster_setup.sh](tools/cluster_setup.sh) script to start a replica set or sharded cluster by passing the appropriate option:
```sh
./test/tools/cluster_setup.sh replica_set
```
or
```sh
./test/tools/cluster_setup.sh sharded_cluster
```
If you are running more than a standalone server, make sure your `ulimit` settings are in accordance with [MongoDB's recommendations][mongodb-ulimit]. Changing the settings on the latest versions of macOS can be tricky. See [this article][macos-ulimt] for tips. (You likely don't need to do the complicated `maxproc` steps.)

The [cluster_setup.sh](tools/cluster_setup.sh) script automatically stores the files associated with the MongoDB server in the `data` directory, which is stored at the top-level of this repository.
You can delete this directory if you want to ensure you're running a clean configuration. If you delete the directory, the associated database server will be stopped, and you will need to run [cluster_setup.sh](tools/cluster_setup.sh) again.

You can prefix `npm test` with a `MONGODB_URI` environment variable to point the tests to a specific deployment. For example, for a standalone server, you might use:

```sh
MONGODB_URI=mongodb://localhost:27017 npm test
```

For a replica set, you might use:

```sh
MONGODB_URI=mongodb://localhost:31000,localhost:31001,localhost:31002/?replicaSet=rs npm test
```

### Running Individual Tests

The easiest way to run a single test is by appending `.only()` to the test context you want to run. For example, you could update a test function to be:

```JavaScript
it.only('cool test', function() {})
```

Then, run the test using `npm run check:test` for a functional or integration test or
`npm run check:unit`
for a unit test. See [Mocha's documentation][mocha-only] for more detailed information on `.only()`.

Another way to run a single test is to use Mocha's `grep` flag. For functional or integration tests, run:
```sh
npm run check:test -- -g <test name>
```
For unit tests, run:
```sh
npm run check:unit -- -g <test name>
```
See the [Mocha documentation][mocha-grep] for information on the `grep` flag.

## Running the Tests in Evergreen

[Evergreen][evergreen-wiki] is the continuous integration (CI) system we use. Evergreen builds are automatically run whenever a pull request is created or when commits are pushed to particular branches (e.g., `main`, `4.0`, and `3.6`).

Each Evergreen build runs the test suite against a variety of build variants that include a combination of topologies, special environments, and operating systems. By default, commits in pull requests only run a subset of the build variants in order to save time and resources. To configure a build, update `.evergreen/config.yml.in` and then generate a new Evergreen config via:

```sh
node .evergreen/generate_evergreen_tasks.js
```

### Manually Kicking Off Evergreen Builds

Occasionally, you will want to manually kick off an Evergreen build in order to debug a test failure or to run tests against uncommitted changes.

#### Evergreen UI

You can use the Evergreen UI to choose to rerun a task (an entire set of test automation for a given topology and environment). Evergreen does not allow you to rerun an individual test.

#### Evergreen CLI

You can also choose to run a build against code on your local machine that you have not yet committed by running a pre-commit patch build.

##### Setup

Begin by setting up the Evergreen CLI.

1. Download and install the Evergreen CLI according to the instructions in the [Evergreen Documentation][evergreen-docs].
1. Be sure to create `evergreen.yml` as described in the documentation.
1. Add the Evergreen binary to your path.

##### Running the Build

Once you have the Evergreen CLI setup, you are ready to run a build. Keep in mind that if you want to run only a few tests, you can append `.only()` as described in the [section above on running individual tests](#running-individual-tests).

1. In a terminal, navigate to your node driver directory:

   ```sh
   cd node-mongodb-native
   ```

1. Use the Evergreen `patch` command. `-y` skips the confirmation dialog. `-u` includes uncommitted changes. `-p [project name]` specifies the Evergreen project. `--browse` opens the patch URL in your browser.

   ```sh
   evergreen patch -y -u -p mongo-node-driver-next --browse
   ```

1. In your browser, select the build variants and tasks to run.

## Using a Pre-Release Version of a Dependent Library

You may want to test the driver with a pre-release version of a dependent library (e.g., [bson][js-bson]).
Follow the steps below to do so.

1. Open [package.json](../package.json)
1. Identify the line that specifies the dependency
1. Replace the version number with the commit hash of the dependent library. For example, you could use a particular commit for the [js-bson][js-bson] project on GitHub: `"bson": "mongodb/js-bson#e29156f7438fa77c1672fd70789d7ade9ca65061"`
1. Run `npm install` to install the dependency

Now you can run the automated tests, run manual tests, or kick off an Evergreen build from your local
repository.

## Manually Testing the Driver

You may want to manually test changes you have made to the driver. The steps below will walk you through how to create a new Node project that uses your local copy of the Node driver. You can
modify the steps to work with existing Node projects.

1. Navigate to a new directory and create a new Node project by running `npm init` in a terminal and working through the interactive prompts. A new file named `package.json` will be created for you.
1. In `package.json`, create a new dependency for `mongodb` that points to your local copy of the driver. For example:
   ```JSON
   "dependencies": {
     "mongodb": "/path-to-your-copy-of-the-driver-repo/node-mongodb-native"
   }
   ```
1. Run `npm install` to install the dependency.
1. Create a new file that uses the driver to test your changes. See the [MongoDB Node.js Quick Start Repo][node-quick-start] for example scripts you can use.

> **Note:** When making driver changes, you will need to run `npm run build:ts` with each change in order for it to take effect.

## Writing Tests

> TODO: flesh this section out more

### Framework

We use `mocha` to construct our test suites and `chai` to assert expectations.

Some special notes on how mocha works with our testing setup:

- `before` hooks will run even if a test is skipped by the environment it runs on.
  - So, for example, if your `before` hook does logic that can only run on a certain server version you can't depend on your test block metadata to filter for that.
- `after` hooks cannot be used to clean up clients because the session leak checker currently runs in an `afterEach` hook, which would be executed before any `after` hook has a chance to run

### Skipping Tests

Not all tests are able to run in all environments and some are unable to run at all due to known bugs.

When marking a test to be skipped, be sure to include a `skipReason`, so that it can be added to the test run printout.

```javascript
// skipping an individual test
it.skip('should not run', () => { /* test */ }).skipReason = 'TODO: NODE-1234';

// skipping a set of tests via beforeEach
beforeEach(() => {
   if (/* some condition */) {
      this.currentTest.skipReason = 'requires <run condition> to run';
      this.skip();
   }
});
```

## Running Benchmarks

```sh
npm run check:bench
```

Refer to the `run-spec-benchmark-tests-node-server` task for Node.js version, MongoDB server version, and platform that we run benchmarks against in CI.

The server is run in standalone mode and the server versions are aliased by this script: https://github.com/mongodb-labs/drivers-evergreen-tools/blob/5048cca80e9ca62642409de2d401058bbd7057fa/.evergreen/mongodl.py#L58 check the latest version to see what alias the driver is running against.

The host used is described here: https://spruce.mongodb.com/distro/rhel90-dbx-perf-large/settings/general (Auth required to view)

It is best to try reproductions against as similar a deployment as possible to isolate regressions.

### Configuration

The benchmarks can be directed to test different settings and driver versions.

The following are environment variables and how the benchmark runner uses them:

- `MONGODB_DRIVER_PATH` - if set MUST be set to the directory a driver version is in, usually another clone of the driver checked out to a different revision.
- `MONGODB_CLIENT_OPTIONS` - if set MUST be a JSON string that will be parsed and passed as the second argument to the MongoClient constructor.
- `MONGODB_URI` - if set MUST be a valid MongoDB connection string and it will be used as the host the benchmarks will run against.

It may be desirable to test how changes to `BSON` impact the driver's performance.

To do this:
- clone the changed version of BSON
  - run the build script for that repo (usually done by `npm install` for you)
- run `npm link`
- over in the driver repo run `npm link bson`

When you run the benchmarks verify that the BSON version has been picked by the version references that are printed out:

```md
- cpu: Apple M1 Max
- cores: 10
- arch: arm64
- os: darwin (23.6.0)
- ram: 32GB
- node: v22.6.0
- driver: 6.11.0 (df3ea32a9): .../mongodb
  - options {}
- bson: 6.10.1 (installed from npm): (.../mongodb/node_modules/bson)
```

## Testing with Special Environments

In order to test some features, you will need to generate and set a specialized group of environment variables. The subsections below will walk you through how to generate and set the environment variables for these features.

We recommend using a different terminal for each specialized environment to avoid the environment variables from one specialized environment impacting the test runs for another specialized environment.

Before you begin any of the subsections below, clone the [drivers-evergreen-tools repo](https://github.com/mongodb-labs/drivers-evergreen-tools.git).

We recommend creating an environment variable named `DRIVERS_TOOLS` that stores the path to your local copy of the `driver-evergreen-tools` repo:

```sh
export DRIVERS_TOOLS="/path/to/your/copy/of/drivers-evergreen-tools"
```

### Serverless

The following steps will walk you through how to create and test a MongoDB Serverless instance.

1. Create the following environment variables using a command like:

   ```sh
   export PROJECT="node-driver"
   ```

   > **Note:** MongoDB employees can pull these values from the Evergreen project's configuration.

   | Variable Name                | Description                                                                                                      |
   | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
   | `Project`                    | The name of the Evergreen project where the tests will be run (e.g., `mongo-node-driver-next`)                   |
   | `SERVERLESS_DRIVERS_GROUP`   | The Atlas organization where you will be creating the serverless instance                                        |
   | `SERVERLESS_API_PUBLIC_KEY`  | The [Atlas API Public Key][atlas-api-key] for the organization where you will be creating a serverless instance  |
   | `SERVERLESS_API_PRIVATE_KEY` | The [Atlas API Private Key][atlas-api-key] for the organization where you will be creating a serverless instance |
   | `SERVERLESS_ATLAS_USER`      | The [SCRAM username][scram-auth] for the Atlas user who has permission to create a serverless instance           |
   | `SERVERLESS_ATLAS_PASSWORD`  | The [SCRAM password][scram-auth] for the Atlas user who has permission to create a serverless instance           |

   _**Remember**_ some of these are sensitive credentials, so keep them safe and only put them in your environment when you need them.

1. Run the [create-instance][create-instance-script] script:

   ```sh
   $DRIVERS_TOOLS/.evergreen/serverless/create-instance.sh
   ```

   The script will take a few minutes to run. When it is finished, a new file named `serverless-expansion.yml` will be created in the current working directory. The file will contain information about an Evergreen expansion:

   ```yml
   MONGODB_URI: xxx
   MONGODB_SRV_URI: xxx
   SERVERLESS_INSTANCE_NAME: xxx
   SSL: xxx
   AUTH: xxx
   TOPOLOGY: xxx
   SERVERLESS: xxx
   SERVERLESS_URI: xxx
   ```

1. Generate a sourceable environment file from `serverless-expansion.yml` by running the following command:

   ```sh
   cat serverless-expansion.yml | sed 's/: /=/g' > serverless.env
   ```

   A new file named `serverless.env` is automatically created.

1. Update the following variables in `serverless.env`, so that they are equivalent to what our Evergreen builds do:

   - Change `MONGODB_URI` to have the same value as `SERVERLESS_URI`.
   - Add `SINGLE_MONGOS_LB_URI` and set it to the value of `SERVERLESS_URI`.
   - Add `MULTI_MONGOS_LB_URI` and set it to the value of `SERVERLESS_URI`.

1. Source the environment variables using a command like `source serverless.env`.

1. Export **each** of the environment variables that were created in `serverless.env`. For example:

   ```sh
   export SINGLE_MONGOS_LB_URI
   ```

1. Comment out the line in `.evergreen/run-serverless-tests.sh` that sources `install-dependencies.sh`.

1. Run the `.evergreen/run-serverless-tests.sh` script directly to test serverless instances from your local machine.

> Hint: If the test script fails with an error along the lines of `Uncaught TypeError: Cannot read properties of undefined (reading 'processId')`, ensure you do **not** have the `FAKE_MONGODB_SERVICE_ID` environment variable set.

### Load Balanced

The following steps will walk you through how to start and test a load balancer.

1. Start a sharded cluster with two `mongos`, so you have a URI similar to `MONGODB_URI=mongodb://host1,host2/`. The server must be version 5.2.0 or higher.
    Create the config server:
    ```sh
    mongod --configsvr --replSet test --dbpath config1 --bind_ip localhost --port 27217
    ```

    Initiate the config server in the shell:
    ```sh
    mongosh "mongodb://localhost:27217" --eval "rs.initiate( { _id: 'test', configsvr: true, members: [ { _id: 0, host: 'localhost:27217' } ] })"
    ```

    Create shard replica sets:
    ```sh
    mongod --shardsvr --replSet testing  --dbpath repl1 --bind_ip localhost --port 27218 --setParameter enableTestCommands=true
    mongod --shardsvr --replSet testing  --dbpath repl2 --bind_ip localhost --port 27219 --setParameter enableTestCommands=true
    mongod --shardsvr --replSet testing  --dbpath repl3 --bind_ip localhost --port 27220 --setParameter enableTestCommands=true
    ```

    Initiate replica set in the shell:
    ```sh
    mongosh "mongodb://localhost:27218" --eval "rs.initiate( { _id: 'testing', members: [ { _id: 0, host: 'localhost:27218' }, { _id: 1, host: 'localhost:27219' }, { _id: 2, host: 'localhost:27220' }] })"
    ```

    Create two `mongos` running on ports `27017` and `27018`:
    ```sh
    mongos --configdb test/localhost:27217 --bind_ip localhost --setParameter enableTestCommands=1 --setParameter loadBalancerPort=27050
    mongos --configdb test/localhost:27217 --port 27018 --bind_ip localhost --setParameter enableTestCommands=1 --setParameter loadBalancerPort=27051
    ```

    Initiate cluster on `mongos` in shell:
    ```sh
    mongosh "mongodb://localhost:27017" --eval "sh.addShard('testing/localhost:27218,localhost:27219,localhost:27220')"
    mongosh "mongodb://localhost:27017" --eval "sh.enableSharding('test')"
    ```
1. An alternative way to the fully manual cluster setup is to use `mlaunch`:
   Initialize the sharded cluster via `mlaunch` in a new empty directory:
   ```shell
   mlaunch init --dir data --ipv6 --replicaset --nodes 2 --port 51000 --name testing --setParameter enableTestCommands=1 --sharded 1 --mongos 2
   ```

   `mlaunch` will then start up the sharded cluster. Once it finishes, stop the cluster:
   ```shell
   mlaunch stop
   ```

   When `mlaunch` has stopped the cluster, navigate to the `data` directory and edit the `.mlaunch_startup` file:
   - Add `--setParameter loadBalancerPort=27050` to the first `mongos` configuration at the bottom of the file.
   - Add `--setParameter loadBalancerPort=27051` to the second `mongos` configuration at the bottom of the file.

   Navigate back up to the root directory where `mlaunch` was initialized and restart:
   ```sh
   mlaunch start
   ```

1. Create an environment variable named `MONGODB_URI` that stores the URI of the sharded cluster you just created. For example:
   ```sh
   export MONGODB_URI="mongodb://host1,host2/"
   ```
1. Install the HAProxy load balancer. For those on macOS, you can install HAProxy with:
   ```sh
   brew install haproxy
   ```
1. Start the load balancer by using the [run-load-balancer script](https://github.com/mongodb-labs/drivers-evergreen-tools/blob/master/.evergreen/run-load-balancer.sh) provided in `drivers-evergreen-tools`.
   ```sh
   $DRIVERS_TOOLS/.evergreen/run-load-balancer.sh start
   ```
   A new file name `lb-expansion.yml` will be automatically created. The contents of the file will be similar in structure to the code below.
   ```yaml
   SINGLE_MONGOS_LB_URI: 'mongodb://127.0.0.1:8000/?loadBalanced=true'
   MULTI_MONGOS_LB_URI: 'mongodb://127.0.0.1:8001/?loadBalanced=true'
   ```
1. Generate a sourceable environment file from `lb-expansion.yml` by running the following command:
   ```sh
   cat lb-expansion.yml | sed 's/: /=/g' > lb.env
   ```
   A new file name `lb.env` is automatically created.
1. Source the environment variables using a command like `source lb.env`.
1. Export **each** of the environment variables that were created in `lb.env`. For example:
   ```sh
   export SINGLE_MONGOS_LB_URI
   ```
1. Export the `LOAD_BALANCER` environment variable to `true`:
   ```sh
   export LOAD_BALANCER='true'
   ```
1. Disable auth for tests:
   ```sh
   export AUTH='noauth'
   ```
1. Run the test suite as you normally would:
   ```sh
   npm run check:test
   ```
   Verify that the output from Mocha includes `[ topology type: load-balanced ]`. This indicates the tests successfully accessed the specialized environment variables for load balancer testing.
1. When you are done testing, shutdown the HAProxy load balancer:
   ```sh
   $DRIVERS_TOOLS/.evergreen/run-load-balancer.sh stop
   ```

### Client-Side Field-Level Encryption (CSFLE)

The following steps will walk you through how to run the tests for CSFLE.

1. Install [MongoDB Client Encryption][npm-csfle] if you haven't already:
   ```sh
   npm install mongodb-client-encryption
   ```
   > **Note:** if developing changes in `mongodb-client-encryption`,
   you can link it locally using `etc/tooling/fle.sh`.

1. Create the following environment variables using a command like:
   ```sh
   export AWS_REGION="us-east-1"
   ```
   > **Note:** MongoDB employees can pull these values from the Evergreen project's configuration.

   | Variable Name          |Description                                                      |
   | -----------------------|---------------------------------------------------------------- |
   | `AWS_ACCESS_KEY_ID`    | The AWS access key ID used to generate KMS messages             |
   | `AWS_SECRET_ACCESS_KEY`| The AWS secret access key used to generate KMS messages         |
   | `AWS_REGION`           | The AWS region where the KMS resides (e.g., `us-east-1`)        |
   | `AWS_CMK_ID`           | The Customer Master Key for the KMS                             |
   | `CSFLE_KMS_PROVIDERS`  | The raw EJSON description of the KMS providers. An example of the format is provided below.                                                                          |
   | `KMIP_TLS_CA_FILE`     | /path/to/mongodb-labs/drivers-evergreen-tools/.evergreen/x509gen/ca.pem|
   | `KMIP_TLS_CERT_FILE`   | /path/to/mongodb-labs/drivers-evergreen-tools/.evergreen/x509gen/client.pem |

   The value of the `CSFLE_KMS_PROVIDERS` variable will have the following format:

   ```
   interface CSFLE_kms_providers {
      aws: {
         accessKeyId: string;
         secretAccessKey: string;
      };
      azure: {
         tenantId: string;
         clientId: string;
         clientSecret: string;
      };
      gcp: {
         email: string;
         privateKey: string;
      };
      local: {
         // EJSON handle converting this, its actually the canonical -> { $binary: { base64: string; subType: string } }
         // **NOTE**: The dollar sign has to be escaped when using this as an ENV variable
         key: Binary;
      }
   }
   ```
1. Start the KMIP servers:

   ```sh
   DRIVERS_TOOLS="/path/to/mongodb-labs/drivers-evergreen-tools" .evergreen/run-kms-servers.sh
   ```

1. Ensure default `~/.aws/config` is present:

   ```
   [default]
   aws_access_key_id=AWS_ACCESS_KEY_ID
   aws_secret_access_key=AWS_SECRET_ACCESS_KEY
   ```

1. Set temporary AWS credentials

   ```
   source /path/to/mongodb-labs/drivers-evergreen-tools/.evergreen/csfle/activate-kmstlsvenv.sh
   source /path/to/mongodb-labs/drivers-evergreen-tools/.evergreen/csfle/set-temp-creds.sh
   ```

   Alternatively, for fish users, the following script can be substituted for `set-temp-creds.sh`:

   ```fish
   function set_aws_creds
         set PYTHON_SCRIPT "\
   import boto3
   client = boto3.client('sts')
   credentials = client.get_session_token()['Credentials']
   print (credentials['AccessKeyId'] + ' ' + credentials['SecretAccessKey'] + ' ' + credentials['SessionToken'])"

         echo $PYTHON_SCRIPT | python3 -
   end

   set CREDS (set_aws_creds)

   set CSFLE_AWS_TEMP_ACCESS_KEY_ID (echo $CREDS | awk '{print $1}')
   set CSFLE_AWS_TEMP_SECRET_ACCESS_KEY (echo $CREDS | awk '{print $2}')
   set CSFLE_AWS_TEMP_SESSION_TOKEN (echo $CREDS | awk '{print $3}')

   set -e CREDS
   ```

1. Run the functional tests:
   ```sh
   npm run check:test
   ```

   The output of the tests will include sections like "Client-Side Encryption Corpus", "Client-Side Encryption Functional", "Client-Side Encryption Prose Tests", and "Client-Side Encryption".

   To run the functional tests using the crypt shared library instead of `mongocryptd`, download the appropriate version of the crypt shared library for the enterprise server version [here](https://www.mongodb.com/download-center/enterprise/releases) and then set the location of it in the environment variable `CRYPT_SHARED_LIB_PATH`.

#### Testing driver changes with mongosh

These steps require `mongosh` to be available locally. Clone it from GitHub.

`mongosh` uses a `lerna` monorepo. As a result, `mongosh` contains multiple references to the `mongodb` package
in their `package.json`s.

Set up `mongosh` by following the steps in the `mongosh` readme.

##### Point mongosh to the driver

mongosh contains a script that does this. To use the script, create an environment
 variable `REPLACE_PACKAGE` that contains a string in the form
`mongodb:<path to your local instance of the driver>`. The package replacement script will replace
all occurrences of `mongodb` with the local path of your driver.

An alternative, which can be useful for
testing a release, is to first run `npm pack` on the driver. This generates a tarball containing all the code
that would be uploaded to `npm` if it were released. Then, set the environment variable `REPLACE_PACKAGE`
with the full path to the file.

Once the environment variable is set, run replace package in `mongosh` with:
```sh
npm run replace:package
```

##### Run specific package tests

`mongosh`'s readme documents how to run its tests. Most likely, it isn't necessary to run all of mongosh's
tests. The `mongosh` readme also documents how to run tests for a particular scope. The scopes are
listed in the `generate_mongosh_tasks.js` evergreen generation script.

For example, to run the `service-provider-server` package, run the following command in `mongosh`:

```shell
lerna run test --scope @mongosh/service-provider-server
```

#### KMIP FLE support tests

1. Install `virtualenv`:
   ```sh
   pip install virtualenv
   ```
2. Source the `./activate-kmstlsvenv.sh` script in driver evergreen tools `.evergreen/csfle/activate-kmstlsvenv.sh`
    - This will install all the dependencies needed to run a Python kms_kmip simulated server
3. In four separate terminals, launch the following:
   ```sh
   ./kmstlsvenv/bin/python3 -u kms_kmip_server.py` # by default it always runs on port 5698
   ```
   ```sh
   ./kmstlsvenv/bin/python3 -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/expired.pem --port 8000
   ```
   ```sh
   ./kmstlsvenv/bin/python3 -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/wrong-host.pem --port 8001
   ```
   ```sh
   ./kmstlsvenv/bin/python3 -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/server.pem --port 8002 --require_client_cert
   ```
4. Set the following environment variables:
    ```sh
    export KMIP_TLS_CA_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/ca.pem"
    export KMIP_TLS_CERT_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/client.pem"
    ```
5. Install the FLE lib:
   ```sh
   npm i --no-save mongodb-client-encryption
   ```
6. Launch a MongoDB server
7. Run the full suite:
   ```sh
   npm run check:test
   ```
   or more specifically
   ```sh
   npx mocha --config test/mocha_mongodb.json test/integration/client-side-encryption/
   ```

### TODO Special Env Sections

- Kerberos
- AWS Authentication
- OCSP
- TLS
- Atlas Data Lake
- LDAP
- Snappy (maybe in general, how to test optional dependencies)
- Atlas connectivity

[mocha]: https://mochajs.org/
[mocha-skip]: https://mochajs.org/#inclusive-tests
[mongodb-ulimit]: https://www.mongodb.com/docs/manual/reference/ulimit/#recommended-ulimit-settings
[macos-ulimt]: https://wilsonmar.github.io/maximum-limits/
[mocha-only]: https://mochajs.org/#exclusive-tests
[mocha-grep]: https://mochajs.org/#command-line-usage
[evergreen-docs]: https://github.com/evergreen-ci/evergreen/wiki/Using-the-Command-Line-Tool
[evergreen-wiki]: https://github.com/evergreen-ci/evergreen/wiki
[driver-specs]: https://github.com/mongodb/specifications
[node-quick-start]: https://github.com/mongodb-developer/nodejs-quickstart
[js-bson]: https://github.com/mongodb/js-bson
[create-instance-script]: https://github.com/mongodb-labs/drivers-evergreen-tools/blob/master/.evergreen/serverless/create-instance.sh
[npm-csfle]: https://www.npmjs.com/package/mongodb-client-encryption
[atlas-api-key]: https://docs.atlas.mongodb.com/tutorial/configure-api-access/organization/create-one-api-key
[scram-auth]: https://docs.atlas.mongodb.com/security-add-mongodb-users/#database-user-authentication
