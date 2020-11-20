import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Db } from '../db';
import type { Server } from '../sdam/server';

/** @public */
export type DropCollectionOptions = CommandOperationOptions;

/** @internal */
export class DropCollectionOperation extends CommandOperation<DropCollectionOptions, boolean> {
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

/** @public */
export type DropDatabaseOptions = CommandOperationOptions;

/** @internal */
export class DropDatabaseOperation extends CommandOperation<DropDatabaseOptions, boolean> {
  execute(server: Server, callback: Callback<boolean>): void {
    super.executeCommand(server, { dropDatabase: 1 }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION]);
