+++
date = "2015-03-19T12:53:26-04:00"
title = "SSL Settings"
[menu.main]
  parent = "Connecting"
  identifier = "SSL Settings"
  weight = 25
  pre = "<i class='fa'></i>"
+++

# SSL

The Node.js driver supports SSL connections to MongoDB when using the Enterprise edition of MongoDB or the open source edition with SSL support compiled in.

## No validation of certificate chain

If the server does not perform any validation of the certificate chain connecting to the server is straightforward.

```js
var MongoClient = require('mongodb').MongoClient;

MongoClient.connect("mongodb://localhost:27017/test?ssl=true", function(err, db) {
  db.close();
});

```

## Driver should validate Server certificate

If the server presents a certificate that we wish to validate client side we need a couple more parameters.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

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

## Driver should ignore host name validation

We want to validate the certificate but ignore the host name validation aspect. We can do so by setting the option `checkServerIdentity` to false.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

// Read the certificate authority
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

// Connect validating the returned certificates from the server
MongoClient.connect("mongodb://localhost:27017/test?ssl=true", {
  server: {
      sslValidate:true
    , checkServerIdentity:false
    , sslCA:ca
  }
}, function(err, db) {
  db.close();
});
```

## Driver should validate Server certificate and present valid Certificate

If the server is configured to perform certificate validation we need to pass a certificate through the driver as well as verify the one retrieved. In this case our certificate password is `10gen`.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

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
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

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

## Topology Options Related to SSL

### Individual Server Level Options

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `ssl` | {Boolean, default: false} |Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons. |
| `sslValidate` | {Boolean, default: true} | Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslCA` | {Buffer[]\|string[], default: null} | Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslCert` | {Buffer\|string, default: null} | String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslKey` | {Buffer\|string, default: null} | String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslPass` | {Buffer\|string, default: null} | String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher). |

If you are connecting to a single MongoDB instance you pass the parameters using the `server` options field.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

MongoClient.connect(f('mongodb://%s@server:27017/test'), {
  server: {
      sslKey:key
    , sslCert:cert
  }
}, function(err, db) {
  db.close();
});

```

### Replicaset Level Options

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `ssl` | {Boolean, default: false} | Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons. |
| `sslValidate` | {Boolean, default: true} | Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslCA` | {Buffer[]\|string[], default: null} | Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslCert` | {Buffer\|string, default: null} | String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslKey` | {Buffer\|string, default: null} | String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslPass` | {Buffer\|string, default: null} | String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher). |

If you are connecting to a MongoDB replicaset, you pass the parameters using the `replset` options field.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

MongoClient.connect(f('mongodb://%s@server:27017/test'), {
  replset: {
      sslKey:key
    , sslCert:cert
  }
}, function(err, db) {
  db.close();
});

```

### Mongos Proxy Level Options

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `ssl` | {Boolean, default: false} | Number of connections in the connection pool for each server instance, set to 5 as default for legacy reasons. |
| `sslValidate` | {Boolean, default: true} | Validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslCA` | {Buffer[]\|string[], default: null} | Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslCert` | {Buffer\|string, default: null} | String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslKey` | {Buffer\|string, default: null} | String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher). |
| `sslPass` | {Buffer\|string, default: null} | String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher). |

If you are connecting to a MongoDB replicaset, you pass the parameters using the `mongos` options field.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

MongoClient.connect(f('mongodb://%s@server:27017/test'), {
  mongos: {
      sslKey:key
    , sslCert:cert
  }
}, function(err, db) {
  db.close();
});

```
