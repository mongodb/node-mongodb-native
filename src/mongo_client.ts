import type { TcpNetConnectOpts } from 'net';
import type { ConnectionOptions as TLSConnectionOptions, TLSSocketOptions } from 'tls';
import { promisify } from 'util';

import { type BSONSerializeOptions, type Document, resolveBSONOptions } from './bson';
import { ChangeStream, type ChangeStreamDocument, type ChangeStreamOptions } from './change_stream';
import {
  type AuthMechanismProperties,
  DEFAULT_ALLOWED_HOSTS,
  type MongoCredentials
} from './cmap/auth/mongo_credentials';
import { AuthMechanism } from './cmap/auth/providers';
import type { LEGAL_TCP_SOCKET_OPTIONS, LEGAL_TLS_SOCKET_OPTIONS } from './cmap/connect';
import type { Connection } from './cmap/connection';
import type { ClientMetadata } from './cmap/handshake/client_metadata';
import type { CompressorName } from './cmap/wire_protocol/compression';
import { parseOptions, resolveSRVRecord } from './connection_string';
import { MONGO_CLIENT_EVENTS } from './constants';
import { Db, type DbOptions } from './db';
import type { AutoEncrypter, AutoEncryptionOptions } from './deps';
import type { Encrypter } from './encrypter';
import { MongoInvalidArgumentError } from './error';
import { MongoLogger, type MongoLoggerOptions } from './mongo_logger';
import { TypedEventEmitter } from './mongo_types';
import type { ReadConcern, ReadConcernLevel, ReadConcernLike } from './read_concern';
import { ReadPreference, type ReadPreferenceMode } from './read_preference';
import type { TagSet } from './sdam/server_description';
import { readPreferenceServerSelector } from './sdam/server_selection';
import type { SrvPoller } from './sdam/srv_polling';
import { Topology, type TopologyEvents } from './sdam/topology';
import { ClientSession, type ClientSessionOptions, ServerSessionPool } from './sessions';
import {
  type HostAddress,
  hostMatchesWildcards,
  type MongoDBNamespace,
  ns,
  resolveOptions
} from './utils';
import type { W, WriteConcern, WriteConcernSettings } from './write_concern';

/** @public */
export const ServerApiVersion = Object.freeze({
  v1: '1'
} as const);

/** @public */
export type ServerApiVersion = (typeof ServerApiVersion)[keyof typeof ServerApiVersion];

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
  Extract<keyof TLSConnectionOptions, (typeof LEGAL_TLS_SOCKET_OPTIONS)[number]>
>;

/** @public */
export type SupportedTLSSocketOptions = Pick<
  TLSSocketOptions,
  Extract<keyof TLSSocketOptions, (typeof LEGAL_TLS_SOCKET_OPTIONS)[number]>
>;

/** @public */
export type SupportedSocketOptions = Pick<
  TcpNetConnectOpts,
  (typeof LEGAL_TCP_SOCKET_OPTIONS)[number]
>;

/** @public */
export type SupportedNodeConnectionOptions = SupportedTLSConnectionOptions &
  SupportedTLSSocketOptions &
  SupportedSocketOptions;

/**
 * Describes all possible URI query options for the mongo client
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/connection-string
 */
