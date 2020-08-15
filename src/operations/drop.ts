import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export type DropCollectionOptions = CommandOperationOptions;

export class DropCollectionOperation extends CommandOperation<DropCollectionOptions> {
  name: string;

  constructor(db: Db, name: string, options: DropCollectionOptions) {
    super(db, options);
    this.name = name;
  }

  execute(server: Server, callback: Callback<boolean>): void {
    super.executeCommand(server, { drop: this.name }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

export type DropDatabaseOptions = CommandOperationOptions;
export class DropDatabaseOperation extends CommandOperation<DropDatabaseOptions> {
  execute(server: Server, callback: Callback<boolean>): void {
    super.executeCommand(server, { dropDatabase: 1 }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
