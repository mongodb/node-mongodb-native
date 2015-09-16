+++
date = "2015-03-19T12:53:30-04:00"
title = "Connection Settings"
[menu.main]
  parent = "Sync Connecting"
  identifier = "Sync Connection Settings"
  weight = 10
  pre = "<i class='fa'></i>"
+++

# Connecting To MongoDB

Connecting to MongoDB using the driver is done using the Topology classes `Server`, `ReplSet` and `Mongos`. There is no auto detection of the server topology as this is a low level driver.

## Single Server Connection

We have a single MongoDB server instance running on the port *27017* Let's connect using the driver and *MongoClient.connect*

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  server.destroy();
});

// Start connecting
server.connect();
```

Let's break down the connection options available.

* `reconnect` **{boolean, default:true}** Server will attempt to reconnect on loss of connection
* `reconnectTries` **{number, default:30}** Server attempt to reconnect #times
* `reconnectInterval` **{number, default:1000}** Server will wait # milliseconds between retries
* `emitError` **{boolean, default:false}** Server will emit errors events
* `cursorFactory` **{Cursor, default:Cursor}** The cursor factory class used for all query cursors
* `host` **{string}** The server host
* `port` **{number}** The server port
* `size` **{number, default:5}** Server connection pool size
* `keepAlive` **{boolean, default:true}** TCP Connection keep alive enabled
* `keepAliveInitialDelay` **{number, default:0}** Initial delay before TCP keep alive enabled
* `noDelay` **{boolean, default:true}** TCP Connection no delay
* `connectionTimeout` **{number, default:0}** TCP Connection timeout setting
* `socketTimeout` **{number, default:0}** TCP Socket timeout setting
* `singleBufferSerializtion` **{boolean, default:true}** Serialize into single buffer, trade of peak memory for serialization speed
* `ssl` **{boolean, default:false}** Use SSL for connection
* `ca` **{Buffer}** SSL Certificate store binary buffer
* `cert` **{Buffer}** SSL Certificate binary buffer
* `key` **{Buffer}** SSL Key file binary buffer
* `passphrase` **{string}** SSL Certificate pass phrase
* `rejectUnauthorized` **{boolean, default:true}** Reject unauthorized server certificates
* `promoteLongs` **{boolean, default:true}** Convert Long values from the db into Numbers if they fit into 53 bits

## Replicaset Connection

We wish to connect to a ReplicaSet consisting of one primary and 1 or more secondaries. To Do this we need to supply the driver with a seedlist of servers and the name of the ReplicaSet we wish to connect to. Let's take a look at a code example.

```js
var ReplSet = require('mongodb-core').ReplSet
  , assert = require('assert');

var server = new ReplSet(
    [{host: 'localhost', port: 31000}, {host: 'localhost', port: 31001}]
  , {setName: 'rs'});
// Wait for the connection event
server.on('connect', function(server) {
  server.destroy();
});

// Start connecting
server.connect();
```

Let's break down the connection options available.

* `setName` **{string}** The Replicaset set name
* `secondaryOnlyConnectionAllowed` **{boolean, default:false}** Allow connection to a secondary only replicaset
* `haInterval` **{number, default:5000}** The High availability period for replicaset inquiry
* `emitError` **{boolean, default:false}** Server will emit errors events
* `cursorFactory` **{Cursor, default:Cursor}** The cursor factory class used for all query cursors
* `size` **{number, default:5}** Server connection pool size
* `keepAlive` **{boolean, default:true}** TCP Connection keep alive enabled
* `keepAliveInitialDelay` **{number, default:0}** Initial delay before TCP keep alive enabled
* `noDelay` **{boolean, default:true}** TCP Connection no delay
* `connectionTimeout` **{number, default:0}** TCP Connection timeout setting
* `socketTimeout` **{number, default:0}** TCP Socket timeout setting
* `singleBufferSerializtion` **{boolean, default:true}** Serialize into single buffer, trade of peak memory for serialization speed
* `ssl` **{boolean, default:false}** Use SSL for connection
* `ca` **{Buffer}** SSL Certificate store binary buffer
* `cert` **{Buffer}** SSL Certificate binary buffer
* `key` **{Buffer}** SSL Key file binary buffer
* `passphrase` **{string}** SSL Certificate pass phrase
* `rejectUnauthorized` **{boolean, default:true}** Reject unauthorized server certificates
* `promoteLongs` **{boolean, default:true}** Convert Long values from the db into Numbers if they fit into 53 bits

## Mongos Proxy Connection

We wish to connect to a set of `mongos` proxies. Just as in the case of connecting to a ReplicaSet we can provide a seed list of `mongos` proxies. This allows the driver to perform failover between proxies automatically in case of a proxy process having been shut down. Let's look at an example of code connecting to a set of proxies.

```js
var Mongos = require('mongodb-core').Mongos
  , assert = require('assert');

var server = new Mongos(
    [{host: 'localhost', port: 50000}, {host: 'localhost', port: 50001}]
  );
// Wait for the connection event
server.on('connect', function(server) {
  server.destroy();
});

// Start connecting
server.connect();
```

Let's break down the connection options available.

* `reconnectTries` **{number, default:30}** Reconnect retries for HA if no servers available
* `haInterval` **{number, default:5000}** The High availability period for replicaset inquiry
* `emitError` **{boolean, default:false}** Server will emit errors events
* `cursorFactory` **{Cursor, default:Cursor}** The cursor factory class used for all query cursors
* `size` **{number, default:5}** Server connection pool size
* `keepAlive` **{boolean, default:true}** TCP Connection keep alive enabled
* `keepAliveInitialDelay` **{number, default:0}** Initial delay before TCP keep alive enabled
* `noDelay` **{boolean, default:true}** TCP Connection no delay
* `connectionTimeout` **{number, default:0}** TCP Connection timeout setting
* `socketTimeout` **{number, default:0}** TCP Socket timeout setting
* `singleBufferSerializtion` **{boolean, default:true}** Serialize into single buffer, trade of peak memory for serialization speed
* `ssl` **{boolean, default:false}** Use SSL for connection
* `ca` **{Buffer}** SSL Certificate store binary buffer
* `cert` **{Buffer}** SSL Certificate binary buffer
* `key` **{Buffer}** SSL Key file binary buffer
* `passphrase` **{string}** SSL Certificate pass phrase
* `rejectUnauthorized` **{boolean, default:true}** Reject unauthorized server certificates
* `promoteLongs` **{boolean, default:true}** Convert Long values from the db into Numbers if they fit into 53 bits

## Authentication using the Core Driver
Authentication is fairly easy to perform and is done using the `auth` method on the connected topology instance. Let's look at a simple example of authenticating using the `MongoCR` authentication strategy.

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  server.auth('mongocr', 'admin', 'test', 'test', function(err, session) {    
    server.destroy();
  });
});

// Start connecting
server.connect();
```

The first argument is the authentication mechanism you wish to use, the second argument is the database you wish to authenticate against and the rest of the parameters are authentication mechanism specific with the last parameter being the callback function. The authentication is performed against all connections on the topology. The driver currently provides the following authentication mechanisms.

* `mongocr` The current default MongoDB authentication mechanism.
* `x509` Using a X509 Certificate for the authentication.
* `plain` Use LDAP for authentication using $external.
* `gssapi` Linux Kerberos authentication using MIT library.
* `sspi` Windows Kerberos authentication using SSPI.
* `scram-sha-1` 2.8 or higher default authentication mechanism.