export interface MongoClientOptions extends BSONSerializeOptions, SupportedNodeConnectionOptions {
  /** Specifies the name of the replica set, if the mongod is a member of a replica set. */
  replicaSet?: string;
  /** Enables or disables TLS/SSL for the connection. */
  tls?: boolean;
  /** A boolean to enable or disables TLS/SSL for the connection. (The ssl option is equivalent to the tls option.) */
  ssl?: boolean;
  /**
   * Specifies the location of a local TLS Certificate
   * @deprecated Will be removed in the next major version. Please use tlsCertificateKeyFile instead.
   */
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
   * @see https://www.mongodb.com/docs/manual/reference/write-concern/
   */
  writeConcern?: WriteConcern | WriteConcernSettings;
  /**
   * Validate mongod server certificate against Certificate Authority
   * @deprecated Will be removed in the next major version. Please use tlsAllowInvalidCertificates instead.
   */
  sslValidate?: boolean;
  /**
   * SSL Certificate file path.
   * @deprecated Will be removed in the next major version. Please use tlsCAFile instead.
   */
  sslCA?: string;
  /**
   * SSL Certificate file path.
   * @deprecated Will be removed in the next major version. Please use tlsCertificateKeyFile instead.
   */
  sslCert?: string;
  /**
   * SSL Key file file path.
   * @deprecated Will be removed in the next major version. Please use tlsCertificateKeyFile instead.
   */
  sslKey?: string;
  /**
   * SSL Certificate pass phrase.
   * @deprecated Will be removed in the next major version. Please use tlsCertificateKeyFilePassword instead.
   */
  sslPass?: string;
  /**
   * SSL Certificate revocation list file path.
   * @deprecated Will be removed in the next major version. Please use tlsCertificateKeyFile instead.
   */
  sslCRL?: string;
  /** TCP Connection no delay */
  noDelay?: boolean;
  /** @deprecated TCP Connection keep alive enabled. Will not be able to turn off in the future. */
  keepAlive?: boolean;
  /**
   * @deprecated The number of milliseconds to wait before initiating keepAlive on the TCP socket.
   *             Will not be configurable in the future.
   */
  keepAliveInitialDelay?: number;
  /** Force server to assign `_id` values instead of driver */
  forceServerObjectId?: boolean;
  /** A primary key factory function for generation of custom `_id` keys */
  pkFactory?: PkFactory;
  /** Enable command monitoring for this client */
  monitorCommands?: boolean;
  /** Server API version */
  serverApi?: ServerApi | ServerApiVersion;
  /**
   * Optionally enable in-use auto encryption
   *
   * @remarks
   *  Automatic encryption is an enterprise only feature that only applies to operations on a collection. Automatic encryption is not supported for operations on a database or view, and operations that are not bypassed will result in error
   *  (see [libmongocrypt: Auto Encryption Allow-List](https://github.com/mongodb/specifications/blob/master/source/client-side-encryption/client-side-encryption.rst#libmongocrypt-auto-encryption-allow-list)). To bypass automatic encryption for all operations, set bypassAutoEncryption=true in AutoEncryptionOpts.
   *
   *  Automatic encryption requires the authenticated user to have the [listCollections privilege action](https://www.mongodb.com/docs/manual/reference/command/listCollections/#dbcmd.listCollections).
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
  readonly isMongoClient: true;
}

/** @public */
export type MongoClientEvents = Pick<TopologyEvents, (typeof MONGO_CLIENT_EVENTS)[number]> & {
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
  /** @internal */
  override readonly mongoLogger: MongoLogger;
  /** @internal */
  private connectionLock?: Promise<this>;

  /**
   * The consolidate, parsed, transformed and merged options.
   * @internal
   */
  [kOptions]: MongoOptions;

  constructor(url: string, options?: MongoClientOptions) {
    super();

    this[kOptions] = parseOptions(url, this, options);
    this.mongoLogger = new MongoLogger(this[kOptions].mongoLoggerOptions);

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
      get isMongoClient(): true {
        return true;
      }
    };
  }

  /** @see MongoOptions */
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

  /**
   * @deprecated This method will be removed in the next major version.
   */
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

  /**
   * Connect to MongoDB using a url
   *
   * @see docs.mongodb.org/manual/reference/connection-string/
   */
  async connect(): Promise<this> {
    if (this.connectionLock) {
      return this.connectionLock;
    }

    try {
      this.connectionLock = this._connect();
      await this.connectionLock;
    } finally {
      // release
      this.connectionLock = undefined;
    }

    return this;
  }

  /**
   * Create a topology to open the connection, must be locked to avoid topology leaks in concurrency scenario.
   * Locking is enforced by the connect method.
   *
   * @internal
   */
  private async _connect(): Promise<this> {
    if (this.topology && this.topology.isConnected()) {
      return this;
    }

    const options = this[kOptions];

    if (typeof options.srvHost === 'string') {
      const hosts = await resolveSRVRecord(options);

      for (const [index, host] of hosts.entries()) {
        options.hosts[index] = host;
      }
    }

    // It is important to perform validation of hosts AFTER SRV resolution, to check the real hostname,
    // but BEFORE we even attempt connecting with a potentially not allowed hostname
    if (options.credentials?.mechanism === AuthMechanism.MONGODB_OIDC) {
      const allowedHosts =
        options.credentials?.mechanismProperties?.ALLOWED_HOSTS || DEFAULT_ALLOWED_HOSTS;
      const isServiceAuth = !!options.credentials?.mechanismProperties?.PROVIDER_NAME;
      if (!isServiceAuth) {
        for (const host of options.hosts) {
          if (!hostMatchesWildcards(host.toHostPort().host, allowedHosts)) {
            throw new MongoInvalidArgumentError(
              `Host '${host}' is not valid for OIDC authentication with ALLOWED_HOSTS of '${allowedHosts.join(
                ','
              )}'`
            );
          }
        }
      }
    }

    this.topology = new Topology(this, options.hosts, options);
    // Events can be emitted before initialization is complete so we have to
    // save the reference to the topology on the client ASAP if the event handlers need to access it

    this.topology.once(Topology.OPEN, () => this.emit('open', this));

    for (const event of MONGO_CLIENT_EVENTS) {
      this.topology.on(event, (...args: any[]) => this.emit(event, ...(args as any)));
    }

    const topologyConnect = async () => {
      try {
        await promisify(callback => this.topology?.connect(options, callback))();
      } catch (error) {
        this.topology?.close({ force: true });
        throw error;
      }
    };

    if (this.autoEncrypter) {
      const initAutoEncrypter = promisify(callback => this.autoEncrypter?.init(callback));
      await initAutoEncrypter();
      await topologyConnect();
      await options.encrypter.connectInternalClient();
    } else {
      await topologyConnect();
    }

    return this;
  }

