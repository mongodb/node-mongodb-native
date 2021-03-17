import type { Document } from '../bson';
import { MongoError } from '../error';
import type { ExplainVerbosityLike } from '../explain';
import { CountOperation, CountOptions } from '../operations/count';
import { executeOperation, ExecutionResult } from '../operations/execute_operation';
import { FindOperation, FindOptions } from '../operations/find';
import { mergeOptions } from '../utils';
import type { Hint } from '../operations/operation';
import type { CollationOptions } from '../operations/command';
import type { Topology } from '../sdam/topology';
import type { ClientSession } from '../sessions';
import { formatSort, Sort, SortDirection } from '../sort';
import type { Callback, MongoDBNamespace } from '../utils';
import { AbstractCursor, assertUninitialized } from './abstract_cursor';

const kFilter = Symbol('filter');
const kNumReturned = Symbol('numReturned');
const kBuiltOptions = Symbol('builtOptions');

/** @public Flags allowed for cursor */
export const FLAGS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'exhaust',
  'partial'
] as const;

/** @public */
export class FindCursor extends AbstractCursor {
  /** @internal */
  [kFilter]: Document;
  /** @internal */
  [kNumReturned]?: number;
  /** @internal */
  [kBuiltOptions]: FindOptions;

  constructor(
    topology: Topology,
    namespace: MongoDBNamespace,
    filter: Document | undefined,
    options: FindOptions = {}
  ) {
    super(topology, namespace, options);

    this[kFilter] = filter || {};
    this[kBuiltOptions] = options;

    if (typeof options.sort !== 'undefined') {
      this[kBuiltOptions].sort = formatSort(options.sort);
    }
  }

  clone(): FindCursor {
    const clonedOptions = mergeOptions({}, this[kBuiltOptions]);
    delete clonedOptions.session;
    return new FindCursor(this.topology, this.namespace, this[kFilter], {
      ...clonedOptions
    });
  }

