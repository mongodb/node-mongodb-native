import { AggregateOperation } from '../operations/aggregate';
import type { AggregateOptions } from '../operations/aggregate';
import type { Document } from '../bson';
import type { Sort } from '../operations/find';
import type { OperationParent } from '../operations/command';
import type { Topology } from '../sdam/topology';
import { AbstractCursor, AbstractCursorOptions } from './abstract_cursor';
import { Callback, maybePromise, MongoDBNamespace } from '../utils';
import type { Server } from '../sdam/server';

/** @public */
export interface AggregationCursorOptions extends AbstractCursorOptions, AggregateOptions {}

/**
 * The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 * @public
 */
export class AggregationCursor extends AbstractCursor {
  options: AggregationCursorOptions;
  parent: OperationParent;
  pipeline: Document[];

  /** @internal */
  constructor(
    topology: Topology,
    ns: MongoDBNamespace,
    parent: OperationParent,
    pipeline: Document[],
    options: AggregationCursorOptions = {}
  ) {
    super(topology, ns, options);
    this.parent = parent;
    this.pipeline = pipeline;
    this.options = options;
  }

  _initialize(server: Server, callback: Callback<Document>): void {
    const operation = new AggregateOperation(this.parent, this.pipeline, this.options);
    if (this.options.explain) {
      delete operation.readConcern;
      delete operation.writeConcern;
    }
    operation.execute(server, callback);
  }

  /**
   * Execute the explain for the cursor
   *
   * @param callback - The result callback.
   */
  explain(): Promise<unknown>;
  explain(callback: Callback): void;
  explain(callback?: Callback): Promise<unknown> | void {
    this.options.explain = true;
    return maybePromise(callback, done => this.next(done));
  }

  /** Set the batch size for the cursor. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation} */
  batchSize(batchSize: number): this {
    this.options.batchSize = batchSize;
    return this;
  }

  /** Add a group stage to the aggregation pipeline */
  group($group: Document): this {
    this.pipeline.push({ $group });
    return this;
  }

  /** Add a limit stage to the aggregation pipeline */
  limit($limit: number): this {
    this.pipeline.push({ $limit });
    return this;
  }

  /** Add a match stage to the aggregation pipeline */
  match($match: Document): this {
    this.pipeline.push({ $match });
    return this;
  }

  /** Add a maxTimeMS stage to the aggregation pipeline */
  maxTimeMS(maxTimeMS: number): this {
    this.options.maxTimeMS = maxTimeMS;
    return this;
  }

  /** Add a out stage to the aggregation pipeline */
  out($out: number): this {
    this.pipeline.push({ $out });
    return this;
  }

  /** Add a project stage to the aggregation pipeline */
  project($project: Document): this {
    this.pipeline.push({ $project });
    return this;
  }

  /** Add a lookup stage to the aggregation pipeline */
  lookup($lookup: Document): this {
    this.pipeline.push({ $lookup });
    return this;
  }

  /** Add a redact stage to the aggregation pipeline */
  redact($redact: Document): this {
    this.pipeline.push({ $redact });
    return this;
  }

  /** Add a skip stage to the aggregation pipeline */
  skip($skip: number): this {
    this.pipeline.push({ $skip });
    return this;
  }

  /** Add a sort stage to the aggregation pipeline */
  sort($sort: Sort): this {
    this.pipeline.push({ $sort });
    return this;
  }

  /** Add a unwind stage to the aggregation pipeline */
  unwind($unwind: number): this {
    this.pipeline.push({ $unwind });
    return this;
  }

  /** Add a geoNear stage to the aggregation pipeline */
  geoNear($geoNear: Document): this {
    this.pipeline.push({ $geoNear });
    return this;
  }
}
