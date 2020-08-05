import type { WriteConcernOptions } from './../collection';
import type { CommandOptions } from './../cmap/wire_protocol/command';
import { CommandOperation } from './command';
import { ReadPreference } from '../read_preference';
import { Aspect, defineAspects } from './operation';
import { applyWriteConcern } from '../utils';
import { loadCollection } from '../dynamic_loaders';
import { MongoError } from '../error';

interface CreateCollectionOperationOptions extends WriteConcernOptions, CommandOptions {
  fsync?: any;
  autoIndexId?: any;
  strict?: any;
  pkFactory?: any;
  readConcern?: any;
  writeConcern?: any;
}

class CreateCollectionOperation extends CommandOperation<CreateCollectionOperationOptions> {
  db: any;
  name: any;

  constructor(db: any, name: any, options: any) {
    super(db, options);
    this.db = db;
    this.name = name;
  }

  execute(server: any, callback: Function) {
    const db = this.db;
    const name = this.name;
    const options = this.options;
    const Collection = loadCollection();

    let listCollectionOptions = Object.assign({ nameOnly: true, strict: false }, options);
    listCollectionOptions = applyWriteConcern(listCollectionOptions, { db }, listCollectionOptions);

    function done(err: any) {
      if (err) {
        return callback(err);
      }

      try {
        callback(
          null,
          new Collection(db, db.s.topology, db.databaseName, name, db.s.pkFactory, options)
        );
      } catch (err) {
        callback(err);
      }
    }

    const cmd = {
      create: name,
      ...options
    };
    delete cmd.w;
    delete cmd.wtimeout;
    delete cmd.j;
    delete cmd.fsync;
    delete cmd.autoIndexId;
    delete cmd.strict;
    delete cmd.serializeFunctions;
    delete cmd.pkFactory;
    delete cmd.raw;
    delete cmd.readPreference;
    delete cmd.session;
    delete cmd.readConcern;
    delete cmd.writeConcern;

    const strictMode = listCollectionOptions.strict;
    if (strictMode) {
      db.listCollections({ name }, listCollectionOptions)
        .setReadPreference(ReadPreference.PRIMARY)
        .toArray((err?: any, collections?: any) => {
          if (err) {
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
export = CreateCollectionOperation;
