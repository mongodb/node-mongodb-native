import { Db, DbOptions } from './db';
import { EventEmitter } from 'events';
import { ChangeStream, ChangeStreamOptions } from './change_stream';
import type { ReadPreference, ReadPreferenceModeId } from './read_preference';
import { MongoError, AnyError } from './error';
import type { W, WriteConcern } from './write_concern';
import {
  maybePromise,
  MongoDBNamespace,
  Callback,
  resolveOptions,
  ClientMetadata,
  ns,
  HostAddress
} from './utils';
import { connect } from './operations/connect';
import { PromiseProvider } from './promise_provider';
import type { Logger, LoggerLevelId } from './logger';
import type { ReadConcern, ReadConcernLevelId, ReadConcernLike } from './read_concern';
import { BSONSerializeOptions, Document, resolveBSONOptions } from './bson';
import type { AutoEncrypter, AutoEncryptionOptions } from './deps';
import type { AuthMechanismId } from './cmap/auth/defaultAuthProviders';
import type { Topology } from './sdam/topology';
import type { ClientSession, ClientSessionOptions } from './sessions';
import type { TagSet } from './sdam/server_description';
import type { MongoCredentials } from './cmap/auth/mongo_credentials';
import { parseOptions } from './connection_string';
import type { CompressorName } from './cmap/wire_protocol/compression';
import type { TLSSocketOptions, ConnectionOptions as TLSConnectionOptions } from 'tls';
import type { TcpNetConnectOpts } from 'net';
import type { SrvPoller } from './sdam/srv_polling';
import type { Connection } from './cmap/connection';
import type { LEGAL_TLS_SOCKET_OPTIONS, LEGAL_TCP_SOCKET_OPTIONS } from './cmap/connect';

/** @public */
export const ServerApiVersion = {
  v1: '1'
};

/** @public */
export type ServerApiVersionId = typeof ServerApiVersion[keyof typeof ServerApiVersion];

/** @public */
export interface ServerApi {
  version: string | ServerApiVersionId;
  strict?: boolean;
  deprecationErrors?: boolean;
}

/** @public */
export interface DriverInfo {
  name?: string;
  version?: string;
  platform?: string;
}

/** @public */
export interface Auth {
  /** The username for auth */
  username?: string;
  /** The password for auth */
  password?: string;
}

/** @public */
export interface PkFactory {
  createPk(): any; // TODO: when js-bson is typed, function should return some BSON type
}

type CleanUpHandlerFunction = (err?: AnyError, result?: any, opts?: any) => Promise<void>;

/** @public */
export type SupportedTLSConnectionOptions = Pick<
  TLSConnectionOptions,
  Extract<keyof TLSConnectionOptions, typeof LEGAL_TLS_SOCKET_OPTIONS[number]>
>;

/** @public */
export type SupportedTLSSocketOptions = Pick<
  TLSSocketOptions,
  Extract<keyof TLSSocketOptions, typeof LEGAL_TLS_SOCKET_OPTIONS[number]>
>;

/** @public */
export type SupportedSocketOptions = Pick<
  TcpNetConnectOpts,
  typeof LEGAL_TCP_SOCKET_OPTIONS[number]
>;

/** @public */
export type SupportedNodeConnectionOptions = SupportedTLSConnectionOptions &
  SupportedTLSSocketOptions &
  SupportedSocketOptions;

/**
 * Describes all possible URI query options for the mongo client
 * @public
 * @see https://docs.mongodb.com/manual/reference/connection-string
 */
