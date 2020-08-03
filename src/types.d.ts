import type { MongoError } from './error';
import type { SerializeOptions as ImportedSerializeOptions } from 'bson';
import type { MongoClient } from '.';

export type AnyError = MongoError | Error;

export type Callback<T = any> = (error?: AnyError, result?: T) => void;
export type Callback2<T0 = any, T1 = any> = (error?: AnyError, result0?: T0, result1?: T1) => void;
export type CallbackWithType<E = AnyError, T0 = any> = (error?: E, result?: T0) => void;

export interface Document {
  [key: string]: any;
}

/** BSON Serialization options. TODO: Remove me when types from BSON are updated */
export interface SerializeOptions extends ImportedSerializeOptions {
  /** Return document results as raw BSON buffers */
  fieldsAsRaw?: { [key: string]: boolean };
  /** Promotes BSON values to native types where possible, set to false to only receive wrapper types */
  promoteValues?: boolean;
  /** Promotes Binary BSON values to native Node Buffers */
  promoteBuffers?: boolean;
  /** Promotes long values to number if they fit inside the 53 bits resolution */
  promoteLongs?: boolean;
  /** Serialize functions on any object */
  serializeFunctions?: boolean;
  /** Specify if the BSON serializer should ignore undefined fields */
  ignoreUndefined?: boolean;
}

/** set of BSON serialize options that are used in the driver */
export interface BSONSerializeOptions {
  /** Promotes BSON values to native types where possible, set to false to only receive wrapper types */
  promoteValues?: SerializeOptions['promoteValues'];
  /** Promotes Binary BSON values to native Node Buffers */
  promoteBuffers?: SerializeOptions['promoteBuffers'];
  /** Promotes long values to number if they fit inside the 53 bits resolution */
  promoteLongs?: SerializeOptions['promoteLongs'];
  /** Serialize functions on any object */
  serializeFunctions?: SerializeOptions['serializeFunctions'];
  /** Specify if the BSON serializer should ignore undefined fields */
  ignoreUndefined?: SerializeOptions['ignoreUndefined'];
}

export const enum AutoEncryptionLoggerLevels {
  FatalError = 0,
  Error = 1,
  Warning = 2,
  Info = 3,
  Trace = 4
}

export interface AutoEncryptionOptions {
  /** A `MongoClient` used to fetch keys from a key vault */
  keyVaultClient?: MongoClient;
  /** The namespace where keys are stored in the key vault */
  keyVaultNamespace?: string;
  /** Configuration options that are used by specific KMS providers during key generation, encryption, and decryption. */
  kmsProviders?: {
    /** Configuration options for using 'aws' as your KMS provider */
    aws?: {
      /** The access key used for the AWS KMS provider */
      accessKeyId?: string;
      /** The secret access key used for the AWS KMS provider */
      secretAccessKey?: string;
    };
    /** Configuration options for using 'local' as your KMS provider */
    local?: {
      /** The master key used to encrypt/decrypt data keys. A 96-byte long Buffer. */
      key?: Buffer;
    };
  };
  /**
   * A map of namespaces to a local JSON schema for encryption
   *
   * **NOTE**: Supplying options.schemaMap provides more security than relying on JSON Schemas obtained from the server.
   * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending decrypted data that should be encrypted.
   * Schemas supplied in the schemaMap only apply to configuring automatic encryption for client side encryption.
   * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
   */
  schemaMap?: Document;
  /** Allows the user to bypass auto encryption, maintaining implicit decryption */
  bypassAutoEncryption?: boolean;
  options?: {
    /** An optional hook to catch logging messages from the underlying encryption engine */
    logger?: (level: AutoEncryptionLoggerLevels, message: string) => void;
  };
  extraOptions?: {
    /**
     * A local process the driver communicates with to determine how to encrypt values in a command.
     * Defaults to "mongodb://%2Fvar%2Fmongocryptd.sock" if domain sockets are available or "mongodb://localhost:27020" otherwise
     */
    mongocryptdURI?: string;
    /** If true, autoEncryption will not attempt to spawn a mongocryptd before connecting  */
    mongocryptdBypassSpawn?: boolean;
    /** The path to the mongocryptd executable on the system */
    mongocryptdSpawnPath?: string;
    /** Command line arguments to use when auto-spawning a mongocryptd */
    mongocryptdSpawnArgs?: string[];
  };
}

