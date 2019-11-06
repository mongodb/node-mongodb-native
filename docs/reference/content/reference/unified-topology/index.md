+++
date = "2019-07-04T12:53:30-04:00"
title = "Unified Topology Design"
[menu.main]
  parent = "Reference"
  identifier = "Unified Topology Design"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# Unified Topology Design

At the time of writing the node driver has seven topology classes, including the newly introduced unified topology. Each legacy topology type from the core module targets a supported topology class: Replica Sets, Sharded Deployments (mongos) and Standalone servers. On top of each of these rests a thin topology wrapper from the "native" layer which introduces the concept of a "disconnect handler", essentially a callback queue for handling naive retryability.

The goal of the unified topology is threefold:
  - fully support the drivers Server Discovery and Monitoring, Server Selection and Max Staleness specifications
  - reduce the maintenance burden of supporting the topology layer in the driver by modeling all supported topology types with a single engine
  - remove confusing functionality which could be potentially dangerous for our users

## How to use it

The unified topology is available now behind the `useUnifiedTopology` feature flag. You can opt in to using it by passing the option to your `MongoClient` constructor:

```js
const client = MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });
```

**NOTE:** In upcoming minor versions `useUnifiedTopology` will default to `true`, and in the next major version of the driver this topology will outright replace the legacy topologies.

## Behavioral Changes

### `MongoClient.connect`, `isConnected`

The unified topology is the first step in a paradigm shift away from a concept of "connecting" to a MongoDB deployment using a `connect` method. Consider for a moment what it means to be connected to a replica set: do we trigger this state when connected to a primary? A primary and one secondary? When connected to all known nodes? It's unclear whether its possible to answer this without introducing something like a `ReadPreference` parameter to the `connect` method. At this point "connecting" is just one half of "operation execution" - you pass a `ReadPreference` in, and await a selectable server for the operation, now we're connected!

But couldn't you do all of that as a part of your first operation? Our goal is to move towards code that looks more like the following:

```js
const client = new MongoClient('mongodb://llama:drama@localhost:27017/?replicaSet=rs');
const coll = client.db('test').collection('foo');
await coll.insert({ test: 'document' });
const docs = coll.find({ test: 1 }, { readPreference: 'secondary' }).toArray();
console.dir({ docs });
await client.close();
```

A default `ReadPreference` of "primary" is used for the first write, and a part of awaiting that insert involves initiating connections to all servers in a cluster, selecting a server and executing the operation. Errors will surface at the callsite of any given operation, giving the user more fine-grained control over error handling.

#### Why does `MongoClient.isConnected` always return `true`?

We think the ambiguity of what it means to be "connected" can lead to far more problems than it seeks to solve. The primary concern of an application developer is successful operation execution. The `isConnected` method is often used to "health check" the `MongoClient` in order to determine if operations can be successfully executed. The unified topology pushes this concern directly to operation execution through the introduction of a "server selection loop" (discussed in detail below). A `MongoClient` thus is _always_ "connected" in that it will _always_ accept operations and attempt to execute them.

**NOTE:** In the next major version of the driver, `isConnected` will be removed completely.

### Server Selection

The psuedocode for operation execution looks something like this:

```js
function executeOperation(topology, operation, callback) {
  const readPreference = resolveReadPreference(operation);
  topology.selectServer(readPreference, (err, server) => {
    if (err) {
      // This error is most likely a "Server selection timed out after Xms"
      return callback(err);
    }

    // checks a connection out of the server to execute the operation, then checks it back in
    server.withConnection(conn => operation.execute(conn, callback));
  })
}
```

The `serverSelection` method above will loop for up to `serverSelectionTimeoutMS` (default: 30s) waiting for the driver to successfully connect to a viable server in order to execute the requested operation. If server selection results in no viable server, control is passed back to the user to determine what the next best course of action is. This doesn't necessarily mean that the client is generally disconnected from a cluster, but that it is not currently connected to any server that satisfies the specified `ReadPreference`.

### disconnectHandler

The three topology types from the "native" layer (in `lib/topologies`) primarily provide support for a callback store, called the "disconnect handler". Rather than using a server selection loop, the legacy topologies instead place callbacks on this store in cases when no suitable server is available, intending to run the operation at some later time. This callback store also provides a form of naive retryability, however in practice this might lead to unexpected, or even unintended results:
  - The callback store is only associated with a single server, so attempts to re-execute an operation are only ever made against the originally selected server. If that server never comes back (it was stepped down, and decommissioned for instance), the operation will sit in limbo.
  - There is no collaboration with the server to ensure that queued write operations only happen one time. Imagine running an `updateOne` operation which is interrupted by a network error. The operation was successfully sent to the server, but the server response was lost during the interruption, which means the operation is placed in the callback store to be retried. At the same, another microservice allows a user to update the written data. Once the original client is reconnected to the server, it automatically rexecutes the operation and updates the _newer_ data with an _older_ value.

The unified topology completely removes the disconnect handler, in favor of the more robust and consistent [Retryable Reads](https://github.com/mongodb/specifications/blob/master/source/retryable-reads/retryable-reads.rst) and [Retryable Writes](https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst) features. Operations now will attempt execution in a server selection loop for up to `serverSelectionTimeoutMS` (default: 30s), and will retry the operation one time in the event of a [retryable error](https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms). All errors outside of this loop are returned to the user, since they know best what to do in these scenarios.
