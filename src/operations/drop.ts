import { Aspect, defineAspects } from './operation';
import { handleCallback } from '../utils';
import { CommandOperation } from './command';

export class DropCollectionOperation extends CommandOperation {
  name: any;

  constructor(db: any, name: any, options: any) {
    super(db, options);
    this.name = name;
  }

  execute(server: any, callback: Function) {
    super.executeCommand(server, { drop: this.name }, (err?: any, result?: any) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

export class DropDatabaseOperation extends CommandOperation {
  execute(server: any, callback: Function) {
    super.executeCommand(server, { dropDatabase: 1 }, (err?: any, result?: any) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
