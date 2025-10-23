# Changes in the MongoDB Node.js Driver v7

## About

The following is a detailed collection of the changes in the major v7 release of the `mongodb` package for Node.js.
The main focus of this release was usability improvements and a streamlined API. Read on for details!

> [!IMPORTANT]
> This is a list of changes relative to v6.21.0 of the driver. ALL changes listed below are BREAKING unless indicated otherwise.
> Users migrating from an older version of the driver are advised to upgrade to at least v6.21.0 before adopting v7.

## Contents

- [🛠️ Runtime and dependency updates](#%EF%B8%8F-runtime-and-dependency-updates)
  - [Minimum Node.js version is now v20.19.0](#minimum-nodejs-version-is-now-v20190)
  - [`bson` and `mongodb-connection-string-url` versions 7.0.0](#bson-and-mongodb-connection-string-url-versions-700)
  - [Optional peer dependency releases and version bumps](#optional-peer-dependency-releases-and-version-bumps)
- [🔐 AWS authentication](#-aws-authentication)
  - [`@aws-sdk/credential-providers` is now required for MONGODB-AWS authentication](#aws-sdkcredential-providers-is-now-required-for-mongodb-aws-authentication)
  - [Custom AWS credential provider takes highest precedence](#custom-aws-credential-provider-takes-highest-precedence)
  - [Explicitly provided credentials no longer accepted with MONGODB-AWS authentication](#explicitly-provided-credentials-no-longer-accepted-with-mongodb-aws-authentication)
- [⚙️ Error handling improvements](#%EF%B8%8F-error-handling-improvements)
  - [Dropping a collection returns false instead of thowing when NS not found](#dropping-a-collection-returns-false-instead-of-throwing-when-ns-not-found)
  - [Aggregate with write concern and explain no longer throws client-side](#aggregate-with-write-concern-and-explain-no-longer-throws-client-side)
  - [All encryption-related errors now subclass MongoError](#all-encryption-related-errors-now-subclass-mongoerror)
  - ['PoolRequstedRetry' error label renamed to 'PoolRequestedRetry'](#poolrequstedretry-error-label-renamed-to-poolrequestedretry)
- [💥 Misc breaking improvements](#-misc-breaking-improvements)
  - [Change streams no longer whitelist `$changeStream` stage options](#change-streams-no-longer-whitelist-changestream-stage-options)
  - [Cursors no longer provide a default `batchSize` of 1000 for `getMore`s](#cursors-no-longer-provide-a-default-batchsize-of-1000-for-getmores)
  - [Auto encryption options now include default filenames in TS](#auto-encryption-options-now-include-default-filenames-in-ts)
- [☀️ Misc non-breaking improvements](#%EF%B8%8F-misc-non-breaking-improvements)
  - [Improve `MongoClient.connect()` consistency across environments](#improve-mongoclientconnect-consistency-across-environments)
  - [`MongoClient.close()` no longer sends `endSessions` if the topology does not have session support](#mongoclientclose-no-longer-sends-endsessions-if-the-topology-does-not-have-session-support)
- [📜 Removal of deprecated functionality](#-removal-of-deprecated-functionality)
  - [Cursor and ChangeStream `stream()` method no longer accepts a transform](#cursor-and-changestream-stream-method-no-longer-accepts-a-transform)
  - [MONGODB-CR AuthMechanism has been removed](#mongodb-cr-authmechanism-has-been-removed)
  - [Internal `ClientMetadata` properties have been removed](#internal-clientmetadata-properties-have-been-removed)
  - [`CommandOptions.noResponse` option removed](#commandoptionsnoresponse-option-removed)
  - [Assorted deprecated type, class, and option removals](#assorted-deprecated-type-class-and-option-removals)
- [⚠️ ALL BREAKING CHANGES](#%EF%B8%8F-all-breaking-changes)

## 🛠️ Runtime and dependency updates

### Minimum Node.js version is now v20.19.0

The minimum supported Node.js version is now [v20.19.0](https://nodejs.org/en/blog/release/v20.19.0) and our TypeScript target has been updated to ES2023. We strive to keep our minimum supported Node.js version in sync with the runtime's [release cadence](https://nodejs.dev/en/about/releases/) to keep up with the latest security updates and modern language features.

Notably, the driver now offers native support for explicit resource management. `Symbol.asyncDispose` implementations are available on the `MongoClient`, `ClientSession`, `ChangeStream` and on cursors.

> [!Note]
> Explicit resource management is considered experimental in the driver and will be until the [TC39 explicit resource management proposal](https://github.com/tc39/proposal-explicit-resource-management) is completed.

### `bson` and `mongodb-connection-string-url` versions 7.0.0

This driver version has been updated to use `bson@7.0.0` and `mongodb-connection-string-url@7.0.0`, which match the driver's Node.js runtime version support. BSON functionality re-exported from the driver is furthermore subject to the changes outlined in the [BSON V7 release notes](https://github.com/mongodb/js-bson/releases/tag/v7.0.0).

### Optional peer dependency releases and version bumps

- `@mongodb-js/zstd` optional peer dependency minimum version raised to `7.0.0`, dropped support for `1.x` and `2.x` (note that `@mongodb-js/zstd` does not have `3.x-6.x` version releases)
- `kerberos` optional peer dependency minimum version raised to `7.0.0`, dropped support for `2.x` (note that `kerberos` does not have `3.x-6.x` version releases)
- `mongodb-client-encryption` optional peer dependency minimum version raised to `7.0.0`, dropped support for `6.x`

Additionally, the driver is now compatible with the following packages:

| Dependency                    | Previous Range | New Allowed Range |
| ----------------------------- | -------------- | ----------------- |
| @aws-sdk/credential-providers | ^3.188.0       | ^3.806.0          |
| gcp-metadata                  | ^5.2.0         | ^7.0.1            |
| socks                         | ^2.7.1         | ^2.8.6            |

## 🔐 AWS authentication

To improve long-term maintainability and ensure compatibility with AWS updates, we’ve standardized AWS auth to use the official SDK in all cases and made a number of supporting changes outlined below.

### `@aws-sdk/credential-providers` is now required for MONGODB-AWS authentication

Previous versions of the driver contained two implementations for AWS authentication and could run the risk of the custom driver implementation not supporting all AWS authentication features as well as not being correct when AWS makes changes. Using the official AWS SDK in all cases alleviates these issues.

```bash
npm install @aws-sdk/credential-providers
```

### Custom AWS credential provider takes highest precedence

When providing a custom AWS credential provider via the auth mechanism property `AWS_CREDENTIAL_PROVIDER`, it will now take the highest precedence over any other AWS auth method.

### Explicitly provided credentials no longer accepted with MONGODB-AWS authentication

AWS environments (such as AWS Lambda) do not have credentials that are permanent and expire within a set amount of time. Providing credentials in the URI or options would mandate that those credentials would be valid for the life of the `MongoClient`, which is problematic. With this change, the installed required AWS SDK will now fetch credentials using the environment, endpoints, or a custom credential provider.

This means that for AWS authentication, all client URIs MUST now be specified as:

```ts
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb<+srv>://<host>:<port>/?authMechanism=MONGODB-AWS');
```
The previous method of providing URI encoded credentials based on the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` directly in the connection string will no longer work.
## ⚙️ Error handling improvements

### Dropping a collection returns false instead of throwing when NS not found

This change has been made for consistency with the common drivers specifications.

### Aggregate with write concern and explain no longer throws client-side

This will now throw a `MongoServerError` instead.

### All encryption-related errors now subclass MongoError

The driver aims to ensure that all errors it throws are subclasses of `MongoError`. However, when using CSFLE or QE, the driver's encryption implementation could sometimes throw errors that were not instances of `MongoError`.

Now, all errors thrown during encryption are subclasses of `MongoError`.

### 'PoolRequstedRetry' error label renamed to 'PoolRequestedRetry'

The `PoolClearedError` thrown in cases where the connection pool was cleared now fixes the typo in the error label.

## 💥 Misc breaking improvements

### Change streams no longer whitelist `$changeStream` stage options

Uses are now able to pass any option to `collection.watch()` and if it is invalid in the `$changeStream` stage of the pipeline the server will error. This is to allow users to provide newly added options quickly that are not in our public types.

### Cursors no longer provide a default `batchSize` of 1000 for `getMore`s

In driver versions <7.0, the driver provides a default `batchSize` of 1000 for each [`getMore`](https://www.mongodb.com/docs/manual/reference/command/getMore/) when iterating a cursor. This behavior is not ideal because the default is set regardless of the documents being fetched. For example, if a cursor fetches many small documents, the driver's default of 1000 can result in many round-trips to fetch all documents, when the server could fit all documents inside a single `getMore` if no `batchSize` were set.

Now, cursors no longer provide a default `batchSize` when executing a `getMore`. A `batchSize` will only be set on `getMore` commands if a `batchSize` has been explicitly configured for the cursor.

### Auto encryption options now include default filenames in TS

A common source of confusion for people configuring auto encryption is where to specify the path to `mongocryptd` and where to specify the path to `crypt_shared`. We've now made this clearer in our Typescript users. Typescript now reports errors if the specified filename doesn't match the default name of the file. Some examples:

```typescript
var path: AutoEncryptionOptions['extraOptions']['mongocryptdSpawnPath'] = 'some path'; // ERROR
var path: AutoEncryptionOptions['extraOptions']['mongocryptdSpawnPath'] = 'mongocryptd'; // OK
var path: AutoEncryptionOptions['extraOptions']['mongocryptdSpawnPath'] =
  '/usr/local/bin/mongocryptd'; // OK
var path: AutoEncryptionOptions['extraOptions']['mongocryptdSpawnPath'] = 'mongocryptd.exe'; // OK

var path: AutoEncryptionOptions['extraOptions']['cryptSharedLibPath'] = 'some path'; // ERROR
var path: AutoEncryptionOptions['extraOptions']['cryptSharedLibPath'] = 'mongo_crypt_v1.so'; // OK
var path: AutoEncryptionOptions['extraOptions']['cryptSharedLibPath'] = 'mongo_crypt_v1.dll'; // OK
var path: AutoEncryptionOptions['extraOptions']['cryptSharedLibPath'] = 'mongo_crypt_v1.dylib'; // OK
```

## ☀️ Misc non-breaking improvements

### Improve `MongoClient.connect()` consistency across environments

The `MongoClient` connect function will now run a handshake regardless of credentials being defined. The upshot of this change is that connect is more consistent at verifying some fail-fast preconditions regardless of environment. For example, previously, if connecting to a `loadBalanced=true` cluster without authentication there would not have been an error until a command was attempted.

### `MongoClient.close()` no longer sends `endSessions` if the topology does not have session support

`MongoClient.close()` attempts to free up any server resources that the client has instantiated, including sessions. Previously, `MongoClient.close()` unconditionally attempted to kill all sessions, regardless of whether or not the topology actually supports sessions.

Now, `MongoClient.close()` only attempts to clean up sessions if the topology supports sessions.

## 📜 Removal of deprecated functionality

### Cursor and ChangeStream `stream()` method no longer accepts a transform

Cursors and ChangeStreams no longer accept a `transform` function. `ReadableStream.map()` can be used instead:

```typescript
// before
const stream = cursor.stream({ transform: JSON.stringify });

// after
const stream = cursor.stream().map(JSON.stringify);
```

### MONGODB-CR AuthMechanism has been removed

This mechanism has been unsupported as of MongoDB 4.0 and attempting to use it will still raise an error.

### Internal `ClientMetadata` properties have been removed

Previous versions of the driver unintentionally made properties used when constructing client metadata public. These properties have now been made internal. The full list of properties is:

```
MongoClient.options.additionalDriverInfo
MongoClient.options.metadata
MongoClient.options.extendedMetadata
MongoOptions.additionalDriverInfo
MongoOptions.metadata
MongoOptions.extendedMetadata
ConnectionOptions.metadata
ConnectionOptions.extendedMetadata
```

### `CommandOptions.noResponse` option removed

This option was never intended to be public, and never worked properly for user-facing APIs. It has now been removed.

### Assorted deprecated type, class, and option removals

```ts
GridFSFile.contentType;
GridFSFile.aliases;
GridFSBucketWriteStreamOptions.contentType;
GridFSBucketWriteStreamOptions.aliases;
CloseOptions;
ResumeOptions;
MongoClientOptions.useNewUrlParser;
MongoClientOptions.useUnifiedTopology;
CreateCollectionOptions.autoIndexId;
FindOptions<TSchema>; // now no generic type
ClientMetadataOptions;
FindOneOptions.batchSize;
FindOneOptions.limit;
FindOneOptions.noCursorTimeout;
ReadPreference.minWireVersion;
ServerCapabilities;
CommandOperationOptions.retryWrites; // is a global option on the MongoClient
ClientSession.transaction;
Transaction;
CancellationToken;
```

## ⚠️ ALL BREAKING CHANGES

- **NODE-7259:** use alphas of all supporting packages ([#4746](https://github.com/mongodb/node-mongodb-native/issues/4746))
- **NODE-5510:** dont filter change stream options ([#4723](https://github.com/mongodb/node-mongodb-native/issues/4723))
- **NODE-6296:** remove cursor default batch size of 1000 ([#4729](https://github.com/mongodb/node-mongodb-native/issues/4729))
- **NODE-7150:** update peer dependency matrix for 3rd party peer deps ([#4720](https://github.com/mongodb/node-mongodb-native/issues/4720))
- **NODE-7046:** remove AWS uri/options support ([#4689](https://github.com/mongodb/node-mongodb-native/issues/4689))
- **NODE-4808:** remove support for stream() transform on cursors and change streams ([#4728](https://github.com/mongodb/node-mongodb-native/issues/4728))
- **NODE-6377:** remove noResponse option ([#4724](https://github.com/mongodb/node-mongodb-native/issues/4724))
- **NODE-6473:** remove MONGODB-CR auth ([#4717](https://github.com/mongodb/node-mongodb-native/issues/4717))
- **NODE-5994:** Remove metadata-related properties from public driver API ([#4716](https://github.com/mongodb/node-mongodb-native/issues/4716))
- **NODE-7016:** remove `beta` namespace and move resource management into driver ([#4719](https://github.com/mongodb/node-mongodb-native/issues/4719))
- **NODE-4184:** don't throw on aggregate with write concern and explain ([#4718](https://github.com/mongodb/node-mongodb-native/issues/4718))
- **NODE-7043, NODE-7217:** adopt mongodb-client-encryption v7 ([#4705](https://github.com/mongodb/node-mongodb-native/issues/4705))
- **NODE-6065:** throw MongoRuntimeError instead of MissingDependencyError in crypto connection ([#4711](https://github.com/mongodb/node-mongodb-native/issues/4711))
- **NODE-6584:** improve typing for filepaths in AutoEncryptionOptions ([#4341](https://github.com/mongodb/node-mongodb-native/issues/4341))
- **NODE-6334:** rename PoolRequstedRetry to PoolRequestedRetry ([#4696](https://github.com/mongodb/node-mongodb-native/issues/4696))
- **NODE-7174:** drop support for Node16 and Node18 ([#4668](https://github.com/mongodb/node-mongodb-native/issues/4668))
- **NODE-7047:** use custom credential provider first after URI ([#4656](https://github.com/mongodb/node-mongodb-native/issues/4656))
- **NODE-6988:** require aws sdk for aws auth ([#4659](https://github.com/mongodb/node-mongodb-native/issues/4659))
- **NODE-5545:** remove deprecated objects ([#4704](https://github.com/mongodb/node-mongodb-native/issues/4704)) ([cfbada6](https://github.com/mongodb/node-mongodb-native/commit/cfbada66ceb017bdb8fa1ff39257e1ab49ee9e25))

### Non-breaking

- **NODE-4243:** drop collection checks ns not found ([#4742](https://github.com/mongodb/node-mongodb-native/issues/4742)) ([a8d7c5f](https://github.com/mongodb/node-mongodb-native/commit/a8d7c5ff6c68ad57291641b2eb14cc27d91508ae))
- **NODE-7223:** run checkout on connect regardless of credentials ([#4715](https://github.com/mongodb/node-mongodb-native/issues/4715)) ([c5f74ab](https://github.com/mongodb/node-mongodb-native/commit/c5f74abe27acd8661f17046b1740ac74de1be082))
- **NODE-7232:** only send endSessions during client close if the topology supports sessions ([#4722](https://github.com/mongodb/node-mongodb-native/issues/4722)) ([cc85ebf](https://github.com/mongodb/node-mongodb-native/commit/cc85ebf246b20e0bae59e1bdcdf0f9c74ea01979))
