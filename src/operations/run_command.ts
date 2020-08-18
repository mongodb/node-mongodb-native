import { CommandOperation, CommandOperationOptions, OperationParent } from './command';
import { defineAspects, Aspect } from './operation';
import { MongoDBNamespace, Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Document } from '../bson';

/** @public */
export type RunCommandOptions = CommandOperationOptions;

/** @internal */
export class RunCommandOperation<
  T extends RunCommandOptions = RunCommandOptions,
  TResult = Document
> extends CommandOperation<T, TResult> {
  command: Document;

  constructor(parent: OperationParent, command: Document, options?: T) {
    super(parent, options);
    this.command = command;
  }

  execute(server: Server, callback: Callback): void {
    const command = this.command;
    this.executeCommand(server, command, callback);
  }
}

export class RunAdminCommandOperation<
  T extends RunCommandOptions = RunCommandOptions,
  TResult = Document
> extends RunCommandOperation<T, TResult> {
  constructor(parent: OperationParent, command: Document, options?: T) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}

defineAspects(RunCommandOperation, [Aspect.NO_INHERIT_OPTIONS]);
defineAspects(RunAdminCommandOperation, [Aspect.NO_INHERIT_OPTIONS]);
