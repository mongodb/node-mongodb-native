import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';
import { Collection } from '../collection';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Db } from '../db';
import type { PkFactory } from '../mongo_client';
import type { ClientSession } from '../sessions';

const ILLEGAL_COMMAND_FIELDS = new Set([
  'w',
  'wtimeout',
  'j',
  'fsync',
  'autoIndexId',
  'pkFactory',
  'raw',
  'readPreference',
  'session',
  'readConcern',
  'writeConcern',
  'raw',
  'fieldsAsRaw',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'bsonRegExp',
  'serializeFunctions',
  'ignoreUndefined'
]);

/** @public
 * Configuration options for timeseries collections
 * @see https://docs.mongodb.com/manual/core/timeseries-collections/
 */
export interface TimeSeriesCollectionOptions extends Document {
  timeField: string;
  metaField?: string;
  granularity?: 'seconds' | 'minutes' | 'hours' | string;
}

/** @public */
export interface CreateCollectionOptions extends CommandOperationOptions {
  /** Returns an error if the collection does not exist */
  strict?: boolean;
  /** Create a capped collection */
  capped?: boolean;
  /** @deprecated Create an index on the _id field of the document, True by default on MongoDB 2.6 - 3.0 */
  autoIndexId?: boolean;
  /** The size of the capped collection in bytes */
  size?: number;
  /** The maximum number of documents in the capped collection */
  max?: number;
  /** Available for the MMAPv1 storage engine only to set the usePowerOf2Sizes and the noPadding flag */
  flags?: number;
  /** Allows users to specify configuration to the storage engine on a per-collection basis when creating a collection on MongoDB 3.0 or higher */
  storageEngine?: Document;
  /** Allows users to specify validation rules or expressions for the collection. For more information, see Document Validation on MongoDB 3.2 or higher */
  validator?: Document;
  /** Determines how strictly MongoDB applies the validation rules to existing documents during an update on MongoDB 3.2 or higher */
  validationLevel?: string;
  /** Determines whether to error on invalid documents or just warn about the violations but allow invalid documents to be inserted on MongoDB 3.2 or higher */
  validationAction?: string;
  /** Allows users to specify a default configuration for indexes when creating a collection on MongoDB 3.2 or higher */
  indexOptionDefaults?: Document;
  /** The name of the source collection or view from which to create the view. The name is not the full namespace of the collection or view; i.e. does not include the database name and implies the same database as the view to create on MongoDB 3.4 or higher */
  viewOn?: string;
  /** An array that consists of the aggregation pipeline stage. Creates the view by applying the specified pipeline to the viewOn collection or view on MongoDB 3.4 or higher */
  pipeline?: Document[];
  /** A primary key factory function for generation of custom _id keys. */
  pkFactory?: PkFactory;
  /** A document specifying configuration options for timeseries collections. */
  timeseries?: TimeSeriesCollectionOptions;
  /** The number of seconds after which a document in a timeseries collection expires. */
  expireAfterSeconds?: number;
}

/** @internal */
export class CreateCollectionOperation extends CommandOperation<Collection> {
  options: CreateCollectionOptions;
  db: Db;
  name: string;

  constructor(db: Db, name: string, options: CreateCollectionOptions = {}) {
    super(db, options);

    this.options = options;
    this.db = db;
    this.name = name;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Collection>): void {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    const done: Callback = err => {
      if (err) {
        return callback(err);
      }

      callback(undefined, new Collection(db, name, options));
    };

    const cmd: Document = { create: name };
    for (const n in options) {
      if (
        (options as any)[n] != null &&
        typeof (options as any)[n] !== 'function' &&
        !ILLEGAL_COMMAND_FIELDS.has(n)
      ) {
        cmd[n] = (options as any)[n];
      }
    }

    // otherwise just execute the command
    super.executeCommand(server, session, cmd, done);
  }
}

defineAspects(CreateCollectionOperation, [Aspect.WRITE_OPERATION]);
