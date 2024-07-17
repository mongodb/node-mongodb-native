# Retryable Write Tests

## Introduction

The YAML and JSON files in this directory are platform-independent tests meant to exercise a driver's implementation of
retryable writes. These tests utilize the [Unified Test Format](../../unified-test-format/unified-test-format.md).

Several prose tests, which are not easily expressed in YAML, are also presented in this file. Those tests will need to
be manually implemented by each driver.

Tests will require a MongoClient created with options defined in the tests. Integration tests will require a running
MongoDB cluster with server versions 3.6.0 or later. The `{setFeatureCompatibilityVersion: 3.6}` admin command will also
need to have been executed to enable support for retryable writes on the cluster. Some tests may have more stringent
version requirements depending on the fail points used.

## Use as Integration Tests

Integration tests are expressed in YAML and can be run against a replica set or sharded cluster as denoted by the
top-level `runOn` field. Tests that rely on the `onPrimaryTransactionalWrite` fail point cannot be run against a sharded
cluster because the fail point is not supported by mongos.

The tests exercise the following scenarios:

- Single-statement write operations
  - Each test expecting a write result will encounter at-most one network error for the write command. Retry attempts
    should return without error and allow operation to succeed. Observation of the collection state will assert that the
    write occurred at-most once.
  - Each test expecting an error will encounter successive network errors for the write command. Observation of the
    collection state will assert that the write was never committed on the server.
- Multi-statement write operations
  - Each test expecting a write result will encounter at-most one network error for some write command(s) in the batch.
    Retry attempts should return without error and allow the batch to ultimately succeed. Observation of the collection
    state will assert that each write occurred at-most once.
  - Each test expecting an error will encounter successive network errors for some write command in the batch. The batch
    will ultimately fail with an error, but observation of the collection state will assert that the failing write was
    never committed on the server. We may observe that earlier writes in the batch occurred at-most once.

We cannot test a scenario where the first and second attempts both encounter network errors but the write does actually
commit during one of those attempts. This is because (1) the fail point only triggers when a write would be committed
and (2) the skip and times options are mutually exclusive. That said, such a test would mainly assert the server's
correctness for at-most once semantics and is not essential to assert driver correctness.

## Split Batch Tests

The YAML tests specify bulk write operations that are split by command type (e.g. sequence of insert, update, and delete
commands). Multi-statement write operations may also be split due to `maxWriteBatchSize`, `maxBsonObjectSize`, or
`maxMessageSizeBytes`.

For instance, an insertMany operation with five 10 MiB documents executed using OP_MSG payload type 0 (i.e. entire
command in one document) would be split into five insert commands in order to respect the 16 MiB `maxBsonObjectSize`
limit. The same insertMany operation executed using OP_MSG payload type 1 (i.e. command arguments pulled out into a
separate payload vector) would be split into two insert commands in order to respect the 48 MB `maxMessageSizeBytes`
limit.

Noting when a driver might split operations, the `onPrimaryTransactionalWrite` fail point's `skip` option may be used to
control when the fail point first triggers. Once triggered, the fail point will transition to the `alwaysOn` state until
disabled. Driver authors should also note that the server attempts to process all documents in a single insert command
within a single commit (i.e. one insert command with five documents may only trigger the fail point once). This behavior
is unique to insert commands (each statement in an update and delete command is processed independently).

If testing an insert that is split into two commands, a `skip` of one will allow the fail point to trigger on the second
insert command (because all documents in the first command will be processed in the same commit). When testing an update
or delete that is split into two commands, the `skip` should be set to the number of statements in the first command to
allow the fail point to trigger on the second command.

## Command Construction Tests

Drivers should also assert that command documents are properly constructed with or without a transaction ID, depending
on whether the write operation is supported.
[Command Logging and Monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) may be used to
check for the presence of a `txnNumber` field in the command document. Note that command documents may always include an
`lsid` field per the [Driver Session](../../sessions/driver-sessions.md) specification.

These tests may be run against both a replica set and shard cluster.

Drivers should test that transaction IDs are never included in commands for unsupported write operations:

- Write commands with unacknowledged write concerns (e.g. `{w: 0}`)
- Unsupported single-statement write operations
  - `updateMany()`
  - `deleteMany()`
- Unsupported multi-statement write operations
  - `bulkWrite()` that includes `UpdateMany` or `DeleteMany`
