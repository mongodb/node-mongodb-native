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

{{% note %}}

This reference applies to **2.1.11** or higher. For **2.1.10** or
earlier, refer to the [legacy connection settings] ({{< relref
"reference/connecting/legacy-connection-settings.md" >}}). **2.1.11**
is backward compatible with the legacy settings as well as the
simplified settings. {{% /note %}}

Use the `MongoClient.connect` method to connect to a running MongoDB deployment.

## Connect to a Single MongoDB Instance

To connect to a single MongoDB instance, specify the URI of the MongoDB
instance to connect to.

In the following example, the
[URI connection string](https://docs.mongodb.org/manual/reference/connection-string/)
specifies connecting to a MongoDB instance that is running on
`localhost` using port `27017`. The `myproject` indicates the database
to use. If the database is omitted, the `MongoClient` uses the default `test` database:

```js
{{% basic-connection %}}
```

For more information on the URI connection string, see
[URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

## Connect to a Replica Set

To connect to a [replica set](https://docs.mongodb.org/manual/core/replication-introduction/),
include a seedlist of replica set members and the name of the replica set in the
[URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

In the following example, the connection string specifies two of the replica set members running on `localhost:27017` and `localhost:27018`, the database to access (`myproject`), and the name of the replica set (`foo`). **When using the 2.0 driver, you must include the replica set name.**

```js
{{% connect-to-replicaset %}}
```

For more information on the URI connection string, see
[URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

## Connect to Sharded Cluster

To connect to a [sharded cluster] (https://docs.mongodb.org/manual/core/sharded-cluster-components/), specify the `mongos` instance or instances in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

In the following example, the connection string specifies the `mongos` instances running on `localhost:50000` and `localhost:50000` and the database to access (`myproject`).

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

var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert'),
  fs = require('fs');

  // Read the certificate authority
  var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/ssl/client.pem");

// Connection URL
var url = 'mongodb://dave:password@localhost:27017?authMechanism=DEFAULT&authSource=db&ssl=true"';

// Use connect method to connect to the Server passing in
// additional options
MongoClient.connect(url,  {
  server: {
      sslValidate:true
    , sslCA:ca
    , sslCert:cert
  }
}, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});

```

For more information on connecting with authentication and TSL/SSL, see:

- [Authentication]({{<relref "tutorials/connect/authenticating.md">}}): detailed documentation of the various ways to specify authentication credentials
- [TLS/SSL]({{<relref "tutorials/connect/ssl.md">}}): Detailed documentation of the various ways to specify the properties of an TLS/SSL connection

For more information on the connection options:

- [URI Connection String](https://docs.mongodb.org/manual/reference/connection-string/): MongoDB connection string URI.
- [Connection Settings]({{<relref "reference/connecting/connection-settings.md">}}): Reference on the driver-specific connection settings.
