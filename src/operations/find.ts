import { OperationBase, Hint } from './operation';
import { Aspect, defineAspects } from './operation';
import { ReadPreference } from '../read_preference';
import { maxWireVersion, MongoDBNamespace, Callback } from '../utils';
import { MongoError } from '../error';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { InternalCursorState } from '../cursor/core_cursor';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { QueryOptions } from '../cmap/wire_protocol/query';

/** @public */
export type SortDirection = 1 | -1 | 'asc' | 'desc' | { $meta: string };
/** @public */
export type Sort =
  | { [key: string]: SortDirection }
  | [string, SortDirection][]
  | [string, SortDirection];

/** @public */
export interface FindOptions extends QueryOptions {
  /** Sets the limit of documents returned in the query. */
  limit?: number;
  /** Set to sort the documents coming back from the query. Array of indexes, `[['a', 1]]` etc. */
  sort?: Sort;
  /** The fields to return in the query. Object of fields to either include or exclude (one of, not both), `{'a':1, 'b': 1}` **or** `{'a': 0, 'b': 0}` */
  projection?: Document;
  /** @deprecated Use `options.projection` instead */
  fields?: Document;
  /** Set to skip N documents ahead in your query (useful for pagination). */
  skip?: number;
  /** Tell the query to use specific indexes in the query. Object of indexes to use, `{'_id':1}` */
  hint?: Hint;
  /** Explain the query instead of returning the data. */
  explain?: boolean;
  /** @deprecated Snapshot query. */
  snapshot?: boolean;
  /** Specify if the cursor can timeout. */
  timeout?: boolean;
  /** Specify if the cursor is tailable. */
  tailable?: boolean;
  /** Specify if the cursor is a a tailable-await cursor. Requires `tailable` to be true */
  awaitData?: boolean;
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /** Only return the index key. */
  returnKey?: boolean;
  /** @deprecated Limit the number of items to scan. */
  maxScan?: number;
  /** Set index bounds. */
  min?: number;
  /** Set index bounds. */
  max?: number;
  /** Show disk location of results. */
  showDiskLoc?: boolean;
  /** You can put a $comment field on a query to make looking in the profiler logs simpler. */
  comment?: string | Document;
  /** Specify if the cursor should return partial results when querying against a sharded system */
  partial?: boolean;
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
}

/** @internal */
export class FindOperation extends OperationBase<FindOptions, Document> {
  cmd: Document;
  readPreference: ReadPreference;
  cursorState?: InternalCursorState;

  constructor(
    collection: Collection,
    ns: MongoDBNamespace,
    command: Document,
    options: FindOptions
  ) {
    super(options);

    this.ns = ns;
    this.cmd = command;
    this.readPreference = ReadPreference.resolve(collection, this.options);
  }

  execute(server: Server, callback: Callback<Document>): void {
    // copied from `CommandOperationV2`, to be subclassed in the future
    this.server = server;

    if (typeof this.cmd.allowDiskUse !== 'undefined' && maxWireVersion(server) < 4) {
      callback(new MongoError('The `allowDiskUse` option is not supported on MongoDB < 3.2'));
      return;
    }

    // TODO: use `MongoDBNamespace` through and through
    const cursorState = this.cursorState || {};
    server.query(
      this.ns.toString(),
      this.cmd,
      cursorState,
      { fullResult: !!this.fullResponse, ...this.options },
      callback
    );
  }
}

defineAspects(FindOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
