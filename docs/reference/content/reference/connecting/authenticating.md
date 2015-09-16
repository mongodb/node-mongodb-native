+++
date = "2015-03-19T14:27:51-04:00"
title = "Authenticating"
[menu.main]
  parent = "Connecting"
  identifier = "Authenticating"
  weight = 20
  pre = "<i class='fa'></i>"
+++

# Authentication

The Node.js driver supports all MongoDB [authentication mechanisms](http://docs.mongodb.org/manual/core/authentication/), including those
only available in the MongoDB [Enterprise Edition](http://docs.mongodb.org/manual/administration/install-enterprise/).

{{% note %}}
MongoDB 3.0 changed the default authentication mechanism from
[MONGODB-CR](http://docs.mongodb.org/manual/core/authentication/#mongodb-cr-authentication) to
[SCRAM-SHA-1](http://docs.mongodb.org/manual/core/authentication/#scram-sha-1-authentication).
{{% /note %}}

## SCRAM-SHA-1

To explicitly connect to MongoDB using [SCRAM-SHA-1](http://docs.mongodb .org/manual/core/authentication/#scram-sha-1-authentication), we pass the following parameters to the driver over the connection URI.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// Connection URL
var url = 'mongodb://dave:password@localhost:27017?authMechanism=SCRAM-SHA-1&authSource=db';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

The URI uses the authMechanism `SCRAM-SHA-1` with the user `dave` and password `password` against the database `db`.

## MONGODB-CR

To explicitly create a credential of type [MONGODB-CR](http://docs.mongodb.org/manual/core/authentication/#mongodb-cr-authentication), we pass the following parameters to the driver over the connection URI.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// Connection URL
var url = 'mongodb://dave:password@localhost:27017?authMechanism=MONGODB-CR&authSource=db';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  db.close();
});
```

The URI uses the authMechanism `MONGODB-CR` with the user `dave` and password `password` against the database `db`.

{{% note class="important" %}}
If you specify the `MONGODB-CR` authMechanism the authentication might fail once you upgrade MongoDB to 3.0 or higher due to new users only being created using the `SCRAM-SHA-1` mechanism.
{{% /note %}}

## X509

The [x.509](http://docs.mongodb.org/manual/core/authentication/#x-509-certificate-authentication) mechanism authenticates a user
whose name is derived from the distinguished subject name of the X.509 certificate presented by the driver during SSL negotiation. This
authentication method requires the use of SSL connections with certificate validation and is available in MongoDB 2.6 and newer.

The example below shows how you connect using a X509 certificate using `MongoClient`. We assume that the `client.pem` file here is a valid X509 certificate and that the MongoDB server is correctly configured.

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

See the MongoDB server
[x.509 tutorial](http://docs.mongodb.org/manual/tutorial/configure-x509-client-authentication/#add-x-509-certificate-subject-as-a-user) for
more information about determining the subject name from the certificate.
## Against The Specified Database

## Kerberos (GSSAPI/SSPI)

[MongoDB Enterprise](http://www.mongodb.com/products/mongodb-enterprise) supports proxy authentication through a Kerberos service. The Node.js driver supports Kerberos on UNIX via the MIT Kerberos library and on Windows via the SSPI API.

Below is an example on how to connect to MongoDB using Kerberos for UNIX.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// KDC Server
var server = "kerberos.example.com";
var principal = "drivers@KERBEROS.EXAMPLE.COM";
var urlEncodedPrincipal = encodeURIComponent(principal);

// Let's write the actual connection code
MongoClient.connect(format("mongodb://%s@%s/kerberos?authMechanism=GSSAPI&gssapiServiceName=mongodb", urlEncodedPrincipal, server), function(err, db) {
  assert.equal(null, err);

  db.close();
  test.done();
});
```

{{% note %}}
The method refers to the `GSSAPI` authentication mechanism instead of `Kerberos` because technically the driver is authenticating via the 
[GSSAPI](https://tools.ietf.org/html/rfc4752) SASL mechanism.
{{% /note %}}

## LDAP (PLAIN)

[MongoDB Enterprise](http://www.mongodb.com/products/mongodb-enterprise) supports proxy authentication through a Lightweight Directory
Access Protocol (LDAP) service.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  assert = require('assert');

// LDAP Server
var server = "ldap.example.com";
var user = "ldap-user";
var pass = "ldap-password";

// Url
var url = format("mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1", user, pass, server);

// Let's write the actual connection code
MongoClient.connect(url, function(err, db) {
  test.equal(null, err);    

  db.close();
  test.done();
});
```

{{% note %}}
The method refers to the `plain` authentication mechanism instead of `LDAP` because technically the driver is authenticating via the [PLAIN](https://www.ietf.org/rfc/rfc4616.txt) SASL mechanism.
{{% /note %}}