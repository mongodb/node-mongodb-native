import type { TcpNetConnectOpts } from 'net';
import type { ConnectionOptions as TLSConnectionOptions, TLSSocketOptions } from 'tls';

import { BSONSerializeOptions, Document, resolveBSONOptions } from './bson';
import { ChangeStream, ChangeStreamDocument, ChangeStreamOptions } from './change_stream';
import type { AuthMechanismProperties, MongoCredentials } from './cmap/auth/mongo_credentials';
import type { AuthMechanism } from './cmap/auth/providers';
import type { LEGAL_TCP_SOCKET_OPTIONS, LEGAL_TLS_SOCKET_OPTIONS } from './cmap/connect';
import type { Connection } from './cmap/connection';
import type { CompressorName } from './cmap/wire_protocol/compression';
import { parseOptions } from './connection_string';
import type { MONGO_CLIENT_EVENTS } from './constants';
import { Db, DbOptions } from './db';
import type { AutoEncrypter, AutoEncryptionOptions } from './deps';
import type { Encrypter } from './encrypter';
import { MongoInvalidArgumentError } from './error';
import type { Logger, LoggerLevel } from './logger';
import { TypedEventEmitter } from './mongo_types';
import { connect } from './operations/connect';
import { PromiseProvider } from './promise_provider';
import type { ReadConcern, ReadConcernLevel, ReadConcernLike } from './read_concern';
import { ReadPreference, ReadPreferenceMode } from './read_preference';
import type { TagSet } from './sdam/server_description';
import { readPreferenceServerSelector } from './sdam/server_selection';
import type { SrvPoller } from './sdam/srv_polling';
import type { Topology, TopologyEvents } from './sdam/topology';
import { ClientSession, ClientSessionOptions, ServerSessionPool } from './sessions';
import {
  Callback,
  ClientMetadata,
  HostAddress,
  maybePromise,
  MongoDBNamespace,
  ns,
  resolveOptions
} from './utils';
import type { W, WriteConcern, WriteConcernSettings } from './write_concern';

/** @public */
export const ServerApiVersion = Object.freeze({
  v1: '1'
} as const);

/** @public */
export type ServerApiVersion = typeof ServerApiVersion[keyof typeof ServerApiVersion];

/** @public */
export interface ServerApi {
  version: ServerApiVersion;
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
  /** Specifies the location of a local .pem file that contains either the client's TLS/SSL certificate and key or only the client's TLS/SSL key when tlsCertificateFile is used to provide the certificate. */
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
  /** An array or comma-delimited string of compressors to enable network compression for communication between this client and a mongod/mongos instance. */
  compressors?: CompressorName[] | string;
  /** An integer that specifies the compression level if using zlib for network compression. */
  zlibCompressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
  /** The maximum number of hosts to connect to when using an srv connection string, a setting of `0` means unlimited hosts */
  srvMaxHosts?: number;
  /**
   * Modifies the srv URI to look like:
   *
   * `_{srvServiceName}._tcp.{hostname}.{domainname}`
   *
   * Querying this DNS URI is expected to respond with SRV records
   */
  srvServiceName?: string;
  /** The maximum number of connections in the connection pool. */
  maxPoolSize?: number;
  /** The minimum number of connections in the connection pool. */
  minPoolSize?: number;
  /** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
  maxConnecting?: number;
  /** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
  maxIdleTimeMS?: number;
  /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
  waitQueueTimeoutMS?: number;
  /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** The level of isolation */
  readConcernLevel?: ReadConcernLevel;
  /** Specifies the read preferences for this connection */
  readPreference?: ReadPreferenceMode | ReadPreference;
  /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
  maxStalenessSeconds?: number;
  /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
  readPreferenceTags?: TagSet[];
  /** The auth settings for when connection to server. */
  auth?: Auth;
  /** Specify the database name associated with the user’s credentials. */
  authSource?: string;
  /** Specify the authentication mechanism that MongoDB will use to authenticate the connection. */
  authMechanism?: AuthMechanism;
  /** Specify properties for the specified authMechanism as a comma-separated list of colon-separated key-value pairs. */
  authMechanismProperties?: AuthMechanismProperties;
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
  /** Instruct the driver it is connecting to a load balancer fronting a mongos like service */
  loadBalanced?: boolean;
  /**
   * The write concern w value
   * @deprecated Please use the `writeConcern` option instead
   */
  w?: W;
  /**
   * The write concern timeout
   * @deprecated Please use the `writeConcern` option instead
   */
  wtimeoutMS?: number;
  /**
   * The journal write concern
   * @deprecated Please use the `writeConcern` option instead
   */
  journal?: boolean;
  /**
   * A MongoDB WriteConcern, which describes the level of acknowledgement
   * requested from MongoDB for write operations.
   *
   * @see https://docs.mongodb.com/manual/reference/write-concern/
   */
  writeConcern?: WriteConcern | WriteConcernSettings;
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
  /**
   * A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
   * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
   */
  promiseLibrary?: any;
  /** The logging level */
  loggerLevel?: LoggerLevel;
  /** Custom logger object */
  logger?: Logger;
  /** Enable command monitoring for this client */
  monitorCommands?: boolean;
  /** Server API version */
  serverApi?: ServerApi | ServerApiVersion;
  /**
   * Optionally enable client side auto encryption
   *
   * @remarks
   *  Automatic encryption is an enterprise only feature that only applies to operations on a collection. Automatic encryption is not supported for operations on a database or view, and operations that are not bypassed will result in error
   *  (see [libmongocrypt: Auto Encryption Allow-List](https://github.com/mongodb/specifications/blob/master/source/client-side-encryption/client-side-encryption.rst#libmongocrypt-auto-encryption-allow-list)). To bypass automatic encryption for all operations, set bypassAutoEncryption=true in AutoEncryptionOpts.
   *
   *  Automatic encryption requires the authenticated user to have the [listCollections privilege action](https://docs.mongodb.com/manual/reference/command/listCollections/#dbcmd.listCollections).
   *
   *  If a MongoClient with a limited connection pool size (i.e a non-zero maxPoolSize) is configured with AutoEncryptionOptions, a separate internal MongoClient is created if any of the following are true:
   *  - AutoEncryptionOptions.keyVaultClient is not passed.
   *  - AutoEncryptionOptions.bypassAutomaticEncryption is false.
   *
   * If an internal MongoClient is created, it is configured with the same options as the parent MongoClient except minPoolSize is set to 0 and AutoEncryptionOptions is omitted.
   */
  autoEncryption?: AutoEncryptionOptions;
  /** Allows a wrapping driver to amend the client metadata generated by the driver to include information about the wrapping driver */
  driverInfo?: DriverInfo;
  /** Configures a Socks5 proxy host used for creating TCP connections. */
  proxyHost?: string;
  /** Configures a Socks5 proxy port used for creating TCP connections. */
  proxyPort?: number;
  /** Configures a Socks5 proxy username when the proxy in proxyHost requires username/password authentication. */
  proxyUsername?: string;
  /** Configures a Socks5 proxy password when the proxy in proxyHost requires username/password authentication. */
  proxyPassword?: string;

