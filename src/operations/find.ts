import { Aspect, defineAspects, Hint } from './operation';
import { ReadPreference } from '../read_preference';
import {
  maxWireVersion,
  MongoDBNamespace,
  Callback,
  formattedOrderClause,
  normalizeHintField
} from '../utils';
import { MongoError } from '../error';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { QueryOptions } from '../cmap/wire_protocol/query';
import { CommandOperation, CommandOperationOptions } from './command';

/** @public */
export type SortDirection = 1 | -1 | 'asc' | 'desc' | { $meta: string };
/** @public */
export type Sort =
  | { [key: string]: SortDirection }
  | [string, SortDirection][]
  | [string, SortDirection];

/** @public */
export interface FindOptions extends QueryOptions, CommandOperationOptions {
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
  /** Explain the query instead of returning the data. */
  explain?: boolean;
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
  /** Set index bounds. */
  min?: number;
  /** Set index bounds. */
  max?: number;
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
  /** Enables writing to temporary files on the server. */
  allowDiskUse?: boolean;
  /** Determines whether to close the cursor after the first batch. Defaults to false. */
  singleBatch?: boolean;
  /** For queries against a sharded collection, allows the command (or subsequent getMore commands) to return partial results, rather than an error, if one or more queried shards are unavailable. */
  allowPartialResults?: boolean;
  /** Determines whether to return the record identifier for each document. If true, adds a field $recordId to the returned documents. */
  showRecordId?: boolean;

  /** @deprecated Use `awaitData` instead */
  awaitdata?: boolean;
  /** @deprecated Use `projection` instead */
  fields?: Document;
  /** @deprecated Limit the number of items to scan. */
  maxScan?: number;
  /** @deprecated An internal command for replaying a replica set’s oplog. */
  oplogReplay?: boolean;
  /** @deprecated Snapshot query. */
  snapshot?: boolean;
  /** @deprecated Show disk location of results. */
  showDiskLoc?: boolean;
  /** @deprecated Use `allowPartialResults` instead */
  partial?: boolean;
}

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

/** @internal */
export class FindOperation extends CommandOperation implements FindOptions {
  cmd: Document;
  filter: Document;
  readPreference: ReadPreference;

  hint?: Hint;
  allowDiskUse: any;
  sort: any;
  projection: any;
  fields: any;
  skip: any;
  limit: any;
  batchSize: any;
  max: any;
  min: any;
  returnKey: any;
  showRecordId: any;
  tailable: any;
  oplogReplay: any;
  timeout: any;
  noCursorTimeout: any;
  awaitData: any;
  awaitdata: any;
  allowPartialResults: any;
  partial: any;
  snapshot: any;
  showDiskLoc: any;
  singleBatch: any;
  raw: boolean;
  promoteLongs: boolean;
  promoteValues: boolean;
  promoteBuffers: boolean;
  ignoreUndefined: boolean;

  constructor(
    collection: Collection,
    ns: MongoDBNamespace,
    filter: Document = {},
    options: FindOptions = {}
  ) {
    super(collection, options);
    this.ns = ns;
    this.readPreference = ReadPreference.resolve(collection, this);

    if (typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MongoError('Query filter must be a plain object or ObjectId');
    }

    // If the filter is a buffer, validate that is a valid BSON document
    if (Buffer.isBuffer(filter)) {
      const objectSize = filter[0] | (filter[1] << 8) | (filter[2] << 16) | (filter[3] << 24);
      if (objectSize !== filter.length) {
        throw new TypeError(
          `query filter raw message size does not match message header size [${filter.length}] != [${objectSize}]`
        );
      }
    }

    // special case passing in an ObjectId as a filter
    this.filter = filter != null && filter._bsontype === 'ObjectID' ? { _id: filter } : filter;

    // FIXME: this should be removed as part of NODE-2790
    this.cmd = {
      find: this.ns.toString(),
      query: this.filter
    };

    this.raw = options.raw ?? collection.s.raw ?? false;
    this.promoteLongs = options.promoteLongs ?? collection.s.promoteLongs ?? true;
    this.promoteValues = options.promoteValues ?? collection.s.promoteValues ?? true;
    this.promoteBuffers = options.promoteBuffers ?? collection.s.promoteBuffers ?? false;
    this.ignoreUndefined = options.ignoreUndefined ?? collection.s.ignoreUndefined ?? false;
  }

