import { CommandOperation, CommandOperationOptions } from './command';
import { defineAspects, Aspect } from './operation';
import { MongoDBNamespace } from '../utils';
import type { Collection } from '../collection';
import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { Document, Callback } from '../types';

export class RunCommandOperation extends CommandOperation {
  command: Document;

  constructor(parent: Db | Collection, command: Document, options: CommandOperationOptions) {
    super(parent, options);
    this.command = command;
  }

  execute(server: Server, callback: Callback): void {
    const command = this.command;
    this.executeCommand(server, command, callback);
  }
}

export class RunAdminCommandOperation extends RunCommandOperation {
  constructor(parent: Db | Collection, command: Document, options: CommandOperationOptions) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}

defineAspects(RunCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
defineAspects(RunAdminCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
