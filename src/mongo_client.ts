import { Db, DbOptions } from './db';
import { EventEmitter } from 'events';
import { ChangeStream, ChangeStreamOptions } from './change_stream';
import { ReadPreference, ReadPreferenceMode } from './read_preference';
import { MongoError, AnyError } from './error';
import { WriteConcern, WriteConcernOptions } from './write_concern';
import { maybePromise, MongoDBNamespace, Callback } from './utils';
import { deprecate } from 'util';
import { connect, validOptions } from './operations/connect';
import { PromiseProvider } from './promise_provider';
import { Logger } from './logger';
import { ReadConcern, ReadConcernLevelLike, ReadConcernLike } from './read_concern';
import { BSONSerializeOptions, Document, resolveBSONOptions } from './bson';
import type { AutoEncryptionOptions } from './deps';
import type { CompressorName } from './cmap/wire_protocol/compression';
import type { AuthMechanism } from './cmap/auth/defaultAuthProviders';
import type { Topology } from './sdam/topology';
import type { ClientSession, ClientSessionOptions } from './sessions';
import type { OperationParent } from './operations/command';
import type { TagSet } from './sdam/server_description';

/** @public */
export enum LogLevel {
  'error' = 'error',
  'warn' = 'warn',
  'info' = 'info',
  'debug' = 'debug'
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
  user?: string;
  /** The password for auth */
  pass?: string;
}

/** @public */
export interface PkFactory {
  createPk(): any; // TODO: when js-bson is typed, function should return some BSON type
}

type CleanUpHandlerFunction = (err?: AnyError, result?: any, opts?: any) => Promise<void>;

/**
 * Describes all possible URI query options for the mongo client
 * @public
 * @see https://docs.mongodb.com/manual/reference/connection-string
 */
export interface MongoURIOptions extends Pick<WriteConcernOptions, 'journal' | 'w' | 'wtimeoutMS'> {
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
  compressors?: string;
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
  /** The level of isolation */
  readConcernLevel?: ReadConcernLevelLike;
  /** Specifies the read preferences for this connection */
  readPreference?: ReadPreferenceMode | ReadPreference;
  /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
  maxStalenessSeconds?: number;
  /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
  readPreferenceTags?: TagSet[];
  /** Specify the database name associated with the user’s credentials. */
  authSource?: string;
  /** Specify the authentication mechanism that MongoDB will use to authenticate the connection. */
  authMechanism?: AuthMechanism;
  /** Specify properties for the specified authMechanism as a comma-separated list of colon-separated key-value pairs. */
  authMechanismProperties?: {
    SERVICE_NAME?: string;
    CANONICALIZE_HOST_NAME?: boolean;
    SERVICE_REALM?: string;
  };
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

/** @public */
export interface MongoClientOptions
  extends WriteConcernOptions,
    MongoURIOptions,
    BSONSerializeOptions {
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
  checkServerIdentity?: boolean | ((hostname: string, cert: Document) => Error | undefined);
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
  /** Force server to assign `_id` values instead of driver */
  forceServerObjectId?: boolean;
  /** Return document results as raw BSON buffers */
  raw?: boolean;
  /** A primary key factory function for generation of custom `_id` keys */
  pkFactory?: PkFactory;
  /** A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible */
  promiseLibrary?: any;
  /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** The logging level */
  loggerLevel?: LogLevel;
  /** Custom logger object */
  logger?: Logger;
  /** Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit */
  domainsEnabled?: boolean;
  /** Validate MongoClient passed in options for correctness */
  validateOptions?: boolean;
  /** The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections */
  appname?: MongoURIOptions['appName'];
  /** The auth settings for when connection to server. */
  auth?: Auth;
  /** Type of compression to use?: snappy or zlib */
  compression?: CompressorName;
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

  dbName?: string;
}

/** @public */
export type WithSessionCallback = (session: ClientSession) => Promise<any> | void;

/** @internal */
export interface MongoClientPrivate {
  url: string;
  options?: MongoClientOptions;
  dbCache: Map<string, Db>;
  sessions: Set<ClientSession>;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  readPreference: ReadPreference;
  bsonOptions: BSONSerializeOptions;
  namespace: MongoDBNamespace;
  logger: Logger;
}

/**
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 * @public
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
export class MongoClient extends EventEmitter implements OperationParent {
  /** @internal */
  s: MongoClientPrivate;
  topology?: Topology;

