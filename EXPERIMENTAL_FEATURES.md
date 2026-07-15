# MongoDB Node.js Driver - Experimental Features

This file documents all experimental features in the MongoDB Node.js Driver. The driver contains **30 experimental annotations** across 7 major feature categories.

> [!WARNING]
> Experimental features may change in any release, including patches and minors, and are not covered by the driver's semver guarantees. Updates can change runtime behavior or break TypeScript compilation, and may require source changes before you can upgrade.

---

## Summary

| Feature | Description | Introduced in |
|---------|-------------|---------------|
| [Runtime Adapters](#runtime-adapters) | Custom runtime module implementations | v7.2.0 |
| [AbortSignal Support](#abortsignal-support) | Cancel operations using `AbortController` | v6.13.0 |
| [Timeout Management](#timeout-management) | Control operation timeouts with `timeoutMS` | v6.6.0 |
| [Strict TypeScript Types](#strict-typescript-types) | Enhanced type safety for filters and updates | v5.0.0 |

---

## Feature Descriptions

### Runtime Adapters

**Description**: Allows providing custom implementations of Node.js runtime modules to the driver. This is useful both for customizing how the driver uses standard modules within a Node.js runtime (for example, supplying a custom DNS resolver) and for running the driver in non-Node.js JavaScript environments.

> [!NOTE]
> We introduced this feature under an experimental stability guarantee becuase defining a universal I/O interface that works seamlessly across major JS runtimes is complex and we anticipate that the shape of these interfaces may need to evolve as we gather feedback from edge-case usages.

#### Types:

##### `RuntimeAdapters`
**Source**: [src/runtime_adapters.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/runtime_adapters.ts)

Interface for providing custom runtime module implementations.

##### `OsAdapter`
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
> If an abort signal aborts an operation while the driver is writing to the underlying socket or reading the response from the server, the socket will be closed. If signals are aborted at a high rate during socket read/writes, this can lead to a high rate of connection reestablishment, programmatically aborting hundreds of operations can empty the driver's connection pool. `AbortSignal` is best suited for human-interactive interruption (e.g., Ctrl-C) where the cancellation frequency is reasonably low.

> [!NOTE]
> The socket-teardown behavior described above is a driver implementation limitation. Making `AbortSignal` stable would require a project to cancel in-flight socket I/O without discarding the connection. Until that lands, the API is unsafe for high-frequency cancellation and will remain experimental.

---

### Timeout Management

**Option**: `timeoutMS`

**Description**: Specifies the Client-side operations timeout (CSOT) in milliseconds after which an operation will throw an error. `timeoutMS` can be configured at the client, database, collection, session, transaction, and per-operation levels, with narrower scopes overriding broader ones.

_See [Limit Server Execution Time](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/csot/) for the full inheritance/override rules, cursor-specific behavior, Client Encryption interactions, and code examples._

> [!NOTE] This feature will remain experimental while the common driver specification for Client-Side Operations Timeout isn't finalized.

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

> [!NOTE]
> The following type shapes use TypeScript inference to check nested-path filters. Because of that complexity, we may refine them without a major version bump, so their shape is not guaranteed to be stable.

**Types**:

#### `StrictFilter<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)

Provides strict type checking for filter predicates with proper nested path support.

#### `StrictUpdateFilter<TSchema>`
**Source**: [src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)

Provides strict typing for update operators (`$set`, `$inc`, `$push`, etc.).

> [!NOTE]
> `StrictUpdateFilter` references `StrictMatchKeysAndValues` ([src/mongo_types.ts](https://github.com/mongodb/node-mongodb-native/blob/main/src/mongo_types.ts)), which is not intended for direct use.

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
