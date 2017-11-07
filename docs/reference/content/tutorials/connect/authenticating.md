+++
date = "2015-03-19T14:27:51-04:00"
title = "Authentication"
[menu.main]
  parent = "Connect to MongoDB"
  identifier = "Authentication"
  weight = 30
  pre = "<i class='fa'></i>"
+++

# Authentication

The Node.js driver supports all MongoDB [authentication mechanisms](http://docs.mongodb.org/manual/core/authentication/), including those only available in the MongoDB [Enterprise Edition](http://docs.mongodb.org/manual/administration/install-enterprise/).


## DEFAULT

{{% note %}}
Starting in MongoDB 3.0, MongoDB changed the default authentication mechanism from [MONGODB-CR](https://docs.mongodb.org/manual/core/security-mongodb-cr/) to [SCRAM-SHA-1](https://docs.mongodb.org/manual/core/security-scram-sha-1/).
{{% /note %}}


To use the default mechanism, either omit the authentication mechanism specification or specify `DEFAULT` as the mechanism in the [URI ConnectionString](https://docs.mongodb.org/manual/reference/connection-string/). The driver will attempt to authenticate using the [SCRAM-SHA-1 authentication] (https://docs.mongodb.org/manual/core/security-scram-sha-1/) method if it is available on the MongoDB server. If the server does not support SCRAM-SHA-1, the driver will authenticate using [MONGODB-CR](https://docs.mongodb.org/manual/core/security-mongodb-cr/).

Include the name and password and the [authentication database] (https://docs.mongodb.org/manual/core/security-users/#user-authentication-database) (`authSource`) in the connection string.

In the following example, the connection string specifies the user `dave`, password `abc123`, authentication mechanism `DEFAULT`, and authentication database `myproject`.

{{% note class="important" %}}
The user and password should always be **URI** encoded using `encodeURIComponent` to ensure any non URI compliant user or password characters are correctly parsed.
{{% /note %}}

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

var user = encodeURIComponent('dave');
var password = encodeURIComponent('abc123');
var authMechanism = 'DEFAULT';

// Connection URL
var url = f('mongodb://%s:%s@localhost:27017/myproject?authMechanism=%s',
  user, password, authMechanism);

// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

## SCRAM-SHA-1

To explicitly connect to MongoDB using [SCRAM-SHA-1] (http://docs.mongodb.org/manual/core/authentication/#scram-sha-1-authentication), specify `SCRAM-SHA-1` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

Include the name and password and the [authentication database](https://docs.mongodb.org/manual/core/security-users/#user-authentication-database) (`authSource`) in the connection string.

In the following example, the connection string specifies the user `dave`, password `abc123`, authentication mechanism `SCRAM-SHA-1`, and authentication database `myproject`.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// Connection URL
var url = 'mongodb://dave:abc123@localhost:27017?authMechanism=SCRAM-SHA-1&authSource=myprojectdb';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```


## MONGODB-CR

To explicitly connect to MongoDB using [MONGODB-CR](https://docs.mongodb.org/manual/core/security-mongodb-cr/), specify `MONGODB-CR` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

Include the name and password and the [authentication database](https://docs.mongodb.org/manual/core/security-users/#user-authentication-database) (`authSource`) in the connection string.

In the following example, the connection string specifies the user `dave`, password `abc123`, authentication mechanism `MONGODB-CR`, and authentication database `myproject`.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// Connection URL
var url = 'mongodb://dave:abc123@localhost:27017?authMechanism=MONGODB-CR&authSource=myprojectdb';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

{{% note class="important" %}}

If you have [upgraded the authentication schema]
(https://docs.mongodb.org/manual/release-notes/3.0-scram/) from `MONGODB-CR` to `SCRAM-SHA-1`, `MONGODB-CR` credentials will fail to authenticate.

{{% /note %}}

## X509

With  [X.509](http://docs.mongodb.org/manual/core/authentication/#x-509-certificate-authentication) mechanism, MongoDB uses the X.509 certificate presented during SSL negotiation to authenticate a user whose name is derived from the distinguished name of the X.509 certificate.

X.509 authentication requires the use of SSL connections with certificate validation and is available in MongoDB 2.6 and newer.

To connect using the X.509 authentication mechanism, specify `MONGODB-X509` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/), `ssl=true`, and the username. Use `enodeURIComponent` to encode the username string.

In addition to the connection string, pass to the `MongoClient.connect` method a connections options for the `server` with  the X.509 certificate and other [TLS/SSL connections]({{< relref "tutorials/connect/ssl.md" >}}) options.


```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// Read the cert and key
var cert = fs.readFileSync(__dirname + "/ssl/x509/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/x509/client.pem");

// User name
var userName = encodeURIComponent("CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US");

// Connect using X509 authentication
MongoClient.connect(f('mongodb://%s@server:27017/test?authMechanism=MONGODB-X509&ssl=true', userName), {
  server: {
      sslKey:key
    , sslCert:cert
    , sslValidate:false
  }
}, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

For more information on connecting to MongoDB instance, replica set, and sharded cluster with TLS/SSL options, see [TLS/SSL connections options]({{< relref "tutorials/connect/ssl.md" >}}).

For more information, refer to the MongoDB manual
[X.509 tutorial](http://docs.mongodb.org/manual/tutorial/configure-x509-client-authentication/#add-x-509-certificate-subject-as-a-user) for more information about determining the subject name from the certificate.

## Kerberos (GSSAPI/SSPI)

[MongoDB Enterprise](http://www.mongodb.com/products/mongodb-enterprise) supports proxy authentication through a Kerberos service. The Node.js driver supports Kerberos on UNIX via the MIT Kerberos library and on Windows via the SSPI API.

To connect using the X.509 authentication mechanism, specify ``authMechanism=GSSAPI`` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/). Specify the user principal and the service name in the connection string.  Use `enodeURIComponent` to encode the user principal string.

The following example connects to MongoDB using Kerberos for UNIX.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// KDC Server
var server = "mongo-server.example.com";
var principal = "drivers@KERBEROS.EXAMPLE.COM";
var urlEncodedPrincipal = encodeURIComponent(principal);

// Let's write the actual connection code
MongoClient.connect(f("mongodb://%s@%s/kerberos?authMechanism=GSSAPI&gssapiServiceName=mongodb", urlEncodedPrincipal, server), function(err, db) {
  assert.equal(null, err);

  db.close();
  test.done();
});
```

{{% note %}}
The method refers to the `GSSAPI` authentication mechanism instead of `Kerberos` because technically the driver authenticates via the [GSSAPI](https://tools.ietf.org/html/rfc4752) SASL mechanism.

{{% /note %}}

## LDAP (PLAIN)

[MongoDB Enterprise](http://www.mongodb.com/products/mongodb-enterprise) supports proxy authentication through a Lightweight Directory Access Protocol (LDAP) service.

To connect using the LDAP authentication mechanism, specify ``authMechanism=PLAIN`` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/).

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// LDAP Server
var server = "ldap.example.com";
var user = "ldap-user";
var pass = "ldap-password";

// Url
var url = f("mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1", user, pass, server);

// Let's write the actual connection code
MongoClient.connect(url, function(err, db) {
  test.equal(null, err);

  db.close();
  test.done();
});
```

{{% note %}}
The method refers to the `PLAIN` authentication mechanism instead of `LDAP` because technically the driver authenticates via the [PLAIN](https://www.ietf.org/rfc/rfc4616.txt) SASL mechanism.
{{% /note %}}
