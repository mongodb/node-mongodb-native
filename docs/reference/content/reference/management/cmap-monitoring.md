+++
date = "2020-01-14T09:03:26-04:00"
title = "Connection Pool Monitoring"
[menu.main]
  parent = "Management"
  identifier = "CMAP"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# Connection Pool Monitoring

The Node.js driver `3.5.0` or higher features Connection Pool Monitoring events, allowing an application or
tool to monitor the internal workings of the driver's connection pool.

**NOTE:** Connection pool monitoring is only available when the "Unified Topology" is enabled

## Overview of CMAP events

| Event | Description |
| :----------| :------------- |
| connectionPoolCreated | Emitted when a connection pool is created |
| connectionPoolClosed | Emitted when a connection pool is closed, prior to server instance destruction |
| connectionCreated | Emitted when a connection is created, but not necessarily when it is used for an operation |
| connectionReady  | Emitted after a connection has successfully completed a handshake, and is ready to be used for operations|
| connectionClosed | Emitted when a connection is closed |
| connectionCheckOutStarted | Emitted when an operation attempts to acquire a connection for execution |
| connectionCheckOutFailed | Emitted when an operation fails to acquire a connection for execution |
| connectionCheckedOut | Emitted when an operation successfully acquires a connection for execution |
| connectionCheckedIn | Emitted when a connection is returned to the pool after operation execution |
| connectionPoolCleared | Emitted when the connection pool's generation count is increased |

## Simple Code Example

The following example demonstrates connecting to a replica set and printing out all CMAP related events:

```js
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://localhost:31000,localhost:31001/?replicaSet=rs';
const client = new MongoClient(url);

client.on('connectionPoolCreated', event => console.dir(event));
client.on('connectionPoolClosed', event => console.dir(event));
client.on('connectionCreated', event => console.dir(event));
client.on('connectionReady', event => console.dir(event));
client.on('connectionClosed', event => console.dir(event));
client.on('connectionCheckOutStarted', event => console.dir(event));
client.on('connectionCheckOutFailed', event => console.dir(event));
client.on('connectionCheckedOut', event => console.dir(event));
client.on('connectionCheckedIn', event => console.dir(event));
client.on('connectionPoolCleared', event => console.dir(event));

client.connect((err, client) => {
  if (err) throw err;
});
```

## Example Events

### connectionPoolCreated
```js
ConnectionPoolCreatedEvent {
  time: 2020-01-14T13:46:15.536Z,
  address: 'localhost:31003',
  options: { ... }
}
```

### connectionPoolClosed
```js
ConnectionPoolClosedEvent {
  time: 2020-01-14T13:54:53.570Z,
  address: '127.0.0.1:34849'
}
```

### connectionCreated
```js
ConnectionCreatedEvent {
  time: 2020-01-14T13:54:53.579Z,
  address: '127.0.0.1:34849',
  connectionId: 1
}
```

### connectionReady
```js
ConnectionReadyEvent {
  time: 2020-01-14T13:54:53.579Z,
  address: '127.0.0.1:34849',
  connectionId: 1
}
```

### connectionClosed
```js
ConnectionClosedEvent {
  time: 2020-01-14T13:54:53.564Z,
  address: '127.0.0.1:34849',
  connectionId: 2,
  reason: ...
}
```

### connectionCheckOutStarted
```js
ConnectionCheckOutStartedEvent {
  time: 2020-01-14T13:49:59.271Z,
  address: 'localhost:31000'
}
```

### connectionCheckOutFailed
```js
ConnectionCheckOutFailedEvent {
  time: 2020-01-14T13:49:59.271Z,
  address: 'localhost:31000'
  reason: ...
}
```

### connectionCheckedOut
```js
ConnectionCheckedOutEvent {
  time: 2020-01-14T13:48:42.541Z,
  address: 'localhost:31000',
  connectionId: 1
}
```

### connectionCheckedIn
```js
ConnectionCheckedInEvent {
  time: 2020-01-14T13:48:42.543Z,
  address: 'localhost:31000',
  connectionId: 1
}
```

### connectionPoolCleared
```js
ConnectionPoolClearedEvent {
  time: 2020-01-14T13:58:11.437Z,
  address: '127.0.0.1:45005'
}
```