export interface MongoClientOptions extends BSONSerializeOptions, SupportedNodeConnectionOptions {
  /** Specifies the name of the replica set, if the mongod is a member of a replica set. */
  replicaSet?: string;
  /** Enables or disables TLS/SSL for the connection. */
  tls?: boolean;
  /** A boolean to enable or disables TLS/SSL for the connection. (The ssl option is equivalent to the tls option.) */
  ssl?: boolean;
  /** Specifies the location of a local TLS Certificate */
  tlsCertificateFile?: string;
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
  compressors?: CompressorName[];
  /** An integer that specifies the compression level if using zlib for network compression. */
  zlibCompressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
  /** The maximum number of connections in the connection pool. */
  maxPoolSize?: number;
  /** The minimum number of connections in the connection pool. */
  minPoolSize?: number;
  /** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
  maxIdleTimeMS?: number;
  /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
  waitQueueTimeoutMS?: number;
  /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** The level of isolation */
  readConcernLevel?: ReadConcernLevelId;
  /** Specifies the read preferences for this connection */
  readPreference?: ReadPreferenceModeId | ReadPreference;
  /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
  maxStalenessSeconds?: number;
  /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
  readPreferenceTags?: TagSet[];
  /** The auth settings for when connection to server. */
  auth?: Auth;
  /** Specify the database name associated with the user’s credentials. */
  authSource?: string;
  /** Specify the authentication mechanism that MongoDB will use to authenticate the connection. */
  authMechanism?: AuthMechanismId;
  /** Specify properties for the specified authMechanism as a comma-separated list of colon-separated key-value pairs. */
  authMechanismProperties?: {
    SERVICE_NAME?: string;
    CANONICALIZE_HOST_NAME?: boolean;
    SERVICE_REALM?: string;
    [key: string]: any;
  };
  /** The size (in milliseconds) of the latency window for selecting among multiple suitable MongoDB instances. */
  localThresholdMS?: number;
  /** Specifies how long (in milliseconds) to block for server selection before throwing an exception.  */
  serverSelectionTimeoutMS?: number;
  /** heartbeatFrequencyMS controls when the driver checks the state of the MongoDB deployment. Specify the interval (in milliseconds) between checks, counted from the end of the previous check until the beginning of the next one. */
  heartbeatFrequencyMS?: number;
  /** Sets the minimum heartbeat frequency. In the event that the driver has to frequently re-check a server's availability, it will wait at least this long since the previous check to avoid wasted effort. */
  minHeartbeatFrequencyMS?: number;
  /** The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections */
  appName?: string;
  /** Enables retryable reads. */
  retryReads?: boolean;
  /** Enable retryable writes. */
  retryWrites?: boolean;
  /** Allow a driver to force a Single topology type with a connection string containing one host */
  directConnection?: boolean;

  /** The write concern w value */
  w?: W;
  /** The write concern timeout */
  wtimeoutMS?: number;
  /** The journal write concern */
  journal?: boolean;

  /** Validate mongod server certificate against Certificate Authority */
  sslValidate?: boolean;
  /** SSL Certificate file path. */
  sslCA?: string;
  /** SSL Certificate file path. */
  sslCert?: string;
  /** SSL Key file file path. */
  sslKey?: string;
  /** SSL Certificate pass phrase. */
  sslPass?: string;
  /** SSL Certificate revocation list file path. */
  sslCRL?: string;
  /** TCP Connection no delay */
  noDelay?: boolean;
  /** TCP Connection keep alive enabled */
  keepAlive?: boolean;
  /** The number of milliseconds to wait before initiating keepAlive on the TCP socket */
  keepAliveInitialDelay?: number;
  /** Force server to assign `_id` values instead of driver */
  forceServerObjectId?: boolean;
  /** Return document results as raw BSON buffers */
  raw?: boolean;
  /** A primary key factory function for generation of custom `_id` keys */
  pkFactory?: PkFactory;
  /** A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible */
  promiseLibrary?: any;
  /** The logging level */
  loggerLevel?: LoggerLevelId;
  /** Custom logger object */
  logger?: Logger;
  /** Enable command monitoring for this client */
  monitorCommands?: boolean;
  /** Server API version */
  serverApi?: ServerApi | ServerApiVersionId;
  /** Optionally enable client side auto encryption */
  autoEncryption?: AutoEncryptionOptions;
  /** Allows a wrapping driver to amend the client metadata generated by the driver to include information about the wrapping driver */
  driverInfo?: DriverInfo;

