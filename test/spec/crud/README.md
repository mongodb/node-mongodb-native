# CRUD Tests

## Introduction

The YAML and JSON files in this directory are platform-independent tests meant to exercise a driver's implementation of
the CRUD specification. These tests utilize the [Unified Test Format](../../unified-test-format/unified-test-format.md).

Several prose tests, which are not easily expressed in YAML, are also presented in this file. Those tests will need to
be manually implemented by each driver.

## Prose Tests

### 1. WriteConcernError.details exposes writeConcernError.errInfo

Test that `writeConcernError.errInfo` in a command response is propagated as `WriteConcernError.details` (or equivalent)
in the driver.

Using a 4.0+ server, set the following failpoint:

```javascript
{
  "configureFailPoint": "failCommand",
  "data": {
    "failCommands": ["insert"],
    "writeConcernError": {
      "code": 100,
      "codeName": "UnsatisfiableWriteConcern",
      "errmsg": "Not enough data-bearing nodes",
      "errInfo": {
        "writeConcern": {
          "w": 2,
          "wtimeout": 0,
          "provenance": "clientSupplied"
        }
      }
    }
  },
  "mode": { "times": 1 }
}
```

Then, perform an insert operation and assert that a WriteConcernError occurs and that its `details` property is both
accessible and matches the `errInfo` object from the failpoint.

### 2. WriteError.details exposes writeErrors\[\].errInfo

Test that `writeErrors[].errInfo` in a command response is propagated as `WriteError.details` (or equivalent) in the
driver.

Using a 5.0+ server, create a collection with
[document validation](https://www.mongodb.com/docs/manual/core/schema-validation/) like so:

```javascript
{
  "create": "test",
  "validator": {
    "x": { $type: "string" }
  }
}
```

Enable [command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) to observe
CommandSucceededEvents. Then, insert an invalid document (e.g. `{x: 1}`) and assert that a WriteError occurs, that its
code is `121` (i.e. DocumentValidationFailure), and that its `details` property is accessible. Additionally, assert that
a CommandSucceededEvent was observed and that the `writeErrors[0].errInfo` field in the response document matches the
WriteError's `details` property.

### 3. `MongoClient.bulkWrite` batch splits a `writeModels` input with greater than `maxWriteBatchSize` operations

Test that `MongoClient.bulkWrite` properly handles `writeModels` inputs containing a number of writes greater than
`maxWriteBatchSize`.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the `maxWriteBatchSize` value contained in the
response. Then, construct the following write model (referred to as `model`):

```javascript
InsertOne: {
  "namespace": "db.coll",
  "document": { "a": "b" }
}
```

Construct a list of write models (referred to as `models`) with `model` repeated `maxWriteBatchSize + 1` times. Execute
`bulkWrite` on `client` with `models`. Assert that the bulk write succeeds and returns a `BulkWriteResult` with an
`insertedCount` value of `maxWriteBatchSize + 1`.

Assert that two CommandStartedEvents (referred to as `firstEvent` and `secondEvent`) were observed for the `bulkWrite`
command. Assert that the length of `firstEvent.command.ops` is `maxWriteBatchSize`. Assert that the length of
`secondEvent.command.ops` is 1. If the driver exposes `operationId`s in its CommandStartedEvents, assert that
`firstEvent.operationId` is equal to `secondEvent.operationId`.

### 4. `MongoClient.bulkWrite` batch splits when an `ops` payload exceeds `maxMessageSizeBytes`

Test that `MongoClient.bulkWrite` properly handles a `writeModels` input which constructs an `ops` array larger than
`maxMessageSizeBytes`.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the following values from the response:
`maxBsonObjectSize` and `maxMessageSizeBytes`. Then, construct the following document (referred to as `document`):

```javascript
{
  "a": "b".repeat(maxBsonObjectSize - 500)
}
```

Construct the following write model (referred to as `model`):

```javascript
InsertOne: {
  "namespace": "db.coll",
  "document": document
}
```

Use the following calculation to determine the number of inserts that should be provided to `MongoClient.bulkWrite`:
`maxMessageSizeBytes / maxBsonObjectSize + 1` (referred to as `numModels`). This number ensures that the inserts
provided to `MongoClient.bulkWrite` will require multiple `bulkWrite` commands to be sent to the server.

Construct as list of write models (referred to as `models`) with `model` repeated `numModels` times. Then execute
`bulkWrite` on `client` with `models`. Assert that the bulk write succeeds and returns a `BulkWriteResult` with an
`insertedCount` value of `numModels`.

Assert that two CommandStartedEvents (referred to as `firstEvent` and `secondEvent`) were observed. Assert that the
length of `firstEvent.command.ops` is `numModels - 1`. Assert that the length of `secondEvent.command.ops` is 1. If the
driver exposes `operationId`s in its CommandStartedEvents, assert that `firstEvent.operationId` is equal to
`secondEvent.operationId`.

### 5. `MongoClient.bulkWrite` collects `WriteConcernError`s across batches

Test that `MongoClient.bulkWrite` properly collects and reports `writeConcernError`s returned in separate batches.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) with `retryWrites: false` configured and
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the `maxWriteBatchSize` value contained in the
response. Then, configure the following fail point with `client`:

