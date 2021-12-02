# MongoDB Node Driver Test Automation

This repo contains a test automation suite with a variety of tests. In this readme, you'll learn
about the types of tests and how to run them.

## Table of Contents

- [About the Tests](#about-the-tests)
- [Running the Tests Locally](#running-the-tests-locally)
- [Running the Tests in Evergreen](#running-the-tests-in-evergreen)
- [Using a Pre-Release Version of a Dependent Library](#using-a-pre-release-version-of-a-dependent-library)
- [Manually Testing the Driver](#manually-testing-the-driver)
- [Testing with Special Environments](#testing-with-special-environments)

## About the Tests

All of our test automation is powered by the [Mocha test framework][mocha].

Some of the tests require a particular topology (e.g., standalone server, replica set, or sharded cluster). These tests
check the topology of the MongoDB server that is being used. If the topology does not match, the
tests will be skipped.

Below is a summary of the types of test automation in this repo.

| Type of Test            | Test Location                              | About the Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                          | How to Run Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                    | `/test/unit`                               | The unit tests test individual pieces of code, typically functions. These tests do **not** interact with a real database, so mocks are used instead. <br><br>The unit test directory mirrors the `/src` directory structure with test file names matching the source file names of the code they test.                                                                                                                                                                   | `npm run check:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Integration             | `/test/functional` and `/test/integration` | The integration tests test that a given feature or piece of a feature is working as expected. These tests do **not** use mocks; instead, they interact with a real database. <br><br> The integration test directory follows the `test/spec` directory structure representing the different functional areas of the driver. <br><br> **Note:** The two directories are due to the fact that the tests are currently being migrated from `/functional` to `/integration`. | `npm run check:test`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Benchmark               | `/test/benchmarks`                         | The benchmark tests report how long a designated set of tests take to run. They are used to measure performance.                                                                                                                                                                                                                                                                                                                                                         | `npm run check:bench`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Specialized Environment | `/test/manual`                             | The specalized environment tests are functional tests that require specialized environment setups in Evergreen. <br><br>**Note**: "manual" in the directory path does not refer to tests that should be run manually. These tests are automated. These tests have a special Evergreen configuration and run in isolation from the other tests.                                                                                                                           | There is no single script for running all of the specialized environment tests. Instead, you can run the appropriate script based on the specialized environment you want to use: <br>- `npm run check:atlas` to test Atlas <br>- `npm run check:adl` to test Atlas Data Lake <br>- `npm run check:ocsp` to test OSCP <br>- `npm run check:kerberos` to test Kerberos <br>- `npm run check:tls` to test TLS <br>- `npm run check:ldap` to test LDAP authorization |
| TypeScript Definition   | `/test/types`                              | The TypeScript definition tests verify the type definitions are correct.                                                                                                                                                                                                                                                                                                                                                                                                 | `npm run check:tsd`                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Spec Tests

All of the MongoDB drivers follow the same [specifications (specs)][driver-specs]. Each spec has tests associated with it. Some of the tests are prose (written, descriptive) tests, which must be implemented on a case by case basis by the developers on the driver teams. Other tests are written in a standardized form as YAML and converted to JSON, which can be read by the specialized spec test runners that are implemented in each driver.

The input test specifications are stored in `test/spec`.

The actual implementations of the spec tests can be unit tests or integration tests depending on the requirements, and they can be found in the corresponding test directory according to their type. Regardless of whether they are located in the `/unit` or `/integration` test directory, test files named `spec_name.spec.test` contain spec test implementations that use a standardized runner and `spec_name.prose.test` files contain prose test implementations.

## Running the Tests Locally

The easiest way to get started running the tests locally is to start a standalone server and run all of the tests.

Start a mongod standalone with our [cluster_setup.sh](tools/cluster_setup.sh) script: `./test/tools/cluster_setup.sh server`.

Then run the tests: `npm test`.

> **Note:** the command above will run a subset of the tests that work with the standalone server topology since the tests are being run against a standalone server.

The output will show how many tests passed, failed, and are pending. Tests that we have indicated should be skipped using `.skip()` will appear as pending in the test results. See [Mocha's documentation][mocha-skip] for more information.

In the following subsections, we'll dig into the details of running the tests.

### Testing Different MongoDB Topologies

As we mentioned earlier, the tests check the topology of the MongoDB server being used and run the tests associated with that topology. Tests that don't have a matching topology will be skipped.

In the steps above, we started a standalone server: `./test/tools/cluster_setup.sh server`.

You can use the same [cluster_setup.sh](tools/cluster_setup.sh) script to start a replica set or sharded cluster by passing the appropriate option: `./test/tools/cluster_setup.sh replica_set` or
`./test/tools/cluster_setup.sh sharded_cluster`. If you are running more than a standalone server, make sure your `ulimit` settings are in accordance with [MongoDB's recommendations][mongodb-ulimit]. Changing the settings on the latest versions of macOS can be tricky. See [this article][macos-ulimt] for tips. (You likely don't need to do the complicated maxproc steps.)

The [cluster_setup.sh](tools/cluster_setup.sh) script automatically stores the files associated with the MongoDB server in the `data` directory, which is stored at the top level of this repository.
You can delete this directory if you want to ensure you're running a clean configuration. If you delete the directory, the associated database server will be stopped, and you will need to run [cluster_setup.sh](tools/cluster_setup.sh) again.

You can prefix `npm test` with a `MONGODB_URI` environment variable to point the tests to a specific deployment. For example, for a standalone server, you might use: `MONGODB_URI=mongodb://localhost:27017 npm test`. For a replica set, you might use: `MONGODB_URI=mongodb://localhost:31000,localhost:31001,localhost:31002/?replicaSet=rs npm test`.

### Running Individual Tests

The easiest way to run a single test is by appending `.only()` to the test context you want to run. For example, you could update a test function to be `it.only(‘cool test’, function() {})`. Then
run the test using `npm run check:test` for a functional or integration test or `npm run check:unit` for a unit test. See [Mocha's documentation][mocha-only] for more detailed information on `.only()`.

Another way to run a single test is to use Mocha's `grep` flag. For functional or integration tests, run `npm run check:test -- -g 'test name'`. For unit tests, run `npm run check:unit -- -g 'test name'`. See the [Mocha documentation][mocha-grep] for information on the `grep` flag.

## Running the Tests in Evergreen

[Evergreen][evergreen-wiki] is the continuous integration (CI) system we use. Evergreen builds are automatically run whenever a pull request is created or when commits are pushed to particular branches (e.g., main, 4.0, and 3.6).

Each Evergreen build runs the test suite against a variety of build variants that include a combination of topologies, special environments, and operating systems. By default, commits in pull requests only run a subset of the build variants in order to save time and resources. To configure a build, update `.evergreen/config.yml.in` and then generate a new Evergreen config via `node .evergreen/generate_evergreen_tasks.js`.

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

   `cd node-mongodb-native`

1. Use the Evergreen `patch` command. `-y` skips the confirmation dialog. `-u` includes uncommitted changes. `-p [project name]` specifies the Evergreen project. --browse opens the patch URL in your browser.

   `evergreen patch -y -u -p mongo-node-driver --browse`

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
   ```
   "dependencies": {
     "mongodb": "/path-to-your-copy-of-the-driver-repo/node-mongodb-native"
   }
   ```
1. Run `npm install` to install the dependency.
1. Create a new file that uses the driver to test your changes. See the [MongoDB Node.js Quick Start Repo][node-quick-start] for example scripts you can use.

> **Note:** When making driver changes, you will need to run `npm run build:ts` with each change in order for it to take effect.

## Testing with Special Environments

In order to test some features, you will need to generate and set a specialized group of environment variables. The subsections below will walk you through how to generate and set the environment variables for these features.

We recommend using a different terminal for each specialized environment to avoid the environment variables from one specialized environment impacting the test runs for another specialized environment.

Before you begin any of the subsections below, clone the [drivers-evergreen-tools repo](https://github.com/mongodb-labs/drivers-evergreen-tools.git).

We recommend creating an environment variable named `DRIVERS_TOOLS` that stores the path to your local copy of the driver-evergreen-tools repo: `export DRIVERS_TOOLS="/path/to/your/copy/of/drivers-evergreen-tools"`.

### Serverless

The following steps will walk you through how to create and test a MongoDB Serverless instance.

1. Create the following environment variables using a command like `export PROJECT="node-driver"`.

   > Note: MongoDB employees can pull these values from the Evergreen project's configuration.

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
   MULTI_ATLASPROXY_SERVERLESS_URI: xxx
   SINGLE_ATLASPROXY_SERVERLESS_URI: xxx
   ```

1. Generate a sourceable environment file from `serverless-expansion.yml` by running the following command:

   ```sh
   cat serverless-expansion.yml | sed 's/: /=/g' > serverless.env
   ```

   A new file named `serverless.env` is automatically created.

1. Update the following variables in `serverless.env`, so that they are equivalent to what our Evergreen builds do:

   - Change `MONGODB_URI` to have the same value as `SINGLE_ATLASPROXY_SERVERLESS_URI`.
   - Add `SINGLE_MONGOS_LB_URI` and set it to the value of `SINGLE_ATLASPROXY_SERVERLESS_URI`.
   - Add `MULTI_MONGOS_LB_URI` and set it to the value of `SINGLE_ATLASPROXY_SERVERLESS_URI`.

1. Source the environment variables using a command like `source serverless.env`.

1. Export **each** of the environment variables that were created in `serverless.env`. For example: `export SINGLE_MONGOS_LB_URI`.

1. Comment out the line in `.evergreen/run-serverless-tests.sh` that sources `install-dependencies.sh`.

1. Run the `.evergreen/run-serverless-tests.sh` script directly to test serverless instances from your local machine.

> Hint: If the test script fails with an error along the lines of `Uncaught TypeError: Cannot read properties of undefined (reading 'processId')`, ensure you do **not** have the `FAKE_MONGODB_SERVICE_ID` environment variable set.

### Load Balanced

The following steps will walk you through how to start and test a load balancer.

1. Start a sharded cluster. You can use the [cluster_setup.sh](tools/cluster_setup.sh) script to do so: `./test/tools/cluster_setup.sh sharded_cluster`. The tool should create a cluster with two mongos, so you have a URI similar to `MONGODB_URI=mongodb://host1,host2/`.
1. Create an environment variable named `MONGODB_URI` that stores the URI of the sharded cluster you just created. For example: `export MONGODB_URI="mongodb://host1,host2/"`
1. Install the HAProxy load balancer. For those on macOS, you can install HAProxy with `brew install haproxy`.
1. Start the load balancer by using the [run-load-balancer script](https://github.com/mongodb-labs/drivers-evergreen-tools/blob/master/.evergreen/run-load-balancer.sh) provided in drivers-evergreen-tools.
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
1. Add an additional environment variable named `FAKE_MONGODB_SERVICE_ID` to the end of the `lb.env` file. Setting `FAKE_MONGODB_SERVICE_ID` to `true` enables logic in the driver to stick in a fake service ID on responses since that's what a real load balanced deployment is required to do.
   ```sh
   FAKE_MONGODB_SERVICE_ID="true"
   ```
   > **Note:** `FAKE_MONGODB_SERVICE_ID` will no longer be needed with the completion of [NODE-3431](https://jira.mongodb.org/browse/NODE-3431).
1. Source the environment variables using a command like `source lb.env`.
1. Export **each** of the environment variables that were created in `lb.env`. For example: `export SINGLE_MONGOS_LB_URI`.
1. Run the test suite as you normally would:
   ```sh
   npm run check:test
   ```
   Verify that the output from Mocha includes `[ topology type: load-balanced ]`. This indicates the tests successfully accessed the specialized environment variables for load balancer testing.
1. When you are done testing, shutdown the HAProxy load balancer:
   ```sh
   $DRIVERS_TOOLS/.evergreen/run-load-balancer.sh stop
   ```

### Client-Side Field Level Encryption (CSFLE)

The following steps will walk you through how to run the tests for CSFLE.

1. Install [MongoDB Client Encryption][npm-csfle] if you haven't already:
   `npm install mongodb-client-encryption`

1. Create the following environment variables using a command like `export AWS_REGION="us-east-1"`.

   > Note: MongoDB employees can pull these values from the Evergreen project's configuration.

   | Variable Name           | Description                                                                                 |
   | ----------------------- | ------------------------------------------------------------------------------------------- |
   | `AWS_ACCESS_KEY_ID`     | The AWS access key ID used to generate KMS messages                                         |
   | `AWS_SECRET_ACCESS_KEY` | The AWS secret access key used to generate KMS messages                                     |
   | `AWS_REGION`            | The AWS region where the KMS resides (e.g., `us-east-1`)                                    |
   | `AWS_CMK_ID`            | The Customer Master Key for the KMS                                                         |
   | `CSFLE_KMS_PROVIDERS`   | The raw EJSON description of the KMS providers. An example of the format is provided below. |

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

1. Run the functional tests:

   `npm run check:test`

   The output of the tests will include sections like "Client Side Encryption Corpus," "Client Side Encryption Functional," "Client Side Encryption Prose Tests," and "Client Side Encryption."

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
[mongodb-ulimit]: https://docs.mongodb.com/manual/reference/ulimit/#recommended-ulimit-settings
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
