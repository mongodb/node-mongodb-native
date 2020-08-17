import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';
import { MongoDBNamespace, Callback } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export type ListDatabasesResult = string[] | Document[];
export interface ListDatabasesOptions extends CommandOperationOptions {
  /** A query predicate that determines which databases are listed */
  filter?: Document;
  /** A flag to indicate whether the command should return just the database names, or return both database names and size information */
  nameOnly?: boolean;
  /** A flag that determines which databases are returned based on the user privileges when access control is enabled */
  authorizedDatabases?: boolean;
}

export class ListDatabasesOperation extends CommandOperation<
  ListDatabasesOptions,
  ListDatabasesResult
> {
  constructor(db: Db, options?: ListDatabasesOptions) {
    super(db, options);
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  execute(server: Server, callback: Callback<ListDatabasesResult>): void {
    const cmd: Document = { listDatabases: 1 };
    if (this.options.nameOnly) {
      cmd.nameOnly = Number(cmd.nameOnly);
    }

    if (this.options.filter) {
      cmd.filter = this.options.filter;
    }

    if (typeof this.options.authorizedDatabases === 'boolean') {
      cmd.authorizedDatabases = this.options.authorizedDatabases;
    }

    super.executeCommand(server, cmd, callback);
  }
}

defineAspects(ListDatabasesOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