```javascript
{
  "configureFailPoint": "failCommand",
  "mode": { "times": 2 },
  "data": {
    "failCommands": ["bulkWrite"],
    "writeConcernError": {
      "code": 91,
      "errmsg": "Replication is being shut down"
    }
  }
}
```

Construct the following write model (referred to as `model`):

```javascript
InsertOne: {
  "namespace": "db.coll",
  "document": { "a": "b" }
}
```

Construct a list of write models (referred to as `models`) with `model` repeated `maxWriteBatchSize + 1` times. Execute
`bulkWrite` on `client` with `models`. Assert that the bulk write fails and returns a `BulkWriteError` (referred to as
`error`).

Assert that `error.writeConcernErrors` has a length of 2.

Assert that `error.partialResult` is populated. Assert that `error.partialResult.insertedCount` is equal to
`maxWriteBatchSize + 1`.

Assert that two CommandStartedEvents were observed for the `bulkWrite` command.

### 6. `MongoClient.bulkWrite` handles individual `WriteError`s across batches

Test that `MongoClient.bulkWrite` handles individual write errors across batches for ordered and unordered bulk writes.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the `maxWriteBatchSize` value contained in the
response.

Construct a `MongoCollection` (referred to as `collection`) with the namespace "db.coll" (referred to as `namespace`).
Drop `collection`. Then, construct the following document (referred to as `document`):

```javascript
{
  "_id": 1
}
```

Insert `document` into `collection`.

Create the following write model (referred to as `model`):

```javascript
InsertOne {
  "namespace": namespace,
  "document": document
}
```

Construct a list of write models (referred to as `models`) with `model` repeated `maxWriteBatchSize + 1` times.

#### Unordered

Test that an unordered bulk write collects `WriteError`s across batches.

Execute `bulkWrite` on `client` with `models` and `ordered` set to false. Assert that the bulk write fails and returns a
`BulkWriteError` (referred to as `unorderedError`).

Assert that `unorderedError.writeErrors` has a length of `maxWriteBatchSize + 1`.

Assert that two CommandStartedEvents were observed for the `bulkWrite` command.

#### Ordered

Test that an ordered bulk write does not execute further batches when a `WriteError` occurs.

Execute `bulkWrite` on `client` with `models` and `ordered` set to true. Assert that the bulk write fails and returns a
`BulkWriteError` (referred to as `orderedError`).

Assert that `orderedError.writeErrors` has a length of 1.

Assert that one CommandStartedEvent was observed for the `bulkWrite` command.

### 7. `MongoClient.bulkWrite` handles a cursor requiring a `getMore`

Test that `MongoClient.bulkWrite` properly iterates the results cursor when `getMore` is required.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the `maxBsonObjectSize` value from the
response.

Construct a `MongoCollection` (referred to as `collection`) with the namespace "db.coll" (referred to as `namespace`).
Drop `collection`. Then create the following list of write models (referred to as `models`):

