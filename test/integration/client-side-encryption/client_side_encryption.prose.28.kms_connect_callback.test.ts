import { expect } from 'chai';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as process from 'process';
import * as tls from 'tls';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import {
  type AutoEncryptionOptions,
  Binary,
  ClientEncryption,
  type KMSConnectCallback,
  type MongoClient
} from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';

// Prose test 28, "KMS Connect Callback": verifies that `kmsConnectCallback` is invoked when a driver
// makes KMS requests and that the socket it returns is used for the KMS connection. All cases require
// real AWS KMS credentials; skip any case if they are not available.

const metadata: MongoDBMetadataUI = {
  requires: { clientSideEncryption: true }
};

const keyVaultNamespace = 'keyvault.datakeys';
const masterKey = {
  region: 'us-east-1',
  key: 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0'
};
// Setup: `kms_http_proxy.py` is started in plain HTTP mode on port 9004 and in HTTPS mode on port 9005.
const HTTP_PROXY_PORT = 9004;
const HTTPS_PROXY_PORT = 9005;

// True only when real AWS credentials for the KMS calls in this suite are configured.
function hasAwsCredentials(): boolean {
  const { aws } = getCSFLEKMSProviders();
  return !!aws?.accessKeyId && !!aws?.secretAccessKey;
}

// A `kmsConnectCallback` for a plain HTTP proxy on port 9004 works as follows (an HTTPS proxy on port
// 9005 works the same way, except step 2 opens a TLS connection using x509gen/ca.pem to verify the
// proxy's certificate):
//
//   1. Accept `(<host>, <port>)` from the driver.
//   2. Open a plain TCP connection to `127.0.0.1:9004`.
//   3. Send `CONNECT <host>:<port> HTTP/1.1\r\nHost: <host>:<port>\r\n\r\n`.
//   4. Read the response and verify it begins with `HTTP/1.1 200`.
//   5. Return a socket-like object.
function makeConnectCallback(useTls: boolean): KMSConnectCallback {
  // 1. Accept `(<host>, <port>)` from the driver.
  return ({ host, port, signal }) =>
    new Promise((resolve, reject) => {
      const proxyPort = useTls ? HTTPS_PROXY_PORT : HTTP_PROXY_PORT;
      const onReady = (sock: net.Socket | tls.TLSSocket) => {
        // 3. Send `CONNECT <host>:<port> HTTP/1.1\r\nHost: <host>:<port>\r\n\r\n`.
        sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
        sock.once('data', data => {
          // 4. Read the response and verify it begins with `HTTP/1.1 200`.
          const response = data.toString('utf8');
          if (!response.startsWith('HTTP/1.1 200')) {
            sock.destroy();
            reject(new Error(`Proxy CONNECT failed: ${response.split('\r\n')[0]}`));
            return;
          }
          // 5. Return a socket-like object.
          resolve(sock);
        });
      };

      // 2. Open a plain TCP connection to the proxy (or, for the HTTPS proxy on port 9005, a TLS
      // connection verified with x509gen/ca.pem).
      const sock: net.Socket = useTls
        ? tls.connect(
            {
              host: '127.0.0.1',
              port: proxyPort,
              ca: fs.readFileSync(process.env.CSFLE_TLS_CA_FILE as string)
            },
            () => onReady(sock)
          )
        : net.connect({ host: '127.0.0.1', port: proxyPort }, () => onReady(sock));

      sock.once('error', reject);

      // Stop connecting and reject if the driver aborts (e.g. when the KMS timeout elapses).
      signal.addEventListener('abort', () => {
        sock.destroy();
        reject(signal.reason ?? new Error('KMS connection aborted'));
      });
    });
}

// Issues a single request against the proxy's control endpoints (`/reset`, `/metrics`), using
// Node's `http`/`https` modules directly since `fetch` cannot take a custom CA without an undici
// `Agent`.
function requestProxyControl(
  method: 'GET' | 'POST',
  path: string,
  useTls: boolean
): Promise<{ connect_count: number }> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      host: '127.0.0.1',
      port: useTls ? HTTPS_PROXY_PORT : HTTP_PROXY_PORT,
      method,
      path,
      ca: useTls ? fs.readFileSync(process.env.CSFLE_TLS_CA_FILE as string) : undefined
    };
    const request = useTls ? https.request(options, onResponse) : http.request(options, onResponse);
    function onResponse(res: http.IncomingMessage) {
      const chunks: Uint8Array[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        // The proxy exposes plaintext metrics, e.g. `connect_count 1\n`.
        const body = Buffer.concat(chunks).toString('utf8');
        const match = body.match(/connect_count (\d+)/);
        resolve({ connect_count: match ? Number(match[1]) : 0 });
      });
    }
    request.once('error', reject);
    request.end();
  });
}

