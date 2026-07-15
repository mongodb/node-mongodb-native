# MongoDB Node.js Driver - Experimental Features

This file documents all experimental features in the MongoDB Node.js Driver.

> [!WARNING]
> Experimental features may change in any release, including patches and minors, and are not covered by the driver's semver guarantees. Updates can change runtime behavior or break TypeScript compilation, and may require source changes before you can upgrade.

---

## Summary

| Feature                                             | Description                                  | Introduced in |
| --------------------------------------------------- | -------------------------------------------- | ------------- |
| [Runtime Adapters](#runtime-adapters)               | Custom runtime module implementations        | v7.2.0        |
| [AbortSignal Support](#abortsignal-support)         | Cancel operations using `AbortController`    | v6.13.0       |
| [Timeout Management](#timeout-management)           | Control operation timeouts with `timeoutMS`  | v6.6.0        |
| [Strict TypeScript Types](#strict-typescript-types) | Enhanced type safety for filters and updates | v5.0.0        |

---

## Feature Descriptions

### Runtime Adapters

Allows providing custom implementations of Node.js runtime modules to the driver. This is useful both for customizing how the driver uses standard modules within a Node.js runtime (for example, supplying a custom DNS resolver) and for running the driver in non-Node.js JavaScript environments.

> [!NOTE]
> We introduced this feature under an experimental stability guarantee because defining a universal I/O interface that works seamlessly across major JS runtimes is complex and we anticipate that the shape of these interfaces may need to evolve as we gather feedback from edge-case usages.

**Types:**

- [`RuntimeAdapters`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Aruntime_adapters.ts+RuntimeAdapters&type=code) – Interface for providing custom runtime module implementations.
- [`OsAdapter`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Aruntime_adapters.ts+OsAdapter&type=code) – Represents the required functionality from the Node.js `os` module.

**Available on**:

- [`MongoClientOptions.runtimeAdapters`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+symbol%3A%2F%5EMongoClientOptions%24%2F&type=code)

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

Allows using `AbortController` to abort asynchronous operations. The `signal.reason` value is used as the error thrown.

**Types**:

- [`Abortable`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Amongo_types.ts+Abortable&type=code)

**Example**:

```typescript
const controller = new AbortController();
const { signal } = controller;

// Abort operation after 5 seconds
setTimeout(() => controller.abort(new Error('Operation timeout')), 5000);

await collection.find({}, { signal }).toArray();
```

> [!WARNING]
> If an abort signal aborts an operation while the driver is writing to the underlying socket or reading the response from the server, the socket will be closed. If signals are aborted at a high rate during socket read/writes, this can lead to a high rate of connection reestablishment; programmatically aborting hundreds of operations can empty the driver's connection pool. `AbortSignal` is best suited for human-interactive interruption (e.g., Ctrl-C) where the cancellation frequency is reasonably low.

> [!NOTE]
> The socket-teardown behavior described above is a driver implementation limitation. Making `AbortSignal` stable would require a project to cancel in-flight socket I/O without discarding the connection. Until that lands, the API is unsafe for high-frequency cancellation and will remain experimental.

---

### Timeout Management

Specifies the Client-side operations timeout (CSOT) in milliseconds after which an operation will throw an error. `timeoutMS` can be configured at the client, database, collection, session, transaction, and per-operation levels, with narrower scopes overriding broader ones.

_See [Limit Server Execution Time](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/csot/) for the full inheritance/override rules, cursor-specific behavior, Client Encryption interactions, and code examples._

> [!NOTE]
> This feature will remain experimental while the common driver specification for Client-Side Operations Timeout isn't finalized.

#### Cursor Timeout Modes

This configures how the CSOT `timeoutMS` above is applied to cursors.

**Type**: [`CursorTimeoutMode`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Aabstract_cursor.ts+CursorTimeoutMode&type=code)

**Available on**:

- [`AbstractCursorOptions.timeoutMode`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+symbol%3A%2F%5EAbstractCursorOptions%24%2F&type=code)
- [`RunCursorCommandOptions.timeoutMode`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+symbol%3A%2F%5ERunCursorCommandOptions%24%2F&type=code)

**Values**:

- `'cursorLifetime'` — Timeout applies to the entire cursor lifetime (default for non-tailable cursors)
- `'iteration'` — Timeout applies to each `cursor.next()` call (default for tailable cursors)

**Example**:

```typescript
// timeoutMS applies to each next() call, not the whole cursor
const cursor = collection.find(
  {},
  {
    timeoutMS: 1_000,
    timeoutMode: 'iteration'
  }
);

for await (const doc of cursor) {
  // each iteration gets its own 1s budget
}
```

#### GridFS Streams

Applies the CSOT `timeoutMS` above to GridFS upload and download streams as a per-stream lifetime.

**Options**:

- [`GridFSBucketReadStreamOptions.timeoutMS`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+symbol%3A%2F%5EGridFSBucketReadStreamOptions%24%2F&type=code) — Limits the lifetime of a download stream; if any async operation is in progress when the timeout expires, the stream throws a timeout error.
- [`GridFSBucketWriteStreamOptions.timeoutMS`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+symbol%3A%2F%5EGridFSBucketWriteStreamOptions%24%2F&type=code) — Limits the lifetime of an upload stream.

**Example**:

```typescript
const bucket = new GridFSBucket(db);

// Upload stream: fail if the whole upload takes longer than 30s
const uploadStream = bucket.openUploadStream('report.pdf', { timeoutMS: 30_000 });
await pipeline(fs.createReadStream('report.pdf'), uploadStream);

// Download stream: fail if the whole download takes longer than 10s
const downloadStream = bucket.openDownloadStream(uploadStream.id, { timeoutMS: 10_000 });
await pipeline(downloadStream, fs.createWriteStream('out.pdf'));
```

---

### Strict TypeScript Types

Provides stricter type checking for MongoDB operations with better TypeScript inference for nested paths and type safety.

> [!NOTE]
> The following type shapes use TypeScript inference to check nested-path filters. Because of that complexity, we may refine them without a major version bump, so their shape is not guaranteed to be stable.

**Types**:

- [`StrictFilter<TSchema>`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Amongo_types.ts+StrictFilter&type=code) – Provides strict type checking for filter predicates with proper nested path support.
- [`StrictUpdateFilter<TSchema>`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Amongo_types.ts+StrictUpdateFilter&type=code) – Provides strict typing for update operators (`$set`, `$inc`, `$push`, etc.).
- [`StrictMatchKeysAndValues`](https://github.com/search?q=repo%3Amongodb%2Fnode-mongodb-native+path%3Amongo_types.ts+StrictMatchKeysAndValues&type=code) – Helper type for `StrictUpdateFilter` (not intended for public use).

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
  $set: { age: 30 } // ✓ Valid
  // $set: { age: 'thirty' } // ✗ Compile error
};
```