```javascript
UpdateOne {
  "namespace": namespace,
  "filter": { "_id": "a".repeat(maxBsonObjectSize / 2) },
  "update": { "$set": { "x": 1 } },
  "upsert": true
},
UpdateOne {
  "namespace": namespace,
  "filter": { "_id": "b".repeat(maxBsonObjectSize / 2) },
  "update": { "$set": { "x": 1 } },
  "upsert": true
},
```

Execute `bulkWrite` on `client` with `models` and `verboseResults` set to true. Assert that the bulk write succeeds and
returns a `BulkWriteResult` (referred to as `result`).

Assert that `result.upsertedCount` is equal to 2.

Assert that the length of `result.updateResults` is equal to 2.

Assert that a CommandStartedEvent was observed for the `getMore` command.

### 8. `MongoClient.bulkWrite` handles a cursor requiring `getMore` within a transaction

Test that `MongoClient.bulkWrite` executed within a transaction properly iterates the results cursor when `getMore` is
required.

This test must only be run on 8.0+ servers. This test must not be run against standalone servers.

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the `maxBsonObjectSize` value from the
response.

Construct a `MongoCollection` (referred to as `collection`) with the namespace "db.coll" (referred to as `namespace`).
Drop `collection`.

Start a session on `client` (referred to as `session`). Start a transaction on `session`.

Create the following list of write models (referred to as `models`):

```javascript
UpdateOne {
  "namespace": namespace,
  "filter": { "_id": "a".repeat(maxBsonObjectSize / 2) },
  "update": { "$set": { "x": 1 } },
  "upsert": true
},
UpdateOne {
  "namespace": namespace,
  "filter": { "_id": "b".repeat(maxBsonObjectSize / 2) },
  "update": { "$set": { "x": 1 } },
  "upsert": true
},
```

Execute `bulkWrite` on `client` with `models`, `session`, and `verboseResults` set to true. Assert that the bulk write
succeeds and returns a `BulkWriteResult` (referred to as `result`).

Assert that `result.upsertedCount` is equal to 2.

Assert that the length of `result.updateResults` is equal to 2.

Assert that a CommandStartedEvent was observed for the `getMore` command.

### 9. `MongoClient.bulkWrite` handles a `getMore` error

Test that `MongoClient.bulkWrite` properly handles a failure that occurs when attempting a `getMore`.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the `maxBsonObjectSize` value from the
response. Then, configure the following fail point with `client`:

```javascript
{
  "configureFailPoint": "failCommand",
  "mode": { "times": 1 },
  "data": {
    "failCommands": ["getMore"],
    "errorCode": 8
  }
}
```

Construct a `MongoCollection` (referred to as `collection`) with the namespace "db.coll" (referred to as `namespace`).
Drop `collection`. Then create the following list of write models (referred to as `models`):

```javascript
UpdateOne {
  "namespace": namespace,
  "filter": { "_id": "a".repeat(maxBsonObjectSize / 2) },
  "update": { "$set": { "x": 1 } },
  "upsert": true
},
UpdateOne {
  "namespace": namespace,
  "filter": { "_id": "b".repeat(maxBsonObjectSize / 2) },
  "update": { "$set": { "x": 1 } },
  "upsert": true
},
```

Execute `bulkWrite` on `client` with `models` and `verboseResults` set to true. Assert that the bulk write fails and
returns a `BulkWriteError` (referred to as `bulkWriteError`).

Assert that `bulkWriteError.error` is populated with an error (referred to as `topLevelError`). Assert that
`topLevelError.errorCode` is equal to 8.

Assert that `bulkWriteError.partialResult` is populated with a result (referred to as `partialResult`). Assert that
`partialResult.upsertedCount` is equal to 2. Assert that the length of `partialResult.updateResults` is equal to 1.

Assert that a CommandStartedEvent was observed for the `getMore` command.

Assert that a CommandStartedEvent was observed for the `killCursors` command.