  /**
   * Close the client and its underlying connections
   *
   * @param force - Force close, emitting no events
   */
  async close(force = false): Promise<void> {
    // There's no way to set hasBeenClosed back to false
    Object.defineProperty(this.s, 'hasBeenClosed', {
      value: true,
      enumerable: true,
      configurable: false,
      writable: false
    });

    const activeSessionEnds = Array.from(this.s.activeSessions, session => session.endSession());
    this.s.activeSessions.clear();

    await Promise.all(activeSessionEnds);

    if (this.topology == null) {
      return;
    }

    // If we would attempt to select a server and get nothing back we short circuit
    // to avoid the server selection timeout.
    const selector = readPreferenceServerSelector(ReadPreference.primaryPreferred);
    const topologyDescription = this.topology.description;
    const serverDescriptions = Array.from(topologyDescription.servers.values());
    const servers = selector(topologyDescription, serverDescriptions);
    if (servers.length !== 0) {
      const endSessions = Array.from(this.s.sessionPool.sessions, ({ id }) => id);
      if (endSessions.length !== 0) {
        await this.db('admin')
          .command(
            { endSessions },
            { readPreference: ReadPreference.primaryPreferred, noResponse: true }
          )
          .catch(() => null); // outcome does not matter
      }
    }

    // clear out references to old topology
    const topology = this.topology;
    this.topology = undefined;

    await new Promise<void>((resolve, reject) => {
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
   * @see https://www.mongodb.com/docs/manual/reference/connection-string/
   */
  static async connect(url: string, options?: MongoClientOptions): Promise<MongoClient> {
    const client = new this(url, options);
    return client.connect();
  }

  /** Starts a new session on the server */
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
  async withSession(callback: WithSessionCallback): Promise<void>;
  async withSession(options: ClientSessionOptions, callback: WithSessionCallback): Promise<void>;
  async withSession(
    optionsOrOperation: ClientSessionOptions | WithSessionCallback,
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

    try {
      await withSessionCallback(session);
    } finally {
      try {
        await session.endSession();
      } catch {
        // We are not concerned with errors from endSession()
      }
    }
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this cluster. Will ignore all
   * changes to system collections, as well as the local, admin, and config databases.
   *
   * @remarks
   * watch() accepts two generic arguments for distinct use cases:
   * - The first is to provide the schema that may be defined for all the data within the current cluster
   * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
   *
   * @param pipeline - An array of {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
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
}

/**
 * Parsed Mongo Client Options.
 *
 * User supplied options are documented by `MongoClientOptions`.
 *
 * **NOTE:** The client's options parsing is subject to change to support new features.
 * This type is provided to aid with inspection of options after parsing, it should not be relied upon programmatically.
 *
 * Options are sourced from:
 * - connection string
 * - options object passed to the MongoClient constructor
 * - file system (ex. tls settings)
 * - environment variables
 * - DNS SRV records and TXT records
 *
 * Not all options may be present after client construction as some are obtained from asynchronous operations.
 *
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
        | 'maxConnecting'
        | 'maxIdleTimeMS'
        | 'maxPoolSize'
        | 'minPoolSize'
        | 'monitorCommands'
        | 'noDelay'
        | 'pkFactory'
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
  appName?: string;
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
  /**
   * @deprecated This option will be removed in the next major version.
   */
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
   * If `tls` is provided as an option, it is equivalent to setting the `ssl` option.
   *
   * NodeJS native TLS options are passed through to the socket and retain their original types.
   *
   * ### Additional options:
   *
   * | nodejs native option  | driver spec compliant option name             | legacy option name | driver option type |
   * |:----------------------|:----------------------------------------------|:-------------------|:-------------------|
   * | `ca`                  | `tlsCAFile`                                   | `sslCA`            | `string`           |
   * | `crl`                 | `tlsCRLFile` (next major version)             | `sslCRL`           | `string`           |
   * | `cert`                | `tlsCertificateFile`, `tlsCertificateKeyFile` | `sslCert`          | `string`           |
   * | `key`                 | `tlsCertificateKeyFile`                       | `sslKey`           | `string`           |
   * | `passphrase`          | `tlsCertificateKeyFilePassword`               | `sslPass`          | `string`           |
   * | `rejectUnauthorized`  | `tlsAllowInvalidCertificates`                 | `sslValidate`      | `boolean`          |
   * | `checkServerIdentity` | `tlsAllowInvalidHostnames`                    | N/A                | `boolean`          |
   * | see note below        | `tlsInsecure`                                 | N/A                | `boolean`          |
   *
   * If `tlsInsecure` is set to `true`, then it will set the node native options `checkServerIdentity`
   * to a no-op and `rejectUnauthorized` to `false`.
   *
   * If `tlsInsecure` is set to `false`, then it will set the node native options `checkServerIdentity`
   * to a no-op and `rejectUnauthorized` to the inverse value of `tlsAllowInvalidCertificates`. If
   * `tlsAllowInvalidCertificates` is not set, then `rejectUnauthorized` will be set to `true`.
   */
  tls: boolean;

  /** @internal */
  [featureFlag: symbol]: any;

  /** @internal */
  mongoLoggerOptions: MongoLoggerOptions;
}
