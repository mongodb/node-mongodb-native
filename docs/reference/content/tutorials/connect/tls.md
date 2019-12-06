+++
date = "2015-03-19T12:53:26-04:00"
title = "TLS Settings"
[menu.main]
  parent = "Connect to MongoDB"
  identifier = "TLS/SSL Settings"
  weight = 35
  pre = "<i class='fa'></i>"
+++

# TLS/SSL

The Node.js driver supports TLS/SSL connections to MongoDB that support TLS/SSL support.

## No Certificate Validation
If the MongoDB instance does not perform any validation of the certificate chain, include the `tls=true` in the [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/).

```js
const MongoClient = require('mongodb').MongoClient;

const client = new MongoClient('mongodb://localhost:27017?tls=true');

client.connect(function(err) {
  client.close();
});
```

## Validate Server Certificate
If the MongoDB instance presents a certificate, to validate the server's certificate, pass the following when creating a `MongoClient`:

- A [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/) that includes `tls=true` setting,

- A connections options with the certificate for the Certificate Authority (`tlsCAFile`)

```js
const MongoClient = require('mongodb').MongoClient;

// Read the certificate authority
const ca = [fs.readFileSync()];

const client = new MongoClient('mongodb://localhost:27017?tls=true', {
  tlsCAFile: `${__dirname}/certs/ca.pem`
});

// Connect validating the returned certificates from the server
client.connect(function(err) {
  client.close();
});
```

## Disable Hostname Verification
By default, the driver ensures that the hostname included in the
server's TLS certificate(s) matches the hostname(s) provided in the URI connection string. If you need to disable the hostname verification, but otherwise validate the server's certificate, pass to the new `MongoClient`:

- A [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/) that includes `tls=true` setting,

- A connections options with the certificate for the Certificate Authority (`tlsCAFile`) but  `tlsAllowInvalidHostnames` set to `true`.

```js
const MongoClient = require('mongodb').MongoClient;
const client = new MongoClient('mongodb://localhost:27017?tls=true', {
  tlsCAFile: `${__dirname}/certs/ca.pem`,
  tlsAllowInvalidHostnames: true
});

// Connect validating the returned certificates from the server
client.connect(function(err) {
  client.close();
});
```

## Validate Server Certificate and Present Valid Certificate
If the MongoDB server performs certificate validation, the client must pass its
certificate to the server. To pass the client's certificate as well as to validate the server's certificate, pass to the new `MongoClient`:

- A [URI Connection String ](https://docs.mongodb.org/manual/reference/connection-string/) that includes `tls=true` setting,

- A connections options with the certificate for the Certificate Authority (`tlsCAFile`), the client's certificate (`tlsCertificateKeyFile`).  If the client's key file is encrypted, include the password (`tlsCertificateKeyFilePassword`).

```js
const MongoClient = require('mongodb').MongoClient;
const client = new MongoClient('mongodb://localhost:27017?tls=true', {
  tlsCAFile: `${__dirname}/certs/ca.pem`,
  tlsCertificateKeyFile: `${__dirname}/certs/client.pem`,
  tlsCertificateKeyFilePassword: '10gen'
});

// Connect validating the returned certificates from the server
client.connect(function(err) {
  client.close();
});
```

## Connect with X.509
[X.509](http://docs.mongodb.org/manual/core/authentication/#x-509-certificate-authentication) authentication requires the use of TLS/SSL connections with certificate validation. MongoDB uses the X.509 certificate presented during TLS negotiation to authenticate a user whose name is derived from the distinguished name of the X.509 certificate.

To connect using the X.509 authentication mechanism, specify `MONGODB-X509` as the mechanism in the [URI connection string](https://docs.mongodb.org/manual/reference/connection-string/), `tls=true`, and the username. Use `enodeURIComponent` to encode the username string.

In addition to the connection string, pass to the new `MongoClient`
a connections options with  the X.509 certificate and other [TLS/SSL connections]({{< relref "reference/connecting/connection-settings.md" >}}) options.

```js
const MongoClient = require('mongodb').MongoClient;
const userName = "CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US";
const client = new MongoClient(`mongodb://${encodeURIComponent(userName)}@server:27017?authMechanism=MONGODB-X509&tls=true`, {
  tlsCertificateKeyFile: `${__dirname}/certs/x509/client.pem`
});

// Connect using the MONGODB-X509 authentication mechanism
client.connect(function(err) {
  client.close();
});
```

## TLS/SSL Options

The following TLS/SSL options are available.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `tls` | {Boolean, default: false} | Use TLS connections |
| `tlsInsecure` | {Boolean, default: false} | Relax TLS constraints as much as possible (e.g. allowing invalid certificates or hostname mismatches); drivers must document the exact constraints which are relaxed by this option being true |
| `tlsCAFile` | {string, default: null} | Path to file with either a single or bundle of certificate authorities to be considered trusted when making a TLS connection |
| `tlsCertificateKeyFile` | {string, default: null} | Path to the client certificate file or the client private key file; in the case that they both are needed, the files should be concatenated |
| `tlsCertificateKeyFilePassword` | {string, default: null} | Password to decrypt the client private key to be used for TLS connections |
| `tlsAllowInvalidCertificates` | {Boolean, default: false} | Specifies whether or not the driver should error when the server’s TLS certificate is invalid |
| `tlsAllowInvalidHostnames` | {Boolean, default: false} | Specifies whether or not the driver should error when there is a mismatch between the server’s hostname and the hostname specified by the TLS certificate |
To connect to a single MongoDB instance, specify the TLS/SSL connection options.

```js
const MongoClient = require('mongodb').MongoClient;
const client = new MongoClient('mongodb://server:27017?tls=true', {
  tlsCAFile: `${__dirname}/certs/ca.pem`,
  tlsCertificateKeyFile: `${__dirname}/certs/client.pem`
});

client.connect(function(err) {
  client.close();
});
```

To connect to a replica set, specify the TLS/SSL connection options.

```js
const MongoClient = require('mongodb').MongoClient;
const client = new MongoClient('mongodb://server:27017?replicaSet=foo&tls=true', {
  tlsCAFile: `${__dirname}/certs/ca.pem`,
  tlsCertificateKeyFile: `${__dirname}/certs/client.pem`
});

client.connect(function(err) {
  client.close();
});
```

To connect to a mongos we pass in the options at the top level, just as for replicasets and single server connections.

```js
const MongoClient = require('mongodb').MongoClient;
const client = new MongoClient('mongodb://server:27017?tls=true', {
  tlsCAFile: `${__dirname}/certs/ca.pem`,
  tlsCertificateKeyFile: `${__dirname}/certs/client.pem`
});

client.connect(function(err) {
  client.close();
});
```
