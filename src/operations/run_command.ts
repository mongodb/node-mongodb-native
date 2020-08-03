import { CommandOperation } from './command';
import { defineAspects, Aspect } from './operation';
import Db = require('../db');
import Collection = require('../collection');
import MongoClient = require('../mongo_client');
import { MongoDBNamespace } from '../utils';
import type { Server } from '../sdam/server';

export class RunCommandOperation extends CommandOperation {
  command: any;

  constructor(
    parent: MongoClient | Db | Collection | { s: { namespace: MongoDBNamespace } },
    command: any,
    options: any
  ) {
    super(parent, options);
    this.command = command;
  }

  execute(server: Server, callback: any) {
    const command = this.command;
    this.executeCommand(server, command, callback);
  }
}

export class RunAdminCommandOperation extends RunCommandOperation {
  constructor(parent: MongoClient | Db | Collection, command: any, options: any) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}

defineAspects(RunCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
defineAspects(RunAdminCommandOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);
