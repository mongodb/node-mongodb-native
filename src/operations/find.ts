import type { Document } from '../bson';
import type { Collection } from '../collection';
import { MongoInvalidArgumentError } from '../error';
import { ReadConcern } from '../read_concern';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { formatSort, type Sort } from '../sort';
import {
  type Callback,
  decorateWithExplain,
  type MongoDBNamespace,
  normalizeHintField
} from '../utils';
import { type CollationOptions, CommandOperation, type CommandOperationOptions } from './command';
import { Aspect, defineAspects, type Hint } from './operation';

/**
 * @public
 * @typeParam TSchema - Unused schema definition, deprecated usage, only specify `FindOptions` with no generic
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface FindOptions<TSchema extends Document = Document>
  extends Omit<CommandOperationOptions, 'writeConcern'> {
  /** Sets the limit of documents returned in the query. */
  limit?: number;
  /** Set to sort the documents coming back from the query. Array of indexes, `[['a', 1]]` etc. */
  sort?: Sort;
  /** The fields to return in the query. Object of fields to either include or exclude (one of, not both), `{'a':1, 'b': 1}` **or** `{'a': 0, 'b': 0}` */
  projection?: Document;
  /** Set to skip N documents ahead in your query (useful for pagination). */
  skip?: number;
  /** Tell the query to use specific indexes in the query. Object of indexes to use, `{'_id':1}` */
  hint?: Hint;
  /** Specify if the cursor can timeout. */
  timeout?: boolean;
  /** Specify if the cursor is tailable. */
  tailable?: boolean;
  /** Specify if the cursor is a tailable-await cursor. Requires `tailable` to be true */
  awaitData?: boolean;
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /** If true, returns only the index keys in the resulting documents. */
  returnKey?: boolean;
  /** The inclusive lower bound for a specific index */
  min?: Document;
  /** The exclusive upper bound for a specific index */
  max?: Document;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. Requires `tailable` and `awaitData` to be true */
  maxAwaitTimeMS?: number;
  /** The server normally times out idle cursors after an inactivity period (10 minutes) to prevent excess memory use. Set this option to prevent that. */
  noCursorTimeout?: boolean;
  /** Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields). */
  collation?: CollationOptions;
  /** Allows disk use for blocking sort operations exceeding 100MB memory. (MongoDB 3.2 or higher) */
  allowDiskUse?: boolean;
  /** Determines whether to close the cursor after the first batch. Defaults to false. */
  singleBatch?: boolean;
  /** For queries against a sharded collection, allows the command (or subsequent getMore commands) to return partial results, rather than an error, if one or more queried shards are unavailable. */
  allowPartialResults?: boolean;
  /** Determines whether to return the record identifier for each document. If true, adds a field $recordId to the returned documents. */
  showRecordId?: boolean;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;
  /**
   * Option to enable an optimized code path for queries looking for a particular range of `ts` values in the oplog. Requires `tailable` to be true.
   * @deprecated Starting from MongoDB 4.4 this flag is not needed and will be ignored.
   */
  oplogReplay?: boolean;
}

/** @internal */
export class FindOperation extends CommandOperation<Document> {
  /**
   * @remarks WriteConcern can still be present on the options because
   * we inherit options from the client/db/collection.  The
   * key must be present on the options in order to delete it.
   * This allows typescript to delete the key but will
   * not allow a writeConcern to be assigned as a property on options.
   */
  override options: FindOptions & { writeConcern?: never };
  filter: Document;

  constructor(
    collection: Collection | undefined,
    ns: MongoDBNamespace,
    filter: Document = {},
    options: FindOptions = {}
  ) {
    super(collection, options);

    this.options = { ...options };
    delete this.options.writeConcern;
    this.ns = ns;

    if (typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MongoInvalidArgumentError('Query filter must be a plain object or ObjectId');
    }

    // special case passing in an ObjectId as a filter
    this.filter = filter != null && filter._bsontype === 'ObjectId' ? { _id: filter } : filter;
  }

