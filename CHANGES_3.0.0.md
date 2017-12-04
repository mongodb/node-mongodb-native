## Features

The following are new features added in MongoDB 3.6 and supported in the Node.js driver.

### Retryable Writes

Support has been added for retryable writes through the connection string. MongoDB 3.6
will utilize server sessions to allow some write commands to specify a transaction ID to enforce
at-most-once semantics for the write operation(s) and allow for retrying the operation if the driver
fails to obtain a write result (e.g. network error or "not master" error after a replica set
failover)Full details can be found in the [Retryable Writes Specification](https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst).


### DNS Seedlist Support

Support has been added for DNS Seedlists. Users may now configure a single domain to return a list
of host names. Full details can be found in the [Seedlist Discovery Specification](https://github.com/mongodb/specifications/blob/master/source/initial-dns-seedlist-discovery/initial-dns-seedlist-discovery.rst).

### Change Streams

Support has been added for creating a stream to track changes to a particular collection. This is a
new feature in MongoDB 3.6. Full details can be found in the [Change Stream Specification](https://github.com/mongodb/specifications/blob/master/source/change-streams.rst) as
well as [examples in the test directory](https://github.com/mongodb/node-mongodb-native/blob/3.0.0/test/functional/operation_changestream_example_tests.js).

### Sessions

Version 3.6 of the server introduces the concept of logical sessions for clients. In this driver,
`MongoClient` now tracks all sessions created on the client, and explicitly cleans them up upon
client close. More information can be found in the [Driver Sessions Specification](https://github.com/mongodb/specifications/blob/master/source/sessions/driver-sessions.rst).

## API Changes

We removed the following API methods.

- `Db.prototype.authenticate`
- `Db.prototype.logout`
- `Db.prototype.open`
- `Db.prototype.db`
- `Db.prototype.close`
- `Admin.prototype.authenticate`
- `Admin.prototype.logout`
- `Admin.prototype.profilingLevel`
- `Admin.prototype.setProfilingLevel`
- `Admin.prototype.profilingInfo`
- `Cursor.prototype.nextObject`

We've added the following API methods.
- `MongoClient.prototype.logout`
- `MongoClient.prototype.isConnected`
- `MongoClient.prototype.db`
- `MongoClient.prototype.close`
- `MongoClient.prototype.connect`
- `Db.prototype.profilingLevel`
- `Db.prototype.setProfilingLevel`
- `Db.prototype.profilingInfo`

In core we have removed the possibility of authenticating multiple credentials against the same
connection pool. This is to avoid problems with MongoDB 3.6 or higher where all users will reside in
the admin database and thus database level authentication is no longer supported.

The legacy construct

```js
var db = var Db('test', new Server('localhost', 27017));
db.open((err, db) => {
  // Authenticate
  db.admin().authenticate('root', 'root', (err, success) => {
    ....
  });
});
```

is replaced with

```js
new MongoClient(new Server('localhost', 27017), {
    user: 'root'
  , password: 'root'
  , authSource: 'adming'}).connect((err, client) => {
    ....
  })
```

`MongoClient.connect` works as expected but it returns the MongoClient instance instead of a
database object.

The legacy operation

```js
MongoClient.connect('mongodb://localhost:27017/test', (err, db) => {
  // Database returned
});
```

is replaced with

```js
MongoClient.connect('mongodb://localhost:27017/test', (err, client) => {
  // Client returned
  var db = client.db('test');
});
```

`Collection.prototype.aggregate` now returns a cursor if a callback is provided. It used to return
the resulting documents which is the same as calling `cursor.toArray()` on the cursor we now pass to
the callback.

## Other Changes

Below are more updates to the driver in the 3.0.0 release.

### Connection String

Following [changes to the MongoDB connection string specification](https://github.com/mongodb/specifications/commit/4631ccd4f825fb1a3aba204510023f9b4d193a05),
authentication and hostname details in connection strings must now be URL-encoded. These changes
reduce ambiguity in connection strings.

For example, whereas before `mongodb://u$ername:pa$$w{}rd@/tmp/mongodb-27017.sock/test` would have
been a valid connection string (with username `u$ername`, password `pa$$w{}rd`, host `/tmp/mongodb-27017.sock`
and auth database `test`), the connection string for those details would now have to be provided to
MongoClient as `mongodb://u%24ername:pa%24%24w%7B%7Drd@%2Ftmp%2Fmongodb-27017.sock/test`.

Unsupported URL options in a connection string now log a warning instead of throwing an error.

For more information about connection strings, read the [connection string specification](https://github.com/mongodb/specifications/blob/master/source/connection-string/connection-string-spec.rst).


### `BulkWriteResult` & `BulkWriteError`

When errors occured with bulk write operations in the past, the driver would callback or reject with
the first write error, as well as passing the resulting `BulkWriteResult`.  For example:

```js
MongoClient.connect('mongodb://localhost', function(err, client) {
  const collection = client.db('foo').collection('test-collection')

  collection
    .insert({ id: 1 })
    .then(() => collection.insertMany([ { id: 1 }, { id: 1 } ]))
    .then(result => /* deal with errors in `result */)
    .catch(err => /* no error is thrown for bulk errors */);
});
```

becomes:

```js
MongoClient.connect('mongodb://localhost', function(err, client) {
  const collection = client.db('foo').collection('test-collection')

  collection
    .insert({ id: 1 })
    .then(() => collection.insertMany([ { id: 1 }, { id: 1 } ]))
    .then(() => /* this will not be called in the event of a bulk write error */)
    .catch(err => /* deal with errors in `err` */);
});
```

Where the result of the failed operation is a `BulkWriteError` which has a child value `result`
which is the original `BulkWriteResult`.  Similarly, the callback form no longer calls back with an
`(Error, BulkWriteResult)`, but instead just a `(BulkWriteError)`.

### `mapReduce` inlined results

When `Collection.prototype.mapReduce` is invoked with a callback that includes `out: 'inline'`,
it would diverge from the `Promise`-based variant by returning additional data as positional
arguments to  the callback (`(err, result, stats, ...)`).  This is no longer the case, both variants
of the method will now return a single object for all results - a single value for the default case,
and an object similar to the existing `Promise` form for cases where there is more data to pass to
the user.

### Find

`find` and `findOne` no longer support the `fields` parameter. You can achieve the same results as
the `fields` parameter by using `Cursor.prototype.project` or by passing the `projection` property
in on the options object . Additionally, `find` does not support individual options like `skip` and
`limit` as positional parameters. You must either pass in these parameters in the `options` object,
or add them via `Cursor` methods like `Cursor.prototype.skip`.

### Aggregation

Support added for `comment` in the aggregation command. Support also added for a `hint` field in the
aggregation `options`.

If you use aggregation and try to use the `explain` flag while you have a `readConcern` or
`writeConcern`, your query will now fail.

### `updateOne` & `updateMany`

The driver now ensures that updated documents contain atomic operators. For instance, if a user
tries to update an existing document but passes in no operations (such as `$set`, `$unset`, or
`$rename`), the driver will now error:

```js

let testCollection = db.collection('test');
testCollection.updateOne({_id: 'test'}, {});
// An error is returned: The update operation document must contain at least one atomic operator.
```

### Tests

We have updated all of the tests to use [Mocha](https://mochajs.org) and a new test runner, [`mongodb-test-runner`](https://github.com/mongodb-js/mongodb-test-runner), which
sets up topologies for the test scenarios.
