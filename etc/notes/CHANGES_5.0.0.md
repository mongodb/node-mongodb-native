# Changes in the MongoDB Node.js Driver v5

## About

The following is a detailed collection of the changes in the major v5 release of the `mongodb` package for Node.js.

## Contents

- [Changes](#changes)
  - [Optional callback support migrated to `mongodb-legacy`](#optional-callback-support-migrated-to-mongodb-legacy)
    - [Migrate to Promise-based API (recommended!)](#migrate-to-promise-based-api-recommended)
    - [Use the Promise-based API and `util.callbackify`](#use-the-promise-based-api-and-utilcallbackify)
    - [Add `mongodb-legacy` as a dependency and update imports to use `mongodb-legacy`](#add-mongodb-legacy-as-a-dependency-and-update-imports-to-use-mongodb-legacy)
  - [Dot notation TypeScript support removed by default](#dot-notation-typescript-support-removed-by-default)
    - [Dot notation helper types exported](#dot-notation-helper-types-exported)
- [Build and Dependency Changes](#build-and-dependency-changes)
  - [Minimum supported Node version](#minimum-supported-node-version)
  - [`bson-ext` support removed](#bson-ext-support-removed)
  - [`@aws-sdk/credential-providers` v3.201.0 or later and optional `peerDependency`](#aws-sdkcredential-providers-v32010-or-later-and-optional-peerdependency)
  - [Snappy v7.2.2 or later and optional `peerDependency`](#snappy-v722-or-later-and-optional-peerdependency)
- [API Changes](#api-changes)
  - [Custom Promise library support removed](#custom-promise-library-support-removed)
  - [`Collection.insert`, `Collection.update`, and `Collection.remove` removed](#collectioninsert-collectionupdate-and-collectionremove-removed)
  - [`Collection.mapReduce()` helper removed](#collectionmapreduce-helper-removed)
  - [`BulkWriteResult` no longer contains a publicly enumerable `result` property](#bulkwriteresult-no-longer-contains-a-publicly-enumerable-result-property)
  - [`BulkWriteResult` now contains individual result properties](#bulkwriteresult-now-contains-individual-result-properties)
  - [Bulk results no longer contain `lastOp()` and `opTime`](#bulk-results-no-longer-contain-lastop-and-optime)
  - [`BulkWriteOptions.keepGoing` option removed](#bulkwriteoptionskeepgoing-option-removed)
  - [`WriteConcernError.err()` removed](#writeconcernerrorerr-removed)
  - [`AddUserOptions.digestPassword` removed](#adduseroptionsdigestpassword-removed)
  - [Kerberos option `gssapiCanonicalizeHostName` removed](#kerberos-option-gssapicanonicalizehostname-removed)
  - [`ObjectID` type removed in favor of `ObjectId`](#objectid-type-removed-in-favor-of-objectid)
  - [`slaveOk` options removed](#slaveok-options-removed)
  - [Cursors now implement `AsyncGenerator` interface instead of `AsyncIterator`](#cursors-now-implement-asyncgenerator-interface-instead-of-asynciterator)
- [Runtime Changes](#runtime-changes)
  - [Cursor closes on exit of `for await ... of` loops](#cursor-closes-on-exit-of-for-await--of-loops)
  - [Driver now sends `1` instead of `true` for hello commands](#driver-now-sends-1-instead-of-true-for-hello-commands)
- [Dead Code Cleanup](#dead-code-cleanup)
  - [`MongoClientOptions.logger` and `MongoClientOptions.logLevel` removed](#mongoclientoptionslogger-and-mongoclientoptionsloglevel-removed)
  - [`CursorCloseOptions` removed](#cursorcloseoptions-removed)
  - [`.unref()` removed from `Db`](#unref-removed-from-db)
  - [`CommandOperationOptions.fullResponse` option removed](#commandoperationoptionsfullresponse-option-removed)
  - [`Projection` and `ProjectionOperations` types removed](#projection-and-projectionoperations-types-removed)
  - [Internal types removed from public API](#internal-types-removed-from-public-api)

## Changes

### Optional callback support migrated to `mongodb-legacy`

Node.js driver v5 drops support for callbacks in favor of a Promise-only API. Below are some strategies for
callback users to adopt v5 of the driver in order of most recommended to least recommended.

The Node.js driver team understands that a callback to Promise migration can be a non-trivial refactor. To help inform your migration strategy, we've outlined three different approaches below.

#### Migrate to Promise-based API (recommended!)

The Node team strongly encourages anyone who is able to migrate from callbacks to Promises to do so. Migrating to
the driver's Promise-based API will streamline the adoption of future driver updates, as well as provide better TypeScript support
than the other options outlined in this document.

The Promise-based API is identical to the callback API except:

- no callback is accepted as the last argument
- a Promise is always returned

For example, with a `findOne` query:

```typescript
// callback-based API
collection.findOne({ name: 'john snow' }, (error, result) => {
  if (error) {
    /* do something with error */
    return;
  }

  /* do something with result */
});

// Promise-based API
collection
  .findOne({ name: 'john snow' })
  .then(() => {
    /* do something with result */
  })
  .catch(error => {
    /* do something with error */
  });

// Promise-based API with async/await
try {
  const result = await collection.findOne({ name: 'john snow' });
  /* do something with result */
} catch (error) {
  /* do something with error */
}
```

#### Use the Promise-based API and `util.callbackify`

If you only have a few callback instances where you are currently unable to adopt the Promise API, we recommend using the Promise API and [Node.js' `callbackify`](https://nodejs.org/api/util.html#utilcallbackifyoriginal)
utility to adapt the Promise-based API to use callbacks.

**Note** Manually converting a Promise-based API to a callback-based API is error prone. We strongly encourage the use of `callbackify`.

We recommend using `callbackify` with an anonymous function that has the same signature as the collection method.

```typescript
const callbackFindOne = callbackify((query, options) => collection.findOne(query, options));

callbackFindOne({ name: 'john snow' }, {}, (error, result) => {
  // handle error or result
});
```

#### Add `mongodb-legacy` as a dependency and update imports to use `mongodb-legacy`

If your application uses callbacks and you are not ready to use Promises, support for your workflow has **not** been removed.
We have migrated callback support to a new package:

- [`mongodb-legacy` GitHub](https://github.com/mongodb-js/nodejs-mongodb-legacy#readme)
- [`mongodb-legacy` npm](https://www.npmjs.com/package/mongodb-legacy)

The package wraps all of the driver's asynchronous operations that previously supported both Promises and callbacks. All the wrapped APIs offer callback support via an optional callback argument alongside a Promise return value so projects with mixed usage will continue to work.

`mongodb-legacy` is intended to preserve driver v4 behavior to enable a smoother transition between
driver v4 and v5. However, new features will **only** support a Promise-based API in both the driver
**and** the legacy driver.

##### Example usage of equivalent callback and Promise usage

After installing the package and modifying imports the following example demonstrates equivalent usages of either `async`/`await` syntax, `.then`/`.catch` chaining, or callbacks:

```typescript
// Just add '-legacy' to my mongodb import
import { MongoClient } from 'mongodb-legacy';
const client = new MongoClient();
const db = client.db();
const collection = db.collection('pets');

// Legacy projects may have intermixed API usage:
app.get('/endpoint_async_await', async (req, res) => {
  try {
    const result = await collection.findOne({});
    res.end(JSON.stringify(result));
  } catch (error) {
    res.errorHandling(error);
  }
});

app.get('/endpoint_promises', (req, res) => {
  collection
    .findOne({})
    .then(result => res.end(JSON.stringify(result)))
    .catch(error => res.errorHandling(error));
});

app.get('/endpoint_callbacks', (req, res) => {
  collection.findOne({}, (error, result) => {
    if (error) return res.errorHandling(error);
    res.end(JSON.stringify(result));
  });
});
```

### Dot notation TypeScript support removed by default

**NOTE:** This is a **TypeScript compile-time only** change. Dot notation in filters sent to MongoDB will still work the same.

MongoDB Node.js Driver v4.3.0 introduced TypeScript support for dot notation in filter predicates. For example:

```typescript
interface Schema {
  user: {
    name: string;
  };
}

declare const collection: Collection<Schema>;
// compiles pre-v4.3.0, fails in v4.3.0+
collection.find({ 'user.name': 4 });
```

This change caused a number of problems for users, including slow compilation times and compile errors for
valid dot notation queries. While we have tried to mitigate this issue as much as possible
in v4, ultimately we do not believe that this feature is fully production ready for all use cases.

Driver 5.0 removes type checking for dot notation in filter predicates. The preceding example will compile with
driver v5.

#### Dot notation helper types exported

Although we removed support for type checking on dot notation filters by default, we have preserved the
corresponding types in an experimental capacity.

These helper types can be used for type checking. We export the `StrictUpdateFilter` and the `StrictFilter`
types for type safety in updates and finds.

To use one of the new types, simply create a predicate that uses dot notation and assign it the type of `StrictFilter<your schema>`.

```typescript
interface Schema {
  user: {
    name: string;
  };
}

declare const collection: Collection<Schema>;

// fails to compile, 4 is not assignable to type "string"
const filterPredicate: StrictFilter<Schema> = { 'user.name': 4 };
collection.find(filterPredicate);
```

**NOTE** As an experimental feature, these types can change at any time and are not recommended for production settings.

## Build and Dependency Changes

### Minimum supported Node version

The new minimum supported Node.js version is now 14.20.1.

### `bson-ext` support removed

The `bson-ext` package will no longer automatically import and supplant the `bson` dependency.

### `@aws-sdk/credential-providers` v3.201.0 or later and optional `peerDependency`

`@aws-sdk/credential-providers` has been added to the `package.json` as a `peerDependency` that is **optional**.
This means `npm` will let you know if the version of the SDK you have installed is incompatible with the driver.

```sh
npm install --save @aws-sdk/credential-providers@3.186.0
```

### Snappy v7.2.2 or later and optional `peerDependency`

`snappy` compression has been added to the `package.json` as a `peerDependency` that is **optional**.
This means `npm` will let you know if the version of `snappy` you have installed is incompatible with the driver.

```sh
npm install --save "snappy@^7.2.2"
```

## API Changes

### Custom Promise library support removed

The `MongoClient` option `promiseLibrary` along with the `Promise.set` export that allows specifying a custom Promise library has been removed.

This allows the driver to adopt `async`/`await` syntax which has [performance benefits](https://v8.dev/blog/fast-async) over manual Promise construction.

### `Collection.insert`, `Collection.update`, and `Collection.remove` removed

Three legacy operation helpers on the collection class have been removed:

| Removed API                | API to migrate to              |
| -------------------------- | ------------------------------ |
| `insert(document)`         | `insertOne(document)`          |
| `insert(arrayOfDocuments)` | `insertMany(arrayOfDocuments)` |
| `update(filter)`           | `updateMany(filter)`           |
| `remove(filter)`           | `deleteMany(filter)`           |

The `insert` method accepted an array of documents for multi-document inserts and a single document for single document inserts. `insertOne` should now be used for single-document inserts and `insertMany` should be used for multi-document inserts.

```typescript
// Single document insert:
await collection.insert({ name: 'spot' });
// Migration:
await collection.insertOne({ name: 'spot' });

// Multi-document insert:
await collection.insert([{ name: 'fido' }, { name: 'luna' }]);
// Migration:
await collection.insertMany([{ name: 'fido' }, { name: 'luna' }]);
```

### `Collection.mapReduce()` helper removed

The `mapReduce` helper has been removed from the `Collection` class. The `mapReduce` operation has been
deprecated in favor of the aggregation pipeline since MongoDB server version 5.0. It is recommended
to migrate code that uses `Collection.mapReduce` to use the aggregation pipeline (see [Map-Reduce to Aggregation Pipeline](https://www.mongodb.com/docs/manual/reference/map-reduce-to-aggregation-pipeline/)).

If the `mapReduce` command must be used, the `Db.command()` helper can be used to run the raw `mapReduce` command.

```typescript
// using the Collection.mapReduce helper in < 4.x drivers
const collection = db.collection('my-collection');

await collection.mapReduce(
  function () {
    emit(this.user_id, 1);
  },
  function (k, vals) {
    return 1;
  },
  {
    out: 'inline',
    readConcern: 'majority'
  }
);

// manually running the command using `db.command()`
const command = {
  mapReduce: 'my-collection',
  map: 'function() { emit(this.user_id, 1); }',
  reduce: 'function(k,vals) { return 1; }',
  out: 'inline',
  readConcern: 'majority'
};

await db.command(command);
```

**Note** When using the `Db.command()` helper, all `mapReduce` options should be specified
on the raw command object and should not be passed through the options object.

### `BulkWriteResult` no longer contains a publicly enumerable `result` property

To access the raw result, please use `bulkWriteResult.getRawResponse()`.

### `BulkWriteResult` now contains individual result properties

These can be accessed via:

```typescript
bulkWriteResult.insertedCount;
bulkWriteResult.matchedCount;
bulkWriteResult.modifiedCount;
bulkWriteResult.deletedCount;
bulkWriteResult.upsertedCount;
bulkWriteResult.upsertedIds;
bulkWriteResult.insertedIds;
```

### Bulk results no longer contain `lastOp()` and `opTime`

The `lastOp()` method and `opTime` property on the `BulkResult` have been removed. Merging of bulk results
no longer normalizes the values. There is no new method or property to replace them.

### `BulkWriteOptions.keepGoing` option removed

The `keepGoing` option on the `BulkWriteOptions` has been removed. Please use the `ordered` option instead.

### `WriteConcernError.err()` removed

The `err()` getter on the WriteConcernError class has been removed. The `toJSON()` method can be used in place of `err()`.

### `AddUserOptions.digestPassword` removed

The `digestPassword` option has been removed from the add user helper.

### Kerberos option `gssapiCanonicalizeHostName` removed

`gssapiCanonicalizeHostName` has been removed in favor of the `CANONICALIZE_HOST_NAME` value.

### `ObjectID` type removed in favor of `ObjectId`

For clarity the deprecated and duplicate export `ObjectID` has been removed. `ObjectId` matches the class name and is equal in every way to the capital "D" export.

### `slaveOk` options removed

The deprecated `slaveOk` option and `slaveOk()` method on the `Collection` class have been removed. Please
now use `secondaryOk` as the replacement for the option and the method.

### Cursors now implement `AsyncGenerator` interface instead of `AsyncIterator`

All cursor types have been changed to implement `AsyncGenerator` instead of `AsyncIterator`.

This was done to make our typing more accurate.

## Runtime Changes

### Cursor closes on exit of `for await ... of` loops

Cursors will now automatically close when exiting a `for await ... of` loop on the cursor itself.

```js
const cursor = collection.find({});
for await (const doc of cursor) {
  console.log(doc);
  break;
}

cursor.closed; // true
```

### Driver now sends `1` instead of `true` for hello commands

Everywhere the driver sends a `hello` command (initial handshake and monitoring), it will now pass the command value as `1` instead of the
previous `true`. This change was made for specification compliance reasons.

## Dead Code Cleanup

### `MongoClientOptions.logger` and `MongoClientOptions.logLevel` removed

Both the `logger` and the `logLevel` options had no effect and have been removed.

### `CursorCloseOptions` removed

Options can no longer be provided to `Cursor.close()`. This removes support for the `skipKillCursors` option that was unused.

### `.unref()` removed from `Db`

The `.unref()` method was a no-op and has now been removed from the `Db` class.

### `CommandOperationOptions.fullResponse` option removed

The `fullResponse` option on the `CommandOperationOptions` was unused in the driver and has been removed.

### `Projection` and `ProjectionOperations` types removed

Both of these types were unused but exported. These types have been removed. Please use `Document` instead.

### Internal types removed from public API

The following types are used internally by the driver but were accidentally exported. They have now been
marked internal and are no longer exported.

- `ServerSelector`
- `PipeOptions`
- `ServerOptions`
