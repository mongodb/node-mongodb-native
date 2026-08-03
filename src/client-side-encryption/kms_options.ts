import { type Duplex } from 'stream';

import { type MongoClientOptions } from '../mongo_client';

/**
 * @public
 *
 * TLS options to use when connecting. The spec specifically calls out which insecure
 * tls options are not allowed:
 *
 *  - tlsAllowInvalidCertificates
 *  - tlsAllowInvalidHostnames
 *  - tlsInsecure
 *
 * These options are not included in the type, and are ignored if provided.
 */
export type ClientEncryptionTlsOptions = Pick<
  MongoClientOptions,
  'tlsCAFile' | 'tlsCertificateKeyFile' | 'tlsCertificateKeyFilePassword' | 'secureContext'
>;

/** @public */
export type CSFLEKMSTlsOptions = {
  aws?: ClientEncryptionTlsOptions;
  gcp?: ClientEncryptionTlsOptions;
  kmip?: ClientEncryptionTlsOptions;
  local?: ClientEncryptionTlsOptions;
  azure?: ClientEncryptionTlsOptions;

  [key: string]: ClientEncryptionTlsOptions | undefined;
};

/**
 * @public
 *
 * Socket options to use for KMS requests.
 */
export type ClientEncryptionSocketOptions = Pick<
  MongoClientOptions,
  'autoSelectFamily' | 'autoSelectFamilyAttemptTimeout'
>;

/**
 * @public
 *
 * A callback that establishes the connection to a KMS host.
 *
 * When provided on `AutoEncryptionOptions` or `ClientEncryptionOptions`, the driver invokes this
 * callback instead of connecting to the KMS host itself, passing the target `host` and `port`. The
 * callback MUST return a `Duplex` stream connected to the KMS host, either directly or tunneled
 * through a proxy; a `net.Socket` satisfies this, as does any other `Duplex`. The returned stream is
 * passed to Node.js' `tls.connect()` as its `socket`, and the driver performs the KMS host's TLS
 * handshake over it using the KMS provider's configured TLS options. The callback therefore MUST NOT
 * perform the KMS host's TLS handshake itself, though it MAY use TLS for its own transport, e.g. when
 * connecting to an HTTPS proxy. This enables routing KMS requests through an HTTP proxy via the HTTP
 * CONNECT method.
 *
 * When the operation has a client-side operation timeout (CSOT) configured, `timeoutMS` is the
 * remaining time budget in milliseconds; it is `undefined` otherwise. The `signal` aborts when the
 * connection attempt exceeds that budget; the callback should stop connecting and reject when it fires.
 *
 * @example <caption>Route KMS requests through an HTTP proxy using the HTTP CONNECT method</caption>
 * ```ts
 * import * as net from 'net';
 *
 * const kmsConnectCallback: KMSConnectCallback = ({ host, port, signal }) =>
 *   new Promise((resolve, reject) => {
 *     // Open a plain connection to the proxy, not to the KMS host.
 *     const socket = net.connect({ host: 'proxy.example.com', port: 8080, signal });
 *     socket.once('error', reject);
 *     socket.once('connect', () => {
 *       // Ask the proxy to tunnel to the KMS host, then hand the socket back for the driver's TLS.
 *       socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
 *       socket.once('data', chunk => {
 *         if (chunk.toString('utf8').startsWith('HTTP/1.1 200')) resolve(socket);
 *         else reject(new Error('Proxy refused the CONNECT request'));
 *       });
 *     });
 *   });
 *
 * const clientEncryption = new ClientEncryption(keyVaultClient, {
 *   keyVaultNamespace,
 *   kmsProviders,
 *   kmsConnectCallback
 * });
 * ```
 */
export type KMSConnectCallback = (options: {
  host: string;
  port: number;
  timeoutMS?: number;
  signal: AbortSignal;
}) => Promise<Duplex>;