- Unsupported write commands
  - `aggregate` with write stage (e.g. `$out`, `$merge`)

Drivers should test that transactions IDs are always included in commands for supported write operations:

- Supported single-statement write operations
  - `insertOne()`
  - `updateOne()`
  - `replaceOne()`
  - `deleteOne()`
  - `findOneAndDelete()`
  - `findOneAndReplace()`
  - `findOneAndUpdate()`
- Supported multi-statement write operations
  - `insertMany()` with `ordered=true`
  - `insertMany()` with `ordered=false`
  - `bulkWrite()` with `ordered=true` (no `UpdateMany` or `DeleteMany`)
  - `bulkWrite()` with `ordered=false` (no `UpdateMany` or `DeleteMany`)

## Prose Tests

The following tests ensure that retryable writes work properly with replica sets and sharded clusters.

### 1. Test that retryable writes raise an exception when using the MMAPv1 storage engine.

For this test, execute a write operation, such as `insertOne`, which should generate an exception. Assert that the error
message is the replacement error message:

```
This MongoDB deployment does not support retryable writes. Please add
retryWrites=false to your connection string.
```

and the error code is 20.

> [!NOTE]
> Drivers that rely on `serverStatus` to determine the storage engine in use MAY skip this test for sharded clusters,
> since `mongos` does not report this information in its `serverStatus` response.

### 2. Test that drivers properly retry after encountering PoolClearedErrors.

This test MUST be implemented by any driver that implements the CMAP specification.

This test requires MongoDB 4.3.4+ for both the `errorLabels` and `blockConnection` fail point options.

1. Create a client with maxPoolSize=1 and retryWrites=true. If testing against a sharded deployment, be sure to connect
   to only a single mongos.

2. Enable the following failpoint:

   ```javascript
   {
       configureFailPoint: "failCommand",
       mode: { times: 1 },
       data: {
           failCommands: ["insert"],
           errorCode: 91,
           blockConnection: true,
           blockTimeMS: 1000,
           errorLabels: ["RetryableWriteError"]
       }
   }
   ```

3. Start two threads and attempt to perform an `insertOne` simultaneously on both.

4. Verify that both `insertOne` attempts succeed.

5. Via CMAP monitoring, assert that the first check out succeeds.

6. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.

7. Via CMAP monitoring, assert that the second check out then fails due to a connection error.

8. Via Command Monitoring, assert that exactly three `insert` CommandStartedEvents were observed in total.

9. Disable the failpoint.

### 3. Test that drivers return the original error after encountering a WriteConcernError with a RetryableWriteError label.

This test MUST:

- be implemented by any driver that implements the Command Monitoring specification,
- only run against replica sets as mongos does not propagate the NoWritesPerformed label to the drivers.
- be run against server versions 6.0 and above.

Additionally, this test requires drivers to set a fail point after an `insertOne` operation but before the subsequent
retry. Drivers that are unable to set a failCommand after the CommandSucceededEvent SHOULD use mocking or write a unit
test to cover the same sequence of events.

1. Create a client with `retryWrites=true`.

2. Configure a fail point with error code `91` (ShutdownInProgress):

   ```javascript
   {
       configureFailPoint: "failCommand",
       mode: {times: 1},
       data: {
           failCommands: ["insert"],
           errorLabels: ["RetryableWriteError"],
           writeConcernError: { code: 91 }
       }
   }
   ```

3. Via the command monitoring CommandSucceededEvent, configure a fail point with error code `10107` (NotWritablePrimary)
   and a NoWritesPerformed label:

   ```javascript
   {
       configureFailPoint: "failCommand",
       mode: {times: 1},
       data: {
           failCommands: ["insert"],
           errorCode: 10107,
           errorLabels: ["RetryableWriteError", "NoWritesPerformed"]
       }
   }
   ```

   Drivers SHOULD only configure the `10107` fail point command if the the succeeded event is for the `91` error
   configured in step 2.

4. Attempt an `insertOne` operation on any record for any database and collection. For the resulting error, assert that
   the associated error code is `91`.

5. Disable the fail point:

   ```javascript
   {
       configureFailPoint: "failCommand",
       mode: "off"
   }
   ```

### 4. Test that in a sharded cluster writes are retried on a different mongos when one is available.

