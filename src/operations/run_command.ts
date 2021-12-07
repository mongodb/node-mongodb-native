import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, MongoDBNamespace } from '../utils';
import { CommandOperation, CommandOperationOptions, OperationParent } from './command';

/** @public */
export type RunCommandOptions = CommandOperationOptions;

/** @internal */
export class RunCommandOperation<T = Document> extends CommandOperation<T> {
  options: RunCommandOptions;
  command: Document;

  constructor(parent: OperationParent | undefined, command: Document, options?: RunCommandOptions) {
    super(parent, options);
    this.options = options ?? {};
    this.command = command;
  }

  execute(server: Server, session: ClientSession, callback: Callback): void {
    const command = this.command;
    this.executeCommand(server, session, command, callback);
  }
}

export class RunAdminCommandOperation<T = Document> extends RunCommandOperation<T> {
  constructor(parent: OperationParent | undefined, command: Document, options?: RunCommandOptions) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}
