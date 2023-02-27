# Changes in 4.x (and how to migrate!)

_Hello dear reader, **thank you** for adopting version 4.x of the MongoDB Node.js driver, from the bottom of our developer hearts we thank you so much for taking the time to upgrade to our latest and greatest offering of a stunning database experience.
We hope you enjoy your upgrade experience and this guide gives you all the answers you are searching for.
If anything, and we mean anything, hinders your upgrade experience please let us know via [JIRA](https://jira.mongodb.org/browse/NODE).
We know breaking changes are hard but they are sometimes for the best.
Anyway, enjoy the guide, see you at the end!_

## Key Changes

### Typescript

We've migrated the driver to Typescript!
Users can now harness the power of type hinting and intellisense in editors that support it to develop their MongoDB applications.
Even pure JavaScript projects can benefit from the type definitions with the right linting setup.
Along with the type hinting there's consistent and helpful docs formatting that editors should be able to display while developing.
Recently we migrated our BSON library to TypeScript as well, this version of the driver pulls in that change.

#### Community Types users (@types/mongodb)

If you are a user of the community types (@types/mongodb) there will likely be compilation errors while adopting the types from our codebase.
Unfortunately we could not achieve a one to one match in types due to the details of writing the codebase in Typescript vs definitions for the user layer API along with the breaking changes of this major version. Please let us know if there's anything that is a blocker to upgrading [on JIRA](https://jira.mongodb.org/browse/NODE).

### Node.js Version

We now require node 12.9 or greater for version 4 of the driver.
If that's outside your support matrix at this time, that's okay!
Bug fix support for our 3.x branch will not be ending until summer 2022, which has support going back as far as Node.js v4!

### CRUD results

Our CRUD operations now return the drivers-wide spec-compliant results which are defined here:

- [CRUD SPEC Write Results](https://github.com/mongodb/specifications/blob/master/source/crud/crud.rst#write-results)

For example, `insertOne()` used to return an object that was shaped like:

```typescript
interface LegacyInsertOneResult {
    insertedCount: number;
    ops: InsertedDocument[];
    insertedId: ObjectId;
    connection: Connection;
    result: { ok: number; n: number };
}
```

and now returns:

```typescript
interface InsertOneResult {
  /**
   * Indicates whether this write result was acknowledged. If not, then all
   * other members of this result will be undefined.
   */
  acknowledged: boolean;

  /**
   * The identifier that was inserted. */
  insertedId: ObjectId;
}
```

### Cursor changes

#### Cursor returning functions

The following methods used to accept a callback as well as return the relevant cursor.
The callback parameter has now been removed and users should only use the returned cursor.

- `Collection.find()`
- `Collection.aggregate()`
- `Db.aggregate()`

#### Cursor classes

Affected classes:

- `AbstractCursor`
- `FindCursor`
- `AggregationCursor`
- `ChangeStreamCursor`
  - This is the underlying cursor for `ChangeStream`
- `ListCollectionsCursor`

Our Cursor implementation has been updated to clarify what is possible before and after execution of an operation. Take this example:

```javascript
const cursor = collection.find({ a: 2.3 }).skip(1);
for await (const doc of cursor) {
  console.log(doc);
  fc.limit(1); // bad.
}
```

Prior to the this release there was inconsistency surrounding how the cursor would error if a setting like limit was applied after cursor execution had begun.
Now, an error along the lines of: `Cursor is already initialized` is thrown.

##### Cursor.count always respects skip and limit

> Updated: Feb 3rd 2022

The `applySkipLimit` argument has been removed from `cursor.count`, cursors will always passthrough the skip and limit to the underlying count operation.
It is recommended that users utilize the `collection.countDocuments` or `collection.estimatedDocumentCount` APIs.

#### ChangeStream must be used as an iterator or an event emitter

You cannot use ChangeStream as an iterator after using as an EventEmitter nor visa versa.
Previously the driver would permit this kind of usage but it could lead to unpredictable behavior and obscure errors.
It's unlikely this kind of usage was useful but to be sure we now prevent it by throwing a clear error.

```javascript
const changeStream = db.watch();
changeStream.on('change', doc => console.log(doc));
await changeStream.next(); // throws: Cannot use ChangeStream as iterator after using as an EventEmitter
```

Or the reverse:

```javascript
const changeStream = db.watch();
await changeStream.next();
changeStream.on('change', doc => console.log(doc)); // throws: Cannot use ChangeStream as an EventEmitter after using as an iterator
```

#### Stream API

The Cursor no longer extends Readable directly, it must be transformed into a stream by calling cursor.stream(), for example:

```javascript
const cursor = collection.find({});
const stream = cursor.stream();
stream.on('data', data => console.log(data));
stream.on('end', () => client.close());
```

`Cursor.transformStream()` has been removed. `Cursor.stream()` accepts a transform function, so that API was redundant.

### MongoClientOptions interface

With type hinting users should find that the options passed to a MongoClient are completely enumerated and easily discoverable.

#### Connection Pool Options
In driver 3.5, we introduced some new connection pool-related options -- `maxPoolSize` and `minPoolSize` -- which were only respected when `useUnifiedTopology` was set to `true`. These options had legacy equivalents named `poolSize` and `minSize`, respectively, which could be used both with and without `useUnifiedTopology` set to `true`.

In driver 4.0, the legacy options have been removed, and only `maxPoolSize` and `minPoolSize` are supported. We have added options validation which should help you identify any usages of the old names.

Please note that the default value for the maximum pool size has changed over time. In driver 3.x **without** `useUnifiedTopology` set to `true`, the default value was 100. In driver 3.x **with** `useUnifiedTopology` set to true, the default was 10.

In this release, we have changed the default value for `maxPoolSize` to 100, in compliance with the drivers [connection pooling specification](https://github.com/mongodb/specifications/blob/master/source/connection-monitoring-and-pooling/connection-monitoring-and-pooling.rst).

#### Unified Topology Only

We internally now only manage a Unified Topology when you connect to your MongoDB.
The [differences are described in detail here](https://mongodb.github.io/node-mongodb-native/3.6/reference/unified-topology/).

Feel free to remove the `useUnifiedTopology` and `useNewUrlParser` options at your leisure, they are no longer used by the driver.

**NOTE:** With the unified topology, in order to connect to replicaSet nodes that have not been initialized you must use the new `directConnection` option.

#### Authentication

Specifying username and password as options is only supported in these two formats:

- `new MongoClient(url, { auth: { username: '', password: '' } })`
- `new MongoClient('mongodb://username:password@myDb.host')`

#### Check Server Identity Inconsistency

Specifying `checkServerIdentity === false` (along with enabling tls) is different from leaving it `undefined`.
The 3.x version intercepted `checkServerIdentity: false` and turned it into a no-op function which is the required way to skip checking the server identity by nodejs.
Setting this option to `false` is only for testing anyway as it disables essential verification to TLS.
So it made sense for our library to directly expose the option validation from Node.js.
If you need to test TLS connections without verifying server identity pass in `{ checkServerIdentity: () => {} }`.

#### Kerberos / GSSAPI

`gssapiServiceName` has been removed.
Users should use `authMechanismProperties.SERVICE_NAME` like so:

- In a URI query param: `?authMechanismProperties=SERVICE_NAME:alternateServiceName`
- Or as an option: `{ authMechanismProperties: { SERVICE_NAME: 'alternateServiceName' } }`

### Non-boolean types are no longer accepted for boolean options
Previously, the driver would accept values that could be coerced to booleans (e.g. `0` and `1`) for  boolean options (for example, `UpdateOptions.upsert`). This is no longer the case; any option documented as being a boolean must be specified as a boolean value.

### db.collection no longer accepts a callback

The only option that required the use of the callback was strict mode.
The strict option would return an error if the collection does not exist.
Users who wish to ensure operations only execute against existing collections should use `db.listCollections` directly.

For example:

```javascript
const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map(
  ({ name }) => name
); // map to get string[]
if (!collections.includes(myNewCollectionName)) {
  throw new Error(`${myNewCollectionName} doesn't exist`);
}
```

### BulkWriteError renamed to MongoBulkWriteError

In 3.x we exported both the names above, we now only export `MongoBulkWriteError`.
Users testing for `BulkWriteError`s should be sure to import the new class name `MongoBulkWriteError`.

### Db no longer emits events

The Db instance is no longer an EventEmitter, all events your application is concerned with can be listened to directly from the `MongoClient` instance.

### Collection.group() removed

The collection `group()` helper has been deprecated in MongoDB since 3.4 and is now removed from the driver.
The same functionality can be achieved using the aggregation pipeline's `$group` operator.

### GridStore removed

The deprecated GridStore API has been removed from the driver.
For more information on GridFS [see the mongodb manual](https://www.mongodb.com/docs/manual/core/gridfs/).

Below are some snippets that represent equivalent operations:

#### Construction

```javascript
// old way
const gs = new GridStore(db, filename, mode[, options])
// new way
const bucket = new GridFSBucket(client.db('test')[, options])
```

#### File seeking

Since GridFSBucket uses the Node.js Stream API you can replicate file seek-ing by using the start and end options creating a download stream from your GridFSBucket

```javascript
bucket.openDownloadStreamByName(filename, { start: 23, end: 52 });
```

#### File Upload & File Download

```javascript
await client.connect();
const filename = 'test.txt'; // whatever local file name you want
const db = client.db();
const bucket = new GridFSBucket(db);

fs.createReadStream(filename)
  .pipe(bucket.openUploadStream(filename))
  .on('error', console.error)
  .on('finish', () => {
    console.log('done writing to db!');

    bucket
      .find()
      .toArray()
      .then(files => {
        console.log(files);

        bucket
          .openDownloadStreamByName(filename)
          .pipe(fs.createWriteStream('downloaded_' + filename))
          .on('error', console.error)
          .on('finish', () => {
            console.log('done downloading!');
            client.close();
          });
      });
  });
```

Notably, **GridFSBucket does not need to be closed like GridStore.**

#### File Deletion

Deleting files hasn't changed much:

```javascript
GridStore.unlink(db, name, callback); // Old way
bucket.delete(file_id); // New way!
```

#### Finding File Metadata

File metadata that used to be accessible on the GridStore instance can be found by querying the bucket

```typescript
const fileMetaDataList: GridFSFile[] = bucket.find({}).toArray();
```

#### Hashing an upload

The automatic MD5 hashing has been removed from the upload family of functions.
This makes the default Grid FS behavior compliant with systems that do not permit usage of MD5 hashing.
The `disableMD5` option is no longer used and has no effect.

If you still want to add an MD5 hash to your file upload, here's a simple example that can be used with [any hashing algorithm](https://nodejs.org/dist/latest-v14.x/docs/api/crypto.html#crypto_crypto_createhash_algorithm_options) provided by Node.js:

```javascript
const bucket = new GridFSBucket(db);

// can be whatever algorithm is supported by your local openssl
const hash = crypto.createHash('md5');
hash.setEncoding('hex'); // we want a hex string in the end

const _id = new ObjectId(); // we could also use file name to do the update lookup

const uploadStream = fs
  .createReadStream('./test.txt')
  .on('data', data => hash.update(data)) // keep the hash up to date with the file chunks
  .pipe(bucket.openUploadStreamWithId(_id, 'test.txt'));

const md5 = await new Promise((resolve, reject) => {
  uploadStream
    .once('error', error => reject(error))
    .once('finish', () => {
      hash.end(); // must call hash.end() otherwise hash.read() will be `null`
      resolve(hash.read());
    });
});

await db.collection('fs.files').updateOne({ _id }, { $set: { md5 } });
```

### BSON

> Updated April 4th, 2022

This version includes an upgrade from js-bson 1.x to js-bson 4.x.

#### Timestamps math operations return Javascript `Long`s

In versions prior to 4.x of the BSON library, Timestamps were represented with a custom class.  In version 4.x of the BSON library, the Timestamp class was refactored to
be a subclass of the Javascript Long class.  As a result of this refactor, math operations on Timestamp objects now return Long objects instead of Timestamp objects.

Math operations with Timestamps is not recommended.  However, if Timestamp math must be used, the old behavior can be replicated by using the Timestamp
constructor, which takes a Long as an argument.

```typescript
const four = Timestamp.fromNumber(4);
const five = Timestamp.fromNumber(5);
const nine = new TimeStamp(four.add(five));
```

## Intentional Breaking Changes

- [`NODE-3368`](https://jira.mongodb.org/browse/NODE-3368): make name prop on error classes read-only ([#2879](https://github.com/mongodb/node-mongodb-native/pull/2879))
- [`NODE-3291`](https://jira.mongodb.org/browse/NODE-3291): standardize error representation in the driver ([#2824](https://github.com/mongodb/node-mongodb-native/pull/2824))
- [`NODE-3272`](https://jira.mongodb.org/browse/NODE-3272): emit correct event type when SRV Polling ([#2825](https://github.com/mongodb/node-mongodb-native/pull/2825))
- [`NODE-1812`](https://jira.mongodb.org/browse/NODE-1812): replace returnOriginal with returnDocument option ([#2803](https://github.com/mongodb/node-mongodb-native/pull/2803))
- [`NODE-3157`](https://jira.mongodb.org/browse/NODE-3157): update find and modify interfaces for 4.0 ([#2799](https://github.com/mongodb/node-mongodb-native/pull/2799))
- [`NODE-2961`](https://jira.mongodb.org/browse/NODE-2961): clarify empty BulkOperation error message ([#2697](https://github.com/mongodb/node-mongodb-native/pull/2697))
- [`NODE-1709`](https://jira.mongodb.org/browse/NODE-1709): stop emitting topology events from `Db` ([#2251](https://github.com/mongodb/node-mongodb-native/pull/2251))
- [`NODE-2704`](https://jira.mongodb.org/browse/NODE-2704): integrate MongoOptions parser into driver ([#2680](https://github.com/mongodb/node-mongodb-native/pull/2680))
- [`NODE-2757`](https://jira.mongodb.org/browse/NODE-2757): add collation to FindOperators ([#2679](https://github.com/mongodb/node-mongodb-native/pull/2679))
- [`NODE-2602`](https://jira.mongodb.org/browse/NODE-2602): createIndexOp returns string, CreateIndexesOp returns array ([#2666](https://github.com/mongodb/node-mongodb-native/pull/2666))
- [`NODE-2936`](https://jira.mongodb.org/browse/NODE-2936): conform CRUD result types to specification ([#2651](https://github.com/mongodb/node-mongodb-native/pull/2651))
- [`NODE-2590`](https://jira.mongodb.org/browse/NODE-2590): adds async iterator for custom promises ([#2578](https://github.com/mongodb/node-mongodb-native/pull/2578))
- [`NODE-2458`](https://jira.mongodb.org/browse/NODE-2458): format sort in cursor and in sort builder ([#2573](https://github.com/mongodb/node-mongodb-native/pull/2573))
- [`NODE-2820`](https://jira.mongodb.org/browse/NODE-2820): pull CursorStream out of Cursor ([#2543](https://github.com/mongodb/node-mongodb-native/pull/2543))
- [`NODE-2850`](https://jira.mongodb.org/browse/NODE-2850): only store topology on MongoClient ([#2594](https://github.com/mongodb/node-mongodb-native/pull/2594))
- [`NODE-2423`](https://jira.mongodb.com/browse/NODE-2423): deprecate `oplogReplay` for find commands ([24155e7](https://github.com/mongodb/node-mongodb-native/commit/24155e7905422460afc7e6abb120c596f40712c1))

## Removals

- [`NODE-2752`](https://jira.mongodb.org/browse/NODE-2752): remove strict/callback mode from Db.collection helper ([#2817](https://github.com/mongodb/node-mongodb-native/pull/2817))
- [`NODE-2978`](https://jira.mongodb.org/browse/NODE-2978): remove deprecated bulk ops ([#2794](https://github.com/mongodb/node-mongodb-native/pull/2794))
- [`NODE-1722`](https://jira.mongodb.org/browse/NODE-1722): remove top-level write concern options ([#2642](https://github.com/mongodb/node-mongodb-native/pull/2642))
- [`NODE-1487`](https://jira.mongodb.org/browse/NODE-1487): remove deprecated Collection.group helper ([#2609](https://github.com/mongodb/node-mongodb-native/pull/2609))
- [`NODE-2816`](https://jira.mongodb.org/browse/NODE-2816): remove deprecated find options ([#2571](https://github.com/mongodb/node-mongodb-native/pull/2571))
- [`NODE-2320`](https://jira.mongodb.org/browse/NODE-2320): remove deprecated GridFS API ([#2290](https://github.com/mongodb/node-mongodb-native/pull/2290))
- [`NODE-2713`](https://jira.mongodb.com/browse/NODE-2713): remove `parallelCollectionScan` helper ([#2449](https://github.com/mongodb/node-mongodb-native/pull/2449)) ([9dee21f](https://github.com/mongodb/node-mongodb-native/commit/9dee21feefab9a8f20e289e6ff7abece40ef7d0b))
- [`NODE-2324`](https://jira.mongodb.com/browse/NODE-2324): remove Cursor#transformStream ([#2574](https://github.com/mongodb/node-mongodb-native/pull/2574)) ([a54be7a](https://github.com/mongodb/node-mongodb-native/commit/a54be7afd665d92337a8ba2e206cc3e6ce5e5773))
- [`NODE-2318`](https://jira.mongodb.com/browse/NODE-2318): remove legacy topology types ([6aa2434](https://github.com/mongodb/node-mongodb-native/commit/6aa2434628e85ead8e5be620c27ebe8ab08a1c05))
- [`NODE-2560`](https://jira.mongodb.com/browse/NODE-2560): remove reIndex ([#2370](https://github.com/mongodb/node-mongodb-native/pull/2370)) ([6b510a6](https://github.com/mongodb/node-mongodb-native/commit/6b510a689ab0dc44b3302ad21c171e75f9059716))
- [`NODE-2736`](https://jira.mongodb.com/browse/NODE-2736): remove the collection save method ([#2477](https://github.com/mongodb/node-mongodb-native/pull/2477)) ([d5bb496](https://github.com/mongodb/node-mongodb-native/commit/d5bb49637853c841b47df020807edf9adb5ef804))
- [`NODE-1722`](https://jira.mongodb.com/browse/NODE-1722): remove top-level write concern options ([#2642](https://github.com/mongodb/node-mongodb-native/issues/2642)) ([6914e87](https://github.com/mongodb/node-mongodb-native/commit/6914e875b37fb0ad444105ad24839d50c5c224d4))
- [`NODE-2506`](https://jira.mongodb.com/browse/NODE-2506): remove createCollection strict mode ([#2506](https://github.com/mongodb/node-mongodb-native/pull/2506)) ([bb13764](https://github.com/mongodb/node-mongodb-native/commit/bb137643b2a95bd5898d2fef4d761de5f2e2cde0))
- [`NODE-2562`](https://jira.mongodb.com/browse/NODE-2562): remove geoHaystackSearch ([#2315](https://github.com/mongodb/node-mongodb-native/pull/2315)) ([5a1b61c](https://github.com/mongodb/node-mongodb-native/commit/5a1b61c9f2baf8f6f3cec4c34ce2db52272cd49d))
- [`NODE-3427`](https://jira.mongodb.org/browse/NODE-3427): remove md5 hashing from GridFS API ([#2899](https://github.com/mongodb/node-mongodb-native/pull/2740)) ([a488d88](https://github.com/mongodb/node-mongodb-native/commit/a488d8838e0d046b0eae243504258a0896ffb383))
- [`NODE-2317`](https://jira.mongodb.org/browse/NODE-2317): remove deprecated items ([#2740](https://github.com/mongodb/node-mongodb-native/pull/2740)) ([listed below](#removed-deprecations))

## Removed deprecations

- `Collection.prototype.find / findOne` options:
  - `fields` - use `projection` instead
- `Collection.prototype.save` - use `insertOne` instead
- `Collection.prototype.dropAllIndexes`
- `Collection.prototype.ensureIndex`
- `Collection.prototype.findAndModify` - use `findOneAndUpdate`/`findOneAndReplace` instead
- `Collection.prototype.findAndRemove` - use `findOneAndDelete` instead
- `Collection.prototype.parallelCollectionScan`
- `MongoError.create`
- `Topology.destroy`
- `Cursor.prototype.each` - use `forEach` instead
- `Db.prototype.eval`
- `Db.prototype.ensureIndex`
- `Db.prototype.profilingInfo`
- `MongoClient.prototype.logout`
- `MongoClient.prototype.addUser` - creating a user without roles
- `MongoClient.prototype.connect`
- `Remove MongoClient.isConnected` - calling connect is a no-op if already connected
- `Remove MongoClient.logOut`
- `require('mongodb').instrument`
  - Use command monitoring: `client.on('commandStarted', (ev) => {})`
- Top-Level export no longer a function: `typeof require('mongodb') !== 'function'`
  - Must construct a MongoClient and call `.connect()` on it.
- Removed `Symbol` export, now `BSONSymbol` which is a deprecated BSON type
  - Existing BSON symbols in your database will be deserialized to a BSONSymbol instance; however, users should use plain strings instead of BSONSymbol
- Removed `connect` export, use `MongoClient` construction

---

_And that's a wrap, thanks for upgrading! You've been a great audience!_