export interface AutoEncrypter {
  encrypt(ns: string, cmd: Document, options: any, callback: Callback<Document>): void;
  decrypt(cmd: Document, options: any, callback: Callback<Document>): void;
}

export enum ReadPreferenceMode {
  primary = 'primary',
  primaryPreferred = 'primaryPreferred',
  secondary = 'secondary',
  secondaryPreferred = 'secondaryPreferred',
  nearest = 'nearest'
}
export type ReadPreferenceModes = keyof typeof ReadPreferenceMode;

export enum Compressor {
  snappy = 'snappy',
  zlib = 'zlib'
}
export type Compressors = keyof typeof Compressor;

export enum ReadConcernLevel {
  local = 'local',
  majority = 'majority',
  linearizable = 'linearizable',
  available = 'available'
}
export type ReadConcernLevels = keyof typeof Compressor;

export enum AuthMechanism {
  'GSSAPI' = 'GSSAPI',
  'MONGODB-AWS' = 'MONGODB-AWS',
  'MONGODB-X509' = 'MONGODB-X509',
  'MONGODB-CR' = 'MONGODB-CR',
  'DEFAULT' = 'DEFAULT',
  'SCRAM-SHA-1' = 'SCRAM-SHA-1',
  'SCRAM-SHA-256' = 'SCRAM-SHA-256',
  'PLAIN' = 'PLAIN'
}
export type AuthMechanisms = keyof typeof AuthMechanism;

export interface ReadConcern {
  level?: ReadConcernLevels;
}

export enum LogLevel {
  'error' = 'error',
  'warn' = 'warn',
  'info' = 'info',
  'debug' = 'debug'
}
export type LogLevels = keyof typeof LogLevel;

export interface AuthMechanismProperties {
  SERVICE_NAME?: string;
  CANONICALIZE_HOST_NAME?: boolean;
  SERVICE_REALM?: string;
}

export interface DriverInfo {
  name?: string;
  version?: string;
  platform?: string;
}

export interface Auth {
  /** The username for auth */
  user?: string;
  /** The password for auth */
  pass?: string;
}

export interface KMSProviders {
  /** Configuration options for using 'aws' as your KMS provider */
  aws?: {
    /** The access key used for the AWS KMS provider */
    accessKeyId?: string;
    /** The secret access key used for the AWS KMS provider */
    secretAccessKey?: string;
  };
  /** Configuration options for using 'local' as your KMS provider */
  local?: {
    /** The master key used to encrypt/decrypt data keys. A 96-byte long Buffer. */
    key?: Buffer;
  };
}

export abstract class PkFactoryAbstract {
  abstract createPk(): any;
}

export interface PkFactoryLiteral {
  createPk(): any;
}

export type PkFactory = typeof PkFactoryAbstract | PkFactoryLiteral;

export interface ReadPreference {
  hedge?: {
    enable: boolean;
  };
  tags?: string[];
  maxStalenessSeconds?: number | undefined;
  mode?: ReadPreferenceModes;
}

/**
 * Describes all possible URI query options for the mongo client
 * https://docs.mongodb.com/manual/reference/connection-string
 */
