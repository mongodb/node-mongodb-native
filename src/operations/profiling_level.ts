import type { Db } from '../db';
import { MongoRuntimeError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';

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
        // TODO(NODE-3483)
        return callback(new MongoRuntimeError(`Illegal profiling level value ${was}`));
      } else {
        // TODO(NODE-3483): Consider MongoUnexpectedServerResponseError
        err != null ? callback(err) : callback(new MongoRuntimeError('Error with profile command'));
      }
    });
  }
}
