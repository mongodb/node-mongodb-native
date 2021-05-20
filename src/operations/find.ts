import { Aspect, defineAspects, Hint } from './operation';
import {
  maxWireVersion,
  MongoDBNamespace,
  Callback,
  normalizeHintField,
  decorateWithExplain
} from '../utils';
import { MongoDriverError } from '../error';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import { CommandOperation, CommandOperationOptions, CollationOptions } from './command';
import { Sort, formatSort } from '../sort';
import { isSharded } from '../cmap/wire_protocol/shared';
import { ReadConcern } from '../read_concern';
import type { ClientSession } from '../sessions';
import type { Projection } from '../mongo_types';

/** @public */
export interface FindOptions<TSchema = Document> extends CommandOperationOptions {
  /** Sets the limit of documents returned in the query. */
  limit?: number;
  /** Set to sort the documents coming back from the query. Array of indexes, `[['a', 1]]` etc. */
  sort?: Sort;
  /** The fields to return in the query. Object of fields to either include or exclude (one of, not both), `{'a':1, 'b': 1}` **or** `{'a': 0, 'b': 0}` */
  projection?: Projection<TSchema>;
  /** Set to skip N documents ahead in your query (useful for pagination). */
  skip?: number;
  /** Tell the query to use specific indexes in the query. Object of indexes to use, `{'_id':1}` */
  hint?: Hint;
  /** Specify if the cursor can timeout. */
  timeout?: boolean;
  /** Specify if the cursor is tailable. */
  tailable?: boolean;
  /** Specify if the cursor is a a tailable-await cursor. Requires `tailable` to be true */
  awaitData?: boolean;
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /** If true, returns only the index keys in the resulting documents. */
  returnKey?: boolean;
  /** The inclusive lower bound for a specific index */
  min?: Document;
  /** The exclusive upper bound for a specific index */
  max?: Document;
  /** You can put a $comment field on a query to make looking in the profiler logs simpler. */
  comment?: string | Document;
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
}

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

/** @internal */
export class FindOperation extends CommandOperation<Document> {
  options: FindOptions;
  filter: Document;

  constructor(
    collection: Collection | undefined,
    ns: MongoDBNamespace,
    filter: Document = {},
    options: FindOptions = {}
  ) {
    super(collection, options);

    this.options = options;
    this.ns = ns;

    if (typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MongoDriverError('Query filter must be a plain object or ObjectId');
    }

    // If the filter is a buffer, validate that is a valid BSON document
    if (Buffer.isBuffer(filter)) {
      const objectSize = filter[0] | (filter[1] << 8) | (filter[2] << 16) | (filter[3] << 24);
      if (objectSize !== filter.length) {
        throw new MongoDriverError(
          `query filter raw message size does not match message header size [${filter.length}] != [${objectSize}]`
        );
      }
    }

    // special case passing in an ObjectId as a filter
    this.filter = filter != null && filter._bsontype === 'ObjectID' ? { _id: filter } : filter;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    this.server = server;

    const serverWireVersion = maxWireVersion(server);
    const options = this.options;
    if (typeof options.allowDiskUse !== 'undefined' && serverWireVersion < 4) {
      callback(new MongoDriverError('The `allowDiskUse` option is not supported on MongoDB < 3.2'));
      return;
    }

    if (options.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      callback(
        new MongoDriverError(
          `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
        )
      );

      return;
    }

    if (serverWireVersion < 4) {
      if (this.readConcern && this.readConcern.level !== 'local') {
        callback(
          new MongoDriverError(
            `server find command does not support a readConcern level of ${this.readConcern.level}`
          )
        );

        return;
      }

      const findCommand = makeLegacyFindCommand(this.ns, this.filter, options);
      if (isSharded(server) && this.readPreference) {
        findCommand.$readPreference = this.readPreference.toJSON();
      }

      server.query(
        this.ns,
        findCommand,
        {
          ...this.options,
          ...this.bsonOptions,
          documentsReturnedIn: 'firstBatch',
          readPreference: this.readPreference
        },
        callback
      );

      return;
    }

    let findCommand = makeFindCommand(this.ns, this.filter, options);
    if (this.explain) {
      findCommand = decorateWithExplain(findCommand, this.explain);
    }

    server.command(
      this.ns,
      findCommand,
      {
        fullResult: !!this.fullResponse,
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

  if (options.comment) {
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

function makeLegacyFindCommand(
  ns: MongoDBNamespace,
  filter: Document,
  options: FindOptions
): Document {
  const findCommand: Document = {
    $query: filter
  };

  if (options.sort) {
    findCommand.$orderby = formatSort(options.sort);
  }

  if (options.hint) {
    findCommand.$hint = normalizeHintField(options.hint);
  }

  if (typeof options.returnKey === 'boolean') {
    findCommand.$returnKey = options.returnKey;
  }

  if (options.max) {
    findCommand.$max = options.max;
  }

  if (options.min) {
    findCommand.$min = options.min;
  }

  if (typeof options.showRecordId === 'boolean') {
    findCommand.$showDiskLoc = options.showRecordId;
  }

  if (options.comment) {
    findCommand.$comment = options.comment;
  }

  if (typeof options.maxTimeMS === 'number') {
    findCommand.$maxTimeMS = options.maxTimeMS;
  }

  if (typeof options.explain !== 'undefined') {
    findCommand.$explain = true;
  }

  return findCommand;
}

defineAspects(FindOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE, Aspect.EXPLAINABLE]);
