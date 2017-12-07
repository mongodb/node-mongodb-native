+++
date = "2015-03-19T12:53:30-04:00"
title = "Pool Design"
[menu.main]
  parent = "Reference"
  identifier = "Sync Pool Design"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# Driver Pool Design

The 2.0 series of the mongodb-core module introduced a newly re-designed pool that will grow and contract based on the usage pattern. This reference outlines how the growing/shrinking of the pool works, how authentication is handled and how operations are executed.

Operations are executed using a work-queue. That means the Pool is responsible for scheduling the execution of operations on connections. The benefit of this is that one avoids slow operations holding up fast operations as long as the following holds true.

```js
numberOfSlowOps < numberOfConnectionsInPool
```

## Pool Growth/Shrinking

This covers the basics of how the pool grows and shrinks.

### Initial Pool connection

1. Single connection is created and put in the `connectingConnections` array.
2. On Successful connect, reapply any existing authentication credentials on the connection.
3. If the user passed in credentials through the `Pool.connect` method these are then applied to the connection and stored in the credentials store if successful.
4. Finally the connection is moved from the `connectingConnections`
 to `availableConnections` and the `connect` event is emitted.

If the initial connection fails the server returns the associated failure event (close, error, timeout, parseError). The `Pool.connect` method will also fail if the authentication fails for any existing or given credentials.

### Growing the Pool

1. A new operation is scheduled to be executed.
2. Pool checks if there are any connections in `availableConnections`.
3. No connections available in `availableConnections`.
4. If we have not reached the max pool `size`, the Pool creates a new connection and puts it in the `connectingConnections`.
5. Any credentials are applied to the new connection and if the connection process is successful, the connection is then moved to `availableConnections` and the operation is re-scheduled for execution.

### Shrinking the Pool

The pool shrinks when a connection is idle for longer than the specified socket timeout. When the connection closes it gets removed from the pool.

## Operation Life-cycle

The Life-cycle of an operation is as follows.

1. User calls the `Pool.write` method.
2. The operation is put at the end of the internal operations `queue` array.
3. The internal `_execute` method is called which picks the first operation of the queue and attempts to execute it against an available connection.
4. The operation is associated with a specific connection for the duration of the operation.

The `Pool.write` options provide for a special `monitoring` options that will schedule the operation at the start of the `queue` array to give it priority over any other operations currently queued up. This is used to execute the `ismaster` commands for things like `Replicaset` monitoring.

## Error handling

When a single connection fails (closes, times out) and there is an operation in flight on that connection the pool will flush out that operation as an error to the end user by calling its associated callback.

## Pool destruction

When the `Pool.destroy` method is called the pool will go into the `destroying` state and will drain the reminder of the operation queue before moving to the `destroy` state.