  /** @internal */
  srvPoller?: SrvPoller;
  /** @internal */
  connectionType?: typeof Connection;

  /** @internal */
  [featureFlag: symbol]: any;
}

/** @public */
export type WithSessionCallback = (session: ClientSession) => Promise<any>;

/** @internal */
export interface MongoClientPrivate {
  url: string;
  bsonOptions: BSONSerializeOptions;
  namespace: MongoDBNamespace;
  hasBeenClosed: boolean;
  /**
   * We keep a reference to the sessions that are acquired from the pool.
   * - used to track and close all sessions in client.close() (which is non-standard behavior)
   * - used to notify the leak checker in our tests if test author forgot to clean up explicit sessions
   */
  readonly activeSessions: Set<ClientSession>;
  readonly sessionPool: ServerSessionPool;
  readonly options: MongoOptions;
  readonly readConcern?: ReadConcern;
  readonly writeConcern?: WriteConcern;
  readonly readPreference: ReadPreference;
  readonly logger: Logger;
  readonly isMongoClient: true;
}

/** @public */
export type MongoClientEvents = Pick<TopologyEvents, typeof MONGO_CLIENT_EVENTS[number]> & {
  // In previous versions the open event emitted a topology, in an effort to no longer
  // expose internals but continue to expose this useful event API, it now emits a mongoClient
  open(mongoClient: MongoClient): void;
};

/** @internal */
const kOptions = Symbol('options');

/**
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 * @public
 *
 * @remarks
 * The programmatically provided options take precedence over the URI options.
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * // Enable command monitoring for debugging
 * const client = new MongoClient('mongodb://localhost:27017', { monitorCommands: true });
 *
 * client.on('commandStarted', started => console.log(started));
 * client.db().collection('pets');
 * await client.insertOne({ name: 'spot', kind: 'dog' });
 * ```
 */
