---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
next: /tutorials/urls
prev: /tutorials/gridfs
title: Connecting To MongoDB
weight: 1
---

# Connecting To MongoDB
---------------------------------------

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

* `mongodb://` is the protocol definition
* `localhost:27017` is the server we are connecting to
* `/myproject` is the database we wish to connect to

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

* `mongodb://` is the protocol definition
* `localhost:27017,localhost:27018` is the servers we are connecting to to discover the topology of the ReplicaSet.
* `/myproject` is the database we wish to connect to
* `replicaSet=foo` is the name of the ReplicaSet we are connecting to. This ensures we are connecting to the correct Replicaset.

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

* `mongodb://` is the protocol definition
* `localhost:50000,localhost:50001` is the *mongos* proxies we are connecting to.
* `/myproject` is the database we wish to connect to

## Authentication

### Against The Specified Database

`MongoClient.connect` also allows us to specify authentication credentials as part of the `URI`. Let's assume there is a user *dave* with the password *password* on the database *protected*. To correctly authenticate we will do the following.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://dave:password@localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

Let's break down the `URI` string.

* `mongodb://` is the protocol definition
* `dave:password` is the user name and password for the database
* `localhost:27017` is the server we are connecting to
* `/myproject` is the database we wish to connect to

*The password and username must be URI encoded to allow for all any possible illegal characters*

### Indirectly Against Another Database

In some cases you might have to authenticate against another database than the one you intend to connect to. This is referred to as delegated authentication. Say you wish to connect to the *myproject* database but the user is defined in the *admin* database. Let's look at how we would accomplish this.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://dave:password@localhost:27017/myproject?authSource=admin';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

Let's break down the `URI` string.

* `mongodb://` is the protocol definition
* `dave:password` is the user name and password for the database
* `localhost:27017` is the server we are connecting to
* `/myproject` is the database we wish to connect to
* `authSource=admin` is the database we wish to authenticate against

# MongoClient.connect Optional Parameters
---------------------------------------
The driver has many more options for tweaking than what's available through the `URI` specification. These can be passed to the driver using an optional parameters object. The top level fields in the options object are.

* `db`, Options that affect the Db instance returned by the MongoClient.connect method.
* `replSet`, Options that modify the Replicaset topology connection behavior.
* `mongos`, Options that modify the Mongos topology connection behavior.
* `server`, Options that modify the Server topology connection behavior.

A simple example connecting to a single server setting all returned queries to be raw BSON buffers and adjusting the poolSize to be 10 connections for this connection.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://dave:password@localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, {
    db: {
      raw: true
    }, 
    server: {
      poolSize: 10
    }
  }, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

Let's look at the individual options for each of the top level fields.

## Data base level options

*  `w`, {Number/String, > -1 || 'majority'} the write concern for the operation where < 1 is no acknowledgment of write and w >= 1 or w = 'majority' acknowledges the write
*  `wtimeout`, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
*  `fsync`, (Boolean, default:false) write waits for fsync before returning
*  `journal`, (Boolean, default:false) write waits for journal sync before returning
*  `readPreference` {String}, the preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
*  `native_parser` {Boolean, default:false}, use c++ bson parser.
*  `forceServerObjectId` {Boolean, default:false}, force server to create _id fields instead of client.
*  `pkFactory` {Object}, object overriding the basic ObjectID primary key generation.
*  `serializeFunctions` {Boolean, default:false}, serialize functions.
*  `raw` {Boolean, default:false}, perform operations using raw bson buffers.
*  `retryMiliSeconds` {Number, default:5000}, number of milliseconds between retries.
*  `numberOfRetries` {Number, default:5}, number of retries off connection.
*  `bufferMaxEntries` {Number, default: -1}, sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited.

## Individual Server Level Options

* `poolSize`, {Number, default: 5} Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
* `ssl`, {Boolean, default: false} Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
* `sslValidate`, {Boolean, default: false} Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslCA`, {Buffer[]|string[], default: null} Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslCert`, {Buffer|string, default: null} String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslKey`, {Buffer|string, default: null} String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslPass`, {Buffer|string, default: null} String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher).
* `socketOptions.autoReconnect`, {Boolean, default: true} Reconnect on error.
* `socketOptions.noDelay`, {Boolean, default: true} TCP Socket NoDelay option.
* `socketOptions.keepAlive`, {Number, default: 0} TCP KeepAlive on the socket with a X ms delay before start. 
* `socketOptions.connectTimeoutMS`, {Number, default: 0} TCP Connection timeout setting.
* `socketOptions.socketTimeoutMS`, {Number, default: 0} TCP Socket timeout setting.

## Replicaset Level Options

*  `ha` {Boolean, default:true}, turn on high availability.
*  `haInterval` {Number, default:5000}, time between each replicaset status check.
*  `replicaSet` {String}, the name of the replicaset to connect to.
*  `secondaryAcceptableLatencyMS` {Number, default:15}, sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms)
*  `connectWithNoPrimary` {Boolean, default:false}, Sets if the driver should connect even if no primary is available.
* `poolSize`, {Number, default: 5} Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
* `ssl`, {Boolean, default: false} Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
* `sslValidate`, {Boolean, default: false} Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslCA`, {Buffer[]|string[], default: null} Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslCert`, {Buffer|string, default: null} String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslKey`, {Buffer|string, default: null} String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslPass`, {Buffer|string, default: null} String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher).
* `socketOptions.autoReconnect`, {Boolean, default: true} Reconnect on error.
* `socketOptions.noDelay`, {Boolean, default: true} TCP Socket NoDelay option.
* `socketOptions.keepAlive`, {Number, default: 0} TCP KeepAlive on the socket with a X ms delay before start. 
* `socketOptions.connectTimeoutMS`, {Number, default: 0} TCP Connection timeout setting.
* `socketOptions.socketTimeoutMS`, {Number, default: 0} TCP Socket timeout setting.

## Mongos Proxy Level Options

*  `ha` {Boolean, default:true}, turn on high availability.
*  `haInterval` {Number, default:5000}, time between each replicaset status check.
*  `replicaSet` {String}, the name of the replicaset to connect to.
*  `secondaryAcceptableLatencyMS` {Number, default:15}, sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms)
* `poolSize`, {Number, default: 5} Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
* `ssl`, {Boolean, default: false} Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons.
* `sslValidate`, {Boolean, default: false} Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslCA`, {Buffer[]|string[], default: null} Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslCert`, {Buffer|string, default: null} String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslKey`, {Buffer|string, default: null} String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher).
* `sslPass`, {Buffer|string, default: null} String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher).
* `socketOptions.autoReconnect`, {Boolean, default: true} Reconnect on error.
* `socketOptions.noDelay`, {Boolean, default: true} TCP Socket NoDelay option.
* `socketOptions.keepAlive`, {Number, default: 0} TCP KeepAlive on the socket with a X ms delay before start. 
* `socketOptions.connectTimeoutMS`, {Number, default: 0} TCP Connection timeout setting.
* `socketOptions.socketTimeoutMS`, {Number, default: 0} TCP Socket timeout setting.
