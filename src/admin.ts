import type { Document } from './bson';
import type { Db } from './db';
import { AddUserOperation, AddUserOptions } from './operations/add_user';
import type { CommandOperationOptions } from './operations/command';
import { executeOperation } from './operations/execute_operation';
import {
  ListDatabasesOperation,
  ListDatabasesOptions,
  ListDatabasesResult
} from './operations/list_databases';
import { RemoveUserOperation, RemoveUserOptions } from './operations/remove_user';
import { RunCommandOperation, RunCommandOptions } from './operations/run_command';
import {
  ValidateCollectionOperation,
  ValidateCollectionOptions
} from './operations/validate_collection';
import type { Callback } from './utils';

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
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * const admin = client.db().admin();
 * const dbInfo = await admin.listDatabases();
 * for (const db of dbInfo.databases) {
 *   console.log(db.name);
 * }
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
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  command(command: Document, callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  command(
    command: Document,
    options?: RunCommandOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({ dbName: 'admin' }, options);

    return executeOperation(
      this.s.db.s.client,
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
  buildInfo(options: CommandOperationOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  buildInfo(callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
  serverInfo(options: CommandOperationOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  serverInfo(callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
  serverStatus(options: CommandOperationOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  serverStatus(callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
  ping(options: CommandOperationOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  ping(callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(username: string, callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(username: string, password: string, callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
      this.s.db.s.client,
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
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  removeUser(username: string, callback: Callback<boolean>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  removeUser(
    username: string,
    options?: RemoveUserOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({ dbName: 'admin' }, options);

    return executeOperation(
      this.s.db.s.client,
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
  validateCollection(collectionName: string, options: ValidateCollectionOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  validateCollection(collectionName: string, callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
      this.s.db.s.client,
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
  listDatabases(options: ListDatabasesOptions): Promise<ListDatabasesResult>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  listDatabases(callback: Callback<ListDatabasesResult>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  listDatabases(options: ListDatabasesOptions, callback: Callback<ListDatabasesResult>): void;
  listDatabases(
    options?: ListDatabasesOptions | Callback<ListDatabasesResult>,
    callback?: Callback<ListDatabasesResult>
  ): Promise<ListDatabasesResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return executeOperation(
      this.s.db.s.client,
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
  replSetGetStatus(options: CommandOperationOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  replSetGetStatus(callback: Callback<Document>): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
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
