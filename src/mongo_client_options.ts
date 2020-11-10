import type { MongoCredentials } from './cmap/auth/mongo_credentials';
import type { CompressorName } from './cmap/wire_protocol/compression';
import type { AutoEncryptionOptions } from './deps';
import type { Logger } from './logger';
import type { DriverInfo, MongoClientOptions, PkFactory } from './mongo_client';
import type { ReadConcern } from './read_concern';
import type { ReadPreference } from './read_preference';
import type { WriteConcern } from './write_concern';

import type { ConnectionOptions as TLSConnectionOptions } from 'tls';
import type { TcpSocketConnectOpts as ConnectionOptions } from 'net';
import type { BSONSerializeOptions } from './bson';
import { MongoParseError } from './error';
import { URL } from 'url';

/**
 * Mongo Client Options
 * @internal
 */
export interface MongoOptions
  extends Required<BSONSerializeOptions>,
    Omit<ConnectionOptions, 'port'>,
    Omit<TLSConnectionOptions, 'port'> {
  hosts: { host: string; port: number }[];
  srv: boolean;

  autoEncryption: AutoEncryptionOptions;
  credentials: MongoCredentials;
  compression: CompressorName;
  compressors: CompressorName[];
  connectTimeoutMS: number;
  dbName: string;
  directConnection: boolean;
  domainsEnabled: boolean;
  driverInfo: DriverInfo;
  forceServerObjectId: boolean;
  gssapiServiceName: string;
  ha: boolean;
  haInterval: number;
  heartbeatFrequencyMS: number;
  keepAlive: boolean;
  keepAliveInitialDelay: number;
  localThresholdMS: number;
  logger: Logger;
  maxIdleTimeMS: number;

  // poolSize: number;
  maxPoolSize: number;

  maxStalenessSeconds: number;

  // minSize: number;
  minPoolSize: number;

  monitorCommands: boolean;
  noDelay: boolean;
  numberOfRetries: number;
  pkFactory: PkFactory;
  promiseLibrary: PromiseConstructorLike;
  raw: boolean;
  readConcern: ReadConcern;
  readPreference: ReadPreference;
  reconnectInterval: number;
  reconnectTries: number;
  replicaSet: string;
  retryReads: boolean;
  retryWrites: boolean;
  serverSelectionTimeoutMS: number;
  serverSelectionTryOnce: boolean;
  socketTimeoutMS: number;

  /**
   * If set TLS enabled, equivalent to setting the ssl option.
   *
   * ### Additional options:
   *
   * |    nodejs option     | MongoDB equivalent                                 | type                                   |
   * |:---------------------|----------------------------------------------------|:---------------------------------------|
   * | `ca`                 | sslCA, tlsCAFile                                   | `string \| Buffer \| Buffer[]`         |
   * | `crl`                | sslCRL                                             | `string \| Buffer \| Buffer[]`         |
   * | `cert`               | sslCert, tlsCertificateFile, tlsCertificateKeyFile | `string \| Buffer \| Buffer[]`         |
   * | `key`                | sslKey, tlsCertificateKeyFile                      | `string \| Buffer \| KeyObject[]`      |
   * | `passphrase`         | sslPass, tlsCertificateKeyFilePassword             | `string`                               |
   * | `rejectUnauthorized` | sslValidate                                        | `boolean`                              |
   *
   */
  tls: boolean;
  tlsAllowInvalidCertificates: boolean;
  tlsAllowInvalidHostnames: boolean;
  tlsInsecure: boolean;

  waitQueueMultiple: number;
  waitQueueTimeoutMS: number;
  writeConcern: WriteConcern;
  zlibCompressionLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
  /**
   * Turn these options into a reusable options dictionary
   */
  toJSON(): Record<string, any>;
  /**
   * Turn these options into a reusable connection URI
   */
  toURI(): string;
}

const HOSTS_RX = new RegExp(
  '(?<protocol>mongodb(?:\\+srv|)):\\/\\/(?:(?<username>[^:]*)(?::(?<password>[^@]*))?@)?(?<hosts>[^\\/?]*)(?<rest>.*)'
);

export function parseURI(uri: string): { srv: boolean; url: URL; hosts: string[] } {
  const match = uri.match(HOSTS_RX);
  if (!match) {
    throw new MongoParseError(`Invalid connection string ${uri}`);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-expect-error
  const { protocol, username, password, hosts, rest } = match.groups;
  if (!protocol || !hosts) {
    throw new MongoParseError('Invalid connection string, protocol and host(s) required');
  }
  const authString = `${username ? `${password ? `${username}:${password}` : username}` : ''}`;
  return {
    srv: protocol.includes('srv'),
    url: new URL(`${protocol.toLowerCase()}://${authString}@dummyHostname${rest}`),
    hosts: hosts.split(',')
  };
}

export function parseOptions(
  uri: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options: MongoClientOptions = {}
): Readonly<MongoOptions> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { srv, url, hosts } = parseURI(uri);
    const mongoOptions: MongoOptions = ({ srv, hosts } as unknown) as MongoOptions;
    // TODO(NODE-2699): option parse logic
    return Object.freeze(mongoOptions);
  } catch {
    return Object.freeze({} as MongoOptions);
  }
}