  /** @internal */
  _initialize(session: ClientSession | undefined, callback: Callback<ExecutionResult>): void {
    const findOperation = new FindOperation(undefined, this.namespace, this[kFilter], {
      ...this[kBuiltOptions], // NOTE: order matters here, we may need to refine this
      ...this.cursorOptions,
      session
    });

    executeOperation(this.topology, findOperation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: We only need this for legacy queries that do not support `limit`, maybe
      //       the value should only be saved in those cases.
      if (response.cursor) {
        this[kNumReturned] = response.cursor.firstBatch.length;
      } else {
        this[kNumReturned] = response.documents ? response.documents.length : 0;
      }

      // TODO: NODE-2882
      callback(undefined, { server: findOperation.server, session, response });
    });
  }

  /** @internal */
  _getMore(batchSize: number, callback: Callback<Document>): void {
    // NOTE: this is to support client provided limits in pre-command servers
    const numReturned = this[kNumReturned];
    if (numReturned) {
      const limit = this[kBuiltOptions].limit;
      batchSize =
        limit && limit > 0 && numReturned + batchSize > limit ? limit - numReturned : batchSize;

      if (batchSize <= 0) {
        return this.close(callback);
      }
    }

    super._getMore(batchSize, (err, response) => {
      if (err) return callback(err);

      // TODO: wrap this in some logic to prevent it from happening if we don't need this support
      if (response) {
        this[kNumReturned] = this[kNumReturned] + response.cursor.nextBatch.length;
      }

      callback(undefined, response);
    });
  }

  /** Get the count of documents for this cursor */
  count(): Promise<number>;
  count(callback: Callback<number>): void;
  count(options: CountOptions): Promise<number>;
  count(options: CountOptions, callback: Callback<number>): void;
  count(
    options?: CountOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (typeof options === 'boolean') {
      throw new TypeError('Invalid first parameter to count');
    }

    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return executeOperation(
      this.topology,
      new CountOperation(this.namespace, this[kFilter], {
        ...this[kBuiltOptions], // NOTE: order matters here, we may need to refine this
        ...this.cursorOptions,
        ...options
      }),
      callback
    );
  }

  /** Execute the explain for the cursor */
  explain(): Promise<Document>;
  explain(callback: Callback): void;
  explain(verbosity?: ExplainVerbosityLike): Promise<Document>;
  explain(
    verbosity?: ExplainVerbosityLike | Callback,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof verbosity === 'function') (callback = verbosity), (verbosity = true);
    if (verbosity === undefined) verbosity = true;

    return executeOperation(
      this.topology,
      new FindOperation(undefined, this.namespace, this[kFilter], {
        ...this[kBuiltOptions], // NOTE: order matters here, we may need to refine this
        ...this.cursorOptions,
        explain: verbosity
      }),
      callback
    );
  }

  /** Set the cursor query */
  filter(filter: Document): this {
    assertUninitialized(this);
    this[kFilter] = filter;
    return this;
  }

  /**
   * Set the cursor hint
   *
   * @param hint - If specified, then the query system will only consider plans using the hinted index.
   */
  hint(hint: Hint): this {
    assertUninitialized(this);
    this[kBuiltOptions].hint = hint;
    return this;
  }

  /**
   * Set the cursor min
   *
   * @param min - Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
   */
  min(min: Document): this {
    assertUninitialized(this);
    this[kBuiltOptions].min = min;
    return this;
  }

  /**
   * Set the cursor max
   *
   * @param max - Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
   */
  max(max: Document): this {
    assertUninitialized(this);
    this[kBuiltOptions].max = max;
    return this;
  }

  /**
   * Set the cursor returnKey.
   * If set to true, modifies the cursor to only return the index field or fields for the results of the query, rather than documents.
   * If set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields.
   *
   * @param value - the returnKey value.
   */
  returnKey(value: boolean): this {
    assertUninitialized(this);
    this[kBuiltOptions].returnKey = value;
    return this;
  }

  /**
   * Modifies the output of a query by adding a field $recordId to matching documents. $recordId is the internal key which uniquely identifies a document in a collection.
   *
   * @param value - The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
   */
  showRecordId(value: boolean): this {
    assertUninitialized(this);
    this[kBuiltOptions].showRecordId = value;
    return this;
  }

  /**
   * Add a query modifier to the cursor query
   *
   * @param name - The query modifier (must start with $, such as $orderby etc)
   * @param value - The modifier value.
   */
  addQueryModifier(name: string, value: string | boolean | number | Document): this {
    assertUninitialized(this);
    if (name[0] !== '$') {
      throw new MongoError(`${name} is not a valid query modifier`);
    }

    // Strip of the $
    const field = name.substr(1);

    // NOTE: consider some TS magic for this
    switch (field) {
      case 'comment':
        this[kBuiltOptions].comment = value as string | Document;
        break;

      case 'explain':
        this[kBuiltOptions].explain = value as boolean;
        break;

      case 'hint':
        this[kBuiltOptions].hint = value as string | Document;
        break;

      case 'max':
        this[kBuiltOptions].max = value as Document;
        break;

      case 'maxTimeMS':
        this[kBuiltOptions].maxTimeMS = value as number;
        break;

      case 'min':
        this[kBuiltOptions].min = value as Document;
        break;

      case 'orderby':
        this[kBuiltOptions].sort = formatSort(value as string | Document);
        break;

      case 'query':
        this[kFilter] = value as Document;
        break;

      case 'returnKey':
        this[kBuiltOptions].returnKey = value as boolean;
        break;

      case 'showDiskLoc':
        this[kBuiltOptions].showRecordId = value as boolean;
        break;

      default:
        throw new TypeError(`invalid query modifier: ${name}`);
    }

    return this;
  }

  /**
   * Add a comment to the cursor query allowing for tracking the comment in the log.
   *
   * @param value - The comment attached to this query.
   */
  comment(value: string): this {
    assertUninitialized(this);
    this[kBuiltOptions].comment = value;
    return this;
  }

  /**
   * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
   *
   * @param value - Number of milliseconds to wait before aborting the tailed query.
   */
  maxAwaitTimeMS(value: number): this {
    assertUninitialized(this);
    if (typeof value !== 'number') {
      throw new MongoError('maxAwaitTimeMS must be a number');
    }

    this[kBuiltOptions].maxAwaitTimeMS = value;
    return this;
  }

  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   *
   * @param value - Number of milliseconds to wait before aborting the query.
   */
  maxTimeMS(value: number): this {
    assertUninitialized(this);
    if (typeof value !== 'number') {
      throw new MongoError('maxTimeMS must be a number');
    }

    this[kBuiltOptions].maxTimeMS = value;
    return this;
  }

  /**
   * Sets a field projection for the query.
   *
   * @param value - The field projection object.
   */
  project(value: Document): this {
    assertUninitialized(this);
    this[kBuiltOptions].projection = value;
    return this;
  }

  /**
   * Sets the sort order of the cursor query.
   *
   * @param sort - The key or keys set for the sort.
   * @param direction - The direction of the sorting (1 or -1).
   */
  sort(sort: Sort | string, direction?: SortDirection): this {
    assertUninitialized(this);
    if (this[kBuiltOptions].tailable) {
      throw new MongoError('Tailable cursor does not support sorting');
    }

    this[kBuiltOptions].sort = formatSort(sort, direction);
    return this;
  }

  /**
   * Allows disk use for blocking sort operations exceeding 100MB memory. (MongoDB 3.2 or higher)
   *
   * @remarks
   * {@link https://docs.mongodb.com/manual/reference/command/find/#find-cmd-allowdiskuse | find command allowDiskUse documentation}
   */
  allowDiskUse(): this {
    assertUninitialized(this);
    if (!this[kBuiltOptions].sort) {
      throw new MongoError('allowDiskUse requires a sort specification');
    }
    this[kBuiltOptions].allowDiskUse = true;
    return this;
  }

  /**
   * Set the collation options for the cursor.
   *
   * @param value - The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
   */
  collation(value: CollationOptions): this {
    assertUninitialized(this);
    this[kBuiltOptions].collation = value;
    return this;
  }

  /**
   * Set the limit for the cursor.
   *
   * @param value - The limit for the cursor query.
   */
  limit(value: number): this {
    assertUninitialized(this);
    if (this[kBuiltOptions].tailable) {
      throw new MongoError('Tailable cursor does not support limit');
    }

    if (typeof value !== 'number') {
      throw new TypeError('limit requires an integer');
    }

    this[kBuiltOptions].limit = value;
    return this;
  }

  /**
   * Set the skip for the cursor.
   *
   * @param value - The skip for the cursor query.
   */
  skip(value: number): this {
    assertUninitialized(this);
    if (this[kBuiltOptions].tailable) {
      throw new MongoError('Tailable cursor does not support skip');
    }

    if (typeof value !== 'number') {
      throw new TypeError('skip requires an integer');
    }

    this[kBuiltOptions].skip = value;
    return this;
  }
}