### 10. `MongoClient.bulkWrite` returns error for unacknowledged too-large insert

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`).

Perform a `hello` command using `client` and record the following values from the response: `maxBsonObjectSize`.

Then, construct the following document (referred to as `document`):

```javascript
{
  "a": "b".repeat(maxBsonObjectSize)
}
```

#### With insert

Construct the following write model (referred to as `model`):

```javascript
InsertOne: {
  "namespace": "db.coll",
  "document": document
}
```

Construct as list of write models (referred to as `models`) with the one `model`.

Call `MongoClient.bulkWrite` with `models` and `BulkWriteOptions.writeConcern` set to an unacknowledged write concern.

Expect a client-side error due the size.

#### With replace

Construct the following write model (referred to as `model`):

```javascript
ReplaceOne: {
  "namespace": "db.coll",
  "filter": {},
  "replacement": document
}
```

Construct as list of write models (referred to as `models`) with the one `model`.

Call `MongoClient.bulkWrite` with `models` and `BulkWriteOptions.writeConcern` set to an unacknowledged write concern.

Expect a client-side error due the size.

### 11. `MongoClient.bulkWrite` batch splits when the addition of a new namespace exceeds the maximum message size

Test that `MongoClient.bulkWrite` batch splits a bulk write when the addition of a new namespace to `nsInfo` causes the
size of the message to exceed `maxMessageSizeBytes - 1000`.

This test must only be run on 8.0+ servers.

Repeat the following setup for each test case:

### Setup

Construct a `MongoClient` (referred to as `client`) with
[command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.rst) enabled to observe
CommandStartedEvents. Perform a `hello` command using `client` and record the following values from the response:
`maxBsonObjectSize` and `maxMessageSizeBytes`.

Calculate the following values:

```
opsBytes = maxMessageSizeBytes - 1122
numModels = opsBytes / maxBsonObjectSize
remainderBytes = opsBytes % maxBsonObjectSize
```

Construct the following write model (referred to as `firstModel`):

```javascript
InsertOne {
  "namespace": "db.coll",
  "document": { "a": "b".repeat(maxBsonObjectSize - 57) }
}
```

Create a list of write models (referred to as `models`) with `firstModel` repeated `numModels` times.

If `remainderBytes` is greater than or equal to 217, add 1 to `numModels` and append the following write model to
`models`:

```javascript
InsertOne {
  "namespace": "db.coll",
  "document": { "a": "b".repeat(remainderBytes - 57) }
}
```

Then perform the following two tests:

#### Case 1: No batch-splitting required

Create the following write model (referred to as `sameNamespaceModel`):

```javascript
InsertOne {
  "namespace": "db.coll",
  "document": { "a": "b" }
}
```

Append `sameNamespaceModel` to `models`.

Execute `bulkWrite` on `client` with `models`. Assert that the bulk write succeeds and returns a `BulkWriteResult`
(referred to as `result`).

Assert that `result.insertedCount` is equal to `numModels + 1`.

Assert that one CommandStartedEvent was observed for the `bulkWrite` command (referred to as `event`).

Assert that the length of `event.command.ops` is `numModels + 1`. Assert that the length of `event.command.nsInfo` is 1.
Assert that the namespace contained in `event.command.nsInfo` is "db.coll".

#### Case 2: Batch-splitting required

Construct the following namespace (referred to as `namespace`):

```
"db." + "c".repeat(200)
```

Create the following write model (referred to as `newNamespaceModel`):

```javascript
InsertOne {
  "namespace": namespace,
  "document": { "a": "b" }
}
```

Append `newNamespaceModel` to `models`.

Execute `bulkWrite` on `client` with `models`. Assert that the bulk write succeeds and returns a `BulkWriteResult`
(referred to as `result`).

Assert that `result.insertedCount` is equal to `numModels + 1`.

Assert that two CommandStartedEvents were observed for the `bulkWrite` command (referred to as `firstEvent` and
`secondEvent`).

Assert that the length of `firstEvent.command.ops` is equal to `numModels`. Assert that the length of
`firstEvent.command.nsInfo` is equal to 1. Assert that the namespace contained in `firstEvent.command.nsInfo` is
"db.coll".

Assert that the length of `secondEvent.command.ops` is equal to 1. Assert that the length of
`secondEvent.command.nsInfo` is equal to 1. Assert that the namespace contained in `secondEvent.command.nsInfo` is
`namespace`.

#### Details on size calculations

This information is not needed to implement this prose test, but is documented for future reference. This test is
designed to work if `maxBsonObjectSize` or `maxMessageSizeBytes` changes, but will need to be updated if a required
field is added to the `bulkWrite` command or the `insert` operation document, or if the overhead `OP_MSG` allowance is
changed in the bulk write specification.

The command document for the `bulkWrite` has the following structure and size:

```javascript
{
  "bulkWrite": 1,
  "errorsOnly": true,
  "ordered": true
}

