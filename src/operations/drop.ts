import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export type DropCollectionOptions = CommandOperationOptions;

/** @internal */
export class DropCollectionOperation extends CommandOperation<boolean> {
  options: DropCollectionOptions;
  name: string;

  constructor(db: Db, name: string, options: DropCollectionOptions) {
    super(db, options);
    this.options = options;
    this.name = name;
  }

  execute(server: Server, session: ClientSession, callback: Callback<boolean>): void {
    super.executeCommand(server, session, { drop: this.name }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

/** @public */
export type DropDatabaseOptions = CommandOperationOptions;

/** @internal */
export class DropDatabaseOperation extends CommandOperation<boolean> {
  options: DropDatabaseOptions;

  constructor(db: Db, options: DropDatabaseOptions) {
    super(db, options);
    this.options = options;
  }
  execute(server: Server, session: ClientSession, callback: Callback<boolean>): void {
    super.executeCommand(server, session, { dropDatabase: 1 }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION]);
