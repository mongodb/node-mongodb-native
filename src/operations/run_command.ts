import { CommandOperation, CommandOperationOptions, Parent } from './command';
import { defineAspects, Aspect } from './operation';
import { MongoDBNamespace } from '../utils';
import type { Server } from '../sdam/server';
import type { Document, Callback } from '../types';

export type RunCommandOptions = CommandOperationOptions;

export class RunCommandOperation<
  T extends RunCommandOptions = RunCommandOptions
> extends CommandOperation<T> {
  command: Document;

  constructor(parent: Parent, command: Document, options?: T) {
    super(parent, options);
    this.command = command;
  }

  execute(server: Server, callback: Callback): void {
    const command = this.command;
    this.executeCommand(server, command, callback);
  }
}

export class RunAdminCommandOperation<
  T extends RunCommandOptions = RunCommandOptions
> extends RunCommandOperation<T> {
  constructor(parent: Parent, command: Document, options?: T) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}

defineAspects(RunCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
defineAspects(RunAdminCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