  srvPoller?: SrvPoller;
  connectionType?: typeof Connection;
}

/** @public */
export type WithSessionCallback = (session: ClientSession) => Promise<any> | void;

/** @internal */
export interface MongoClientPrivate {
  url: string;
  sessions: Set<ClientSession>;
  bsonOptions: BSONSerializeOptions;
  namespace: MongoDBNamespace;
  readonly options?: MongoOptions;
  readonly readConcern?: ReadConcern;
  readonly writeConcern?: WriteConcern;
  readonly readPreference: ReadPreference;
  readonly logger: Logger;
}

const kOptions = Symbol('options');

/**
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 * @public
 *
 * @remarks
 * The programmatically provided options take precedent over the URI options.
 *
 * @example
 * ```js
 * // Connect using a MongoClient instance
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * const mongoClient = new MongoClient(url);
 * mongoClient.connect(function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 * ```
 *
 * @example
 * ```js
 * // Connect using the MongoClient.connect static method
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 * ```
 */
export class MongoClient extends EventEmitter {
  /** @internal */
  s: MongoClientPrivate;
  topology?: Topology;

  /**
   * The consolidate, parsed, transformed and merged options.
   * @internal
   */
  [kOptions]: MongoOptions;

  constructor(url: string, options?: MongoClientOptions) {
    super();

    this[kOptions] = parseOptions(url, this, options);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;

    // The internal state
    this.s = {
      url,
      sessions: new Set(),
      bsonOptions: resolveBSONOptions(this[kOptions]),
      namespace: ns('admin'),

      get options() {
        return client[kOptions];
      },
      get readConcern() {
        return client[kOptions].readConcern;
      },
      get writeConcern() {
        return client[kOptions].writeConcern;
      },
      get readPreference() {
        return client[kOptions].readPreference;
      },
      get logger() {
        return client[kOptions].logger;
      }
    };
  }

  get options(): Readonly<MongoOptions> {
    return Object.freeze({ ...this[kOptions] });
  }

  get serverApi(): Readonly<ServerApi | undefined> {
    return this[kOptions].serverApi && Object.freeze({ ...this[kOptions].serverApi });
  }
  /**
   * Intended for APM use only
   * @internal
   */
  get monitorCommands(): boolean {
    return this[kOptions].monitorCommands;
  }
  set monitorCommands(value: boolean) {
    this[kOptions].monitorCommands = value;
  }

  get autoEncrypter(): AutoEncrypter | undefined {
    return this[kOptions].autoEncrypter;
  }

  get readConcern(): ReadConcern | undefined {
    return this.s.readConcern;
  }

  get writeConcern(): WriteConcern | undefined {
    return this.s.writeConcern;
  }

  get readPreference(): ReadPreference {
    return this.s.readPreference;
  }

  get bsonOptions(): BSONSerializeOptions {
    return this.s.bsonOptions;
  }

  get logger(): Logger {
    return this.s.logger;
  }

  /**
   * Connect to MongoDB using a url
   *
   * @see docs.mongodb.org/manual/reference/connection-string/
   */
  connect(): Promise<MongoClient>;
  connect(callback: Callback<MongoClient>): void;
  connect(callback?: Callback<MongoClient>): Promise<MongoClient> | void {
    if (callback && typeof callback !== 'function') {
      throw new TypeError('`connect` only accepts a callback');
    }

    return maybePromise(callback, cb => {
      connect(this, this[kOptions], err => {
        if (err) return cb(err);
        cb(undefined, this);
      });
    });
  }

