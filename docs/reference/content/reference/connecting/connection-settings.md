+++
date = "2015-03-19T12:53:30-04:00"
title = "Connection Settings"
[menu.main]
  parent = "Connecting"
  identifier = "Connection Settings"
  weight = 10
  pre = "<i class='fa'></i>"
+++

# Connecting To MongoDB

{{% note %}}
This reference applies to `2.1.11` or higher. For `2.1.10` or earlier please see the legacy connection settings. `2.1.11` is backward compatible with the legacy connection settings as well as the simplified settings.
{{% /note %}}

Connecting to MongoDB using the driver is primarily done using the `MongoClient.connect` method and a URI. Let's look at how we connect to a couple of different server topologies.

## Single Server Connection

We have a single MongoDB server instance running on the port *27017* Let's connect using the driver and *MongoClient.connect*

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

Let's break down the `URI` string we passed as the first argument to MongoClient.connect.

| Parameter | Description |
| :----------| :------------- |
| `mongodb://` | is the protocol definition |
| `localhost:27017` | is the server we are connecting to |
| `/myproject` | is the database we wish to connect to |

## Replicaset Server Connection

We wish to connect to a ReplicaSet consisting of one primary and 1 or more secondaries. To Do this we need to supply the driver with a seedlist of servers and the name of the ReplicaSet we wish to connect to. Let's take a look at a code example.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017,localhost:27018/myproject?replicaSet=foo';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

Let's break down the `URI` string.

| Parameter | Description |
| :----------| :------------- |
| `mongodb://` | is the protocol definition |
| `localhost:27017,localhost:27018` | is the servers we are connecting to to discover the topology of the ReplicaSet. |
| `/myproject` | is the database we wish to connect to |
| `replicaSet=foo` | is the name of the ReplicaSet we are connecting to. This ensures we are connecting to the correct Replicaset. **This is a required parameter when using the 2.0 driver** |

## Mongos Proxy Connection

We wish to connect to a set of `mongos` proxies. Just as in the case of connecting to a ReplicaSet we can provide a seed list of `mongos` proxies. This allows the driver to perform failover between proxies automatically in case of a proxy process having been shut down. Let's look at an example of code connecting to a set of proxies.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:50000,localhost:50001/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

Let's break down the `URI` string.

| Parameter | Description |
| :----------| :------------- |
| `mongodb://` | is the protocol definition |
| `localhost:50000,localhost:50001` | is the *mongos* proxies we are connecting to. |
| `/myproject` | is the database we wish to connect to |

Let's break down the `URI` string.

| Parameter | Description |
| :----------| :------------- |
| `mongodb://` | is the protocol definition |
| `dave:password` | is the user name and password for the database |
| `localhost:27017` | is the server we are connecting to |
| `/myproject` | is the database we wish to connect to |
| `authSource=admin` | is the database we wish to authenticate against |

## Optional Connection Settings

Optional connection settings are settings not covered by the MongoDB URI specification. These options are passed in the options parameter in the MongoClient.connect function.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:50000,localhost:50001/myproject';
// Use connect method to connect to the Server passing in
// additional options
MongoClient.connect(url, {
  poolSize: 10, ssl: true
}, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

The table below shows all settings and what topology they affect.

| Option | Affects | Type | Default | Description |
| :----------| :------------------ | :------ | :------ |:------------- |
| **poolSize** | Server, ReplicaSet, Mongos | integer | 5 | Set the maximum poolSize for each individual server or proxy connection.|
| **ssl** | Server, ReplicaSet, Mongos | boolean | false | Use ssl connection (needs to have a mongod server with ssl support) |
| **sslValidate** | Server, ReplicaSet, Mongos | boolean | true | Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher) |
| **sslCA** | Server, ReplicaSet, Mongos | Array | null | Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher) |
| **sslCert** | Server, ReplicaSet, Mongos | Buffer/String | null | String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher) |
| **sslKey** | Server, ReplicaSet, Mongos | Buffer/String | null | String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher) |
| **sslPass** | Server, ReplicaSet, Mongos | Buffer/String | null | String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher) |
| **autoReconnect** | Server | boolean | true | Reconnect on error. |
| **noDelay** | Server, ReplicaSet, Mongos | boolean | true | TCP Socket NoDelay option. |
| **keepAlive** | Server, ReplicaSet, Mongos | integer | 0 | The number of milliseconds to wait before initiating keepAlive on the TCP socket. |
| **connectTimeoutMS** | Server, ReplicaSet, Mongos | integer | 30000 | TCP Connection timeout setting. |
| **socketTimeoutMS** | Server, ReplicaSet, Mongos | integer | 30000 | TCP Socket timeout setting. |
| **reconnectTries** | Server | integer | 30 | Server attempt to reconnect #times |
| **reconnectInterval** | Server | integer | 1000 | Server will wait # milliseconds between retries. |
| **ha** | ReplicaSet, Mongos | boolean | true | Turn on high availability monitoring. |
| **haInterval** | ReplicaSet, Mongos | integer | 10000,5000 | Time between each replicaset status check. |
| **replicaSet** | ReplicaSet | string | null | The name of the replicaset to connect to. |
| **secondaryAcceptableLatencyMS** | ReplicaSet | integer | 15 | Sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms). |
| **acceptableLatencyMS** | Mongos | integer | 15 | Sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms). |
| **connectWithNoPrimary** | ReplicaSet | boolean | false | Sets if the driver should connect even if no primary is available. |
| **authSource** | Server, ReplicaSet, Mongos | string | null |  If the database authentication is dependent on another databaseName. |
| **w** | Server, ReplicaSet, Mongos | string, integer| null |  The write concern. |
| **wtimeout** | Server, ReplicaSet, Mongos | integer | null |  The write concern timeout value. |
| **j** | Server, ReplicaSet, Mongos | boolean | false | Specify a journal write concern. |
| **forceServerObjectId** | Server, ReplicaSet, Mongos | boolean | false | Force server to assign _id values instead of driver. |
| **serializeFunctions** | Server, ReplicaSet, Mongos | boolean | false | Serialize functions on any object. |
| **ignoreUndefined** | Server, ReplicaSet, Mongos | boolean | false | Specify if the BSON serializer should ignore undefined fields. |
| **raw** | Server, ReplicaSet, Mongos | boolean | false | Return document results as raw BSON buffers. |
| **promoteLongs** | Server, ReplicaSet, Mongos | boolean | true | Promotes Long values to number if they fit inside the 53 bits resolution. |
| **bufferMaxEntries** | Server, ReplicaSet, Mongos | integer | -1 | Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited. |
| **readPreference** | Server, ReplicaSet, Mongos | object | null | The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). |
| **pkFactory** | Server, ReplicaSet, Mongos | object | null | A primary key factory object for generation of custom _id keys. |
| **promiseLibrary** | Server, ReplicaSet, Mongos | object | null | A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible. |
| **readConcern** | Server, ReplicaSet, Mongos | object | null |  Specify a read concern for the collection. (only MongoDB 3.2 or higher supported). |
