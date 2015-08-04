---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
prev: ../../tutorials/changes-from-1.0
next: ../../tutorials/apm
title: Driver Enterprise Features
weight: 61
---

# Enterprise Driver Features

This tutorial covers aspects of the driver related to the Subscription version of MongoDB that includes SSL, X509, ldap and kerberos support.

## Connecting using SSL

### No validation of certificate chain

If the server does not perform any validation of the certificate chain connecting to the server is straightforward.

```js
var MongoClient = require('mongodb').MongoClient;

MongoClient.connect("mongodb://localhost:27017/test?ssl=true", function(err, db) {
  db.close();
});

```

### Driver should validate Server certificate

If the server presents a certificate that we wish to validate client side we need a couple more parameters.

```js
var MongoClient = require('mongodb').MongoClient
  , fs = require('fs');

// Read the certificate authority
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

// Connect validating the returned certificates from the server
MongoClient.connect("mongodb://localhost:27017/test?ssl=true", {
  server: {
      sslValidate:true
    , sslCA:ca
  }
}, function(err, db) {
  db.close();
});

```

### Driver should validate Server certificate and present valid Certificate

If the server is configured to perform certificate validation we need to pass a certificate through the driver as well as verify the one retrieved. In this case our certificate password is `10gen`.

```js
var MongoClient = require('mongodb').MongoClient
  , fs = require('fs');

// Read the certificate authority
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/client.pem");

// Connect validating the returned certificates from the server
MongoClient.connect("mongodb://localhost:27017/test?ssl=true", {
  server: {
      sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
    , sslPass:'10gen'
  }
}, function(err, db) {
  db.close();
});

```

## Connecting using X509

X509 is a certification validation process similar to normal SSL validation but it also includes specific user information that can be used for authorization. Connecting is very similar to the previous SSL examples.

```js
var MongoClient = require('mongodb').MongoClient
  , fs = require('fs');

// Read the cert and key
var cert = fs.readFileSync(__dirname + "/ssl/x509/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/x509/client.pem");

// User name
var userName = "CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US";

// Connect using the MONGODB-X509 authentication mechanism
MongoClient.connect(f('mongodb://%s@server:27017/test?authMechanism=%s&ssl=true'
    , encodeURIComponent(userName), 'MONGODB-X509'), {
  server: {
      sslKey:key
    , sslCert:cert
  }
}, function(err, db) {
  db.close();
});

```

## Connecting using LDAP

The LDAP support in the subscription version of MongoDB allows for integrating against corporate LDAP server to manage authentication and authorization. To connect using LDAP we need to do the following.

```js
var MongoClient = require('mongodb').MongoClient
  , f = require('util').format;

// LDAP credentials
var server = "ldaptest.someserver.com";
var user = "drivers-team";
var pass = "mongo0x$server";

// Url
var url = f("mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1", user, pass, server);

// Connect using ldap credentials
MongoClient.connect(url, function(err, db) {
  db.close();
});

```

## Connecting using Kerberos

The subscription version of MongoDB support kerberos authentication and authorization support using SSPI under windwos and GSAPI under unix. To connect with kerberos (this example expects there to be a valid kerberos ticket for the user).

```js
var MongoClient = require('mongodb').MongoClient;
  , f = require('util').format;

// KDC Server
var server = "ldaptest.10gen.cc";
var principal = "drivers@LDAPTEST.10GEN.CC";
var urlEncodedPrincipal = encodeURIComponent(principal);

// Url
var url = f("mongodb://%s@%s/kerberos?authMechanism=GSSAPI&gssapiServiceName=mongodb", urlEncodedPrincipal, server);

// Connect using kerberos details
MongoClient.connect(url, function(err, db) {
  db.close();
});

```

You can also pass in password credentials for a kerberos connection, this is useful on windows if you don't have a security domain set up.

```js
var MongoClient = require('mongodb').MongoClient;
  , f = require('util').format;

// KDC Server
var server = "ldaptest.10gen.cc";
var principal = "drivers@LDAPTEST.10GEN.CC";
var urlEncodedPrincipal = encodeURIComponent(principal);

// Url
var url = f("mongodb://%s:%s@%s/kerberos?authMechanism=GSSAPI&maxPoolSize=1", urlEncodedPrincipal, pass, server);

// Connect using kerberos details
MongoClient.connect(url, function(err, db) {
  db.close();
});

```