export interface MongoURIOptions {
  /** Specifies the name of the replica set, if the mongod is a member of a replica set. */
  replicaSet?: string;
  /** Enables or disables TLS/SSL for the connection. */
  tls?: boolean;
  /** A boolean to enable or disables TLS/SSL for the connection. (The ssl option is equivalent to the tls option.) */
  ssl?: MongoURIOptions['tls'];
  /** Specifies the location of a local .pem file that contains either the client’s TLS/SSL certificate or the client’s TLS/SSL certificate and key. */
  tlsCertificateKeyFile?: string;
  /** Specifies the password to de-crypt the tlsCertificateKeyFile. */
  tlsCertificateKeyFilePassword?: string;
  /** Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance. */
  tlsCAFile?: string;
  /** Bypasses validation of the certificates presented by the mongod/mongos instance */
  tlsAllowInvalidCertificates?: boolean;
  /** Disables hostname validation of the certificate presented by the mongod/mongos instance. */
  tlsAllowInvalidHostnames?: boolean;
  /** Disables various certificate validations. */
  tlsInsecure?: boolean;
  /** The time in milliseconds to attempt a connection before timing out. */
  connectTimeoutMS?: number;
  /** The time in milliseconds to attempt a send or receive on a socket before the attempt times out. */
  socketTimeoutMS?: number;
  /** Comma-delimited string of compressors to enable network compression for communication between this client and a mongod/mongos instance. */
  compressors?: Compressors[];
  /** An integer that specifies the compression level if using zlib for network compression. */
  zlibCompressionLevel?: number;
  /** The maximum number of connections in the connection pool. */
  maxPoolSize?: number;
  /** The minimum number of connections in the connection pool. */
  minPoolSize?: number;
  /** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
  maxIdleTimeMS?: number;
  /** A number that the driver multiples the maxPoolSize value to, to provide the maximum number of threads allowed to wait for a connection to become available from the pool. */
  waitQueueMultiple?: number;
  /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
  waitQueueTimeoutMS?: number;
  /** Corresponds to the write concern w Option. The w option requests acknowledgement that the write operation has propagated to a specified number of mongod instances or to mongod instances with specified tags. */
  w?: number | 'majority';
  /** Corresponds to the write concern wtimeout. wtimeoutMS specifies a time limit, in milliseconds, for the write concern. */
  wtimeoutMS?: number;
  /** Corresponds to the write concern j Option option. The journal option requests acknowledgement from MongoDB that the write operation has been written to the journal. */
  journal?: boolean;
  /** The level of isolation */
  readConcernLevel?: ReadConcernLevels;
  /** Specifies the read preferences for this connection */
  readPreference?: ReadPreferenceModes;
  /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
  maxStalenessSeconds?: number;
  /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
  readPreferenceTags?: string | string[] | { [key: string]: string };
  /** Specify the database name associated with the user’s credentials. */
  authSource?: string;
  /** Specify the authentication mechanism that MongoDB will use to authenticate the connection. */
  authMechanism?: AuthMechanisms;
  /** Specify properties for the specified authMechanism as a comma-separated list of colon-separated key-value pairs. */
  authMechanismProperties?: AuthMechanismProperties;
  /** Set the Kerberos service name when connecting to Kerberized MongoDB instances. This value must match the service name set on MongoDB instances to which you are connecting. */
  gssapiServiceName?: string;
  /** The size (in milliseconds) of the latency window for selecting among multiple suitable MongoDB instances. */
  localThresholdMS?: number;
  /** Specifies how long (in milliseconds) to block for server selection before throwing an exception.  */
  serverSelectionTimeoutMS?: number;
  /** When true, instructs the driver to scan the MongoDB deployment exactly once after server selection fails and then either select a server or raise an error. When false, the driver blocks and searches for a server up to the serverSelectionTimeoutMS value. */
  serverSelectionTryOnce?: boolean;
  /** heartbeatFrequencyMS controls when the driver checks the state of the MongoDB deployment. Specify the interval (in milliseconds) between checks, counted from the end of the previous check until the beginning of the next one. */
  heartbeatFrequencyMS?: number;
  /** Specify a custom app name. */
  appName?: string;
  /** Enables retryable reads. */
  retryReads?: boolean;
  /** Enable retryable writes. */
  retryWrites?: boolean;
  /** Allow a driver to force a Single topology type with a connection string containing one host */
  directConnection?: boolean;
}

