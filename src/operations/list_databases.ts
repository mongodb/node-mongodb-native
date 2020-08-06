import { CommandOperation } from './command';
import { Aspect, defineAspects } from './operation';
import { MongoDBNamespace } from '../utils';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Db } from '../db';

export interface ListDatabasesOptions {
  /** Whether the command should return only db names, or names and size info. */
  nameOnly?: boolean;
  /** optional session to use for this operation */
  session?: ClientSession;
}

export class ListDatabasesOperation extends CommandOperation {
  constructor(db: Db, options: ListDatabasesOptions) {
    super(db, options);
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  execute(server: Server, callback: Callback): void {
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

defineAspects(ListDatabasesOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);