This test MUST be executed against a sharded cluster that has at least two mongos instances, supports
`retryWrites=true`, has enabled the `configureFailPoint` command, and supports the `errorLabels` field (MongoDB 4.3.1+).

> [!NOTE]
> This test cannot reliably distinguish "retry on a different mongos due to server deprioritization" (the behavior
> intended to be tested) from "retry on a different mongos due to normal SDAM randomized suitable server selection".
> Verify relevant code paths are correctly executed by the tests using external means such as a logging, debugger, code
> coverage tool, etc.

1. Create two clients `s0` and `s1` that each connect to a single mongos from the sharded cluster. They must not connect
   to the same mongos.

2. Configure the following fail point for both `s0` and `s1`:

   ```javascript
   {
       configureFailPoint: "failCommand",
       mode: { times: 1 },
       data: {
           failCommands: ["insert"],
           errorCode: 6,
           errorLabels: ["RetryableWriteError"]
       }
   }
   ```

3. Create a client `client` with `retryWrites=true` that connects to the cluster using the same two mongoses as `s0` and
   `s1`.

4. Enable failed command event monitoring for `client`.

5. Execute an `insert` command with `client`. Assert that the command failed.

6. Assert that two failed command events occurred. Assert that the failed command events occurred on different mongoses.

7. Disable the fail points on both `s0` and `s1`.

### 5. Test that in a sharded cluster writes are retried on the same mongos when no others are available.

This test MUST be executed against a sharded cluster that supports `retryWrites=true`, has enabled the
`configureFailPoint` command, and supports the `errorLabels` field (MongoDB 4.3.1+).

Note: this test cannot reliably distinguish "retry on a different mongos due to server deprioritization" (the behavior
intended to be tested) from "retry on a different mongos due to normal SDAM behavior of randomized suitable server
selection". Verify relevant code paths are correctly executed by the tests using external means such as a logging,
debugger, code coverage tool, etc.

1. Create a client `s0` that connects to a single mongos from the cluster.

2. Configure the following fail point for `s0`:

   ```javascript
   {
       configureFailPoint: "failCommand",
       mode: { times: 1 },
       data: {
           failCommands: ["insert"],
           errorCode: 6,
           errorLabels: ["RetryableWriteError"],
           closeConnection: true
       }
   }
   ```

3. Create a client `client` with `directConnection=false` (when not set by default) and `retryWrites=true` that connects
   to the cluster using the same single mongos as `s0`.

4. Enable succeeded and failed command event monitoring for `client`.

5. Execute an `insert` command with `client`. Assert that the command succeeded.

6. Assert that exactly one failed command event and one succeeded command event occurred. Assert that both events
   occurred on the same mongos.

7. Disable the fail point on `s0`.

## Changelog

- 2024-05-30: Migrated from reStructuredText to Markdown.

- 2024-02-27: Convert legacy retryable writes tests to unified format.

- 2024-02-21: Update prose test 4 and 5 to workaround SDAM behavior preventing\
  execution of deprioritization code
  paths.

- 2024-01-05: Fix typo in prose test title.

- 2024-01-03: Note server version requirements for fail point options and revise\
  tests to specify the `errorLabels`
  option at the top-level instead of within `writeConcernError`.

- 2023-08-26: Add prose tests for retrying in a sharded cluster.

- 2022-08-30: Add prose test verifying correct error handling for errors with\
  the NoWritesPerformed label, which is to
  return the original error.

- 2022-04-22: Clarifications to `serverless` and `useMultipleMongoses`.

- 2021-08-27: Add `serverless` to `runOn`. Clarify behavior of\
  `useMultipleMongoses` for `LoadBalanced` topologies.

- 2021-04-23: Add `load-balanced` to test topology requirements.

- 2021-03-24: Add prose test verifying `PoolClearedErrors` are retried.

- 2019-10-21: Add `errorLabelsContain` and `errorLabelsContain` fields to\
  `result`

- 2019-08-07: Add Prose Tests section

- 2019-06-07: Mention $merge stage for aggregate alongside $out

- 2019-03-01: Add top-level `runOn` field to denote server version and/or\
  topology requirements requirements for the
  test file. Removes the `minServerVersion` and `maxServerVersion` top-level fields, which are now expressed within
  `runOn` elements.

  Add test-level `useMultipleMongoses` field.
