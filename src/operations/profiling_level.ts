import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export type ProfilingLevelOptions = CommandOperationOptions;
export class ProfilingLevelOperation extends CommandOperation<ProfilingLevelOptions, string> {
  constructor(db: Db, options: ProfilingLevelOptions) {
    super(db, options);
  }

  execute(server: Server, callback: Callback<string>): void {
    super.executeCommand(server, { profile: -1 }, (err, doc) => {
      if (err == null && doc.ok === 1) {
        const was = doc.was;
        if (was === 0) return callback(undefined, 'off');
        if (was === 1) return callback(undefined, 'slow_only');
        if (was === 2) return callback(undefined, 'all');
        return callback(new Error('Error: illegal profiling level value ' + was));
      } else {
        err != null ? callback(err) : callback(new Error('Error with profile command'));
      }
    });
  }
}
