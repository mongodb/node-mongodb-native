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
   */
  async command(command: Document, options?: RunCommandOptions): Promise<Document> {
    return executeOperation(
      this.s.db.s.client,
      new RunCommandOperation(this.s.db, command, { dbName: 'admin', ...options })
    );
  }

  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   */
  async buildInfo(options?: CommandOperationOptions): Promise<Document> {
    return this.command({ buildinfo: 1 }, options);
  }

  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   */
  async serverInfo(options?: CommandOperationOptions): Promise<Document> {
    return this.command({ buildinfo: 1 }, options);
  }

  /**
   * Retrieve this db's server status.
   *
   * @param options - Optional settings for the command
   */
  async serverStatus(options?: CommandOperationOptions): Promise<Document> {
    return this.command({ serverStatus: 1 }, options);
  }

  /**
   * Ping the MongoDB server and retrieve results
   *
   * @param options - Optional settings for the command
   */
  async ping(options?: CommandOperationOptions): Promise<Document> {
    return this.command({ ping: 1 }, options);
  }

  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param passwordOrOptions - An optional password for the new user, or the options for the command
   * @param options - Optional settings for the command
   */
  async addUser(
    username: string,
    passwordOrOptions?: string | AddUserOptions,
    options?: AddUserOptions
  ): Promise<Document> {
    options =
      options != null && typeof options === 'object'
        ? options
        : passwordOrOptions != null && typeof passwordOrOptions === 'object'
        ? passwordOrOptions
        : undefined;
    const password = typeof passwordOrOptions === 'string' ? passwordOrOptions : undefined;
    return executeOperation(
      this.s.db.s.client,
      new AddUserOperation(this.s.db, username, password, { dbName: 'admin', ...options })
    );
  }

  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   */
  async removeUser(username: string, options?: RemoveUserOptions): Promise<boolean> {
    return executeOperation(
      this.s.db.s.client,
      new RemoveUserOperation(this.s.db, username, { dbName: 'admin', ...options })
    );
  }

  /**
   * Validate an existing collection
   *
   * @param collectionName - The name of the collection to validate.
   * @param options - Optional settings for the command
   */
  async validateCollection(
    collectionName: string,
    options: ValidateCollectionOptions = {}
  ): Promise<Document> {
    return executeOperation(
      this.s.db.s.client,
      new ValidateCollectionOperation(this, collectionName, options)
    );
  }

  /**
   * List the available databases
   *
   * @param options - Optional settings for the command
   */
  async listDatabases(options?: ListDatabasesOptions): Promise<ListDatabasesResult> {
    return executeOperation(this.s.db.s.client, new ListDatabasesOperation(this.s.db, options));
  }

  /**
   * Get ReplicaSet status
   *
   * @param options - Optional settings for the command
   */
  async replSetGetStatus(options?: CommandOperationOptions): Promise<Document> {
    return this.command({ replSetGetStatus: 1 }, options);
  }
}
