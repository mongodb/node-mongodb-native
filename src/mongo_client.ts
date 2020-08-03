import { Db } from './db';
import { EventEmitter } from 'events';
import { ChangeStream } from './change_stream';
import { ReadPreference } from './read_preference';
import { MongoError } from './error';
import { WriteConcern } from './write_concern';
import { maybePromise, MongoDBNamespace } from './utils';
import { deprecate } from 'util';
import { connect, validOptions } from './operations/connect';
import { PromiseProvider } from './promise_provider';
import type { Callback, MongoClientOptions } from './types';

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
        cb(null, client);
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
        .then((result: any) => cleanupHandler(null, result, undefined))
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
