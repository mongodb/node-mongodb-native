# How to test

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
