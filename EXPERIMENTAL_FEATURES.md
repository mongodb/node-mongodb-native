# MongoDB Node.js Driver - Experimental Features

This report documents all experimental features in the MongoDB Node.js Driver. The driver contains **34 experimental annotations** across 10 major feature categories. These features are marked as experimental because they may undergo breaking changes in future releases, even in minor or patch versions.

---

## Summary

| Feature | Description | Introduced in | Status |
|---------|-------------|---------------|--------|
| [Runtime Adapters](#runtime-adapters) | Custom runtime module implementations | v7.2.0 | ⚠️ Experimental |
| [Queryable Encryption Text Search](#queryable-encryption-text-search) | Text search on encrypted fields | v6.19.0 | ⚠️ Public Technical Preview |
| [AbortSignal Support](#abortsignal-support) | Cancel operations using `AbortController` | v6.13.0 | ⚠️ Experimental |
| [Cursor Timeout Modes](#cursor-timeout-modes) | Configure how timeouts apply to cursors | v6.11.0 | ⚠️ Experimental |
| [Explicit Resource Management](#explicit-resource-management) | Automatic cleanup using `Symbol.asyncDispose` | v6.9.0 | ⚠️ Experimental |
| [GridFS Timeout Support](#gridfs-timeout-support) | Timeout options for GridFS streams | v6.6.0 | ⚠️ Experimental |
| [Timeout Management](#timeout-management) | Control operation timeouts with `timeoutMS` | v6.6.0 | ⚠️ Experimental |
| [Client-Side Encryption Features](#client-side-encryption-features) | Custom key material and rewrap APIs | v6.0.0 | ⚠️ Experimental |
| [Strict TypeScript Types](#strict-typescript-types) | Enhanced type safety for filters and updates | v5.0.0 | ⚠️ Experimental |
| [Encrypted Fields](#encrypted-fields) | Schema for encrypted collections | v4.6.0 | ⚠️ Experimental |

---

## Feature Descriptions

### Explicit Resource Management

**Status**: ⚠️ Experimental (until TC39 proposal completion)

**Description**: Native support for JavaScript's explicit resource management using `Symbol.asyncDispose`. This feature enables automatic cleanup of resources using the `await using` syntax.

**Available On**:
- `MongoClient` - [src/mongo_client.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_client.ts)
- `ClientSession` - [src/sessions.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/sessions.ts)
- `ChangeStream` - [src/change_stream.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/change_stream.ts)
- All cursor types (`AbstractCursor`, `FindCursor`, `AggregationCursor`, etc.) - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/cursor/abstract_cursor.ts)

**Example**:
```typescript
// Automatic cleanup when scope exits
await using client = new MongoClient(url);
await using session = client.startSession();
// No need to call client.close() or session.endSession()
```

**References**:
- [TC39 Explicit Resource Management Proposal](https://github.com/tc39/proposal-explicit-resource-management)
- Driver upgrade notes: `etc/notes/CHANGES_7.0.0.md`

**Stability Note**: Will remain experimental until the TC39 proposal is finalized.

---

### AbortSignal Support

**Status**: ⚠️ Experimental

**Type**: `Abortable`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_types.ts)

**Description**: Allows using `AbortController` to abort asynchronous operations. The `signal.reason` value is used as the error thrown.

**Example**:
```typescript
const controller = new AbortController();
const { signal } = controller;

// Abort operation after 5 seconds
setTimeout(() => controller.abort(new Error('Operation timeout')), 5000);

await collection.find({}, { signal }).toArray();
```

**⚠️ Important Warning**: 
If an abort signal aborts an operation while the driver is writing to the underlying socket or reading the response from the server, the socket will be closed. If signals are aborted at a high rate during socket read/writes, this can lead to a high rate of connection reestablishment.

---

### Timeout Management

**Status**: ⚠️ Experimental

**Option**: `timeoutMS`

**Description**: Specifies the time (in milliseconds) an operation will run until it throws a timeout error.

**Available On**:
- `CommandOperationOptions` - [src/db.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/db.ts)
- `ClientSessionOptions` - [src/sessions.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/sessions.ts)
- `ClientSessionStartOptions.defaultTimeoutMS` - [src/sessions.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/sessions.ts)
- `ClientEncryptionOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/client-side-encryption/client_encryption.ts)
- `MongoClientOptions` - [src/mongo_client.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_client.ts)
- `RunCommandOptions` - [src/operations/run_command.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/operations/run_command.ts)
- `RunCursorCommandOptions` - [src/cursor/run_command_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/cursor/run_command_cursor.ts)
- `CollectionOptions` - [src/collection.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/collection.ts)
- `OperationOptions` - [src/operations/operation.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/operations/operation.ts)
- `GridFSBucketReadStreamOptions` - [src/gridfs/index.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/gridfs/index.ts)
- `GridFSBucketWriteStreamOptions` - [src/gridfs/upload.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/gridfs/upload.ts)
- Various database and collection operation options

**Example**:
```typescript
// Set timeout at client level
const client = new MongoClient(url, { timeoutMS: 10000 });

// Set timeout at operation level
await collection.find({}, { timeoutMS: 5000 }).toArray();

// Set timeout for session
const session = client.startSession({ timeoutMS: 30000 });
```

---

### Cursor Timeout Modes

**Status**: ⚠️ Experimental

**Type**: `CursorTimeoutMode`
**Source**:
- Constant definition - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/cursor/abstract_cursor.ts)
- Type definition - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/cursor/abstract_cursor.ts)
- Option in `AbstractCursorOptions` - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/cursor/abstract_cursor.ts)
- Option in `RunCursorCommandOptions` - [src/cursor/run_command_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/cursor/run_command_cursor.ts)

**Values**:
- `'cursorLifetime'` - Timeout applies to the entire cursor lifetime
- `'iteration'` - Timeout applies to each `cursor.next()` call

**Description**: Specifies how `timeoutMS` is applied to cursors.

**Default Behavior**:
- **Non-tailable cursors**: `'cursorLifetime'`
- **Tailable cursors**: `'iteration'` (since tailable cursors can have arbitrarily long lifetimes)

**Examples**:
```typescript
// Iteration mode: Each next() call must complete within 100ms
const cursor1 = collection.find({}, { 
  timeoutMS: 100, 
  timeoutMode: 'iteration' 
});
for await (const doc of cursor1) {
  // Process doc - each iteration has 100ms timeout
}

// Cursor lifetime mode: Entire operation must complete within 1000ms
const cursor2 = collection.find({}, { 
  timeoutMS: 1000, 
  timeoutMode: 'cursorLifetime' 
});
const docs = await cursor2.toArray(); // Must complete in 1000ms total
```

---

### Strict TypeScript Types

**Status**: ⚠️ Experimental

**Description**: Provides stricter type checking for MongoDB operations with better TypeScript inference for nested paths and type safety.

**Types**:

#### `StrictFilter<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_types.ts)

Provides strict type checking for filter predicates with proper nested path support.

#### `StrictMatchKeysAndValues<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_types.ts)

Ensures type-safe matching of keys and values in update operations.

#### `StrictUpdateFilter<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_types.ts)

Provides strict typing for update operators (`$set`, `$inc`, `$push`, etc.).

**Example**:
```typescript
interface User {
  name: string;
  age: number;
  address: {
    city: string;
    zip: number;
  };
}

const collection: Collection<User> = db.collection('users');

// Type-safe filter with nested paths
const filter: StrictFilter<User> = { 
  'address.city': 'New York' // ✓ Valid
  // 'address.city': 123 // ✗ Compile error: number not assignable to string
};

// Type-safe update
const update: StrictUpdateFilter<User> = {
  $set: { age: 30 }, // ✓ Valid
  // $set: { age: 'thirty' } // ✗ Compile error
};
```

**⚠️ Production Warning**: As experimental features, these types can change at any time and are not recommended for production settings.

---

### Runtime Adapters

**Status**: ⚠️ Experimental

**Description**: Allows providing custom implementations of Node.js runtime modules to the driver. This enables the driver to work in non-Node.js JavaScript environments or with alternative module implementations.

**Types**:

#### `RuntimeAdapters`
**Source**: [src/runtime_adapters.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/runtime_adapters.ts)

Interface for providing custom runtime module implementations.

#### `OsAdapter`
**Source**: [src/runtime_adapters.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/runtime_adapters.ts)

Represents the required functionality from the Node.js `os` module.

**Available On**:
- `MongoClientOptions.runtimeAdapters` - [src/mongo_client.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/mongo_client.ts)

**Example**:
```typescript
// Provide custom OS module implementation
const client = new MongoClient(url, {
  runtimeAdapters: {
    os: {
      release: () => 'custom-release',
      platform: () => 'linux',
      arch: () => 'x64',
      type: () => 'Linux'
    }
  }
});
```

**⚠️ Important Warning**: This feature is experimental and primarily intended for running the driver in non-Node.js JavaScript runtimes. The API may change in future versions.

---

### Client-Side Encryption Features

**Status**: ⚠️ Experimental

**Description**: Advanced client-side encryption capabilities for enhanced data security.

#### Custom Key Material

**Option**: `keyMaterial`
**Type**: `Buffer | Binary`
**Location**: `ClientEncryptionCreateDataKeyProviderOptions`
**Source**: [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/client-side-encryption/client_encryption.ts)

**Description**: Allows providing custom key material when creating data keys, giving more control over the encryption key generation process.

**Example**:
```typescript
const encryption = new ClientEncryption(client, {
  keyVaultNamespace: 'encryption.__keyVault',
  kmsProviders: { local: { key: localMasterKey } }
});

const dataKeyId = await encryption.createDataKey('local', {
  keyMaterial: customKeyBuffer // Experimental option
});
```

#### RewrapManyDataKey API

**Interfaces**:
- `ClientEncryptionRewrapManyDataKeyProviderOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/client-side-encryption/client_encryption.ts)
- `ClientEncryptionRewrapManyDataKeyResult` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/client-side-encryption/client_encryption.ts)

**Description**: Experimental API for rewrapping multiple data keys in a single operation, useful for key rotation scenarios.

**Interface Definition**:
```typescript
interface ClientEncryptionRewrapManyDataKeyProviderOptions {
  provider: ClientEncryptionDataKeyProvider;
  masterKey?: AWSEncryptionKeyOptions | AzureEncryptionKeyOptions |
              GCPEncryptionKeyOptions | KMIPEncryptionKeyOptions | undefined;
}

interface ClientEncryptionRewrapManyDataKeyResult {
  /** The result of rewrapping data keys. If unset, no keys matched the filter. */
  bulkWriteResult?: BulkWriteResult;
}
```

---

### Queryable Encryption Text Search

**Status**: ⚠️ Public Technical Preview (may break at any time)

**Option**: `textOptions`
**Type**: `TextQueryOptions`
**Location**: `ClientEncryptionEncryptOptions`
**Source**:
- Option in `ClientEncryptionEncryptOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/client-side-encryption/client_encryption.ts)
- Interface `TextQueryOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/client-side-encryption/client_encryption.ts)

**Description**: Options for Queryable Encryption fields supporting text queries. Only valid when the encryption algorithm is set to `TextPreview`.

**Example**:
```typescript
const encrypted = await encryption.encrypt(value, {
  algorithm: 'TextPreview',
  keyId: dataKeyId,
  textOptions: {
    // Text search configuration options
  }
});
```

**⚠️ Critical Warning**: This is a Public Technical Preview feature. The `textPreview` algorithm and related options are experimental and may break at any time. Not recommended for production use.

---

### Encrypted Fields

**Status**: ⚠️ Experimental

**Option**: `encryptedFields`
**Type**: `Document`

**Available On**:
- `CreateCollectionOptions` - [src/operations/create_collection.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/operations/create_collection.ts)
- `DropCollectionOptions` - [src/operations/drop.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/operations/drop.ts)

**Description**: Specifies the schema for encrypted fields in a collection, used with Queryable Encryption.

**Example**:
```typescript
// Create collection with encrypted fields
await db.createCollection('users', {
  encryptedFields: {
    fields: [
      {
        path: 'ssn',
        bsonType: 'string',
        keyId: dataKeyId
      }
    ]
  }
});

// Drop collection with encrypted fields
await db.dropCollection('users', {
  encryptedFields: encryptedFieldsConfig
});
```

---

### GridFS Timeout Support

**Status**: ⚠️ Experimental

**Description**: Timeout support for GridFS read and write streams.

#### GridFS Read Stream Timeout

**Option**: `timeoutMS` in `GridFSBucketReadStreamOptions`
**Source**: [src/gridfs/index.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/gridfs/index.ts)

**Description**: Specifies the lifetime duration of a GridFS read stream. If any async operations are in progress when this timeout expires, the stream will throw a timeout error.

**Example**:
```typescript
const bucket = new GridFSBucket(db);
const downloadStream = bucket.openDownloadStream(fileId, {
  timeoutMS: 30000 // 30 second timeout for the entire download
});
```

#### GridFS Write Stream Timeout

**Option**: `timeoutMS` in `GridFSBucketWriteStreamOptions`
**Source**: [src/gridfs/upload.ts](https://github.com/mongodb/node-mongodb-native/blob/v7.2.0/src/gridfs/upload.ts)

**Description**: Specifies the time an upload operation will run until it throws a timeout error.

**Example**:
```typescript
const bucket = new GridFSBucket(db);
const uploadStream = bucket.openUploadStream('filename.txt', {
  timeoutMS: 60000 // 60 second timeout for the entire upload
});
```

