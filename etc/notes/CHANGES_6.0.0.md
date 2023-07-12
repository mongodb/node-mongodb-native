# Changes in the MongoDB Node.js Driver v6

## About

The following is a detailed collection of the changes in the major v6 release of the `mongodb` package for Node.js.

## Contents

- [Changes](#changes)
  - [Deprecated SSL options removed](#deprecated-ssl-options-removed)

## Changes

### Deprecated SSL options removed

The following deprecated SSL/TLS options have now been removed (-> indicating the corresponding option):

  - `sslCA` -> `tlsCAFile`
  - `sslCRL`
  - `sslCert` -> `tlsCertificateKeyFile`
  - `sslKey` -> `tlsCertificateKeyFile`
  - `sslPass` -> `tlsCertificateKeyFilePassword`
  - `sslValidate` -> `tlsAllowInvalidCertificates`
  - `tlsCertificateFile` -> `tlsCertificateKeyFile`