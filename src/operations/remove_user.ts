import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export type RemoveUserOptions = CommandOperationOptions;

export class RemoveUserOperation extends CommandOperation<RemoveUserOptions> {
  username: string;

  constructor(db: Db, username: string, options: RemoveUserOptions) {
    super(db, options);
    this.username = username;
  }

  execute(server: Server, callback: Callback<boolean>): void {
    super.executeCommand(server, { dropUser: this.username }, err => {
      callback(err, err ? false : true);
    });
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
