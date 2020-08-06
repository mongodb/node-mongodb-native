import { defineAspects, Aspect, OperationOptions } from './operation';
import { CommandOperation } from './command';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export class ProfilingLevelOperation extends CommandOperation {
  constructor(db: Db, options: OperationOptions) {
    super(db, options);
  }

  execute(server: Server, callback: Callback): void {
    super.executeCommand(server, { profile: -1 }, (err, doc) => {
      if (err == null && doc.ok === 1) {
        const was = doc.was;
        if (was === 0) return callback(undefined, 'off');
        if (was === 1) return callback(undefined, 'slow_only');
        if (was === 2) return callback(undefined, 'all');
        return callback(new Error('Error: illegal profiling level value ' + was), null);
      } else {
        err != null ? callback(err, null) : callback(new Error('Error with profile command'), null);
      }
    });
  }
}

defineAspects(ProfilingLevelOperation, [Aspect.EXECUTE_WITH_SELECTION]);
