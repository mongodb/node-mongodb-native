import { defineAspects, Aspect } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Db } from '../db';
const levelValues = new Set(['off', 'slow_only', 'all']);

export enum ProfilingLevel {
  off = 'off',
  slowOnly = 'slow_only',
  all = 'all'
}

export type SetProfilingLevelOptions = CommandOperationOptions;

export class SetProfilingLevelOperation extends CommandOperation<
  SetProfilingLevelOptions,
  ProfilingLevel
> {
  level: ProfilingLevel;
  profile: 0 | 1 | 2;

  constructor(db: Db, level: ProfilingLevel, options: SetProfilingLevelOptions) {
    super(db, options);
    switch (level) {
      case ProfilingLevel.off:
        this.profile = 0;
        break;
      case ProfilingLevel.slowOnly:
        this.profile = 1;
        break;
      case ProfilingLevel.all:
        this.profile = 2;
        break;
      default:
        this.profile = 0;
        break;
    }

    this.level = level;
  }

  execute(server: Server, callback: Callback<ProfilingLevel>): void {
    const level = this.level;

    if (!levelValues.has(level)) {
      return callback(new Error('Error: illegal profiling level value ' + level));
    }

    super.executeCommand(server, { profile: this.profile }, (err, doc) => {
      if (err == null && doc.ok === 1) return callback(undefined, level);
      return err != null ? callback(err) : callback(new Error('Error with profile command'));
    });
  }
}
