import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Db } from '../db';
import type { ClientSession } from '../sessions';
import { MongoDriverError } from '../error';

/** @public */
export type ProfilingLevelOptions = CommandOperationOptions;

/** @internal */
export class ProfilingLevelOperation extends CommandOperation<string> {
  options: ProfilingLevelOptions;

  constructor(db: Db, options: ProfilingLevelOptions) {
    super(db, options);
    this.options = options;
  }

  execute(server: Server, session: ClientSession, callback: Callback<string>): void {
    super.executeCommand(server, session, { profile: -1 }, (err, doc) => {
      if (err == null && doc.ok === 1) {
        const was = doc.was;
        if (was === 0) return callback(undefined, 'off');
        if (was === 1) return callback(undefined, 'slow_only');
        if (was === 2) return callback(undefined, 'all');
        return callback(new MongoDriverError('Error: illegal profiling level value ' + was));
      } else {
        err != null ? callback(err) : callback(new MongoDriverError('Error with profile command'));
      }
    });
  }
}