  override executeCallback(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Document>
  ): void {
    this.server = server;

    const options = this.options;

    let findCommand = makeFindCommand(this.ns, this.filter, options);
    if (this.explain) {
      findCommand = decorateWithExplain(findCommand, this.explain);
    }

    server.command(
      this.ns,
      findCommand,
      {
        ...this.options,
        ...this.bsonOptions,
        documentsReturnedIn: 'firstBatch',
        session
      },
      callback
    );
  }
}

function makeFindCommand(ns: MongoDBNamespace, filter: Document, options: FindOptions): Document {
  const findCommand: Document = {
    find: ns.collection,
    filter
  };

  if (options.sort) {
    findCommand.sort = formatSort(options.sort);
  }

  if (options.projection) {
    let projection = options.projection;
    if (projection && Array.isArray(projection)) {
      projection = projection.length
        ? projection.reduce((result, field) => {
            result[field] = 1;
            return result;
          }, {})
        : { _id: 1 };
    }

    findCommand.projection = projection;
  }

  if (options.hint) {
    findCommand.hint = normalizeHintField(options.hint);
  }

  if (typeof options.skip === 'number') {
    findCommand.skip = options.skip;
  }

  if (typeof options.limit === 'number') {
    if (options.limit < 0) {
      findCommand.limit = -options.limit;
      findCommand.singleBatch = true;
    } else {
      findCommand.limit = options.limit;
    }
  }

  if (typeof options.batchSize === 'number') {
    if (options.batchSize < 0) {
      if (
        options.limit &&
        options.limit !== 0 &&
        Math.abs(options.batchSize) < Math.abs(options.limit)
      ) {
        findCommand.limit = -options.batchSize;
      }

      findCommand.singleBatch = true;
    } else {
      findCommand.batchSize = options.batchSize;
    }
  }

  if (typeof options.singleBatch === 'boolean') {
    findCommand.singleBatch = options.singleBatch;
  }

  // we check for undefined specifically here to allow falsy values
  // eslint-disable-next-line no-restricted-syntax
  if (options.comment !== undefined) {
    findCommand.comment = options.comment;
  }

  if (typeof options.maxTimeMS === 'number') {
    findCommand.maxTimeMS = options.maxTimeMS;
  }

  const readConcern = ReadConcern.fromOptions(options);
  if (readConcern) {
    findCommand.readConcern = readConcern.toJSON();
  }

  if (options.max) {
    findCommand.max = options.max;
  }

  if (options.min) {
    findCommand.min = options.min;
  }

  if (typeof options.returnKey === 'boolean') {
    findCommand.returnKey = options.returnKey;
  }

  if (typeof options.showRecordId === 'boolean') {
    findCommand.showRecordId = options.showRecordId;
  }

  if (typeof options.tailable === 'boolean') {
    findCommand.tailable = options.tailable;
  }

  if (typeof options.oplogReplay === 'boolean') {
    findCommand.oplogReplay = options.oplogReplay;
  }

  if (typeof options.timeout === 'boolean') {
    findCommand.noCursorTimeout = !options.timeout;
  } else if (typeof options.noCursorTimeout === 'boolean') {
    findCommand.noCursorTimeout = options.noCursorTimeout;
  }

  if (typeof options.awaitData === 'boolean') {
    findCommand.awaitData = options.awaitData;
  }

  if (typeof options.allowPartialResults === 'boolean') {
    findCommand.allowPartialResults = options.allowPartialResults;
  }

  if (options.collation) {
    findCommand.collation = options.collation;
  }

  if (typeof options.allowDiskUse === 'boolean') {
    findCommand.allowDiskUse = options.allowDiskUse;
  }

  if (options.let) {
    findCommand.let = options.let;
  }

  return findCommand;
}

defineAspects(FindOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXPLAINABLE,
  Aspect.CURSOR_CREATING
]);
