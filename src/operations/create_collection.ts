import { CommandOperation } from './command';
import { Aspect, defineAspects } from './operation';
import { loadCollection } from '../dynamic_loaders';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';

const ILLEGAL_COMMAND_FIELDS = new Set([
  'w',
  'wtimeout',
  'j',
  'fsync',
  'autoIndexId',
  'serializeFunctions',
  'pkFactory',
  'raw',
  'readPreference',
  'session',
  'readConcern',
  'writeConcern'
]);

export class CreateCollectionOperation extends CommandOperation {
  db: any;
  name: any;

  constructor(db: any, name: any, options: any) {
    super(db, options);
    this.db = db;
    this.name = name;
  }

  execute(server: Server, callback: Callback) {
    const db = this.db;
    const name = this.name;
    const options = this.options;
    const Collection = loadCollection();

    function done(err: any) {
      if (err) {
        return callback(err);
      }

      try {
        callback(
          undefined,
          new Collection(db, db.s.topology, db.databaseName, name, db.s.pkFactory, options)
        );
      } catch (err) {
        callback(err);
      }
    }

    const cmd: any = { create: name };
    for (const n in options) {
      if (
        options[n] != null &&
        typeof options[n] !== 'function' &&
        !ILLEGAL_COMMAND_FIELDS.has(n)
      ) {
        cmd[n] = options[n];
      }
    }

    // otherwise just execute the command
    super.executeCommand(server, cmd, done);
  }
}

defineAspects(CreateCollectionOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