export interface MongoClientOptions extends MongoURIOptions, BSONSerializeOptions {
  /** The maximum number of connections in the connection pool. */
  poolSize?: MongoURIOptions['maxPoolSize'];
  /** Validate mongod server certificate against Certificate Authority */
  sslValidate?: boolean;
  /** SSL Certificate store binary buffer. */
  sslCA?: Buffer;
  /** SSL Certificate binary buffer. */
  sslCert?: Buffer;
  /** SSL Key file binary buffer. */
  sslKey?: Buffer;
  /** SSL Certificate pass phrase. */
  sslPass?: string;
  /** SSL Certificate revocation list binary buffer. */
  sslCRL?: Buffer;
  /** Ensure we check server identify during SSL, set to false to disable checking. */
  checkServerIdentity?: boolean | Function;
  /** Enable autoReconnect for single server instances */
  autoReconnect?: boolean;
  /** Enable autoReconnect for single server instances */
  auto_reconnect?: MongoClientOptions['autoReconnect'];
  /** TCP Connection no delay */
  noDelay?: boolean;
  /** TCP Connection keep alive enabled */
  keepAlive?: boolean;
  /** The number of milliseconds to wait before initiating keepAlive on the TCP socket */
  keepAliveInitialDelay?: number;
  /** Version of IP stack. Can be 4, 6 or null (default). If null, will attempt to connect with IPv6, and will fall back to IPv4 on failure */
  family?: 4 | 6 | null;
  /** Server attempt to reconnect #times */
  reconnectTries?: number;
  /** Server will wait number of milliseconds between retries */
  reconnectInterval?: number;
  /** Control if high availability monitoring runs for Replicaset or Mongos proxies */
  ha?: boolean;
  /** The High availability period for replicaset inquiry */
  haInterval?: number;
  /** Cutoff latency point in MS for Replicaset member selection */
  secondaryAcceptableLatencyMS?: number;
  /** Cutoff latency point in MS for Mongos proxies selection */
  acceptableLatencyMS?: number;
  /** Sets if the driver should connect even if no primary is available */
  connectWithNoPrimary?: boolean;
  /** The write concern timeout */
  wtimeout?: MongoURIOptions['wtimeoutMS'];
  /** Corresponds to the write concern j Option option. The journal option requests acknowledgement from MongoDB that the write operation has been written to the journal. */
  j?: MongoURIOptions['journal'];
  /** Force server to assign `_id` values instead of driver */
  forceServerObjectId?: boolean;
  /** Return document results as raw BSON buffers */
  raw?: boolean;
  /** Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited */
  bufferMaxEntries?: number;
  /** A primary key factory object for generation of custom `_id` keys */
  pkFactory?: PkFactory;
  /** A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible */
  promiseLibrary?: any;
  /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The logging level */
  loggerLevel?: LogLevels;
  /** Custom logger object */
  logger?: object;
  /** Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit */
  domainsEnabled?: boolean;
  /** Validate MongoClient passed in options for correctness */
  validateOptions?: boolean;
  /** The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections */
  appname?: MongoURIOptions['appName'];
  /** The auth settings for when connection to server. */
  auth?: Auth;
  /** Type of compression to use?: snappy or zlib */
  compression?: Compressors;
  /** Specify a file sync write concern */
  fsync?: boolean;
  /** The number of retries for a tailable cursor */
  numberOfRetries?: number;
  /** Enable command monitoring for this client */
  monitorCommands?: boolean;
  /** If present, the connection pool will be initialized with minSize connections, and will never dip below minSize connections */
  minSize?: number;
  /** Determines whether or not to use the new url parser. Enables the new, spec-compliant, url parser shipped in the core driver. This url parser fixes a number of problems with the original parser, and aims to outright replace that parser in the near future. Defaults to true, and must be explicitly set to false to use the legacy url parser. */
  useNewUrlParser?: boolean;
  /** Enables the new unified topology layer */
  useUnifiedTopology?: boolean;
  /** Optionally enable client side auto encryption */
  autoEncryption?: AutoEncryptionOptions;
  /** Allows a wrapping driver to amend the client metadata generated by the driver to include information about the wrapping driver */
  driverInfo?: DriverInfo;
  /** String containing the server name requested via TLS SNI. */
  servername?: string;
  read_preference?: MongoClientOptions['readPreference'];
  read_preference_tags?: MongoClientOptions['readPreferenceTags'];
}
