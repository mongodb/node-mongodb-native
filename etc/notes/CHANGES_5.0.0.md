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

### `AddUserOptions.digestPassword` removed

The `digestPassword` option has been removed from the add user helper.

### Removal of Internal Types from Public API

The following types are used internally the driver but were accidentally exported.  They have now been
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

Both of these types were unused but exported.  These types have been removed.  Please
use `Document` instead.

### `CommandOperationOptions.fullResponse` Option Removed

The `fullResponse` option on the `CommandOperationOptions` as unused in the driver and has been removed.

### `BulkWriteOptions.keepGoing` Option Removed

The `keepGoing` option on the `BulkWriteOptions` has been removed.  Please use the `ordered` option instead.

### `WriteConcernError.err()` Removed

The `err()` getter on the WriteConcernError class has been removed.  The `toJSON()` method can be in place
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

### Snappy v7.x.x or later and optional peerDependency

`snappy` compression has been added to the package.json as a peerDependency that is **optional**.
This means `npm` will let you know if the version of snappy you have installed is incompatible with the driver.

```sh
npm install --save snappy@7
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

### Cursor closes on exit of for await of loops

Cursors will now automatically close when exiting a for await of loop on the cursor itself.

```js
const cursor = collection.find({});
for await (const doc of cursor) {
  console.log(doc);
  break;
}

cursor.closed // true
```

### Driver now sends `1` instead of `true` for hello commands

Everywhere the driver sends a `hello` command (initial handshake and monitoring), it will now pass the command value as `1` instead of the
previous `true` for spec compliance.

### Removed `Collection.insert`, `Collection.update`, and `Collection.remove`

Three legacy operation helpers on the collection class have been removed:

| Removed API                                    | API to migrate to                                  |
|------------------------------------------------|----------------------------------------------------|
| `insert(document)`                             | `insertOne(document)`                              |
| `insert(arrayOfDocuments)`                     | `insertMany(arrayOfDocuments)`                     |
| `update(filter)`                               | `updateMany(filter)`                               |
| `remove(filter)`                               | `deleteMany(filter)`                               |

The `insert` method could accept arrays or single documents, instead for single document inserts `insertOne` or an `insertMany` call with an array argument of one should be used.

```ts
// Single document insert:
await collection.insert({ name: 'spot' });
// Migration:
await collection.insertOne({ name: 'spot' });

// Multi-document insert:
await collection.insert([{ name: 'fido' }, { name: 'luna' }])
// Migration:
await collection.insertMany([{ name: 'fido' }, { name: 'luna' }])
```

### Removed `keepGoing` option from `BulkWriteOptions`

The `keepGoing` option was a legacy name for setting `ordered` to `false` for bulk inserts.
It was only supported by the legacy `collection.insert()` method which is now removed as noted above.
