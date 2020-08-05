import { CommandOperation } from './command';
import { defineAspects, Aspect } from './operation';
import { MongoDBNamespace } from '../utils';
import type { Db } from '../db';
import type { Collection } from '../collection';
import type { MongoClient } from '../mongo_client';
import type { Server } from '../sdam/server';

class RunCommandOperation extends CommandOperation {
  command: any;

  constructor(parent: MongoClient | Db | Collection, command: any, options: any) {
    super(parent, options);
    this.command = command;
  }

  execute(server: Server, callback: any) {
    const command = this.command;
    this.executeCommand(server, command, callback);
  }
}

class RunAdminCommandOperation extends RunCommandOperation {
  constructor(parent: MongoClient | Db | Collection, command: any, options: any) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}

defineAspects(RunCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
defineAspects(RunAdminCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
export { RunCommandOperation, RunAdminCommandOperation };
