import { AddUserOperation, AddUserOptions } from './operations/add_user';
import { RemoveUserOperation, RemoveUserOptions } from './operations/remove_user';
import {
  ValidateCollectionOperation,
  ValidateCollectionOptions
} from './operations/validate_collection';
import {
  ListDatabasesOperation,
  ListDatabasesOptions,
  ListDatabasesResult
} from './operations/list_databases';
import { executeOperation } from './operations/execute_operation';
import { RunCommandOperation, RunCommandOptions } from './operations/run_command';
import { Callback, getTopology } from './utils';
import type { Document } from './bson';
import type { CommandOperationOptions } from './operations/command';
import type { Db } from './db';

/** @internal */
export interface AdminPrivate {
  db: Db;
}

/**
 * The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 *
 * **ADMIN Cannot directly be instantiated**
 * @public
 *
 * @example
 * ```js
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
 * ```
 */
export class Admin {
  /** @internal */
  s: AdminPrivate;

  /**
   * Create a new Admin instance
   * @internal
   */
  constructor(db: Db) {
    this.s = { db };
  }

  /**
   * Execute a command
   *
   * @param command - The command to execute
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  command(command: Document): Promise<Document>;
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  command(
    command: Document,
    options?: RunCommandOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({ dbName: 'admin' }, options);

    return executeOperation(
      getTopology(this.s.db),
      new RunCommandOperation(this.s.db, command, options),
      callback
    );
  }

  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  buildInfo(): Promise<Document>;
  buildInfo(callback: Callback<Document>): void;
  buildInfo(options: CommandOperationOptions): Promise<Document>;
  buildInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
  buildInfo(
    options?: CommandOperationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};
    return this.command({ buildinfo: 1 }, options, callback as Callback<Document>);
  }

  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  serverInfo(): Promise<Document>;
  serverInfo(callback: Callback<Document>): void;
  serverInfo(options: CommandOperationOptions): Promise<Document>;
  serverInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
  serverInfo(
    options?: CommandOperationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};
    return this.command({ buildinfo: 1 }, options, callback as Callback<Document>);
  }

  /**
   * Retrieve this db's server status.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  serverStatus(): Promise<Document>;
  serverStatus(callback: Callback<Document>): void;
  serverStatus(options: CommandOperationOptions): Promise<Document>;
  serverStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
  serverStatus(
    options?: CommandOperationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};
    return this.command({ serverStatus: 1 }, options, callback as Callback<Document>);
  }

  /**
   * Ping the MongoDB server and retrieve results
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  ping(): Promise<Document>;
  ping(callback: Callback<Document>): void;
  ping(options: CommandOperationOptions): Promise<Document>;
  ping(options: CommandOperationOptions, callback: Callback<Document>): void;
  ping(
    options?: CommandOperationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};
    return this.command({ ping: 1 }, options, callback as Callback<Document>);
  }

  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param password - An optional password for the new user
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  addUser(username: string): Promise<Document>;
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  addUser(
    username: string,
    password: string,
    options: AddUserOptions,
    callback: Callback<Document>
  ): void;
  addUser(
    username: string,
    password?: string | AddUserOptions | Callback<Document>,
    options?: AddUserOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof password === 'function') {
      (callback = password), (password = undefined), (options = {});
    } else if (typeof password !== 'string') {
      if (typeof options === 'function') {
        (callback = options), (options = password), (password = undefined);
      } else {
        (options = password), (callback = undefined), (password = undefined);
      }
    } else {
      if (typeof options === 'function') (callback = options), (options = {});
    }

    options = Object.assign({ dbName: 'admin' }, options);

    return executeOperation(
      getTopology(this.s.db),
      new AddUserOperation(this.s.db, username, password, options),
      callback
    );
  }

  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  removeUser(username: string): Promise<boolean>;
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  removeUser(
    username: string,
    options?: RemoveUserOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({ dbName: 'admin' }, options);

    return executeOperation(
      getTopology(this.s.db),
      new RemoveUserOperation(this.s.db, username, options),
      callback
    );
  }

  /**
   * Validate an existing collection
   *
   * @param collectionName - The name of the collection to validate.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  validateCollection(collectionName: string): Promise<Document>;
  validateCollection(collectionName: string, callback: Callback<Document>): void;
  validateCollection(collectionName: string, options: ValidateCollectionOptions): Promise<Document>;
  validateCollection(
    collectionName: string,
    options: ValidateCollectionOptions,
    callback: Callback<Document>
  ): void;
  validateCollection(
    collectionName: string,
    options?: ValidateCollectionOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return executeOperation(
      getTopology(this.s.db),
      new ValidateCollectionOperation(this, collectionName, options),
      callback
    );
  }

  /**
   * List the available databases
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  listDatabases(): Promise<ListDatabasesResult>;
  listDatabases(callback: Callback<ListDatabasesResult>): void;
  listDatabases(options: ListDatabasesOptions): Promise<ListDatabasesResult>;
  listDatabases(options: ListDatabasesOptions, callback: Callback<ListDatabasesResult>): void;
  listDatabases(
    options?: ListDatabasesOptions | Callback<ListDatabasesResult>,
    callback?: Callback<ListDatabasesResult>
  ): Promise<ListDatabasesResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return executeOperation(
      getTopology(this.s.db),
      new ListDatabasesOperation(this.s.db, options),
      callback
    );
  }

  /**
   * Get ReplicaSet status
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replSetGetStatus(): Promise<Document>;
  replSetGetStatus(callback: Callback<Document>): void;
  replSetGetStatus(options: CommandOperationOptions): Promise<Document>;
  replSetGetStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
  replSetGetStatus(
    options?: CommandOperationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};
    return this.command({ replSetGetStatus: 1 }, options, callback as Callback<Document>);
  }
}
