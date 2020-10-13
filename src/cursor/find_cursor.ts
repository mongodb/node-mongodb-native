import type { Document } from '../bson';
import { FindOperation, FindOptions } from '../operations/find';
import type { Server } from '../sdam/server';
import type { Topology } from '../sdam/topology';
import type { Callback, MongoDBNamespace } from '../utils';
import { AbstractCursor } from './abstract_cursor';
import type { Sort, SortDirection } from '../operations/find';
import { CountOperation, CountOptions } from '../operations/count';
import { executeOperation } from '../operations/execute_operation';

export class FindCursor extends AbstractCursor {
  filter: Document;
  options: FindOptions;
  isCursor: boolean;

  constructor(
    topology: Topology,
    ns: MongoDBNamespace,
    filter: Document | undefined,
    options: FindOptions = {}
  ) {
    super(topology, ns, options);

    this.filter = filter || {};
    this.options = options;
    this.isCursor = true;
  }

  _initialize(server: Server, callback: Callback<Document>): void {
    const operation = new FindOperation(undefined, this.namespace, this.filter, this.options);
    operation.execute(server, callback);
  }

  /**
   * Set the limit for the cursor.
   *
   * @param value - The limit for the cursor query.
   */
  limit(value: number): this {
    this.options.limit = value;
    return this;
  }

  /**
   * Set the skip for the cursor.
   *
   * @param value - The skip for the cursor query.
   */
  skip(value: number): this {
    this.options.skip = value;
    return this;
  }

  /**
   * Sets a field projection for the query.
   *
   * @param value - The field projection object.
   */
  project(value: Document): this {
    this.options.projection = value;
    return this;
  }

  /**
   * Sets the sort order of the cursor query.
   *
   * @param sort - The key or keys set for the sort.
   * @param direction - The direction of the sorting (1 or -1).
   */
  sort(sort: Sort | string, direction?: SortDirection): this {
    if (typeof sort === 'string') {
      if (direction != null) this.options.sort = [[sort, direction]];
      return this;
    }

    this.options.sort = sort;
    return this;
  }

  /**
   * Get the count of documents for this cursor
   *
   * @param applySkipLimit - Should the count command apply limit and skip settings on the cursor or in the passed in options.
   */

  count(): Promise<number>;
  count(callback: Callback<number>): void;
  count(applySkipLimit: boolean): Promise<number>;
  count(applySkipLimit: boolean, callback: Callback<number>): void;
  count(applySkipLimit: boolean, options: CountOptions): Promise<number>;
  count(applySkipLimit: boolean, options: CountOptions, callback: Callback<number>): void;
  count(
    applySkipLimit?: boolean | CountOptions | Callback<number>,
    options?: CountOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    if (typeof applySkipLimit === 'function') {
      callback = applySkipLimit;
      applySkipLimit = true;
    }

    if (this.session) {
      options = Object.assign({}, options, { session: this.session });
    }

    const countOperation = new CountOperation(this, !!applySkipLimit, options);
    return executeOperation(this.topology, countOperation, callback);
  }
}