  /**
   * Close the db and its underlying connections
   *
   * @param force - Force close, emitting no events
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  close(): Promise<void>;
  close(callback: Callback<void>): void;
  close(force: boolean): Promise<void>;
  close(force: boolean, callback: Callback<void>): void;
  close(
    forceOrCallback?: boolean | Callback<void>,
    callback?: Callback<void>
  ): Promise<void> | void {
    if (typeof forceOrCallback === 'function') {
      callback = forceOrCallback;
    }

    const force = typeof forceOrCallback === 'boolean' ? forceOrCallback : false;

    return maybePromise(callback, cb => {
      if (this.topology == null) {
        return cb();
      }

      // clear out references to old topology
      const topology = this.topology;
      this.topology = undefined;

      topology.close({ force }, err => {
        const autoEncrypter = topology.s.options.autoEncrypter;
        if (!autoEncrypter) {
          cb(err);
          return;
        }

        autoEncrypter.teardown(force, err2 => cb(err || err2));
      });
    });
  }

  /**
   * Create a new Db instance sharing the current socket connections.
   *
   * @param dbName - The name of the database we want to use. If not provided, use database name from connection string.
   * @param options - Optional settings for Db construction
   */
  db(dbName?: string, options?: DbOptions): Db {
    options = options ?? {};

    // Default to db from connection string if not provided
    if (!dbName) {
      dbName = this.options.dbName;
    }

    // Copy the options and add out internal override of the not shared flag
    const finalOptions = Object.assign({}, this[kOptions], options);

    // If no topology throw an error message
    if (!this.topology) {
      throw new MongoError('MongoClient must be connected before calling MongoClient.prototype.db');
    }

    // Return the db object
    const db = new Db(this, dbName, finalOptions);

    // Return the database
    return db;
  }

