# MongoDB Node.js Driver - Experimental Featuress

This report documents all experimental features in the MongoDB Node.js Driver version 7.1.0. The driver contains **31 experimental annotations** across 9 major feature categories. These features are marked as experimental because they may undergo breaking changes in future releases, even in minor or patch versions.

---

## Summary

| Feature | Description | Introduced in | Status |
|---------|-------------|---------------|--------|
| [Explicit Resource Management](#explicit-resource-management) | Automatic cleanup using `Symbol.asyncDispose` | v6.9.0 | ⚠️ Experimental |
| [AbortSignal Support](#abortsignal-support) | Cancel operations using `AbortController` | v6.13.0 | ⚠️ Experimental |
| [Timeout Management](#timeout-management) | Control operation timeouts with `timeoutMS` | v6.6.0 | ⚠️ Experimental |
| [Cursor Timeout Modes](#cursor-timeout-modes) | Configure how timeouts apply to cursors | v6.11.0 | ⚠️ Experimental |
| [Strict TypeScript Types](#strict-typescript-types) | Enhanced type safety for filters and updates | v5.0.0 | ⚠️ Experimental |
| [Client-Side Encryption Features](#client-side-encryption-features) | Custom key material and rewrap APIs | v6.0.0 | ⚠️ Experimental |
| [Queryable Encryption Text Search](#queryable-encryption-text-search) | Text search on encrypted fields | v6.19.0 | ⚠️ Public Technical Preview |
| [Encrypted Fields](#encrypted-fields) | Schema for encrypted collections | v4.6.0 | ⚠️ Experimental |
| [GridFS Timeout Support](#gridfs-timeout-support) | Timeout options for GridFS streams | v6.6.0 | ⚠️ Experimental |

---

## Feature Descriptions

### Explicit Resource Management

**Status**: ⚠️ Experimental (until TC39 proposal completion)

**Description**: Native support for JavaScript's explicit resource management using `Symbol.asyncDispose`. This feature enables automatic cleanup of resources using the `await using` syntax.

**Available On**:
- `MongoClient` - [src/mongo_client.ts:466](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/mongo_client.ts#L466)
- `ClientSession` - [src/sessions.ts:293](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/sessions.ts#L293)
- `ChangeStream` - [src/change_stream.ts:576](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/change_stream.ts#L576)
- All cursor types (`AbstractCursor`, `FindCursor`, `AggregationCursor`, etc.) - [src/cursor/abstract_cursor.ts:433](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/cursor/abstract_cursor.ts#L433)

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
**Source**: [src/mongo_types.ts:488](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/mongo_types.ts#L488)

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
- `CommandOperationOptions` - [src/db.ts:97](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/db.ts#L97)
- `ClientSessionOptions` - [src/sessions.ts:141](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/sessions.ts#L141)
- `ClientSessionStartOptions.defaultTimeoutMS` - [src/sessions.ts:63](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/sessions.ts#L63)
- `ClientEncryptionOptions` - [src/client-side-encryption/client_encryption.ts:942](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/client-side-encryption/client_encryption.ts#L942)
- `MongoClientOptions` - [src/mongo_client.ts:145](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/mongo_client.ts#L145)
- `RunCommandOptions` - [src/operations/run_command.ts:19](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/operations/run_command.ts#L19)
- `RunCursorCommandOptions` - [src/cursor/run_command_cursor.ts:23](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/cursor/run_command_cursor.ts#L23)
- `CollectionOptions` - [src/collection.ts:123](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/collection.ts#L123)
- `OperationOptions` - [src/operations/operation.ts:42](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/operations/operation.ts#L42)
- `GridFSBucketReadStreamOptions` - [src/gridfs/index.ts:42](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/gridfs/index.ts#L42)
- `GridFSBucketWriteStreamOptions` - [src/gridfs/upload.ts:36](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/gridfs/upload.ts#L36)
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
- Constant definition - [src/cursor/abstract_cursor.ts:70](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/cursor/abstract_cursor.ts#L70)
- Type definition - [src/cursor/abstract_cursor.ts:104](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/cursor/abstract_cursor.ts#L104)
- Option in `AbstractCursorOptions` - [src/cursor/abstract_cursor.ts:155](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/cursor/abstract_cursor.ts#L155)
- Option in `RunCursorCommandOptions` - [src/cursor/run_command_cursor.ts:31](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/cursor/run_command_cursor.ts#L31)

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
**Source**: [src/mongo_types.ts:622](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/mongo_types.ts#L622)

Provides strict type checking for filter predicates with proper nested path support.

#### `StrictMatchKeysAndValues<TSchema>`
**Source**: [src/mongo_types.ts:664](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/mongo_types.ts#L664)

Ensures type-safe matching of keys and values in update operations.

#### `StrictUpdateFilter<TSchema>`
**Source**: [src/mongo_types.ts:634](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/mongo_types.ts#L634)

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

### Client-Side Encryption Features

**Status**: ⚠️ Experimental

**Description**: Advanced client-side encryption capabilities for enhanced data security.

#### Custom Key Material

**Option**: `keyMaterial`
**Type**: `Buffer | Binary`
**Location**: `ClientEncryptionCreateDataKeyProviderOptions`
**Source**: [src/client-side-encryption/client_encryption.ts:1099](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/client-side-encryption/client_encryption.ts#L1099)

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
- `ClientEncryptionRewrapManyDataKeyProviderOptions` - [src/client-side-encryption/client_encryption.ts:889](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/client-side-encryption/client_encryption.ts#L889)
- `ClientEncryptionRewrapManyDataKeyResult` - [src/client-side-encryption/client_encryption.ts:1108](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/client-side-encryption/client_encryption.ts#L1108)

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
- Option in `ClientEncryptionEncryptOptions` - [src/client-side-encryption/client_encryption.ts:846](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/client-side-encryption/client_encryption.ts#L846)
- Interface `TextQueryOptions` - [src/client-side-encryption/client_encryption.ts:855](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/client-side-encryption/client_encryption.ts#L855)

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
- `CreateCollectionOptions` - [src/operations/create_collection.ts:98](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/operations/create_collection.ts#L98)
- `DropCollectionOptions` - [src/operations/drop.ts:15](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/operations/drop.ts#L15)

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
**Source**: [src/gridfs/index.ts:42](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/gridfs/index.ts#L42)

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
**Source**: [src/gridfs/upload.ts:36](https://github.com/mongodb/node-mongodb-native/blob/v7.1.0/src/gridfs/upload.ts#L36)

**Description**: Specifies the time an upload operation will run until it throws a timeout error.

**Example**:
```typescript
const bucket = new GridFSBucket(db);
const uploadStream = bucket.openUploadStream('filename.txt', {
  timeoutMS: 60000 // 60 second timeout for the entire upload
});
```

