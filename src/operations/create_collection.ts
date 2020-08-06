import { CommandOperation, CommandOpOptions } from './command';
import { ReadPreference } from '../read_preference';
import { Aspect, defineAspects } from './operation';
import { applyWriteConcern } from '../utils';
import { loadCollection } from '../dynamic_loaders';
import { MongoError } from '../error';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

const ILLEGAL_COMMAND_FIELDS = new Set([
  'w',
  'wtimeout',
  'j',
  'fsync',
  'autoIndexId',
  'strict',
  'serializeFunctions',
  'pkFactory',
  'raw',
  'readPreference',
  'session',
  'readConcern',
  'writeConcern'
]);

export interface CreateCollectionOperationOptions extends CommandOpOptions {
  [key: string]: any;
}

export class CreateCollectionOperation extends CommandOperation {
  db: Db;
  name: string;

  constructor(db: Db, name: string, options: CreateCollectionOperationOptions) {
    super(db, options);
    this.db = db;
    this.name = name;
  }

  execute(server: Server, callback: Callback): void {
    const db = this.db;
    const name = this.name;
    const options: CreateCollectionOperationOptions = this.options;
    const Collection = loadCollection();

    let listCollectionOptions = Object.assign({ nameOnly: true, strict: false }, options);
    listCollectionOptions = applyWriteConcern(listCollectionOptions, { db }, listCollectionOptions);

    const done: Callback = err => {
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
    };

    const cmd: Document = { create: name };
    for (const n in options) {
      if (
        options[n] != null &&
        typeof options[n] !== 'function' &&
        !ILLEGAL_COMMAND_FIELDS.has(n)
      ) {
        cmd[n] = options[n];
      }
    }

    const strictMode = listCollectionOptions.strict;
    if (strictMode) {
      db.listCollections({ name }, listCollectionOptions)
        .setReadPreference(ReadPreference.PRIMARY)
        .toArray((err, collections) => {
          if (err || !collections) {
            return callback(err);
          }

          if (collections.length > 0) {
            return callback(
              new MongoError(`Collection ${name} already exists. Currently in strict mode.`)
            );
          }

          super.executeCommand(server, cmd, done);
        });

      return;
    }

    // otherwise just execute the command
    super.executeCommand(server, cmd, done);
  }
}

defineAspects(CreateCollectionOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
