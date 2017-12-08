+++
date = "2015-03-19T12:53:26-04:00"
title = "Topology Monitoring"
[menu.main]
  parent = "Management"
 identifier = "SDAM"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# Topology Management

The Node.js driver `2.1.10` or higher features SDAM Monitoring events,
allowing an application or tool to monitor changes in the drivers
view of a single server, replica set or `mongos`. This allows an
application to react to changes of topology, such as a secondary
joining or leaving a replica set.

## Overview of SDAM events

| Event | Applies To | Description |
| :----------| :------------- | :------------- |
| serverOpening | Server, Replicaset, Mongos| Emitted when server connection is established. |
| serverClosed | Server, Replicaset, Mongos | Emitted when server connection gets closed. |
| serverDescriptionChanged | Server, Replicaset, Mongos| Emitted when server state changes (such as from secondary to primary). |
| topologyOpening | Server, Replicaset, Mongos| Emitted before any server connections are performed. |
| topologyClosed | Server, Replicaset, Mongos| Emitted when topology connections have all closed. |
| topologyDescriptionChanged | Replicaset, Mongos | Emitted when the topology shape changes, such as a new primary being elected or a mongos proxy disconnecting. |
| serverHeartbeatStarted | Replicaset, Mongos | Emitted before the ismaster command is issued to a MongoDB server. |
| serverHeartbeatSucceeded | Replicaset, Mongos | Emitted after a successful ismaster command was issued to a MongoDB server. |
| serverHeartbeatFailed | Replicaset, Mongos | Emitted if a ismaster command failed against a specific MongoDB server. |

## Simple Code Example

The following example demonstrates how to connect to a replica set and monitor all the events that are emitted by the replica set topology.

```js
const MongoClient = require('mongodb').MongoClient;

const url = 'mongodb://localhost:31000,localhost:31001/?replicaSet=rs';
const client = new MongoClient();

client.on('serverDescriptionChanged', function(event) {
  console.log('received serverDescriptionChanged');
  console.log(JSON.stringify(event, null, 2));
});

client.on('serverHeartbeatStarted', function(event) {
  console.log('received serverHeartbeatStarted');
  console.log(JSON.stringify(event, null, 2));
});

client.on('serverHeartbeatSucceeded', function(event) {
  console.log('received serverHeartbeatSucceeded');
  console.log(JSON.stringify(event, null, 2));
});

client.on('serverHeartbeatFailed', function(event) {
  console.log('received serverHeartbeatFailed');
  console.log(JSON.stringify(event, null, 2));
});

client.on('serverOpening', function(event) {
  console.log('received serverOpening');
  console.log(JSON.stringify(event, null, 2));
});

client.on('serverClosed', function(event) {
  console.log('received serverClosed');
  console.log(JSON.stringify(event, null, 2));
});

client.on('topologyOpening', function(event) {
  console.log('received topologyOpening');
  console.log(JSON.stringify(event, null, 2));
});

client.on('topologyClosed', function(event) {
  console.log('received topologyClosed');
  console.log(JSON.stringify(event, null, 2));
});

client.on('topologyDescriptionChanged', function(event) {
  console.log('received topologyDescriptionChanged');
  console.log(JSON.stringify(event, null, 2));
});

client.connect(url, function(err, client) {
  if(err) throw err;
});
```

## Example Documents Returned For Each Event Type

The following examples serve as a guide to the format of the returned documents.

### serverDescriptionChanged

```js
{ address: 'localhost:27017',
  arbiters: [],
  hosts: [],
  passives: [],
  type: 'RSPrimary' }
```

The type can be one of the following values.

| Type | Description |
| :----------| :------------- |
| RSPrimary| Primary server |
| RSSecondary| Secondary server |
| RSArbiter| Arbiter |
| Standalone| Standalone server|
| Unknown | Unknown server |
| Mongos | Mongos proxy |

### serverHeartbeatStarted

```js
{ connectionId: 'localhost:27017' }
```

### serverHeartbeatSucceeded

```js
{ durationMS: 20,
  reply: {
    setName: "rs", setVersion: 1, electionId: new ObjectId(),
    maxBsonObjectSize : 16777216, maxMessageSizeBytes : 48000000,
    maxWriteBatchSize : 1000, localTime : new Date(),
    maxWireVersion : 4, minWireVersion : 0, ok : 1,
    hosts: ["localhost:32000", "localhost:32001"],
    arbiters: ["localhost:32002"]
  },
  connectionId: 'localhost:27017' }
```

### serverHeartbeatFailed

```js
{ durationMS: 20,
  err: new MongoError('some error'),
  connectionId: 'localhost:27017' }
```

### serverOpening

```js
{ topologyId: 0, name: 'localhost:27017' }
```

### serverClosed

```js
{ topologyId: 0, name: 'localhost:27017' }
```

### topologyOpening

```js
{ topologyId: 0 }
```

### topologyClosed

```js
{ topologyId: 0 }
```

### topologyDescriptionChanged

```js
{
  topologyId: 0,
  previousDescription: {
    topologyType: "ReplicaSetNoPrimary",
    setName: "rs",
    servers: [
      {
        type: "RSSecondary",
        address: "localhost:32001",
        hosts: [
          "localhost:32000",
          "localhost:32001"
        ],
        arbiters: [
          "localhost:32002"
        ],
        setName: "rs"
      },
      {
        type: "RSSecondary",
        address: "localhost:32000",
        hosts: [
          "localhost:32000",
          "localhost:32001"
        ],
        arbiters: [
          "localhost:32002"
        ],
        setName: "rs"
      },
      {
        type: "RSArbiter",
        address: "localhost:32002",
        hosts: [
          "localhost:32000",
          "localhost:32001"
        ],
        arbiters: [
          "localhost:32002"
        ],
        setName: "rs"
      }
    ]
  },
  newDescription: {
    topologyType: "ReplicaSetWithPrimary",
    setName: "rs",
    servers: [
      {
        type: "RSPrimary",
        address: "localhost:32001",
        hosts: [
          "localhost:32000",
          "localhost:32001"
        ],
        arbiters: [
          "localhost:32002"
        ],
        setName: "rs"
      },
      {
        type: "RSSecondary",
        address: "localhost:32000",
        hosts: [
          "localhost:32000",
          "localhost:32001"
        ],
        arbiters: [
          "localhost:32002"
        ],
        setName: "rs"
      },
      {
        type: "RSArbiter",
        address: "localhost:32002",
        hosts: [
          "localhost:32000",
          "localhost:32001"
        ],
        arbiters: [
          "localhost:32002"
        ],
        setName: "rs"
      }
    ]
  },
  diff: {
    servers: [{
        "address": "localhost:32000",
        "from": "RSSecondary",
        "to": "RSPrimary"
      }
    ]
  }  
}
```

The `type` field in the server array documents can be one of the following values:

| Type | Description |
| :----------| :------------- |
| RSPrimary| Primary server |
| RSSecondary| Secondary server |
| RSArbiter| Arbiter |
| Standalone| Standalone server|
| Unknown | Unknown server |

The `topologyType` field can be one of the following values:

| Type | Description |
| :----------| :------------- |
| ReplicaSetWithPrimary| Replica set with a primary |
| ReplicaSetNoPrimary| Replica set with no primary |
| Unknown | Unknown topology |