  /**
   * Connect to MongoDB using a url
   *
   * @remarks
   * The programmatically provided options take precedent over the URI options.
   *
   * @see https://docs.mongodb.org/manual/reference/connection-string/
   */
  static connect(url: string): Promise<MongoClient>;
  static connect(url: string, callback: Callback<MongoClient>): void;
  static connect(url: string, options: MongoClientOptions): Promise<MongoClient>;
  static connect(url: string, options: MongoClientOptions, callback: Callback<MongoClient>): void;
  static connect(
    url: string,
    options?: MongoClientOptions | Callback<MongoClient>,
    callback?: Callback<MongoClient>
  ): Promise<MongoClient> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    try {
      // Create client
      const mongoClient = new MongoClient(url, options);
      // Execute the connect method
      if (callback) {
        return mongoClient.connect(callback);
      } else {
        return mongoClient.connect();
      }
    } catch (error) {
      if (callback) return callback(error);
      else return PromiseProvider.get().reject(error);
    }
  }

  /** Starts a new session on the server */
  startSession(): ClientSession;
  startSession(options: ClientSessionOptions): ClientSession;
  startSession(options?: ClientSessionOptions): ClientSession {
    options = Object.assign({ explicit: true }, options);
    if (!this.topology) {
      throw new MongoError('Must connect to a server before calling this method');
    }

    return this.topology.startSession(options, this.s.options);
  }

  /**
   * Runs a given operation with an implicitly created session. The lifetime of the session
   * will be handled without the need for user interaction.
   *
   * NOTE: presently the operation MUST return a Promise (either explicit or implicitly as an async function)
   *
   * @param options - Optional settings for the command
   * @param callback - An callback to execute with an implicitly created session
   */
  withSession(callback: WithSessionCallback): Promise<void>;
  withSession(options: ClientSessionOptions, callback: WithSessionCallback): Promise<void>;
  withSession(
    optionsOrOperation?: ClientSessionOptions | WithSessionCallback,
    callback?: WithSessionCallback
  ): Promise<void> {
    let options: ClientSessionOptions = optionsOrOperation as ClientSessionOptions;
    if (typeof optionsOrOperation === 'function') {
      callback = optionsOrOperation as WithSessionCallback;
      options = { owner: Symbol() };
    }

    if (callback == null) {
      throw new TypeError('Missing required callback parameter');
    }

    const session = this.startSession(options);
    const Promise = PromiseProvider.get();

    let cleanupHandler: CleanUpHandlerFunction = ((err, result, opts) => {
      // prevent multiple calls to cleanupHandler
      cleanupHandler = () => {
        throw new ReferenceError('cleanupHandler was called too many times');
      };

      opts = Object.assign({ throw: true }, opts);
      session.endSession();

      if (err) {
        if (opts.throw) throw err;
        return Promise.reject(err);
      }
    }) as CleanUpHandlerFunction;

    try {
      const result = callback(session);
      return Promise.resolve(result).then(
        result => cleanupHandler(undefined, result, undefined),
        err => cleanupHandler(err, null, { throw: true })
      );
    } catch (err) {
      return cleanupHandler(err, null, { throw: false }) as Promise<void>;
    }
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this cluster. Will ignore all
   * changes to system collections, as well as the local, admin, and config databases.
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch(): ChangeStream;
  watch(pipeline?: Document[]): ChangeStream;
  watch(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream {
    pipeline = pipeline || [];
    options = options ?? {};

    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream(this, pipeline, resolveOptions(this, options));
  }

  /** Return the mongo client logger */
  getLogger(): Logger {
    return this.s.logger;
  }
}

/**
 * Mongo Client Options
 * @public
 */
export interface MongoOptions
  extends Required<
      Pick<
        MongoClientOptions,
        | 'autoEncryption'
        | 'compressors'
        | 'connectionType'
        | 'connectTimeoutMS'
        | 'directConnection'
        | 'driverInfo'
        | 'forceServerObjectId'
        | 'minHeartbeatFrequencyMS'
        | 'heartbeatFrequencyMS'
        | 'keepAlive'
        | 'keepAliveInitialDelay'
        | 'localThresholdMS'
        | 'logger'
        | 'maxIdleTimeMS'
        | 'maxPoolSize'
        | 'minPoolSize'
        | 'monitorCommands'
        | 'noDelay'
        | 'pkFactory'
        | 'promiseLibrary'
        | 'raw'
        | 'replicaSet'
        | 'retryReads'
        | 'retryWrites'
        | 'serverSelectionTimeoutMS'
        | 'socketTimeoutMS'
        | 'tlsAllowInvalidCertificates'
        | 'tlsAllowInvalidHostnames'
        | 'tlsInsecure'
        | 'waitQueueTimeoutMS'
        | 'zlibCompressionLevel'
      >
    >,
    SupportedNodeConnectionOptions {
  hosts: HostAddress[];
  srvHost?: string;
  credentials?: MongoCredentials;
  readPreference: ReadPreference;
  readConcern: ReadConcern;
  serverApi: ServerApi;
  writeConcern: WriteConcern;
  dbName: string;
  metadata: ClientMetadata;
  autoEncrypter?: AutoEncrypter;

  userSpecifiedAuthSource: boolean;
  userSpecifiedReplicaSet: boolean;

  /**
   * # NOTE ABOUT TLS Options
   *
   * If set TLS enabled, equivalent to setting the ssl option.
   *
   * ### Additional options:
   *
   * |    nodejs option     | MongoDB equivalent                                       | type                                   |
   * |:---------------------|--------------------------------------------------------- |:---------------------------------------|
   * | `ca`                 | `sslCA`, `tlsCAFile`                                     | `string \| Buffer \| Buffer[]`         |
   * | `crl`                | `sslCRL`                                                 | `string \| Buffer \| Buffer[]`         |
   * | `cert`               | `sslCert`, `tlsCertificateFile`, `tlsCertificateKeyFile` | `string \| Buffer \| Buffer[]`         |
   * | `key`                | `sslKey`, `tlsCertificateKeyFile`                        | `string \| Buffer \| KeyObject[]`      |
   * | `passphrase`         | `sslPass`, `tlsCertificateKeyFilePassword`               | `string`                               |
   * | `rejectUnauthorized` | `sslValidate`                                            | `boolean`                              |
   *
   */
  tls: boolean;

  /**
   * Turn these options into a reusable connection URI
   */
  toURI(): string;
}
