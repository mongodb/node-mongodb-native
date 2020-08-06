import { Db } from './db';
import { EventEmitter } from 'events';
import { ChangeStream } from './change_stream';
import { ReadPreference, ReadPreferenceMode } from './read_preference';
import { MongoError } from './error';
import { WriteConcern } from './write_concern';
import { maybePromise, MongoDBNamespace } from './utils';
import { deprecate } from 'util';
import { connect, validOptions } from './operations/connect';
import { PromiseProvider } from './promise_provider';
import type { Callback, BSONSerializeOptions, AutoEncryptionOptions } from './types';
import type { CompressorName } from './cmap/wire_protocol/compression';
import type { ReadConcernLevel, ReadConcern } from './read_concern';
import type { AuthMechanism } from './cmap/auth/defaultAuthProviders';

export enum LogLevel {
  'error' = 'error',
  'warn' = 'warn',
  'info' = 'info',
  'debug' = 'debug'
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
  /** Corresponds to the write concern w Option. The w option requests acknowledgement that the write operation has propagated to a specified number of mongod instances or to mongod instances with specified tags. */
  w?: number | 'majority';
  /** Corresponds to the write concern wtimeout. wtimeoutMS specifies a time limit, in milliseconds, for the write concern. */
  wtimeoutMS?: number;
  /** Corresponds to the write concern j Option option. The journal option requests acknowledgement from MongoDB that the write operation has been written to the journal. */
  journal?: boolean;
  /** The level of isolation */
  readConcernLevel?: ReadConcernLevel;
  /** Specifies the read preferences for this connection */
  readPreference?: ReadPreferenceMode | ReadPreference;
  /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
  maxStalenessSeconds?: number;
  /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
  readPreferenceTags?: string;
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
  /** The write concern timeout */
  wtimeout?: MongoURIOptions['wtimeoutMS'];
  /** Corresponds to the write concern j Option option. The journal option requests acknowledgement from MongoDB that the write operation has been written to the journal. */
  j?: MongoURIOptions['journal'];
  /** Force server to assign `_id` values instead of driver */
  forceServerObjectId?: boolean;
  /** Return document results as raw BSON buffers */
  raw?: boolean;
  /** A primary key factory object for generation of custom `_id` keys */
  pkFactory?: PkFactory;
  /** A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible */
  promiseLibrary?: any;
  /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The logging level */
  loggerLevel?: LogLevel;
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
  compression?: CompressorName;
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
}

/**
 * A string specifying the level of a ReadConcern
 *
 * @typedef {'local'|'available'|'majority'|'linearizable'|'snapshot'} ReadConcernLevel
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html#read-concern-levels
 */

/**
 * Configuration options for drivers wrapping the node driver.
 *
 * @typedef {object} DriverInfoOptions
 * @property {string} [name] The name of the driver
 * @property {string} [version] The version of the driver
 * @property {string} [platform] Optional platform information
 */

export interface MongoClient {
  logout(options: any, callback: Callback): void;
}

/**
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 *
 * @example
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
 *
 * @example
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
 */