  execute(server: Server, callback: Callback<Document>): void {
    // copied from `CommandOperationV2`, to be subclassed in the future
    this.server = server;
    const serverWireVersion = maxWireVersion(server);

    if (typeof this.allowDiskUse !== 'undefined' && serverWireVersion < 4) {
      callback(new MongoError('The `allowDiskUse` option is not supported on MongoDB < 3.2'));
      return;
    }

    const findCommand: Document = Object.assign({}, this.cmd);

    if (this.sort) {
      findCommand.sort = formattedOrderClause(this.sort);
    }

    if (this.projection || this.fields) {
      let projection = this.projection || this.fields;
      if (projection && !Buffer.isBuffer(projection) && Array.isArray(projection)) {
        projection = projection.length
          ? projection.reduce((result, field) => {
              result[field] = 1;
              return result;
            }, {})
          : { _id: 1 };
      }

      findCommand.fields = projection;
    }

    if (this.hint) {
      findCommand.hint = normalizeHintField(this.hint);
    }

    if (typeof this.skip === 'number') {
      findCommand.skip = this.skip;
    }

    if (typeof this.limit === 'number') {
      findCommand.limit = this.limit;
    }

    if (typeof this.batchSize === 'number') {
      findCommand.batchSize = this.batchSize;
    }

    if (typeof this.singleBatch === 'boolean') {
      findCommand.singleBatch = this.singleBatch;
    }

    if (this.comment) {
      findCommand.comment = this.comment;
    }

    if (typeof this.maxTimeMS === 'number') {
      findCommand.maxTimeMS = this.maxTimeMS;
    }

    if (this.readConcern && (!this.session || !this.session.inTransaction())) {
      findCommand.readConcern = this.readConcern;
    }

    if (this.max) {
      findCommand.max = this.max;
    }

    if (this.min) {
      findCommand.min = this.min;
    }

    if (typeof this.returnKey === 'boolean') {
      findCommand.returnKey = this.returnKey;
    }

    if (typeof this.showRecordId === 'boolean') {
      findCommand.showRecordId = this.showRecordId;
    }

    if (typeof this.tailable === 'boolean') {
      findCommand.tailable = this.tailable;
    }

    if (typeof this.oplogReplay === 'boolean') {
      findCommand.oplogReplay = this.oplogReplay;
    }

    if (typeof this.timeout === 'boolean') {
      findCommand.noCursorTimeout = this.timeout;
    } else if (typeof this.noCursorTimeout === 'boolean') {
      findCommand.noCursorTimeout = this.noCursorTimeout;
    }

    if (typeof this.awaitData === 'boolean') {
      findCommand.awaitData = this.awaitData;
    } else if (typeof this.awaitdata === 'boolean') {
      findCommand.awaitData = this.awaitdata;
    }

    if (typeof this.allowPartialResults === 'boolean') {
      findCommand.allowPartialResults = this.allowPartialResults;
    } else if (typeof this.partial === 'boolean') {
      findCommand.allowPartialResults = this.partial;
    }

    if (this.collation) {
      if (serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
        callback(
          new MongoError(
            `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
          )
        );

        return;
      }

      findCommand.collation = this.collation;
    }

    if (typeof this.allowDiskUse === 'boolean') {
      findCommand.allowDiskUse = this.allowDiskUse;
    }

    if (typeof this.snapshot === 'boolean') {
      findCommand.snapshot = this.snapshot;
    }

    if (typeof this.showDiskLoc === 'boolean') {
      findCommand.showDiskLoc = this.showDiskLoc;
    }

    // TODO: use `MongoDBNamespace` through and through
    server.query(
      this.ns.toString(),
      findCommand,
      { fullResult: !!this.fullResponse, ...this },
      callback
    );
  }
}

defineAspects(FindOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
