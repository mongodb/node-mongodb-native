import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';
import { MongoDBNamespace } from '../utils';

interface ListDatabasesOperationOptions extends CommandOperationOptions {
  nameOnly?: any;
  filter?: any;
  authorizedDatabases?: any;
}

class ListDatabasesOperation extends CommandOperation<ListDatabasesOperationOptions> {
  constructor(db: any, options: any) {
    super(db, options);
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  execute(server: any, callback: Function) {
    const cmd = { listDatabases: 1 } as any;
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

export = ListDatabasesOperation;
