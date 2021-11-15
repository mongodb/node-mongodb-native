# How to test

All of our test automation is powered by the [Mocha test framework](https://mochajs.org/).

| Type of Test | Test Location | About the Tests | How to Run Tests |
| ------------ | ------------- | ---------------- | ------------- |
| Unit | `/test/unit` | The unit tests test individual units of code, typically functions. These tests do **not** interact with a real database, so mocks are used instead. | `npm run check:unit` |
| Functional | `/test/functional` | The function tests test that a given feature or piece of a feature is working as expected. These tests do **not** use mocks; instead, they interact with a real database. | `npm run check:test` |
| Benchmark | `/test/benchmarks` | The benchmark tests report how long a designated set of tests take to run??? | `npm run check:bench` |
| Integration | /test/integration | *Coming Soon* The integration tests test that pieces of the driver work together as expect. | `npm run check:test` |
| Manual | `/test/manual` | The manual tests are functional tests that require specialized environment setups in Evergreen.  **Note**: "manual" does not refer to tests that should be run manually. These tests are automated. These tests require manual configuration in Evergreen. | There is no script for running all of the manual tests. Instead, you can run the appropriate script based on the specialized environment you want to use:
`npm run check:atlas` to test Atlas connectivity
`npm run check:adl` to test Atlas Data Lake
`npm run check:ocsp` to test OSCP
`npm run check:kerberos` to test Kerberos
`npm run check:tls` to test TLS
`npm run check:ldap` to test LDAP authorization
| Spec | Test input and expected results: `/test/spec`. Test runners are in `/test/functional` with the the `_spec` postfix in the test file's name. Some spec tests are also in `/test/unit`. | All of the MongoDB drivers follow the same [specifications (aka specs)](https://github.com/mongodb/specifications). The specifications include prose (written, descriptive) tests.  The drivers can choose whether to manually run the prose spec tests or automate the prose spec tests.  The `test/spec` directory contains the JSON and YML files that describe the input and expected results for the prose spec tests. The test runners for these files are located in `test/functional` and `/test/unit`.
| TypeScript Types |




# LAUREN MOVE TEST INFO FROM CONTRIBUTING.md

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
