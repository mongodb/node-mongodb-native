import { Aspect, defineAspects } from './operation';
import { handleCallback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export type DropCollectionOptions = CommandOperationOptions;

export class DropCollectionOperation extends CommandOperation<DropCollectionOptions> {
  name: string;

  constructor(db: Db, name: string, options: DropCollectionOptions) {
    super(db, options);
    this.name = name;
  }

  execute(server: Server, callback: Callback): void {
    super.executeCommand(server, { drop: this.name }, (err, result) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

export type DropDatabaseOptions = CommandOperationOptions;
export class DropDatabaseOperation extends CommandOperation<DropDatabaseOptions> {
  execute(server: Server, callback: Callback): void {
    super.executeCommand(server, { dropDatabase: 1 }, (err, result) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
