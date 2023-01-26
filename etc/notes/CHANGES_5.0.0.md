# Changes in v5

## TOC

- TODO

## About

The following is a detailed collection of the changes in the major v5 release of the mongodb package for Node.js.

<!--
1. a brief statement of what is breaking (brief as in "x will now return y instead of z", or "x is no longer supported, use y instead", etc
2. a brief statement of why we are breaking it (bug, not useful, inconsistent behavior, better alternative, etc)
3. if applicable, an example of suggested syntax change (can be included in (1) )
-->

## Changes

### Optional callback support migrated to `mongodb-legacy`

Node v5 drops support for callbacks in favor of a promise-only API. Below are some strategies for
callback users to adopt driver v5 in order of most recommended to least recommended.

The Node driver team understands that a callback to promise migration can be a non-trivial refactor. To help inform your migration strategy, we've outlined three different approaches below.

#### Migrate to promise based api (recommended!)

The Node team strongly encourages anyone who is able to migrate from callbacks to promises to do so. Adopting the
regular driver API will streamline the adoption of future driver updates, as well as provide better Typescript support
than the other options outlined in this document.

The promise-based API is identical to the callback API except:

- no callback is accepted as the last argument
- a promise is always returned

For example, with a findOne query:

```typescript
// callback-based API
collection.findOne({ name: 'john snow' }, (error, result) => {
  if (error) {
    doSomethingWithError(error);
    return;
  }

  doSomethingWithResult(result);
});

// promise-based API
collection.findOne({ name: 'john snow' }).then(
  result => doSomethingWithResult(result),
  error => doSomethingWithError(error)
);

// promise-based API with async/await
try {
  const result = await collection.findOne({ name: 'john snow' });
  doSomethingWithResult(result);
} catch (error) {
  doSomethingWithError(error);
}
```

#### Use the promise-based API and `util.callbackify`

If you only have a few callback instances where you are currently unable to adopt the promise API, we recommend using the promise API and Nodejs's `callbackify`
utility to adapt the promise-based API to use callbacks.

**Note** Manually converting a promise-based api to a callback-based API is error prone. We strongly encourage the use of `callbackify`.

We recommend using callbackify with an anonymous function that has the same signature as the collection
method.

```typescript
const callbackFindOne = callbackify((query, options) => collection.findOne(query, options));

callbackFindOne({ name: 'john snow' }, {}, (error, result) => {
  // handle error or result
});
```

#### Add `mongodb-legacy` as a dependency and update imports to use `mongodb-legacy`

If you are a callback user and you are not ready to use promises, support for your workflow has **not** been removed.
We have migrated it to a new package:

- [`mongodb-legacy` Github](https://github.com/mongodb-js/nodejs-mongodb-legacy#readme)
- [`mongodb-legacy` npm](https://www.npmjs.com/package/mongodb-legacy)

The package wraps all of the driver's asynchronous operations that previously supported both promises and callbacks. All the wrapped APIs offer callback support via an optional callback argument alongside a Promise return value so projects with mixed usage will continue to work.

`mongodb-legacy` is intended to preserve driver v4 behavior to enable a smoother transition between
driver v4 and v5. However, new features will **only** only support a promise-based
API in both the driver **and** the legacy driver.

##### Example usage of equivalent callback and promise usage

After installing the package and modifying imports the following example demonstrates equivalent usages of either `async`/`await` syntax, `.then`/`.catch` chaining, or callbacks:

```ts
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

### Dot Notation Typescript Support Removed By Default

**NOTE:** This is a **Typescript compile-time only** change. Dot notation in filters sent to MongoDB will still work the same.

Version 4.3.0 introduced Typescript support for dot notation in filter predicates. For example:

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

#### Dot Notation Helper Types Exported

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

### `Collection.mapReduce()` helper removed

The `mapReduce` helper has been removed from the `Collection` class. The `mapReduce` operation has been
deprecated in favor of the aggregation pipeline since MongoDB server version 5.0. It is recommended
to migrate code that uses `Collection.mapReduce` to use the aggregation pipeline (see [Map-Reduce to Aggregation Pipeline](https://www.mongodb.com/docs/manual/reference/map-reduce-to-aggregation-pipeline/)).

If the `mapReduce` command must be used, the `Db.command()` helper can be used to run the raw
`mapReduce` command.

```typescript
// using the Collection.mapReduce helper in <4.x drivers
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

### `AddUserOptions.digestPassword` removed

The `digestPassword` option has been removed from the add user helper.

### Removal of Internal Types from Public API

The following types are used internally the driver but were accidentally exported. They have now been
marked internal and are no longer exported.

- ServerSelector
- PipeOptions
- ServerOptions

### `DeleteOptions.single` Option Removed

TODO - merge in Neal's removal of `collection.remove` and combine notes

### Remove of `ObjectID` Type in Favor Of `ObjectId`

For clarity the deprecated and duplicate export ObjectID has been removed. ObjectId matches the class name and is equal in every way to the capital "D" export.

### Kerberos Option `gssapiCanonicalizeHostName` Removed

`gssapiCanonicalizeHostName` has been removed in favor of the `CANONICALIZE_HOST_NAME` value.

### `Projection` and `ProjectionOperations` Types Removed

Both of these types were unused but exported. These types have been removed. Please
use `Document` instead.

### `CommandOperationOptions.fullResponse` Option Removed

The `fullResponse` option on the `CommandOperationOptions` as unused in the driver and has been removed.

### `BulkWriteOptions.keepGoing` Option Removed

The `keepGoing` option on the `BulkWriteOptions` has been removed. Please use the `ordered` option instead.

### `WriteConcernError.err()` Removed

The `err()` getter on the WriteConcernError class has been removed. The `toJSON()` method can be in place
of `err()`.

### slaveOk options removed

The deprecated `slaveOk` option and `slaveOk()` method on the `Collection` class have been removed. Please
now use `secondaryOk` as the replacement for the option and the method.

### Bulk results no longer contain `lastOp()` and `opTime`

The `lastOp()` method and `opTime` property on the `BulkResult` have been removed. Merging of bulk results
no longer normalizes the values. There is no new method or property to replace them.

### `CursorCloseOptions` removed

When calling `close()` on a `Cursor`, no more options can be provided. This removes support for the
`skipKillCursors` option that was unused.

### Snappy v7.2.2 or later and optional peerDependency

`snappy` compression has been added to the package.json as a peerDependency that is **optional**.
This means `npm` will let you know if the version of snappy you have installed is incompatible with the driver.

```sh
npm install --save "snappy@^7.2.2"
```

### `.unref()` removed from `Db`

The `.unref()` method was a no-op and has now been removed from the Db class.

### @aws-sdk/credential-providers v3.201.0 or later and optional peerDependency

`@aws-sdk/credential-providers` has been added to the package.json as a peerDependency that is **optional**.
This means `npm` will let you know if the version of the sdk you have installed is incompatible with the driver.

```sh
npm install --save @aws-sdk/credential-providers@3.186.0
```

### Minimum supported Node version

The new minimum supported Node.js version is now 14.20.1.

### Custom Promise library support removed

The MongoClient option `promiseLibrary` along with the `Promise.set` export that allows specifying a custom promise library has been removed.
This allows the driver to adopt async/await syntax which has [performance benefits](https://v8.dev/blog/fast-async) over manual promise construction.

### Cursors now implement `AsyncGenerator` interface instead of `AsyncIterator`

All cursor types have been changed to implement `AsyncGenerator` instead of `AsyncIterator`.
This was done to make our typing more accurate.

### Cursor closes on exit of for await of loops

Cursors will now automatically close when exiting a for await of loop on the cursor itself.

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
previous `true` for spec compliance.

### Removed `Collection.insert`, `Collection.update`, and `Collection.remove`

Three legacy operation helpers on the collection class have been removed:

| Removed API                | API to migrate to              |
| -------------------------- | ------------------------------ |
| `insert(document)`         | `insertOne(document)`          |
| `insert(arrayOfDocuments)` | `insertMany(arrayOfDocuments)` |
| `update(filter)`           | `updateMany(filter)`           |
| `remove(filter)`           | `deleteMany(filter)`           |

The `insert` method accepted an array of documents for multi-document inserts and a single document for single document inserts. `insertOne` should now be used for single-document inserts and `insertMany` should be used for multi-document inserts.

```ts
// Single document insert:
await collection.insert({ name: 'spot' });
// Migration:
await collection.insertOne({ name: 'spot' });

// Multi-document insert:
await collection.insert([{ name: 'fido' }, { name: 'luna' }]);
// Migration:
await collection.insertMany([{ name: 'fido' }, { name: 'luna' }]);
```

### Removed `keepGoing` option from `BulkWriteOptions`

The `keepGoing` option was a legacy name for setting `ordered` to `false` for bulk inserts.
It was only supported by the legacy `collection.insert()` method which is now removed as noted above.

### `bson-ext` support removed

The `bson-ext` package will no longer automatically import and supplant the `bson` dependency.

### `BulkWriteResult` no longer contains a publicly enumerable `result` property.

To access the raw result, please use `bulkWriteResult.getRawResponse()`.

### `BulkWriteResult` now contains individual ressult properties.

These can be accessed via:

```ts
bulkWriteResult.insertedCount;
bulkWriteResult.matchedCount;
bulkWriteResult.modifiedCount;
bulkWriteResult.deletedCount;
bulkWriteResult.upsertedCount;
bulkWriteResult.upsertedIds;
bulkWriteResult.insertedIds;
```