Size: 43 bytes
```

Each write model will create an `ops` document with the following structure and size:

```javascript
{
  "insert": <0 | 1>,
  "document": {
    "_id": <object ID>,
    "a": <string>
  }
}

Size: 57 bytes + <number of characters in string>
```

The `ops` document for both `newNamespaceModel` and `sameNamespaceModel` has a string with one character, so it is a
total of 58 bytes.

The models using the "db.coll" namespace will create one `nsInfo` document with the following structure and size:

```javascript
{
  "ns": "db.coll"
}

Size: 21 bytes
```

`newNamespaceModel` will create an `nsInfo` document with the following structure and size:

```javascript
{
  "ns": "db.<c repeated 200 times>"
}

Size: 217 bytes
```

We need to fill up the rest of the message with bytes such that another `ops` document will fit, but another `nsInfo`
entry will not. The following calculations are used:

```
# 1000 is the OP_MSG overhead required in the spec
maxBulkWriteBytes = maxMessageSizeBytes - 1000

# bulkWrite command + first namespace entry
existingMessageBytes = 43 + 21

# Space to fit the last model's ops entry
lastModelBytes = 58

remainingBulkWriteBytes = maxBulkWriteBytes - existingMessageBytes - lastModelBytes

# With the actual numbers plugged in
remainingBulkWriteBytes = maxMessageSizeBytes - 1122
```

### 12. `MongoClient.bulkWrite` returns an error if no operations can be added to `ops`

Test that `MongoClient.bulkWrite` returns an error if an operation provided exceeds `maxMessageSizeBytes` such that an
empty `ops` payload would be sent.

This test must only be run on 8.0+ servers. This test may be skipped by drivers that are not able to construct
arbitrarily large documents.

Construct a `MongoClient` (referred to as `client`). Perform a `hello` command using `client` and record the
`maxMessageSizeBytes` value contained in the response.

#### Case 1: `document` too large

Construct the following write model (referred to as `largeDocumentModel`):

```javascript
InsertOne {
  "namespace": "db.coll",
  "document": { "a": "b".repeat(maxMessageSizeBytes) }
}
```

Execute `bulkWrite` on `client` with `largeDocumentModel`. Assert that an error (referred to as `error`) is returned.
Assert that `error` is a client error.

#### Case 2: `namespace` too large

Construct the following namespace (referred to as `namespace`):

```
"db." + "c".repeat(maxMessageSizeBytes)
```

Construct the following write model (referred to as `largeNamespaceModel`):

```javascript
InsertOne {
  "namespace": namespace,
  "document": { "a": "b" }
}
```

Execute `bulkWrite` on `client` with `largeNamespaceModel`. Assert that an error (referred to as `error`) is returned.
Assert that `error` is a client error.

### 13. `MongoClient.bulkWrite` returns an error if auto-encryption is configured

This test is expected to be removed when [DRIVERS-2888](https://jira.mongodb.org/browse/DRIVERS-2888) is resolved.

Test that `MongoClient.bulkWrite` returns an error if the client has auto-encryption configured.

This test must only be run on 8.0+ servers.

Construct a `MongoClient` (referred to as `client`) configured with the following `AutoEncryptionOpts`:

```javascript
AutoEncryptionOpts {
  "keyVaultNamespace": "db.coll",
  "kmsProviders": {
    "aws": {
      "accessKeyId": "foo",
      "secretAccessKey": "bar"
    }
  }
}
```

Construct the following write model (referred to as `model`):

```javascript
InsertOne {
  "namespace": "db.coll",
  "document": { "a": "b" }
}
```

Execute `bulkWrite` on `client` with `model`. Assert that an error (referred to as `error`) is returned. Assert that
`error` is a client error containing the message: "bulkWrite does not currently support automatic encryption".
