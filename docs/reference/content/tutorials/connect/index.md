+++
date = "2015-03-19T12:53:30-04:00"
title = "Connect to MongoDB"
[menu.main]
  parent = "Tutorials"
  identifier = "Connect to MongoDB"
  weight = 25
  pre = "<i class='fa'></i>"
+++

# Connect to MongoDB

Use the `client.connect` method to connect to a running MongoDB deployment.

## Connect to a Single MongoDB Instance

To connect to a single MongoDB instance, specify the URI of the MongoDB
instance to connect to.

In the following example, the
[URI connection string](https://docs.mongodb.org/manual/reference/connection-string/)
specifies connecting to a MongoDB instance that is running on
`localhost` using port `27017`. The `myproject` indicates the database
to use.

```js
{{% basic-connection %}}
```

For more information on the URI connection string, see
[URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

## Connect to a Replica Set

To connect to a [replica set](https://docs.mongodb.org/manual/core/replication-introduction/),
include a seedlist of replica set members and the name of the replica set in the
[URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

In the following example, the connection string specifies two of the replica set members running on `localhost:27017` and `localhost:27018` and the name of the replica set (`foo`). 

```js
{{% connect-to-replicaset %}}
```

For more information on the URI connection string, see
[URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

## Connect to Sharded Cluster

To connect to a [sharded cluster] (https://docs.mongodb.org/manual/core/sharded-cluster-components/), specify the `mongos` instance or instances in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

In the following example, the connection string specifies the `mongos` instances running on `localhost:50000` and `localhost:50001`.

```js
{{% connect-to-sharded-cluster %}}
```

For more information on the URI connection string, see
[URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

## Connection Options

You can specify various connection settings in the [URI Connection
String ](https://docs.mongodb.org/manual/reference/connection-string/).

For example, you can specify TLS/SSL and authentication setting.

```js

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const fs = require('fs');

  // Read the certificate authority
const ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
const cert = fs.readFileSync(__dirname + "/ssl/client.pem");

// Connection URL
const url = 'mongodb://dave:password@localhost:27017?authMechanism=DEFAULT&authSource=db&ssl=true"';

// Create a client, passing in additional options
const client = new MongoClient(url,  {
  sslValidate: true,
  sslCA: ca,
  sslCert: cert
});

// Use connect method to connect to the server
client.connect(function(err) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  client.close();
});

```

For more information on connecting with authentication and TSL/SSL, see:

- [Authentication]({{<relref "tutorials/connect/authenticating.md">}}): detailed documentation of the various ways to specify authentication credentials
- [TLS/SSL]({{<relref "tutorials/connect/ssl.md">}}): Detailed documentation of the various ways to specify the properties of an TLS/SSL connection

For more information on the connection options:

- [URI Connection String](https://docs.mongodb.org/manual/reference/connection-string/): MongoDB connection string URI.
- [Connection Settings]({{<relref "reference/connecting/connection-settings.md">}}): Reference on the driver-specific connection settings.
