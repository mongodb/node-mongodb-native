# MongoDB Node.js Driver - Experimental Features

This report documents all experimental features in the MongoDB Node.js Driver. The driver contains **34 experimental annotations** across 8 major feature categories.

> [!WARNING]
> Experimental features may change in any release, including patches and minors, and are not covered by the driver's semver guarantees. Updates can change runtime behavior or break TypeScript compilation, and may require source changes before you can upgrade.

---

## Summary

| Feature | Description | Introduced in |
|---------|-------------|---------------|
| [Runtime Adapters](#runtime-adapters) | Custom runtime module implementations | v7.2.0 |
| [Queryable Encryption Text Search](#queryable-encryption-text-search) | Text search on encrypted fields | v6.19.0 |
| [AbortSignal Support](#abortsignal-support) | Cancel operations using `AbortController` | v6.13.0 |
| [Explicit Resource Management](#explicit-resource-management) | Automatic cleanup using `Symbol.asyncDispose` | v6.9.0 |
| [Timeout Management](#timeout-management) | Control operation timeouts with `timeoutMS` | v6.6.0 |
| [Client-Side Encryption Key Management](#client-side-encryption-key-management) | Custom key material and rewrap APIs | v6.0.0 |
| [Strict TypeScript Types](#strict-typescript-types) | Enhanced type safety for filters and updates | v5.0.0 |
| [Encrypted Fields](#encrypted-fields) | Schema for encrypted collections | v4.6.0 |

---

## Feature Descriptions

### Explicit Resource Management

> [!WARNING]
> Experimental until [TC39](https://github.com/tc39/proposal-explicit-resource-management) proposal completion

**Description**: Native support for JavaScript's explicit resource management using `Symbol.asyncDispose`. This feature enables automatic cleanup of resources using the `await using` syntax.

**Available On**:
- `MongoClient` - [src/mongo_client.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_client.ts)
- `ClientSession` - [src/sessions.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/sessions.ts)
- `ChangeStream` - [src/change_stream.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/change_stream.ts)
- All cursor types (`AbstractCursor`, `FindCursor`, `AggregationCursor`, etc.) - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/cursor/abstract_cursor.ts)

**Example**:
```typescript
// Automatic cleanup when scope exits
await using client = new MongoClient(url);
await using session = client.startSession();
// No need to call client.close() or session.endSession()
```

---

### AbortSignal Support

**Type**: `Abortable`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)

**Description**: Allows using `AbortController` to abort asynchronous operations. The `signal.reason` value is used as the error thrown.

**Example**:
```typescript
const controller = new AbortController();
const { signal } = controller;

// Abort operation after 5 seconds
setTimeout(() => controller.abort(new Error('Operation timeout')), 5000);

await collection.find({}, { signal }).toArray();
```

> [!WARNING]
> If an abort signal aborts an operation while the driver is writing to the underlying socket or reading the response from the server, the socket will be closed. If signals are aborted at a high rate during socket read/writes, this can lead to a high rate of connection reestablishment — programmatically aborting hundreds of operations can empty the driver's connection pool.
>
> `AbortSignal` is best suited for human-interactive interruption (e.g., Ctrl-C) where the cancellation frequency is reasonably low. Mitigation of this limitation is tracked in [NODE-6062](https://jira.mongodb.org/browse/NODE-6062) (`timeoutMS` expiration has the same limitation).

---

### Timeout Management

**Option**: `timeoutMS`

**Description**: Specifies the time (in milliseconds) an operation will run until it throws a timeout error. `timeoutMS` can be configured at the client, database, collection, session, transaction, and per-operation levels, with narrower scopes overriding broader ones.

See [Limit Server Execution Time (CSOT) — MongoDB Node.js Driver Docs](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/csot/) for the full inheritance/override rules, cursor-specific behavior, Client Encryption interactions, and code examples.

#### Cursor Timeout Modes

> [!NOTE]
> This configures how the CSOT `timeoutMS` above is applied to cursors.

**Type**: `CursorTimeoutMode`
**Source**:
- Constant definition - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/cursor/abstract_cursor.ts)
- Type definition - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/cursor/abstract_cursor.ts)
- Option in `AbstractCursorOptions` - [src/cursor/abstract_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/cursor/abstract_cursor.ts)
- Option in `RunCursorCommandOptions` - [src/cursor/run_command_cursor.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/cursor/run_command_cursor.ts)

**Values**:
- `'cursorLifetime'` - Timeout applies to the entire cursor lifetime
- `'iteration'` - Timeout applies to each `cursor.next()` call

**Description**: Specifies how `timeoutMS` is applied to cursors.

**Default Behavior**:
- **Non-tailable cursors**: `'cursorLifetime'`
- **Tailable cursors**: `'iteration'` (since tailable cursors can have arbitrarily long lifetimes)

#### GridFS Streams

> [!NOTE]
> Applies the CSOT `timeoutMS` above to GridFS upload and download streams as a per-stream lifetime.

**Options**:
- `timeoutMS` in `GridFSBucketReadStreamOptions` — [src/gridfs/download.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/gridfs/download.ts). Limits the lifetime of a download stream; if any async operation is in progress when the timeout expires, the stream throws a timeout error.
- `timeoutMS` in `GridFSBucketWriteStreamOptions` — [src/gridfs/upload.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/gridfs/upload.ts). Limits the lifetime of an upload stream.

---

### Strict TypeScript Types

**Description**: Provides stricter type checking for MongoDB operations with better TypeScript inference for nested paths and type safety.

**Types**:

#### `StrictFilter<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)

Provides strict type checking for filter predicates with proper nested path support.

#### `StrictMatchKeysAndValues<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)

Ensures type-safe matching of keys and values in update operations.

#### `StrictUpdateFilter<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)

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

---

### Runtime Adapters

**Description**: Allows providing custom implementations of Node.js runtime modules to the driver. This is useful both for customizing how the driver uses standard modules within a Node.js runtime (for example, supplying a custom DNS resolver) and for running the driver in non-Node.js JavaScript environments.

**Types**:

#### `RuntimeAdapters`
**Source**: [src/runtime_adapters.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/runtime_adapters.ts)

Interface for providing custom runtime module implementations.

#### `OsAdapter`
**Source**: [src/runtime_adapters.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/runtime_adapters.ts)

Represents the required functionality from the Node.js `os` module.

**Available On**:
- `MongoClientOptions.runtimeAdapters` - [src/mongo_client.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_client.ts)

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

---

### Client-Side Encryption Key Management

**Description**: Experimental APIs for creating and rewrapping CSFLE data keys.

#### Custom Key Material

**Option**: `keyMaterial`
**Type**: `Buffer | Binary`
**Location**: `ClientEncryptionCreateDataKeyProviderOptions`
**Source**: [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/client-side-encryption/client_encryption.ts)

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
- `ClientEncryptionRewrapManyDataKeyProviderOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/client-side-encryption/client_encryption.ts)
- `ClientEncryptionRewrapManyDataKeyResult` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/client-side-encryption/client_encryption.ts)

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

> [!NOTE]
> This feature is a Public Technical Preview

**Option**: `textOptions`
**Type**: `TextQueryOptions`
**Location**: `ClientEncryptionEncryptOptions`
**Source**:
- Option in `ClientEncryptionEncryptOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/client-side-encryption/client_encryption.ts)
- Interface `TextQueryOptions` - [src/client-side-encryption/client_encryption.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/client-side-encryption/client_encryption.ts)

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

---

### Encrypted Fields

**Option**: `encryptedFields`
**Type**: `Document`

**Available On**:
- `CreateCollectionOptions` - [src/operations/create_collection.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/operations/create_collection.ts)
- `DropCollectionOptions` - [src/operations/drop.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/operations/drop.ts)

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