export class MongoClient extends EventEmitter {
  s: any;
  topology: any;
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
      writeConcern: WriteConcern.fromOptions(options),
      namespace: new MongoDBNamespace('admin')
    };
  }

  get writeConcern() {
    return this.s.writeConcern;
  }

  get readPreference() {
    return ReadPreference.primary;
  }

  /**
   * The callback format for results
   *
   * @callback MongoClient~connectCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {MongoClient} client The connected client.
   */

  /**
   * Connect to MongoDB using a url as documented at
   *
   *  docs.mongodb.org/manual/reference/connection-string/
   *
   * Note that for replica sets the replicaSet query parameter is required in the 2.0 driver
   *
   * @function
   * @param {MongoClient~connectCallback} [callback] The command result callback
   * @returns {Promise<MongoClient>} returns Promise if no callback passed
   */
  connect(callback?: Callback): Promise<MongoClient> | void {
    if (typeof callback === 'string') {
      throw new TypeError('`connect` only accepts a callback');
    }

    const client = this;
    return maybePromise(callback, (cb: any) => {
      const err = validOptions(client.s.options);
      if (err) return cb(err);

      connect(client, client.s.url, client.s.options, (err: any) => {
        if (err) return cb(err);
        cb(undefined, client);
      });
    });
  }

  /**
   * Close the db and its underlying connections
   *
   * @function
   * @param {boolean} [force=false] Force close, emitting no events
   * @param {Db~noResultCallback} [callback] The result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  close(force?: boolean, callback?: Callback): Promise<void> {
    if (typeof force === 'function') {
      callback = force;
      force = false;
    }

    const client = this;
    return maybePromise(callback, (cb: any) => {
      if (client.topology == null) {
        cb();
        return;
      }

      client.topology.close(force, (err: any) => {
        const autoEncrypter = client.topology.s.options.autoEncrypter;
        if (!autoEncrypter) {
          cb(err);
          return;
        }

        autoEncrypter.teardown(force, (err2: any) => cb(err || err2));
      });
    });
  }

  /**
   * Create a new Db instance sharing the current socket connections.
   * Db instances are cached so performing db('db1') twice will return the same instance.
   * You can control these behaviors with the options noListener and returnNonCachedInstance.
   *
   * @function
   * @param {string} [dbName] The name of the database we want to use. If not provided, use database name from connection string.
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.noListener=false] Do not make the db an event listener to the original connection.
   * @param {boolean} [options.returnNonCachedInstance=false] Control if you want to return a cached instance or have a new one created
   * @returns {Db}
   */
  db(dbName: string, options?: any): Db {
    options = options || {};

    // Default to db from connection string if not provided
    if (!dbName) {
      dbName = this.s.options.dbName;
    }

    // Copy the options and add out internal override of the not shared flag
    const finalOptions = Object.assign({}, this.s.options, options);

    // Do we have the db in the cache already
    if (this.s.dbCache.has(dbName) && finalOptions.returnNonCachedInstance !== true) {
      return this.s.dbCache.get(dbName);
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

  /**
   * Check if MongoClient is connected
   *
   * @function
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.noListener=false] Do not make the db an event listener to the original connection.
   * @param {boolean} [options.returnNonCachedInstance=false] Control if you want to return a cached instance or have a new one created
   * @returns {boolean}
   */
  isConnected(options?: any): boolean {
    options = options || {};

    if (!this.topology) return false;
    return this.topology.isConnected(options);
  }

  /**
   * Connect to MongoDB using a url as documented at
   *
   *  docs.mongodb.org/manual/reference/connection-string/
   *
   * Note that for replica sets the replicaSet query parameter is required in the 2.0 driver
   */
  static connect(
    url: string,
    options?: MongoClientOptions,
    callback?: Callback<MongoClient>
  ): Promise<MongoClient> | void {
    const args = Array.prototype.slice.call(arguments, 1);
    callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
    options = args.length ? args.shift() : null;
    options = options || {};

    if (options && options.promiseLibrary) {
      PromiseProvider.set(options.promiseLibrary);
    }

    // Create client
    const mongoClient = new MongoClient(url, options);
    // Execute the connect method
    return mongoClient.connect(callback!);
  }

  /**
   * Starts a new session on the server
   *
   * @param {SessionOptions} [options] optional settings for a driver session
   * @returns {ClientSession} the newly established session
   */
  startSession(options?: any): any {
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
   * NOTE: presently the operation MUST return a Promise (either explicit or implicity as an async function)
   *
   * @param {object} [options] Optional settings to be appled to implicitly created session
   * @param {Function} operation An operation to execute with an implicitly created session. The signature of this MUST be `(session) => {}`
   * @returns {Promise<void>}
   */
  withSession(options?: object, operation?: Function): Promise<void> {
    if (typeof options === 'function') (operation = options), (options = undefined);
    const session = this.startSession(options);
    const Promise = PromiseProvider.get();

    let cleanupHandler = (err: any, result: any, opts: any) => {
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
    };

    try {
      const result = operation!(session);
      return Promise.resolve(result)
        .then((result: any) => cleanupHandler(undefined, result, undefined))
        .catch((err: any) => cleanupHandler(err, null, { throw: true }));
    } catch (err) {
      return cleanupHandler(err, null, { throw: false });
    }
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this cluster. Will ignore all changes to system collections, as well as the local, admin,
   * and config databases.
   *
   * @function
   * @since 3.1.0
   * @param {Array} [pipeline] An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param {object} [options] Optional settings
   * @param {string} [options.fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
   * @param {object} [options.resumeAfter] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
   * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
   * @param {number} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @param {ReadPreference} [options.readPreference] The read preference. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
   * @param {Timestamp} [options.startAtOperationTime] receive change events that occur after the specified timestamp
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @returns {ChangeStream} a ChangeStream instance.
   */
  watch(pipeline?: any[], options?: any): ChangeStream {
    pipeline = pipeline || [];
    options = options || {};

    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream(this, pipeline, options);
  }

  /**
   * Return the mongo client logger
   *
   * @function
   * @returns {Logger} return the mongo client logger
   */
  getLogger(): any {
    return this.s.options.logger;
  }
}

MongoClient.prototype.logout = deprecate((options: any, callback: Callback): void => {
  if (typeof options === 'function') (callback = options), (options = {});
  if (typeof callback === 'function') callback(undefined, true);
}, 'Multiple authentication is prohibited on a connected client, please only authenticate once per MongoClient');
