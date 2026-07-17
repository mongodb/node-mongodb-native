import type * as net from 'net';
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
 * A callback that establishes the socket used to connect to a KMS host.
 *
 * When provided on `AutoEncryptionOptions` or `ClientEncryptionOptions`, the driver invokes this
 * callback instead of opening the KMS socket itself, passing the target `host` and `port`. The
 * callback MUST return a socket-like object connected to the KMS host, either directly or tunneled
 * through a proxy. The driver then performs the TLS handshake to the KMS host over that socket, using
 * the KMS provider's configured TLS options, so the callback MUST NOT perform the KMS host's TLS
 * handshake itself. The callback MAY use TLS for its own transport, e.g. when connecting to an HTTPS
 * proxy. This enables routing KMS requests through an HTTP proxy via the HTTP CONNECT method.
 *
 * When the operation has a client-side operation timeout (CSOT) configured, `timeoutMS` is the
 * remaining time budget in milliseconds; it is `undefined` otherwise. The `signal` aborts when the
 * connection attempt exceeds that budget; the callback should stop connecting and reject when it fires.
 */
export type KMSConnectCallback = (options: {
  host: string;
  port: number;
  timeoutMS?: number;
  signal: AbortSignal;
}) => Promise<net.Socket | Duplex>;
