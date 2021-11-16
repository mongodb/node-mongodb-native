# MongoDB Node Driver Test Automation

This repo contains a test automation suite with a variety of tests. In this readme, you'll learn
about the types of tests and how to run them.

## Run the Tests Locally

Start a mongod standalone with our [cluster_setup.sh](test/tools/cluster_setup.sh) script: `./test/tools/cluster_setup.sh server`

Then run the tests: `npm test`

Note: this will run a subset of the tests that work with the standalone server topology.

## Run the Tests in Evergreen

[Evergreen](https://github.com/evergreen-ci/evergreen/wiki) is a continuous integration (CI) system
we use.  Evergreen builds are automatically run whenever a pull request is created or when commits are
pushed to particular branches (e.g., main, 4.0, and 3.6).

Each Evergreen build runs the test suite against a variety of build variants that include a combination
of topologies, special environments, and operating systems. By default, commits in pull requests only run a
subset of the build variants in order to save time and resources. These builds can be individually
configured in the Evergreen UI to include more build variants.

### Manually Kicking Off Evergreen Builds

Occasionally, you will want to manually kick off an Evergreen build in order to debug a test failure
or to run tests against uncommitted changes.

#### Evergreen UI
You can use the Evergreen UI to choose to rerun a task (an entire set of test automation for a given topology and environment).
Evergreen does not allow you to rerun an individual test.

#### Evergreen CLI
You can also choose to run a build against code on your local machine that you have not yet committed
by running a pre-commit patch build.

##### Setup

Begin by setting up the Evergreen CLI.

1. Download and install the Evergreen CLI according to the instructions in the [Evergreen Documentation](https://github.com/evergreen-ci/evergreen/wiki/Using-the-Command-Line-Tool).
1. Be sure to create `evergreen.yml` as described in the documentation.
1. Add the Evergreen binary to your path.

##### Running the Build

Once you have the Evergreen CLI setup, you are ready to run a build.

1. In a terminal, navigate to your node driver directory:

   `cd node-mongodb-native`
1. Use the Evergreen `patch` command. `-y` skips the confirmation dialog. `-u` includes uncommitted changes. `-p [project name]` specifies the Evergreen project. --browse opens the patch URL in your browser.

   `evergreen patch -y -u -p mongo-node-driver --browse`
1. In your browser, select the build variants and tasks to run.

## About the Tests

All of our test automation is powered by the [Mocha test framework](https://mochajs.org/).

Some of the tests require a particular topology (e.g., standalone server, replica set, or sharded cluster). These tests
check the topology of the MongoDB server that is being used. If the topology does not match, the
tests will be skipped.

Below is a summary of the types of test automation in this repo.

| Type of Test | Test Location | About the Tests | How to Run Tests |
| ------------ | ------------- | --------------- | ---------------- |
| Unit | `/test/unit` | The unit tests test individual pieces of code, typically functions. These tests do **not** interact with a real database, so mocks are used instead. | `npm run check:unit` |
| Functional | `/test/functional` | The function tests test that a given feature or piece of a feature is working as expected. These tests do **not** use mocks; instead, they interact with a real database. | `npm run check:test` |
| Benchmark | `/test/benchmarks` | The benchmark tests report how long a designated set of tests take to run. They are used to measure performance. | `npm run check:bench` |
| Integration | `/test/integration` | *Coming Soon* The integration tests test that pieces of the driver work together as expected. | `npm run check:test` |
| Manual | `/test/manual` | The manual tests are functional tests that require specialized environment setups in Evergreen. <br>**Note**: "manual" does not refer to tests that should be run manually. These tests are automated. These tests require manual configuration in Evergreen. | There is no script for running all of the manual tests. Instead, you can run the appropriate script based on the specialized environment you want to use: <br>- `npm run check:atlas` to test Atlas connectivity <br>- `npm run check:adl` to test Atlas Data Lake <br>- `npm run check:ocsp` to test OSCP <br>- `npm run check:kerberos` to test Kerberos <br>- `npm run check:tls` to test TLS <br>- `npm run check:ldap` to test LDAP authorization
| Spec | Test input and expected results: `/test/spec`.  <br>Test runners are in `/test/functional` with  the `_spec` suffix in the test file's name.  <br>Some spec tests are also in `/test/unit`. | All of the MongoDB drivers follow the same [specifications (specs)](https://github.com/mongodb/specifications). Each spec has tests associated with it. Some of the tests are prose (written, descriptive) tests.  Other tests are written in JSON. The developers on the driver teams automate these tests. For prose tests, the tests are converted to automation and stored in the `test/unit` or `test/functional` as appropriate. For the JSON tests, a developer uses a tool to convert the JSON test file to YAML. Both the JSON and YAML files are stored in `test/spec`. The test runners for the JSON and YAML files are located in `test/functional` and `/test/unit`. | `npm run check:test` to run all of the functional and integration tests (including the spec tests stored with those). `npm run check:unit` to run all of the unit tests (including the spec tests stored with those).
| TypeScript Definition | `/test/types` | The TypeScript definition tests verify the type definitions are correct. | `npm run check:tsd` |

## Special Environments

There are collections of tests that test features requiring a specialized set of environment variables to be generated and set in order to run. Look below for the section that applies to the feature you are trying to test.

### Serverless

Find the following script in driver-evergreen-tools and make sure you have the following environment variables defined.
_**Remember**_ some of these are sensitive credentials so keep them safe and only put them in your environment when you need them.

- `PROJECT`
- `SERVERLESS_DRIVERS_GROUP`
- `SERVERLESS_API_PUBLIC_KEY`
- `SERVERLESS_API_PRIVATE_KEY`
- `SERVERLESS_ATLAS_USER`
- `SERVERLESS_ATLAS_PASSWORD`
- `LOADBALANCED`

```sh
$DRIVERS_TOOLS/.evergreen/serverless/create-instance.sh
```

this will output an evergreen expansion in `serverless-expansion.yml` in the current working directory.

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

Since it's a flat yaml file, you can run the following to get a sourceable environment file:

```sh
cat serverless-expansion.yml | sed 's/: /=/g' > serverless.env
```

Before sourcing `serverless.env`, make some adjustments that are equivalent to what our EVG does:

- Change `MONGODB_URI` to be the same as `SINGLE_ATLASPROXY_SERVERLESS_URI`
- Add `SINGLE_MONGOS_LB_URI` and `MULTI_MONGOS_LB_URI` and set them to `SINGLE_ATLASPROXY_SERVERLESS_URI`

Lastly, comment out the `source` of `install-dependencies.sh` command in `.evergreen/run-serverless-tests.sh` and you can run that script directly to test serverless instances from your local machine.

### Load Balanced

You'll first need to start a sharded cluster using your favorite MongoDB orchestration tool of choice.
The tool should create a cluster with two mongos so you have a uri like `MONGODB_URI=mongodb://host1,host2/`
Then you need to start a load balancer: you can install `haproxy` on macos via `brew` and use the script provided in drivers-evergreen-tools.

```sh
$DRIVERS_TOOLS/.evergreen/run-load-balancer.sh start
```

This will output an evergreen expansion file: `lb-expansion.yml`

```yaml
SINGLE_MONGOS_LB_URI: "mongodb://127.0.0.1:8000/?loadBalanced=true"
MULTI_MONGOS_LB_URI: "mongodb://127.0.0.1:8001/?loadBalanced=true"
```

Since it's a flat yaml file, you can run the following to get a sourceable environment file:

```sh
cat lb-expansion.yml | sed 's/: /=/g' > lb.env
```

You have to add an additional environment variable to the end of this `lb.env` file:

```sh
FAKE_MONGODB_SERVICE_ID="true"
```

This enables logic in the driver to stick in a fake service id on responses since that's what a real LB deployment is required to do.
With those variables sourced, you can run the whole test suite as you normally would.

> Please note, `FAKE_MONGODB_SERVICE_ID` will no longer be needed with the completion of [NODE-3431](https://jira.mongodb.org/browse/NODE-3431).

```sh
npm run check:test
```

Take note of the `[ topology type: load-balanced ]` printout from mocha to make sure it picked up the environment as expected.

When you are done testing you can shutdown the haproxy load balancer with:

```sh
$DRIVERS_TOOLS/.evergreen/run-load-balancer.sh stop
```

### CSFLE

As long as certain environment variables are present and mongodb-client-encryption is installed, FLE will run with a regular mocha execution: `npm run check:test`.

Define the following variables in your environment:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `CSFLE_KMS_PROVIDERS`
- `AWS_REGION`
- `AWS_CMK_ID`

### TODO Special Env Sections

- Kerberos
- AWS Authentication
- OCSP
- TLS
- Atlas Data Lake
- LDAP
- Snappy (maybe in general, how to test optional dependencies)
- Atlas connectivity

### Tests FAQ

- How can I run the tests against more than a standalone?

  You can use `test/tools/cluster_setup.sh replica_set` to start a replica set.

  If you are running more than a standalone server, make sure your `ulimit` settings are in accordance with
  [MongoDB's recommendations][mongodb-ulimit].
  Changing the settings on the latest versions of macOS can be tricky.  See [this article][macos-ulimt]
  for tips. (You likely don't need to do the complicated maxproc steps.)

  You can prefix `npm test` with a `MONGODB_URI` environment variable to point the tests to a specific deployment:
  `env MONGODB_URI=mongodb://localhost:27017 npm test`

- How can I run just one test?

  The easiest way to run a single test is by appending `.only()` to the suite or test you want to run.
  For example, you could update a test function to be `it.only(‘cool test’, function() {})`.  Then
  run the test using `npm run check:test` for a functional or integration test or
  `npm run check:unit` for a unit test.  See [Mocha's documentation][mocha-only]
  for more detailed information on `.only()`.

  Another way to run a single test is to use Mocha's `grep` flag.  For functional or integration tests,
  run `npm run check:test -- -g 'test name'`. For unit tests, run `npm run check:unit -- -g 'test name'`.
  See the [Mocha documentation][mocha-grep] for information on the `grep` flag.

- Why are some of the tests "pending"?

  Tests that we have indicated should be skipped using `.skip()` will appear as pending in the test
  results.  See
  [Mocha's documentation][mocha-skip] for more information.
