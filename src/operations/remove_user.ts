import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOpOptions } from './command';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export interface RemoveUserOptions extends CommandOpOptions {
  /** The write concern. */
  w: string | number;
  /** The write concern timeout. */
  wtimeout: number;
  /** Specify a journal write concern. */
  j: boolean;
  /** Specify a file sync write concern. */
  fsync: boolean;
}

export class RemoveUserOperation extends CommandOperation {
  username: string;

  constructor(db: Db, username: string, options: RemoveUserOptions) {
    super(db, options);
    this.username = username;
  }

  execute(server: Server, callback: Callback): void {
    super.executeCommand(server, { dropUser: this.username }, err => {
      callback(err, err ? false : true);
    });
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
