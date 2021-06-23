# Manual Tests

This directory contains a set of manual tests that require setup of additional systems and thus cannot _just_ be run as part of the other unit tests.

See the individual test files for details - only some will be described in this document.

## Kerberos Tests
The Kerberos tests are defined in [`kerberos.test.js](./kerberos.test.js). The following environment variables must be set up for the test to work properly:

* `MONGODB_URI`: The full connection string including a valid User Principal Name to connect to a Kerberos-enabled MongoDB server (must include `authMechanism=GSSAPI`)
* `KRB5_PRINCIPAL`: The User Principal Name specified in the connection string (i.e. `MONGODB_URI`)

> Note: You have to initialize Kerberos locally before running the tests, e.g. by running `kinit` in order to acquire a valid TGT from the KDC.

The test also requires a database `kerberos` to be present with a single document in the `test` collection having a `kerberos` property of boolean value `true`, e.g.:

```
use kerberos; db.test.insertOne({ kerberos: true })
```