export class MongoClient extends TypedEventEmitter<MongoClientEvents> {
  /** @internal */
  s: MongoClientPrivate;
  /** @internal */
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
      bsonOptions: resolveBSONOptions(this[kOptions]),
      namespace: ns('admin'),
      hasBeenClosed: false,
      sessionPool: new ServerSessionPool(this),
      activeSessions: new Set(),

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
      },
      get isMongoClient(): true {
        return true;
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
  connect(): Promise<this>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  connect(callback: Callback<this>): void;
  connect(callback?: Callback<this>): Promise<this> | void {
    if (callback && typeof callback !== 'function') {
      throw new MongoInvalidArgumentError('Method `connect` only accepts a callback');
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
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  close(callback: Callback<void>): void;
  close(force: boolean): Promise<void>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  close(force: boolean, callback: Callback<void>): void;
  close(
    forceOrCallback?: boolean | Callback<void>,
    callback?: Callback<void>
  ): Promise<void> | void {
    // There's no way to set hasBeenClosed back to false
    Object.defineProperty(this.s, 'hasBeenClosed', {
      value: true,
      enumerable: true,
      configurable: false,
      writable: false
    });

    if (typeof forceOrCallback === 'function') {
      callback = forceOrCallback;
    }

    const force = typeof forceOrCallback === 'boolean' ? forceOrCallback : false;

    return maybePromise(callback, callback => {
      if (this.topology == null) {
        // Do not connect just to end sessions
        return callback();
      }

      const activeSessionEnds = Array.from(this.s.activeSessions, session => session.endSession());
      this.s.activeSessions.clear();

      Promise.all(activeSessionEnds)
        .then(() => {
          if (this.topology == null) {
            return;
          }
          // If we would attempt to select a server and get nothing back we short circuit
          // to avoid the server selection timeout.
          const selector = readPreferenceServerSelector(ReadPreference.primaryPreferred);
          const topologyDescription = this.topology.description;
          const serverDescriptions = Array.from(topologyDescription.servers.values());
          const servers = selector(topologyDescription, serverDescriptions);
          if (servers.length === 0) {
            return;
          }

          const endSessions = Array.from(this.s.sessionPool.sessions, ({ id }) => id);
          if (endSessions.length === 0) return;
          return this.db('admin')
            .command(
              { endSessions },
              { readPreference: ReadPreference.primaryPreferred, noResponse: true }
            )
            .catch(() => null); // outcome does not matter
        })
        .then(() => {
          if (this.topology == null) {
            return;
          }
          // clear out references to old topology
          const topology = this.topology;
          this.topology = undefined;

          return new Promise<void>((resolve, reject) => {
            topology.close({ force }, error => {
              if (error) return reject(error);
              const { encrypter } = this[kOptions];
              if (encrypter) {
                return encrypter.close(this, force, error => {
                  if (error) return reject(error);
                  resolve();
                });
              }
              resolve();
            });
          });
        })
        .then(
          () => callback(),
          error => callback(error)
        );
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

    // Return the db object
    const db = new Db(this, dbName, finalOptions);

    // Return the database
    return db;
  }

  /**
   * Connect to MongoDB using a url
   *
   * @remarks
   * The programmatically provided options take precedence over the URI options.
   *
   * @see https://docs.mongodb.org/manual/reference/connection-string/
   */
  static connect(url: string): Promise<MongoClient>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  static connect(url: string, callback: Callback<MongoClient>): void;
  static connect(url: string, options: MongoClientOptions): Promise<MongoClient>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
      if (callback) {
        return callback(error);
      } else {
        const PromiseConstructor = PromiseProvider.get() ?? Promise;
        return PromiseConstructor.reject(error);
      }
    }
  }

  /** Starts a new session on the server */
  startSession(): ClientSession;
  startSession(options: ClientSessionOptions): ClientSession;
  startSession(options?: ClientSessionOptions): ClientSession {
    const session = new ClientSession(
      this,
      this.s.sessionPool,
      { explicit: true, ...options },
      this[kOptions]
    );
    this.s.activeSessions.add(session);
    session.once('ended', () => {
      this.s.activeSessions.delete(session);
    });
    return session;
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
    const options = {
      // Always define an owner
      owner: Symbol(),
      // If it's an object inherit the options
      ...(typeof optionsOrOperation === 'object' ? optionsOrOperation : {})
    };

    const withSessionCallback =
      typeof optionsOrOperation === 'function' ? optionsOrOperation : callback;

    if (withSessionCallback == null) {
      throw new MongoInvalidArgumentError('Missing required callback parameter');
    }

    const session = this.startSession(options);
    const PromiseConstructor = PromiseProvider.get() ?? Promise;

    return PromiseConstructor.resolve()
      .then(() => withSessionCallback(session))
      .then(() => {
        // Do not return the result of callback
      })
      .finally(() => {
        session.endSession().catch(() => null);
      });
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this cluster. Will ignore all
   * changes to system collections, as well as the local, admin, and config databases.
   *
   * @remarks
   * watch() accepts two generic arguments for distinct usecases:
   * - The first is to provide the schema that may be defined for all the data within the current cluster
   * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   * @typeParam TSchema - Type of the data being detected by the change stream
   * @typeParam TChange - Type of the whole change stream document emitted
   */
  watch<
    TSchema extends Document = Document,
    TChange extends Document = ChangeStreamDocument<TSchema>
  >(pipeline: Document[] = [], options: ChangeStreamOptions = {}): ChangeStream<TSchema, TChange> {
    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream<TSchema, TChange>(this, pipeline, resolveOptions(this, options));
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
        | 'maxConnecting'
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
        | 'srvMaxHosts'
        | 'srvServiceName'
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
  loadBalanced: boolean;
  serverApi: ServerApi;
  compressors: CompressorName[];
  writeConcern: WriteConcern;
  dbName: string;
  metadata: ClientMetadata;
  autoEncrypter?: AutoEncrypter;
  proxyHost?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
  /** @internal */
  connectionType?: typeof Connection;

  /** @internal */
  encrypter: Encrypter;
  /** @internal */
  userSpecifiedAuthSource: boolean;
  /** @internal */
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

  /** @internal */
  [featureFlag: symbol]: any;
}
