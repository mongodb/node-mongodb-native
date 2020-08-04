import { Aspect, defineAspects } from './operation';
import { CommandOperation } from './command';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';

export class RemoveUserOperation extends CommandOperation {
  username: any;

  constructor(db: any, username: any, options: any) {
    super(db, options);
    this.username = username;
  }

  execute(server: Server, callback: Callback) {
    super.executeCommand(server, { dropUser: this.username }, (err?: any) => {
      callback(err, err ? false : true);
    });
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
