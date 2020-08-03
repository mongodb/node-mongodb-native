import { Aspect, defineAspects } from './operation';
import { CommandOperation } from './command';

export class RemoveUserOperation extends CommandOperation {
  username: any;

  constructor(db: any, username: any, options: any) {
    super(db, options);
    this.username = username;
  }

  execute(server: any, callback: Function) {
    super.executeCommand(server, { dropUser: this.username }, (err?: any) => {
      callback(err, err ? false : true);
    });
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
