# Changes in the MongoDB Node.js Driver v6

## About

The following is a detailed collection of the changes in the major v6 release of the `mongodb` package for Node.js.
The main focus of this release was usability improvements and a streamlined API. Read on for details!

> [!IMPORTANT]
> This is a list of changes relative to v5.8.1 of the driver. ALL changes listed below are BREAKING.
> Users migrating from an older version of the driver are advised to upgrade to at least v5.8.1 before adopting v6.

## Contents

- [🛠️ Runtime and dependency updates](#%EF%B8%8F-runtime-and-dependency-updates)
  - [Minimum Node.js version is now v16.20.1](#minimum-nodejs-version-is-now-v16201)
  - [BSON version 6.0.0](#bson-version-600)
  - [Optional peer dependency version bumps](#optional-peer-dependency-version-bumps)
  - [Allow `socks` to be installed optionally](#allow-socks-to-be-installed-optionally)
- [☀️ API usability improvements](#%EF%B8%8F-api-usability-improvements)
  - [`findOneAndX` family of methods will now return only the found document or `null` by default (`includeResultMetadata` is false by default)](#findoneandx-family-of-methods-will-now-return-only-the-found-document-or-null-by-default-includeresultmetadata-is-false-by-default)
  - [`session.commitTransaction()` and `session.abortTransaction()` return void](#sessioncommittransaction-and-sessionaborttransaction-return-void)
  - [`withSession` and `withTransaction` return the value returned by the provided function](#withsession-and-withtransaction-return-the-value-returned-by-the-provided-function)
  - [Driver methods throw if a session is provided from a different `MongoClient`](#driver-methods-throw-if-a-session-is-provided-from-a-different-mongoclient-)
  - [Callbacks removed from ClientEncryption's `encrypt`, `decrypt`, and `createDataKey` methods](#callbacks-removed-from-clientencryptions-encrypt-decrypt-and-createdatakey-methods)
  - [`MongoCryptError` is now a subclass of `MongoError`](#mongocrypterror-is-now-a-subclass-of-mongoerror)
- [⚙️ Option parsing improvements](#%EF%B8%8F-option-parsing-improvements)
  - [`useNewUrlParser` and `useUnifiedTopology` emit deprecation warnings](#usenewurlparser-and-useunifiedtopology-emit-deprecation-warnings)
  - [Boolean options only accept 'true' or 'false' in connection strings](#boolean-options-only-accept-true-or-false-in-connection-strings)
  - [Repeated options are no longer allowed in connection strings](#repeated-options-are-no-longer-allowed-in-connection-strings)
  - [TLS certificate authority and certificate-key files are now read asynchronously](#tls-certificate-authority-and-certificate-key-files-are-now-read-asynchronously)
- [🐛 Bug fixes](#-bug-fixes)
  - [db.command() and admin.command() unsupported options removed](#dbcommand-and-admincommand-unsupported-options-removed)
  - [Removed irrelevant fields from `ConnectionPoolCreatedEvent.options`](#removed-irrelevant-fields-from-connectionpoolcreatedeventoptions)
  - [Fixed parsing of empty readPreferenceTags in connection string](#fixed-parsing-of-empty-readpreferencetags-in-connection-string)
  - [Corrected `GridFSBucketWriteStream`'s `Writable` method overrides and event emission](#corrected-gridfsbucketwritestreams-writable-method-overrides-and-event-emission)
  - [Fix manually emitted events from `GridFSBucketReadStream`](#fix-manually-emitted-events-from-gridfsbucketreadstream)
  - [`createDataKey` return type fix](#createdatakey-return-type-fix)
- [📜 Removal of deprecated functionality](#-removal-of-deprecated-functionality)
  - [`db.addUser()` and `admin.addUser()` removed](#dbadduser-and-adminadduser-removed)
  - [`collection.stats()` removed](#collectionstats-removed)
  - [`BulkWriteResult` deprecated properties removed](#bulkwriteresult-deprecated-properties-removed)
  - [Deprecated SSL options have been removed](#deprecated-ssl-options-have-been-removed)
  - [The deprecated `keepAlive` and `keepAliveInitialDelay` options have been removed](#the-deprecated-keepalive-and-keepaliveinitialdelay-options-have-been-removed)
- [🗑️ Removal of "dead" code](#-removal-of-dead-code)
  - [Constructors for `MongoError` and its subclasses now clearly indicate they are meant for internal use only](#constructors-for-mongoerror-and-its-subclasses-now-clearly-indicate-they-are-meant-for-internal-use-only)
  - [`AutoEncrypter` and `MongoClient.autoEncrypter` are now internal](#autoencrypter-and-mongoclientautoencrypter-are-now-internal)
  - [`ClientEncryption.onKMSProvidersRefresh` function removed](#clientencryptiononkmsprovidersrefresh-function-removed)
  - [`EvalOptions` removed](#evaloptions-removed)
- [⚠️ ALL BREAKING CHANGES](#%EF%B8%8F-all-breaking-changes)

## 🛠️ Runtime and dependency updates

### Minimum Node.js version is now v16.20.1

The minimum supported Node.js version is now v16.20.1. We strive to keep our minimum supported Node.js version in sync with the runtime's [release cadence](https://nodejs.dev/en/about/releases/) to keep up with the latest security updates and modern language features.

### BSON version 6.0.0

This driver version has been updated to use `bson@6.0.0`. BSON functionality re-exported from the driver is subject to the changes outlined in the [BSON V6 release notes](https://github.com/mongodb/js-bson/releases/tag/v6.0.0).

### Optional peer dependency version bumps

- `kerberos` optional peer dependency minimum version raised to `2.0.1`, dropped support for `1.x`
- `zstd` optional peer depedency minimum version raised to `1.1.0` from `1.0.0`
- `mongodb-client-encryption` optional peer dependency minimum version raised to `6.0.0` from `2.3.0` (note that `mongodb-client-encryption` does not have `3.x-5.x` version releases)

> [!NOTE]
> As of version 6.0.0, all useful public APIs formerly exposed from `mongodb-client-encryption` have been moved into the driver and should now be imported directly from the driver. These APIs rely internally on the functionality exposed from `mongodb-client-encryption`, but there is no longer any need to explicitly reference `mongodb-client-encryption` in your application code.

### Allow `socks` to be installed optionally

The driver uses the `socks` dependency to connect to `mongod` or `mongos` through a [SOCKS5 proxy](https://en.wikipedia.org/wiki/SOCKS). `socks` used to be a required dependency of the driver and was installed automatically. Now, `socks` is a `peerDependency` that must be installed to enable `socks` proxy support.

## ☀️ API usability improvements

### `findOneAndX` family of methods will now return only the found document or `null` by default (`includeResultMetadata` is false by default)

Previously, the default return type of this family of methods was a `ModifyResult` containing the found document and additional metadata. This additional metadata is unnecessary for the majority of use cases, so now, by default, they will return only the found document or `null`.

The previous behavior is still available by explicitly setting `includeResultMetadata: true` in the options.

See the following [blog post](https://www.mongodb.com/blog/post/behavioral-changes-find-one-family-apis-node-js-driver-6-0-0) for more information.

```ts
// This has the same behaviour as providing `{ includeResultMetadata: false }` in the v5.7.0+ driver
await collection.findOneAndUpdate({ hello: 'world' }, { $set: { hello: 'WORLD' } });
// > { _id: new ObjectId("64c4204517f785be30795c92"), hello: 'world' }

// This has the same behaviour as providing no options in any previous version of the driver
await collection.findOneAndUpdate(
  { hello: 'world' },
  { $set: { hello: 'WORLD' } },
  { includeResultMetadata: true }
);
// > {
// >  lastErrorObject: { n: 1, updatedExisting: true },
// >  value: { _id: new ObjectId("64c4208b17f785be30795c93"), hello: 'world' },
// >  ok: 1
// > }
```

### `session.commitTransaction()` and `session.abortTransaction()` return void

Each of these methods erroneously returned server command results that can be different depending on server version or type the driver is connected to. These methods return a promise that if resolved means the command (aborting or commiting) sucessfully completed and rejects otherwise. Viewing command responses is possible through the [command monitoring APIs](https://www.mongodb.com/docs/drivers/node/upcoming/fundamentals/monitoring/command-monitoring/) on the `MongoClient`.

### `withSession` and `withTransaction` return the value returned by the provided function

The `await client.withSession(async session => {})` now returns the value that the provided function returns. Previously, this function returned `void` this is a feature to align with the following breaking change.

The `await session.withTransaction(async () => {})` method now returns the value that the provided function returns. Previously, this function returned the server command response which is subject to change depending on the server version or type the driver is connected to. The return value got in the way of writing robust, reliable, consistent code no matter the backing database supporting the application.

> [!WARNING]
> When upgrading to this version of the driver, be sure to audit any usages of `withTransaction` for `if` statements or other conditional checks on the return value of `withTransaction`. Previously, the return value was the command response if the transaction was committed and `undefined` if it had been manually aborted. It would only throw if an operation or the author of the function threw an error. Since prior to this release it was not possible to get the result of the function passed to `withTransaction` we suspect most existing functions passed to this method return `void`, making `withTransaction` a `void` returning function in this major release. Take care to ensure that the return values of your function match the expectation of the code that follows the completion of `withTransaction`.

### Driver methods throw if a session is provided from a different `MongoClient`

Providing a session from one `MongoClient` to a method on a different `MongoClient` has never been a supported use case and leads to undefined behavior. To prevent this mistake, the driver now throws a `MongoInvalidArgumentError` if session is provided to a driver helper from a different `MongoClient`.

```typescript
// pre v6
const session = client1.startSession();
client2.db('foo').collection('bar').insertOne({ name: 'john doe' }, { session }); // no error thrown, undefined behavior

// v6+
const session = client1.startSession();
client2.db('foo').collection('bar').insertOne({ name: 'john doe' }, { session });
// MongoInvalidArgumentError thrown
```

### Callbacks removed from ClientEncryption's `encrypt`, `decrypt`, and `createDataKey` methods

Driver v5 dropped support for callbacks in asynchronous functions in favor of returning promises in order to provide more consistent type and API experience. In alignment with that, we are now removing support for callbacks from the `ClientEncryption` class.

### `MongoCryptError` is now a subclass of `MongoError`

Since `MongoCryptError` made use of Node.js 16's `Error` API, it has long supported setting the `Error.cause` field using options passed in via the constructor. Now that Node.js 16 is our minimum supported version, `MongoError` has been modified to make use of this API as well, allowing us to let `MongoCryptError` subclass from it directly.

## ⚙️ Option parsing improvements

### `useNewUrlParser` and `useUnifiedTopology` emit deprecation warnings

These options were removed in 4.0.0 but continued to be parsed and silently left unused. We have now added a deprecation warning through Node.js' [warning system](https://nodejs.org/api/process.html#event-warning) and will fully remove these options in the _next_ major release.

### Boolean options only accept 'true' or 'false' in connection strings

Prior to this change, we accepted the values `'1', 'y', 'yes', 't'` as synonyms for `true` and `'-1', '0', 'f', 'n', 'no'` as synonyms for `false`. These have now been removed in an effort to make working with connection string options simpler.

```ts
// Incorrect
const client = new MongoClient('mongodb://localhost:27017?tls=1'); // throws MongoParseError

// Correct
const client = new MongoClient('mongodb://localhost:27017?tls=true');
```

### Repeated options are no longer allowed in connection strings

In order to avoid accidental misconfiguration the driver will no longer prioritize the first instance of an option provided on the URI. Instead repeated options that are not permitted to be repeated will throw an error.

This change will ensure that connection strings that contain options like `tls=true&tls=false` are no longer ambiguous.

### TLS certificate authority and certificate-key files are now read asynchronously

In order to align with Node.js best practices of keeping I/O async, we have updated the `MongoClient` to store the file names provided to the existing `tlsCAFile` and `tlsCertificateKeyFile` options, as well as the `tlsCRLFile` option, and only read these files the first time it connects. Prior to this change, the files were read synchronously on `MongoClient` construction.

> [!NOTE]
> This has no effect on driver functionality when TLS configuration files are properly specified. However, if there are any issues with the TLS configuration files (invalid file name), the error is now thrown when the `MongoClient` is connected instead of at construction time.

```ts
const client = new MongoClient(CONNECTION_STRING, {
  tls: true,
  tlsCAFile: 'caFileName',
  tlsCertificateKeyFile: 'certKeyFile',
  tlsCRLFile: 'crlPemFile'
}); // Files are not read here, but file names are stored on the MongoClient

await client.connect(); // Files are now read and their contents stored
await client.close();

await client.connect(); // Since the file contents have already been cached, the files will not be read again.
```

Take a look at our [TLS documentation](https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/tls/) for more information on the `tlsCAFile`, `tlsCertificateKeyFile`, and `tlsCRLFile` options.

## 🐛 Bug fixes

### db.command() and admin.command() unsupported options removed

These APIs allow for specifying a command BSON document directly, so the driver does not try to enumerate all possible commands that could be passed to this API in an effort to be as forward and backward compatible as possible.

The `db.command()` and `admin.command()` APIs have their `options` types updated to accurately reflect options compatible on all commands that could be passed to either API.

Perhaps most notably, [`readConcern`](https://www.mongodb.com/docs/manual/reference/read-concern/) and [`writeConcern`](https://www.mongodb.com/docs/manual/reference/write-concern/) options are no longer handled by the driver. Users **must** attach these properties to the command that is passed to the `.command()` method.

### Removed irrelevant fields from `ConnectionPoolCreatedEvent.options`

The `options` field of `ConnectionPoolCreatedEvent` now has the following shape:

```ts
{
	maxPoolSize: number,
	minPoolSize: number,
	maxConnecting: number,
	maxIdleTimeMS: number,
	waitQueueTimeoutMS: number
}
```

### Fixed parsing of empty readPreferenceTags in connection string

The following connection string will now produce the following readPreferenceTags:

```ts
'mongodb://host?readPreferenceTags=region:ny&readPreferenceTags=rack:r1&readPreferenceTags=';
// client.options.readPreference.tags
[{ region: 'ny' }, { rack: 'r1' }, {}];
```

The empty `readPreferenceTags` allows drivers to still select a server if the leading tag conditions are not met.

### Corrected `GridFSBucketWriteStream`'s `Writable` method overrides and event emission

Our implementation of a writeable stream for `GridFSBucketWriteStream` mistakenly overrode the `write()` and `end()` methods, as well as, manually emitted `'close'`, `'drain'`, `'finish'` events. Per Node.js documentation, these methods and events are intended for the Node.js stream implementation to provide, and an author of a stream implementation is supposed to override `_write`, `_final`, and allow Node.js to manage event emitting.

Since the API is still a `Writable` stream most usages will continue to work with no changes, the `.write()` and `.end()` methods are still available and take the same arguments. The breaking change relates to the improper manually emitted event listeners that are now handled by Node.js. **The `'finish'` and `'drain'` events will no longer receive the `GridFSFile` document as an argument** (this is the document inserted to the bucket's files collection after all chunks have been inserted). Instead, it will be available on the stream itself as a property: `gridFSFile`.

```ts
// If our event handler is declared as a `function` "this" is bound to the stream.
fs.createReadStream('./file.txt')
  .pipe(bucket.openUploadStream('file.txt'))
  .on('finish', function () {
    console.log(this.gridFSFile);
  });

// If our event handler is declared using big arrow notation,
// the property is accessible on a scoped variable
const uploadStream = bucket.openUploadStream('file.txt');
fs.createReadStream('./file.txt')
  .pipe(uploadStream)
  .on('finish', () => console.log(uploadStream.gridFSFile));
```

Since the class no longer emits its own events: static constants `GridFSBucketWriteStream.ERROR`, `GridFSBucketWriteStream.FINISH`, `GridFSBucketWriteStream.CLOSE` have been removed to avoid confusion about the source of the events and the arguments their listeners accept.

### Fix manually emitted events from `GridFSBucketReadStream`

The `GridFSBucketReadStream` internals have also been corrected to no longer emit events that are handled by Node's stream logic. Since the class no longer emits its own events: static constants `GridFSBucketReadStream.ERROR`, `GridFSBucketReadStream.DATA`, `GridFSBucketReadStream.CLOSE`, and `GridFSBucketReadStream.END` have been removed to avoid confusion about the source of the events and the arguments their listeners accept.

### `createDataKey` return type fix

Previously, the TypeScript for `createDataKey` incorrectly declared the result to be a `DataKey` but the method actually returns the DataKey's `insertedId`.

## 📜 Removal of deprecated functionality

### `db.addUser()` and `admin.addUser()` removed

The deprecated `addUser` APIs have been removed. The driver maintains support across many server versions and the `createUser` command has support for different features based on the server's version. Since applications can generally write code to work against a uniform and perhaps more modern server, the path forward is for applications to send the `createUser` command directly.

The associated options interface with this API has also been removed: `AddUserOptions`.

See the [`createUser` documentation](https://www.mongodb.com/docs/manual/reference/command/createUser/) for more information.

```ts
const db = client.db('admin');
// Example addUser usage
await db.addUser('myUsername', 'myPassword', { roles: [{ role: 'readWrite', db: 'mflix' }] });
// Example equivalent command usage
await db.command({
  createUser: 'myUsername',
  pwd: 'myPassword',
  roles: [{ role: 'readWrite', db: 'mflix' }]
});
```

### `collection.stats()` removed

The `collStats` command is deprecated starting in server v6.2 so the driver is removing its bespoke helper in this major release. The `collStats` command is still available to run manually via `await db.command()`. However, the recommended migration is to use the [`$collStats` aggregation stage](https://www.mongodb.com/docs/current/reference/operator/aggregation/collStats/).

The following interfaces associated with this API have also been removed: `CollStatsOptions` and `WiredTigerData`.

### `BulkWriteResult` deprecated properties removed

The following deprecated properties have been removed as they duplicated those outlined in the [MongoDB CRUD specification|https://github.com/mongodb/specifications/blob/611ecb5d624708b81a4d96a16f98aa8f71fcc189/source/crud/crud.rst#write-results]. The list indicates what properties provide the correct migration:

- `BulkWriteResult.nInserted` -> `BulkWriteResult.insertedCount`
- `BulkWriteResult.nUpserted` -> `BulkWriteResult.upsertedCount`
- `BulkWriteResult.nMatched` -> `BulkWriteResult.matchedCount`
- `BulkWriteResult.nModified` -> `BulkWriteResult.modifiedCount`
- `BulkWriteResult.nRemoved` -> `BulkWriteResult.deletedCount`
- `BulkWriteResult.getUpsertedIds` -> `BulkWriteResult.upsertedIds` / `BulkWriteResult.getUpsertedIdAt(index: number)`
- `BulkWriteResult.getInsertedIds` -> `BulkWriteResult.insertedIds`

### Deprecated SSL options have been removed

The following options have been removed with their supported counterparts listed after the ->

- `sslCA` -> `tlsCAFile`
- `sslCRL` -> `tlsCRLFile`
- `sslCert` -> `tlsCertificateKeyFile`
- `sslKey` -> `tlsCertificateKeyFile`
- `sslPass` -> `tlsCertificateKeyFilePassword`
- `sslValidate` -> `tlsAllowInvalidCertificates`
- `tlsCertificateFile` -> `tlsCertificateKeyFile`

### The deprecated `keepAlive` and `keepAliveInitialDelay` options have been removed

TCP keep alive will always be on and now set to a value of 30000ms.

## 🗑️ Removal of "dead" code

The removed functionality listed in this section was either unused or not useful outside the driver internals.

### Constructors for `MongoError` and its subclasses now clearly indicate they are meant for internal use only

`MongoError` and its subclasses are not meant to be constructed by users as they are thrown within the driver on specific error conditions to allow users to react to these conditions in ways which match their use cases. The constructors for these types are now subject to change outside of major versions and their API documentation has been updated to reflect this.

### `AutoEncrypter` and `MongoClient.autoEncrypter` are now internal

As of this release, users will no longer be able to access the `AutoEncrypter` interface or the `MongoClient.autoEncrypter` field of an encrypted `MongoClient` instance as they do not have a use outside the driver internals.

### `ClientEncryption.onKMSProvidersRefresh` function removed

`ClientEncryption.onKMSProvidersRefresh` was added as a public API in version 2.3.0 of `mongodb-client-encryption` to allow for automatic refresh of KMS provider credentials. Subsequently, we added the capability to automatically refresh KMS credentials using the KMS provider's preferred refresh mechanism, and `onKMSProviderRefresh` is no longer used.

### `EvalOptions` removed

This cleans up some dead code in the sense that there were no `eval` command related APIs but the `EvalOptions` type was public, so we want to ensure there are no surprises now that this type has been removed.

## ⚠️ ALL BREAKING CHANGES

- **NODE-5484:** mark MongoError for internal use and remove Node14 cause assignment logic ([#3800](https://github.com/mongodb/node-mongodb-native/issues/3800))
- **NODE-4788:** use implementer Writable methods for GridFSBucketWriteStream ([#3808](https://github.com/mongodb/node-mongodb-native/issues/3808))
- **NODE-4986:** remove callbacks from ClientEncryption encrypt, decrypt, and createDataKey ([#3797](https://github.com/mongodb/node-mongodb-native/issues/3797))
- **NODE-5490:** bump kerberos compatibility to ^2.0.1 ([#3798](https://github.com/mongodb/node-mongodb-native/issues/3798))
- **NODE-3568:** ensure includeResultsMetadata is false by default ([#3786](https://github.com/mongodb/node-mongodb-native/issues/3786))
- **NODE-3989:** only accept true and false for boolean options ([#3791](https://github.com/mongodb/node-mongodb-native/issues/3791))
- **NODE-5233:** prevent session from one client from being used on another ([#3790](https://github.com/mongodb/node-mongodb-native/issues/3790))
- **NODE-5444:** emit deprecation warning for useNewUrlParser and useUnifiedTopology ([#3792](https://github.com/mongodb/node-mongodb-native/issues/3792))
- **NODE-5470:** convert remaining FLE to TS and drop support for `onKMSProvidersRefresh` ([#3787](https://github.com/mongodb/node-mongodb-native/issues/3787))
- **NODE-5508:** remove EvalOperation and EvalOptions ([#3795](https://github.com/mongodb/node-mongodb-native/issues/3795))
- **NODE-3920:** validate options are not repeated in connection string ([#3788](https://github.com/mongodb/node-mongodb-native/issues/3788))
- **NODE-3924:** read tls files async ([#3776](https://github.com/mongodb/node-mongodb-native/issues/3776))
- **NODE-5430:** make AutoEncrypter and MongoClient.autoEncrypter internal ([#3789](https://github.com/mongodb/node-mongodb-native/issues/3789))
- **NODE-4961:** remove command result from commit and abort transaction APIs ([#3784](https://github.com/mongodb/node-mongodb-native/issues/3784))
- **NODE-2014:** return executor result from withSession and withTransaction ([#3783](https://github.com/mongodb/node-mongodb-native/issues/3783))
- **NODE-5409:** allow socks to be installed optionally ([#3782](https://github.com/mongodb/node-mongodb-native/issues/3782))
- **NODE-4796:** remove addUser and collection.stats APIs ([#3781](https://github.com/mongodb/node-mongodb-native/issues/3781))
- **NODE-4936:** remove unsupported options from db.command and admin.command ([#3775](https://github.com/mongodb/node-mongodb-native/issues/3775))
- **NODE-5228:** remove unneeded fields from ConnectionPoolCreatedEvent.options ([#3772](https://github.com/mongodb/node-mongodb-native/issues/3772))
- **NODE-5190:** remove deprecated keep alive options ([#3771](https://github.com/mongodb/node-mongodb-native/issues/3771))
- **NODE-5186:** remove duplicate BulkWriteResult accessors ([#3766](https://github.com/mongodb/node-mongodb-native/issues/3766))
- **NODE-5376:** remove deprecated ssl options ([#3755](https://github.com/mongodb/node-mongodb-native/issues/3755))
- **NODE-5415:** bump minimum Node.js version to v16.20.1 ([#3760](https://github.com/mongodb/node-mongodb-native/issues/3760))