  constructor(url: string, options?: MongoClientOptions) {
    super();

    if (options && options.promiseLibrary) {
      PromiseProvider.set(options.promiseLibrary);
    }

    // The internal state
    this.s = {
      url,
      options: options || {},
      dbCache: new Map(),
      sessions: new Set(),
      readConcern: ReadConcern.fromOptions(options),
      writeConcern: WriteConcern.fromOptions(options),
      readPreference: ReadPreference.fromOptions(options) || ReadPreference.primary,
      bsonOptions: resolveBSONOptions(options),
      namespace: new MongoDBNamespace('admin'),
      logger: options?.logger ?? new Logger('MongoClient')
    };
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
  connect(callback?: Callback<MongoClient>): void;
  connect(callback?: Callback<MongoClient>): Promise<MongoClient> | void {
    if (callback && typeof callback !== 'function') {
      throw new TypeError('`connect` only accepts a callback');
    }

    return maybePromise(callback, cb => {
      const err = validOptions(this.s.options as any);
      if (err) return cb(err);

      connect(this, this.s.url, this.s.options as any, err => {
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

      const topology = this.topology;
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
   * Db instances are cached so performing db('db1') twice will return the same instance.
   * You can control these behaviors with the options noListener and returnNonCachedInstance.
   *
   * @param dbName - The name of the database we want to use. If not provided, use database name from connection string.
   * @param options - Optional settings for Db construction
   */
  db(dbName: string): Db;
  db(dbName: string, options: DbOptions & { returnNonCachedInstance?: boolean }): Db;
  db(dbName: string, options?: DbOptions & { returnNonCachedInstance?: boolean }): Db {
    options = options || {};

    // Default to db from connection string if not provided
    if (!dbName && this.s.options?.dbName) {
      dbName = this.s.options?.dbName;
    }

    // Copy the options and add out internal override of the not shared flag
    const finalOptions = Object.assign({}, this.s.options, options);

    // Do we have the db in the cache already
    const dbFromCache = this.s.dbCache.get(dbName);
    if (dbFromCache && finalOptions.returnNonCachedInstance !== true) {
      return dbFromCache;
    }

    // If no topology throw an error message
    if (!this.topology) {
      throw new MongoError('MongoClient must be connected before calling MongoClient.prototype.db');
    }

    // Return the db object
    const db = new Db(dbName, this.topology, finalOptions);

    // Add the db to the cache
    this.s.dbCache.set(dbName, db);
    // Return the database
    return db;
  }

  /** Check if MongoClient is connected */
  isConnected(): boolean {
    if (!this.topology) return false;
    return this.topology.isConnected();
  }

  /**
   * Connect to MongoDB using a url
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
    options = options || {};

    if (options && options.promiseLibrary) {
      PromiseProvider.set(options.promiseLibrary);
    }

    // Create client
    const mongoClient = new MongoClient(url, options);
    // Execute the connect method
    return mongoClient.connect(callback);
  }

  /** Starts a new session on the server */
  startSession(): ClientSession;
  startSession(options: ClientSessionOptions): ClientSession;
  startSession(options?: ClientSessionOptions): ClientSession {
    options = Object.assign({ explicit: true }, options);
    if (!this.topology) {
      throw new MongoError('Must connect to a server before calling this method');
    }

    if (!this.topology.hasSessionSupport()) {
      throw new MongoError('Current topology does not support sessions');
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
    options = options || {};

    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream(this, pipeline, options);
  }

  /** Return the mongo client logger */
  getLogger(): Logger {
    return this.s.logger;
  }

  /**
   * @deprecated You cannot logout a MongoClient, you can create a new instance.
   */
  logout = deprecate((options: any, callback: Callback): void => {
    if (typeof options === 'function') (callback = options), (options = {});
    if (typeof callback === 'function') callback(undefined, true);
  }, 'Multiple authentication is prohibited on a connected client, please only authenticate once per MongoClient');
}
