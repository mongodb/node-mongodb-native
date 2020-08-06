import { applyWriteConcern } from './utils';
import { AddUserOperation, AddUserOptions } from './operations/add_user';
import { RemoveUserOperation } from './operations/remove_user';
import { ValidateCollectionOperation } from './operations/validate_collection';
import { ListDatabasesOperation } from './operations/list_databases';
import { executeOperation } from './operations/execute_operation';
import { RunCommandOperation } from './operations/run_command';
import type { Callback } from './types';

/**
 * The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 *
 * **ADMIN Cannot directly be instantiated**
 *
 * @example
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 *
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Use the admin database for the operation
 *   const adminDb = client.db(dbName).admin();
 *
 *   // List all the available databases
 *   adminDb.listDatabases(function(err, dbs) {
 *     expect(err).to.not.exist;
 *     test.ok(dbs.databases.length > 0);
 *     client.close();
 *   });
 * });
 */

export class Admin {
  s: any;

  /**
   * Create a new Admin instance (INTERNAL TYPE, do not instantiate directly)
   *
   * @param {any} db
   * @param {any} topology
   * @returns {Admin} a collection instance.
   */
  constructor(db: any, topology: any) {
    this.s = {
      db,
      topology
    };
  }

  /**
   * The callback format for results
   *
   * @callback Admin~resultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {object} result The result object if the command was executed successfully.
   */

  /**
   * Execute a command
   *
   * @function
   * @param {object} command The command hash
   * @param {object} [options] Optional settings.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
   * @param {Admin~resultCallback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  command(command: object, options?: any, callback?: Callback): Promise<void> | void {
    const args = Array.prototype.slice.call(arguments, 1);
    callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
    options = Object.assign({ dbName: 'admin' }, args.length ? args.shift() : {});
    return executeOperation(
      this.s.db.s.topology,
      new RunCommandOperation(this.s.db, command, options),
      callback
    );
  }

  /**
   * Retrieve the server information for the current
   * instance of the db client
   *
   * @param {object} [options] optional parameters for this operation
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  buildInfo(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    return this.command({ buildinfo: 1 }, options, callback);
  }

  /**
   * Retrieve the server information for the current
   * instance of the db client
   *
   * @param {object} [options] optional parameters for this operation
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  serverInfo(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    return this.command({ buildinfo: 1 }, options, callback);
  }

  /**
   * Retrieve this db's server status.
   *
   * @param {object} [options] optional parameters for this operation
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  serverStatus(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    return this.command({ serverStatus: 1 }, options, callback);
  }

  /**
   * Ping the MongoDB server and retrieve results
   *
   * @param {object} [options] optional parameters for this operation
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  ping(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    return this.command({ ping: 1 }, options, callback);
  }

  /**
   * Add a user to the database.
   *
   * @function
   * @param {string} username The username.
   * @param {string} [password] The password.
   * @param {Callback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  addUser(
    username: string,
    password?: string,
    options?: AddUserOptions,
    callback?: Callback
  ): Promise<void> | void {
    const args = Array.prototype.slice.call(arguments, 2);
    callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

    // Special case where there is no password ($external users)
    if (typeof username === 'string' && password != null && typeof password === 'object') {
      options = password;
      password = undefined;
    }

    options = args.length ? args.shift() : {};
    options = Object.assign({}, options);
    // Get the options
    options = applyWriteConcern(options, { db: this.s.db });
    // Set the db name to admin
    options!.dbName = 'admin';

    const addUserOperation = new AddUserOperation(this.s.db, username, password, options!);
    return executeOperation(this.s.db.s.topology, addUserOperation, callback);
  }

  /**
   * Remove a user from a database
   *
   * @function
   * @param {string} username The username.
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.fsync=false] Specify a file sync write concern.
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  removeUser(username: string, options?: any, callback?: Callback): Promise<void> | void {
    const args = Array.prototype.slice.call(arguments, 1);
    callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

    options = args.length ? args.shift() : {};
    options = Object.assign({}, options);
    // Get the options
    options = applyWriteConcern(options, { db: this.s.db });
    // Set the db name
    options.dbName = 'admin';

    const removeUserOperation = new RemoveUserOperation(this.s.db, username, options);
    return executeOperation(this.s.db.s.topology, removeUserOperation, callback);
  }

  /**
   * Validate an existing collection
   *
   * @param {string} collectionName The name of the collection to validate.
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.background] Validates a collection in the background, without interrupting read or write traffic (only in MongoDB 4.4+)
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback.
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  validateCollection(
    collectionName: string,
    options?: any,
    callback?: Callback
  ): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const validateCollectionOperation = new ValidateCollectionOperation(
      this,
      collectionName,
      options
    );

    return executeOperation(this.s.db.s.topology, validateCollectionOperation, callback);
  }

  /**
   * List the available databases
   *
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.nameOnly=false] Whether the command should return only db names, or names and size info.
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback.
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  listDatabases(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.db.s.topology,
      new ListDatabasesOperation(this.s.db, options),
      callback
    );
  }

  /**
   * Get ReplicaSet status
   *
   * @param {object} [options] optional parameters for this operation
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Admin~resultCallback} [callback] The command result callback.
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  replSetGetStatus(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    return this.command({ replSetGetStatus: 1 }, options, callback);
  }
}
