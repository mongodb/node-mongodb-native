# MongoDB Node Driver Test Automation

This repo contains a test automation suite with a variety of tests. In this readme, you'll learn
about the types of tests and how to run them.

## Table of Contents

- [MongoDB Node Driver Test Automation](#mongodb-node-driver-test-automation)
  - [Table of Contents](#table-of-contents)
  - [About the Tests](#about-the-tests)
    - [Spec Tests](#spec-tests)
  - [Running the Tests Locally](#running-the-tests-locally)
    - [Testing With Authorization-Enabled](#testing-with-authorization-enabled)
    - [Testing Different MongoDB Topologies](#testing-different-mongodb-topologies)
    - [Running Individual Tests](#running-individual-tests)
  - [Running the Tests in Evergreen](#running-the-tests-in-evergreen)
    - [Manually Kicking Off Evergreen Builds](#manually-kicking-off-evergreen-builds)
      - [Evergreen UI](#evergreen-ui)
      - [Evergreen CLI](#evergreen-cli)
        - [Setup](#setup)
        - [Running the Build](#running-the-build)
  - [Using a Pre-Release Version of a Dependent Library](#using-a-pre-release-version-of-a-dependent-library)
  - [Manually Testing the Driver](#manually-testing-the-driver)
  - [Writing Tests](#writing-tests)
    - [Framework](#framework)
    - [Skipping Tests](#skipping-tests)
  - [Running Benchmarks](#running-benchmarks)
    - [Configuration](#configuration)
  - [Secrets](#secrets)
  - [Testing with Special Environments](#testing-with-special-environments)
    - [Serverless](#serverless)
    - [Load Balanced](#load-balanced)
    - [Client-Side Field-Level Encryption (CSFLE)](#client-side-field-level-encryption-csfle)
    - [Deployed KMS Tests](#deployed-kms-tests)
      - [Azure KMS](#azure-kms)
      - [GCP KMS](#gcp-kms)
    - [Deployed Atlas Tests](#deployed-atlas-tests)
      - [Launching an Atlas Cluster](#launching-an-atlas-cluster)
      - [Search Indexes](#search-indexes)
      - [Deployed Lambda Tests](#deployed-lambda-tests)
    - [Kerberos Tests](#kerberos-tests)
    - [AWS Authentication tests](#aws-authentication-tests)
    - [Container Tests](#container-tests)
    - [TODO Special Env Sections](#todo-special-env-sections)
  - [Testing driver changes with mongosh](#testing-driver-changes-with-mongosh)
    - [Point mongosh to the driver](#point-mongosh-to-the-driver)
    - [Run specific package tests](#run-specific-package-tests)

## About the Tests

All of our test automation is powered by the [Mocha test framework][mocha].

Some of the tests require a particular topology (e.g., standalone server, replica set, or sharded cluster). These tests
check the topology of the MongoDB server that is being used. If the topology does not match, the
tests will be skipped.

Below is a summary of the types of test automation in this repo.

| Type of Test                 | Test Location                              | About the Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | How to Run Tests                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                         | `/test/unit`                               | The unit tests test individual pieces of code, typically functions. These tests do **not** interact with a real database, so mocks are used instead. <br><br>The unit test directory mirrors the `/src` directory structure with test file names matching the source file names of the code they test.                                                                                                                                                                                          | `npm run check:unit`                                                                                                                                                                                                                                                                                                                                                                                                      |
| Integration                  | `/test/integration`                        | The integration tests test that a given feature or piece of a feature is working as expected. These tests do **not** use mocks; instead, they interact with a real database. <br><br> The integration test directory follows the `test/spec` directory structure representing the different functional areas of the driver. <br><br> **Note:** The `.gitkeep` files are intentionally left to ensure that this directory structure is preserved even as the actual test files are moved around. | `npm run check:test`                                                                                                                                                                                                                                                                                                                                                                                                      |
| Benchmark                    | `/test/benchmarks`                         | The benchmark tests report how long a designated set of tests take to run. They are used to measure performance.                                                                                                                                                                                                                                                                                                                                                                                | `npm run check:bench`                                                                                                                                                                                                                                                                                                                                                                                                     |
| Specialized Environment      | `/test/manual`                             | The specalized environment tests are functional tests that require specialized environment setups in Evergreen. <br><br>**Note**: "manual" in the directory path does not refer to tests that should be run manually. These tests are automated. These tests have a special Evergreen configuration and run in isolation from the other tests.                                                                                                                                                  | There is no single script for running all of the specialized environment tests. Instead, you can run the appropriate script based on the specialized environment you want to use: <br>- `npm run check:atlas` to test Atlas <br>- `npm run check:adl` to test Atlas Data Lake <br>- `npm run check:kerberos` to test Kerberos <br>- `npm run check:tls` to test TLS <br>- `npm run check:ldap` to test LDAP authorization |
| TypeScript Definition        | `/test/types`                              | The TypeScript definition tests verify the type definitions are correct.                                                                                                                                                                                                                                                                                                                                                                                                                        | `npm run check:tsd`                                                                                                                                                                                                                                                                                                                                                                                                       |
| GitHub Actions               | `/test/action`                             | Tests that run as GitHub Actions such as dependency checking.                                                                                                                                                                                                                                                                                                                                                                                                                                   | Currently, only `npm run check:dependencies` but could be expanded to more in the future.                                                                                                                                                                                                                                                                                                                                 |
| Code Examples                | `/test/integration/node-specific/examples` | Code examples that are also paired with tests that show they are working examples.                                                                                                                                                                                                                                                                                                                                                                                                              | Currently, `npm run check:lambda` to test the AWS Lambda example with default auth and `npm run check:lambda:aws` to test the AWS Lambda example with AWS auth.                                                                                                                                                                                                                                                           |
| Explicit Resource Management | `/test/explicit-resource-management`       | Tests that use explicit resource management with the driver's disposable resources.                                                                                                                                                                                                                                                                                                                                                                                                             | `bash .evergreen/run-resource-management-feature-integration.sh`                                                                                                                                                                                                                                                                                                                                                          |

### Spec Tests

All of the MongoDB drivers follow the same [specifications (specs)][driver-specs]. Each spec has tests associated with it. Some of the tests are prose (written, descriptive) tests, which must be implemented on a case-by-case basis by the developers on the driver teams. Other tests are written in a standardized form as YAML and converted to JSON, which can be read by the specialized spec test runners that are implemented in each driver.

The input test specifications are stored in `test/spec`.

The actual implementations of the spec tests can be unit tests or integration tests depending on the requirements, and they can be found in the corresponding test directory according to their type. Regardless of whether they are located in the `/unit` or `/integration` test directory, test files named `spec_name.spec.test` contain spec test implementations that use a standardized runner and `spec_name.prose.test` files contain prose test implementations.

## Running the Tests Locally

The easiest way to get started running the tests locally is to start a standalone server and run all of the tests.

Ensure the drivers tools submodule is cloned:

```sh
git submodule init
git submodule update
```

Start a `mongod` standalone with our [run-orchestration.sh](.evergreen/run-orchestration.sh) script with the environment set for the cluster:

```sh
VERSION='latest' TOPOLOGY='server' AUTH='noauth' ./.evergreen/run-orchestration.sh
```

Then run the tests:

```sh
npm test
```

> **Note:** the command above will run a subset of the tests that work with the standalone server topology since the tests are being run against a standalone server.

The output will show how many tests passed, failed, and are pending. Tests that we have indicated should be skipped using `.skip()` will appear as pending in the test results. See [Mocha's documentation][mocha-skip] for more information.

In the following subsections, we'll dig into the details of running the tests.

### Testing With Authorization-Enabled

By default, the integration tests run with auth-enabled and the mongo orchestration script will run with auth enabled when the `AUTH` variable is set to `auth`. Tests can be run locally without auth by setting the environment variable `AUTH` to the value of `noauth`.  This must be a two-step process of starting a server without auth-enabled and then running the tests without auth-enabled.

```shell
AUTH='noauth' TOPOLOGY='server' ./.evergreen/run-orchestration.sh
AUTH='noauth' npm run check:test
```
### Testing Different MongoDB Topologies

As we mentioned earlier, the tests check the topology of the MongoDB server being used and run the tests associated with that topology. Tests that don't have a matching topology will be skipped.

In the steps above, we started a standalone server:

```sh
TOPOLOGY='server' ./.evergreen/run-orchestration.sh
```

You can use the same [run-orchestration.sh](.evergreen/run-orchestration.sh) script to start a replica set or sharded cluster by passing the appropriate option:
```sh
TOPOLOGY='replica_set' ./.evergreen/run-orchestration.sh
```
or
```sh
TOPOLOGY='sharded_cluster' ./.evergreen/run-orchestration.sh
```
If you are running more than a standalone server, make sure your `ulimit` settings are in accordance with [MongoDB's recommendations][mongodb-ulimit]. Changing the settings on the latest versions of macOS can be tricky. See [this article][macos-ulimt] for tips. (You likely don't need to do the complicated `maxproc` steps.)

The [run-orchestration.sh](.evergreen/run-orchestration.sh) script automatically stores the files associated with the MongoDB server in the `data` directory, which is stored at the top-level of this repository.
You can delete this directory if you want to ensure you're running a clean configuration. If you delete the directory, the associated database server will be stopped, and you will need to run [run-orchestration.sh](.evergreen/run-orchestration.sh) again.

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

The host used is described in detail here: https://spruce.mongodb.com/distro/rhel90-dbx-perf-large/settings/general (Auth required to view)

Here is a rough list of the key configurations:

- cpu: Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz
- cores: 16
- arch: x64
- os: RHEL 9.0 linux (5.14.0-70.75.1.el9_0.x86_64)
- ram: 64 GB

It is best to try reproductions against as similar a deployment as possible to isolate regressions.

### Configuration

The benchmarks can be directed to test different settings and driver versions.

The following are environment variables and how the benchmark runner uses them:

- `MONGODB_DRIVER_PATH` - (default: current working driver) if set MUST be set to the directory a driver version is in, usually another clone of the driver checked out to a different revision.
- `MONGODB_CLIENT_OPTIONS` - (default: empty object) if set MUST be a JSON string that will be parsed and passed as the second argument to the MongoClient constructor.
- `MONGODB_URI` - (default: `mongodb://127.0.0.1:27017`) if set MUST be a valid MongoDB connection string and it will be used as the host the benchmarks will run against.

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

## Secrets

Secrets needed for testing in special environments are managed in a drivers-wide AWS secrets manager vault.

drivers-evergreen-tools contains scripts that can fetch secrets from secrets manager for local use and use in CI in the [.evergreen/secrets_handling folder](https://github.com/mongodb-labs/drivers-evergreen-tools/blob/master/.evergreen/secrets_handling/README.md).

Local use of secrets manager requires:

- the AWS SDK installed
- an AWS profile with access to the AWS vault has been configured

(see instructions in the secrets handling readme).

Here's an example usage of the tooling in drivers-evergreen-tools that configures credentials for CSFLE:

```bash
bash ${DRIVERS_TOOLS}/.evergreen/secrets_handling/setup-secrets.sh drivers/csfle
source secrets-export.sh
```

1. The `setup-secrets` script authenticates with AWS, fetches credentials and writes them to a bash file called `secrets-export.sh`.
2. The setup-secrets accepts a space separated list of all the vaults from which to fetch credentials.  in this case, we fetch credentials from the `drivers/csfle` vault.
3. Source `secrets-export.sh` to load the credentials into the environment.

> [!IMPORTANT]
> Make sure `secrets-export.sh` is in the .gitignore of any Github repo you might be using these tools in to avoid leaking credentials.  This is already done for this repo.

## Testing with Special Environments

In order to test some features, you will need to generate and set a specialized group of environment variables. The subsections below will walk you through how to generate and set the environment variables for these features.

We recommend using a different terminal for each specialized environment to avoid the environment variables from one specialized environment impacting the test runs for another specialized environment.

Before you begin any of the subsections below, ensure the drivers-evergreen-tools submodule is updated:

```sh
git submodule init
git submodule update
```

We recommend creating an environment variable named `DRIVERS_TOOLS` that stores the path to the `driver-evergreen-tools` submodule (code examples in this section will assume this has been done):

```sh
export DRIVERS_TOOLS="./drivers-evergreen-tools"
```

### Serverless

The following steps will walk you through how to create and test a MongoDB Serverless instance.

> [!IMPORTANT]
> If you set up an Atlas cluster for local use, you MUST delete it when you are finished with it using the [delete-instance script](https://github.com/mongodb-labs/drivers-evergreen-tools/blob/master/.evergreen/serverless/delete-instance.sh).

This script uses aws secrets manager to fetch credentials.  Make sure you are logged into AWS and have your profile set correctly.

1. Run the setup-serverless script:

```bash
bash .evergreen/setup-serverless.sh
```

2. Source the expansions and secrets:

```bash
source secrets-export.sh
source serverless.env
```

3. Comment out the line in `.evergreen/run-serverless-tests.sh` that sources `install-dependencies.sh` (this downloads node and npm and is only used in CI).

4. Run the `.evergreen/run-serverless-tests.sh` script directly to test serverless instances from your local machine.

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
```bash
npm install mongodb-client-encryption
```
> [!NOTE] 
> If developing changes in `mongodb-client-encryption`, you can link it locally using `etc/tooling/fle.sh`.

2. Load FLE credentials and download crypt_shared

This must be run inside a bash or zsh shell.

```bash
source .evergreen/setup-fle.sh
```

> [!NOTE]
> By default, `setup-fle.sh` installs crypt_shared.  If you want to test with mongocryptd instead, set the RUN_WITH_MONGOCRYPTD environment variable before 
> sourcing `setup-fle.sh`. 

3. Run the functional tests:
```bash
export TEST_CSFLE=true
npm run check:test
```

The output of the tests will include sections like "Client-Side Encryption Corpus", "Client-Side Encryption Functional", "Client-Side Encryption Prose Tests", and "Client-Side Encryption".

### Deployed KMS Tests

CSFLE supports automatic KMS credential fetching for Azure, GCP and AWS.  In order to e2e test GCP and Azure, we must run the tests on an actual GCP or Azure host (our ).  This is supported by drivers-evergreen-tools.

The basic idea is to

1. Provision an Azure or GCP server.
2. Set up a cluster on the server.
3. Copy the driver and tests to the server and run the tests on the server.
4. Copy the results back.

All of this is handled in the csfle/azurekms and csfle/gcpkms folders in drivers-evergreen-tools.

> [!IMPORTANT]
> Azure VMs and GCP VMs must be destroyed with their corresponding `teardown.sh` scripts.

#### Azure KMS

1. Provision an Azure server.  You must set the `AZUREKMS_VMNAME_PREFIX` variable: 

```bash
export AZUREKMS_VMNAME_PREFIX: "NODE_DRIVER"
bash ${DRIVERS_TOOLS}/.evergreen/csfle/azurekms/setup.sh
```

2. Comment out the following line in `run-deployed-azure-kms-tests.sh`:

```bash
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
```

3. Run the tests:

```bash
bash .evergreen/run-deployed-azure-kms-tests.sh
```

#### GCP KMS

1. Provision an GCP server.

```bash
bash ${DRIVERS_TOOLS}/.evergreen/csfle/gcpkms/setup.sh
```

1. Comment out the following line in `run-deployed-gcp-kms-tests.sh`:

```bash
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
```

3. Run the tests:

```bash
bash .evergreen/run-deployed-gcp-kms-tests.sh
```


### Deployed Atlas Tests

#### Launching an Atlas Cluster

Using drivers evergreen tools, run the `setup-atlas-cluster` script.  You must also set the CLUSTER_PREFIX environment variable.

```bash
CLUSTER_PREFIX=dbx-node-lambda bash ${DRIVERS_TOOLS}/.evergreen/atlas/setup-atlas-cluster.sh
```

The URI of the cluster is available in the `atlas-expansions.yml` file.

#### Search Indexes

1. Set up an Atlas cluster, as outlined in the "Launching an Atlas Cluster" section.
2. Add the URI of the cluster to the environment as the MONGODB_URI environment variable.
3. Run the tests with `npm run check:search-indexes`.

#### Deployed Lambda Tests

TODO(NODE-6698): Update deployed lambda test section.

### Kerberos Tests

You must be in an office or connected to the VPN to run these tests.

Run `.evergreen/run-kerberos-tests.sh`.

### AWS Authentication tests

> [!NOTE]
> AWS ECS tests have a different set up process.  Don't even bother running these locally, just pray to the CI gods that things work and you never have to touch these tests.

AWS tests require a cluster configured with MONGODB_AWS auth enabled.  This is easy to set up using drivers-evergreen-tools
by specifying the `aws-auth.json` orchestration file (this is what CI does).

1. Set up your cluster and export the URI of your cluster as MONGODB_URI.
2. Choose your configuration and set the relevant environment variables.

Do you want the AWS SDK to be installed while running auth?  If not, set MONGODB_AWS_SDK to false.

Choose your AWS authentication credential type and export the `AWS_CREDENTIAL_TYPE` type with the chosen value:

| AWS Credential Type | Explanation                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| regular             | The AWS credentials are present in the URI as username:password                                 |
| env-creds           | AWS credentials are loaded into the environment as AWS_ACCESS_KEY_ID and  AWS_SECRET_ACCESS_KEY |
| assume-role         | The machine assumes a particular authentication role, associated with the machine               |
| ec2                 | The driver authenticates against a local endpoint (on an AWS ec2 instance)                      |
| web-identity        | Credentials are sourced from an AssumeRoleWithWebIdentity                                       |
| session-creds       | Similar to env-creds, but the credentials are temporary and include a session token             |

1. Run the `bash .evergreen/run-mongodb-aws-tests.sh`.

### Container Tests

It may become required to run tests or debug code inside a live Azure or GCP container. The best way to do this is to leverage
our existing integration test suite and run Evergreen patches against a single integration test.

_Note that in cases where the tests need to run longer than one hour to ensure that tokens expire
that the mocha timeout must be increased in order for the test not to timeout._

## GCP

1. Add a new GCP prose test to `test/integration/auth/mongodb_oidc_gcp.prose.06.test.ts` that mimics the behaviour that
needs to be tested.
2. Ensure that the test has the `only` attribute so only it will run.
3. For additional Node.js options (like HTTP debug), add them to `GCPOIDC_TEST_CMD` in `.evergreen/run-oidc-tests-gcp.sh`
4. Create an evergreen patch and schedule only the `oidc-auth-test-gcp-latest` variant.

## Azure

1. Add a new Azure prose test to `test/integration/auth/mongodb_oidc_azure.prose.05.test.ts` that mimics the behaviour that
needs to be tested.
2. Ensure that the test has the `only` attribute so only it will run.
3. For additional Node.js options (like HTTP debug), add them to `AZUREOIDC_TEST_CMD` in `.evergreen/run-oidc-tests-azure.sh`
4. Create an evergreen patch and schedule only the `oidc-auth-test-azure-latest` variant.

## AWS

1. Add a new AWS prose test to `test/integration/auth/mongodb_oidc_k8s.prose.07.test.ts` that mimics the behaviour that
needs to be tested.
2. Ensure that the test has the `only` attribute so only it will run.
3. For additional Node.js options (like HTTP debug), add them to `K8S_TEST_CMD` in `.evergreen/run-oidc-tests-k8s.sh`
4. Create an evergreen patch and schedule only the `oidc-auth-test-k8s-latest-aks` variant.


### TODO Special Env Sections

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

## Testing driver changes with mongosh

These steps require `mongosh` to be available locally. Clone it from GitHub.

`mongosh` uses a `lerna` monorepo. As a result, `mongosh` contains multiple references to the `mongodb` package
in their `package.json`s.

Set up `mongosh` by following the steps in the `mongosh` readme.

### Point mongosh to the driver

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

### Run specific package tests

`mongosh`'s readme documents how to run its tests. Most likely, it isn't necessary to run all of mongosh's
tests. The `mongosh` readme also documents how to run tests for a particular scope. The scopes are
listed in the `generate_mongosh_tasks.js` evergreen generation script.

For example, to run the `service-provider-server` package, run the following command in `mongosh`:

```shell
lerna run test --scope @mongosh/service-provider-server
```
