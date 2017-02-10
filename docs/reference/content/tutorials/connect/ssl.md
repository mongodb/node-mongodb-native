+++
date = "2015-03-19T12:53:26-04:00"
title = "SSL Settings"
[menu.main]
  parent = "Connect to MongoDB"
  identifier = "TLS/SSL Settings"
  weight = 35
  pre = "<i class='fa'></i>"
+++

# TLS/SSL

The Node.js driver supports TLS/SSL connections to MongoDB that support TLS/SSL support.

## No Certificate Validation
If the MongoDB instance does not perform any validation of the certificate chain, include the `ssl=true` in the [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

```js
var MongoClient = require('mongodb').MongoClient;

MongoClient.connect("mongodb://localhost:27017/test?ssl=true", function(err, db) {
  db.close();
});
```

## Validate Server Certificate
If the MongoDB instance presents a certificate, to validate the server's certificate, pass to the `MongoClient.connect` method:

- A [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/) that includes `ssl=true` setting,

- A connections options with the certificate for the Certificate Authority (`sslCA`) and the `sslValidate` setting set to `true`

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

// Read the certificate authority
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

// Connect validating the returned certificates from the server
MongoClient.connect("mongodb://localhost:27017/test?ssl=true", {
  sslValidate:true,
  sslCA:ca
}, function(err, db) {
  db.close();
});
```

## Disable Hostname Verification
By default, the driver ensures that the hostname included in the
server's SSL certificate(s) matches the hostname(s) provided in the URI connection string. If you need to disable the hostname verification, but otherwise validate the server's certificate, pass to the `MongoClient.connect` method:

- A [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/) that includes `ssl=true` setting,

- A connections options with the certificate for the Certificate Authority (`sslCA`) and the `sslValidate` setting set to `true` but  `checkServerIdentity` set to `false`.

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

// Read the certificate authority
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

// Connect validating the returned certificates from the server
MongoClient.connect("mongodb://localhost:27017/test?ssl=true", {
  sslValidate:true,
  checkServerIdentity:false,
  sslCA:ca
}, function(err, db) {
  db.close();
});
```

## Validate Server Certificate and Present Valid Certificate
If the MongoDB server performs certificate validation, the client must pass its
certificate to the server. To pass the client's certificate as well as to validate the server's certificate, pass to the `MongoClient.connect` method:

- A [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/) that includes `ssl=true` setting,

- A connections options with the `sslValidate` setting set to `true`, the certificate for the Certificate Authority (`sslCA`), the client's certificate (`sslCert`) and private key file (`sslKey`).  If the client's key file is encrypted, include the password (`sslPass`).

```js
var MongoClient = require('mongodb').MongoClient,
  f = require('util').format,
  fs = require('fs');

// Read the certificates
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/client.pem");

// Connect validating the returned certificates from the server
MongoClient.connect("mongodb://localhost:27017/test?ssl=true", {
  sslValidate:true,
  sslCA:ca,
  sslKey:key,
  sslCert:cert,
  sslPass:'10gen',
}, function(err, db) {
  db.close();
});
```

## Connect with X.509
[X.509](http://docs.mongodb.org/manual/core/authentication/#x-509-certificate-authentication) authentication requires the use of TLS/SSL connections with certificate validation. MongoDB uses the X.509 certificate presented during SSL negotiation to authenticate a user whose name is derived from the distinguished name of the X.509 certificate.

To connect using the X.509 authentication mechanism, specify `MONGODB-CR` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/), `ssl=true`, and the username. Use `enodeURIComponent` to encode the username string.

In addition to the connection string, pass to the `MongoClient.connect` method
a connections options with  the X.509 certificate and other [TLS/SSL connections]({{< relref "reference/connecting/connection-settings.md" >}}) options.

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
  sslKey:key,
  sslCert:cert,
}, function(err, db) {
  db.close();
});
```

## TLS/SSL Options

The following TLS/SSL options are available.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `ssl` | {Boolean, default: false} | Use ssl connection |
| `sslValidate` | {Boolean, default: true} | Validate server certificate against certificate authority. |
| `sslCA` | {Buffer[]\|string[], default: null} | Array of valid certificates for Certificate Authority either as Buffers or Strings. |
| `sslCert` | {Buffer\|string, default: null} | String or buffer containing the client certificate. |
| `sslPass` | {Buffer\|string, default: null} | String or buffer containing the client certificate password. |

To connect to a single MongoDB instance, specify the TLS/SSL connection options.

```js
var MongoClient = require('mongodb').MongoClient,
  fs = require('fs');

// Read the certificates
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/client.pem");

MongoClient.connect('mongodb://server:27017/test?ssl=true', {
  sslCA:ca,
  sslKey:key,
  sslCert:cert,
}, function(err, db) {
  db.close();
});
```

To connect to a replica set, specify the TLS/SSL connection options.

```js
var MongoClient = require('mongodb').MongoClient,
  fs = require('fs');

// Read the certificates
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/client.pem");

MongoClient.connect('mongodb://server:27017/test?replicaSet=foo&ssl=true', {
  sslCA:ca,
  sslKey:key,
  sslCert:cert,
}, function(err, db) {
  db.close();
});
```

To connect to a mongos we pass in the options at the top level, just as for replicasets and single server connections.

```js
var MongoClient = require('mongodb').MongoClient,
  fs = require('fs');

// Read the certificates
var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
var key = fs.readFileSync(__dirname + "/ssl/client.pem");

MongoClient.connect('mongodb://server:27017/test?ssl=true', {
  sslCA:ca,
  sslKey:key,
  sslCert:cert,
}, function(err, db) {
  db.close();
});
```