// Reset the proxy metrics: `POST /reset` (over HTTPS with `ca.pem` when `useTls`).
async function resetMetrics(useTls: boolean): Promise<void> {
  await requestProxyControl('POST', '/reset', useTls);
}

// Fetch the proxy metrics: `GET /metrics` (over HTTPS with `ca.pem` when `useTls`).
async function getMetrics(useTls: boolean): Promise<{ connect_count: number }> {
  return requestProxyControl('GET', '/metrics', useTls);
}

describe('28. KMS Connect Callback', function () {
  let client: MongoClient;

  beforeEach(function () {
    // All cases require real AWS KMS credentials; skip any case if they are not available.
    if (!hasAwsCredentials()) {
      if (this.currentTest) {
        this.currentTest.skipReason = 'Requires AWS KMS credentials (FLE_AWS_KEY / FLE_AWS_SECRET)';
      }
      this.skip();
    }
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client?.close();
  });

  it('Case 1: plain HTTP proxy', metadata, async function () {
    // Create a `ClientEncryption` object with `keyVaultNamespace` set to `keyvault.datakeys` and a
    // default `MongoClient` as the `keyVaultClient`, `kmsProviders` `{ "aws": { <AWS credentials> } }`,
    // and `kmsConnectCallback` the plain HTTP proxy callback described in Setup.
    const clientEncryption = new ClientEncryption(client, {
      keyVaultNamespace,
      keyVaultClient: client,
      kmsProviders: { aws: getCSFLEKMSProviders().aws },
      kmsConnectCallback: makeConnectCallback(false)
    });

    // Reset the proxy metrics: `POST http://127.0.0.1:9004/reset`.
    await resetMetrics(false);

    // Call `client_encryption.createDataKey()` with `"aws"` as the provider and the `masterKey`.
    // Expect this to succeed.
    await clientEncryption.createDataKey('aws', { masterKey });

    // Fetch `GET http://127.0.0.1:9004/metrics`. Assert `connect_count` is `1`.
    const metrics = await getMetrics(false);
    expect(metrics.connect_count).to.equal(1);
  });

  it('Case 2: HTTPS proxy', metadata, async function () {
    // Create a `ClientEncryption` object as in Case 1, but with `kmsConnectCallback` the HTTPS proxy
    // callback described in Setup.
    const clientEncryption = new ClientEncryption(client, {
      keyVaultNamespace,
      keyVaultClient: client,
      kmsProviders: { aws: getCSFLEKMSProviders().aws },
      kmsConnectCallback: makeConnectCallback(true)
    });

    // Reset the proxy metrics: `POST https://127.0.0.1:9005/reset` (use `ca.pem` to verify the
    // proxy's TLS certificate).
    await resetMetrics(true);

    // Call `client_encryption.createDataKey()` with the same provider and `masterKey` as Case 1.
    // Expect this to succeed.
    await clientEncryption.createDataKey('aws', { masterKey });

    // Fetch `GET https://127.0.0.1:9005/metrics` (using `ca.pem`). Assert `connect_count` is `1`.
    const metrics = await getMetrics(true);
    expect(metrics.connect_count).to.equal(1);
  });

  it('Case 3: full auto encryption pipeline via proxy', metadata, async function () {
    // This case exercises the complete auto encryption and decryption pipeline with
    // `kmsConnectCallback` routing KMS traffic through a proxy.
    type Coll3Doc = { _id: number; encrypted_string: string };

    // 1. Create a `MongoClient` without encryption enabled (referred to as `client`). This reuses the
    //    suite's `client` from `beforeEach`.
    // 2. Using `client`, drop the collections `keyvault.datakeys` and `db.coll`.
    await client
      .db('keyvault')
      .dropCollection('datakeys')
      .catch(() => null);
    await client
      .db('db')
      .dropCollection('coll')
      .catch(() => null);

    // 3. Create a `ClientEncryption` object (referred to as `client_encryption`) with
    //    `keyVaultNamespace` `keyvault.datakeys`, `keyVaultClient` set to `client`, `kmsProviders`
    //    `{ "aws": { <AWS credentials> } }`, and `kmsConnectCallback` the plain HTTP proxy callback.
    const clientEncryption = new ClientEncryption(client, {
      keyVaultNamespace,
      keyVaultClient: client,
      kmsProviders: { aws: getCSFLEKMSProviders().aws },
      kmsConnectCallback: makeConnectCallback(false)
    });

    // 4. Call `client_encryption.createDataKey()` with `"aws"` and the `masterKey`. Expect this to
    //    succeed. Store the returned UUID as `dataKeyId`.
    const dataKeyId = await clientEncryption.createDataKey('aws', { masterKey });

    // 5. Build a JSON schema for `db.coll` using `dataKeyId`.
    const schemaMap = {
      'db.coll': {
        bsonType: 'object',
        properties: {
          encrypted_string: {
            encrypt: {
              keyId: [dataKeyId],
              bsonType: 'string',
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
            }
          }
        }
      }
    };

    // 6. Reset the proxy metrics: `POST http://127.0.0.1:9004/reset`.
    await resetMetrics(false);

    // 7. Create a `MongoClient` configured with auto encryption (referred to as `client_encrypted`)
    //    with `keyVaultNamespace` `keyvault.datakeys`, `kmsProviders` `{ "aws": { <AWS credentials> } }`,
    //    `schemaMap` `{ "db.coll": <schema from step 5> }`, and `kmsConnectCallback` the plain HTTP
    //    proxy callback.
    const autoEncryptionOptions: AutoEncryptionOptions = {
      keyVaultNamespace,
      kmsProviders: { aws: getCSFLEKMSProviders().aws },
      schemaMap,
      kmsConnectCallback: makeConnectCallback(false),
      extraOptions: getEncryptExtraOptions()
    };
    const encryptedClient = this.configuration.newClient(
      {},
      { autoEncryption: autoEncryptionOptions }
    );
    try {
      // 8. Use `client_encrypted` to insert `{ "_id": 1, "encrypted_string": "hello" }` into
      //    `db.coll`. Expect this to succeed.
      await encryptedClient
        .db('db')
        .collection<Coll3Doc>('coll')
        .insertOne({ _id: 1, encrypted_string: 'hello' });

      // 9. Use `client_encrypted` to run a `findOne` on `db.coll` with filter `{ "_id": 1 }`. Expect
      //    the returned document to contain `{ "encrypted_string": "hello" }`.
      const decrypted = await encryptedClient
        .db('db')
        .collection<Coll3Doc>('coll')
        .findOne({ _id: 1 });
      expect(decrypted).to.have.property('encrypted_string', 'hello');

      // 10. Use `client` (unencrypted) to run a `findOne` on `db.coll` with filter `{ "_id": 1 }`.
      //     Expect `encrypted_string` to be a Binary value (i.e. still encrypted).
      const raw = await client
        .db('db')
        .collection<{ _id: number; encrypted_string: unknown }>('coll')
        .findOne({ _id: 1 });
      expect(raw?.encrypted_string).to.be.instanceOf(Binary);

      // 11. Fetch `GET http://127.0.0.1:9004/metrics`. Assert `connect_count` is `1`, confirming that
      //     KMS requests were routed through the proxy. Expect only one KMS request since the
      //     resulting decrypted key is cached.
      const metrics = await getMetrics(false);
      expect(metrics.connect_count).to.equal(1);
    } finally {
      await encryptedClient.close();
    }
  });

  it('Case 4: error', metadata, async function () {
    // Create a `ClientEncryption` object as in Case 1, but with `kmsConnectCallback` a proxy callback
    // that returns an error with a placeholder message "Test Error".
    const clientEncryption = new ClientEncryption(client, {
      keyVaultNamespace,
      keyVaultClient: client,
      kmsProviders: { aws: getCSFLEKMSProviders().aws },
      kmsConnectCallback: async () => {
        throw new Error('Test Error');
      }
    });

    // Call `client_encryption.createDataKey()` with the same provider and `masterKey` as Case 1.
    // Expect this to fail and the error with message "Test Error" to propagate.
    const err = await clientEncryption.createDataKey('aws', { masterKey }).catch(e => e);
    expect(err).to.exist;
    const chain = [err?.message, err?.cause?.message, err?.cause?.cause?.message];
    expect(chain).to.include('Test Error');
  });

  it('Case 5: callback receives timeout', metadata, async function () {
    // This case MUST only be run by drivers that have implemented CSOT.
    let receivedTimeout: number | undefined;

    // Create a `ClientEncryption` object with `keyVaultNamespace` `keyvault.datakeys` and a
    // `MongoClient` configured with `timeoutMS: 1000` as the `keyVaultClient`, `kmsProviders`
    // `{ "aws": { <AWS credentials> } }`, and a `kmsConnectCallback` that records the timeout value it
    // receives and then proceeds normally (performs the HTTP CONNECT through the plain HTTP proxy on
    // port 9004 as described in Setup).
    const timedClient = this.configuration.newClient({}, { timeoutMS: 1000 });
    try {
      const clientEncryption = new ClientEncryption(timedClient, {
        keyVaultNamespace,
        keyVaultClient: timedClient,
        kmsProviders: { aws: getCSFLEKMSProviders().aws },
        kmsConnectCallback: opts => {
          receivedTimeout = opts.timeoutMS;
          return makeConnectCallback(false)(opts);
        }
      });

      // Call `client_encryption.createDataKey()` with the same provider and `masterKey` as Case 1.
      // Expect this to succeed.
      await clientEncryption.createDataKey('aws', { masterKey });

      // Assert that the callback was called with a non-zero timeout.
      expect(receivedTimeout).to.be.a('number');
      expect(receivedTimeout).to.be.greaterThan(0);
    } finally {
      await timedClient.close();
    }
  });
});
