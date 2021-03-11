import { AggregateOperation, AggregateOptions } from '../operations/aggregate';
import { AbstractCursor, assertUninitialized } from './abstract_cursor';
import { executeOperation, ExecutionResult } from '../operations/execute_operation';
import { mergeOptions } from '../utils';
import type { Document } from '../bson';
import type { Sort } from '../sort';
import type { Topology } from '../sdam/topology';
import type { Callback, MongoDBNamespace } from '../utils';
import type { ClientSession } from '../sessions';
import type { OperationParent } from '../operations/command';
import type { AbstractCursorOptions } from './abstract_cursor';
import type { ExplainVerbosityLike } from '../explain';

/** @public */
export interface AggregationCursorOptions extends AbstractCursorOptions, AggregateOptions {}

const kParent = Symbol('parent');
const kPipeline = Symbol('pipeline');
const kOptions = Symbol('options');

/**
 * The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 * @public
 */
export class AggregationCursor extends AbstractCursor {
  /** @internal */
  [kParent]: OperationParent; // TODO: NODE-2883
  /** @internal */
  [kPipeline]: Document[];
  /** @internal */
  [kOptions]: AggregateOptions;

  /** @internal */
  constructor(
    parent: OperationParent,
    topology: Topology,
    namespace: MongoDBNamespace,
    pipeline: Document[] = [],
    options: AggregateOptions = {}
  ) {
    super(topology, namespace, options);

    this[kParent] = parent;
    this[kPipeline] = pipeline;
    this[kOptions] = options;
  }

  get pipeline(): Document[] {
    return this[kPipeline];
  }

  clone(): AggregationCursor {
    const clonedOptions = mergeOptions({}, this[kOptions]);
    delete clonedOptions.session;
    return new AggregationCursor(this[kParent], this.topology, this.namespace, this[kPipeline], {
      ...clonedOptions
    });
  }

  /** @internal */
  _initialize(session: ClientSession | undefined, callback: Callback<ExecutionResult>): void {
    const aggregateOperation = new AggregateOperation(this[kParent], this[kPipeline], {
      ...this[kOptions],
      ...this.cursorOptions,
      session
    });

    executeOperation(this.topology, aggregateOperation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: NODE-2882
      callback(undefined, { server: aggregateOperation.server, session, response });
    });
  }

  /** Execute the explain for the cursor */
  explain(): Promise<Document>;
  explain(callback: Callback): void;
  explain(verbosity: ExplainVerbosityLike): Promise<Document>;
  explain(
    verbosity?: ExplainVerbosityLike | Callback,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof verbosity === 'function') (callback = verbosity), (verbosity = true);
    if (verbosity === undefined) verbosity = true;

    return executeOperation(
      this.topology,
      new AggregateOperation(this[kParent], this[kPipeline], {
        ...this[kOptions], // NOTE: order matters here, we may need to refine this
        ...this.cursorOptions,
        explain: verbosity
      }),
      callback
    );
  }

  /** Add a group stage to the aggregation pipeline */
  group($group: Document): this {
    assertUninitialized(this);
    this[kPipeline].push({ $group });
    return this;
  }

  /** Add a limit stage to the aggregation pipeline */
  limit($limit: number): this {
    assertUninitialized(this);
    this[kPipeline].push({ $limit });
    return this;
  }

  /** Add a match stage to the aggregation pipeline */
  match($match: Document): this {
    assertUninitialized(this);
    this[kPipeline].push({ $match });
    return this;
  }

  /** Add a out stage to the aggregation pipeline */
  out($out: number): this {
    assertUninitialized(this);
    this[kPipeline].push({ $out });
    return this;
  }

  /** Add a project stage to the aggregation pipeline */
  project($project: Document): this {
    assertUninitialized(this);
    this[kPipeline].push({ $project });
    return this;
  }

  /** Add a lookup stage to the aggregation pipeline */
  lookup($lookup: Document): this {
    assertUninitialized(this);
    this[kPipeline].push({ $lookup });
    return this;
  }

  /** Add a redact stage to the aggregation pipeline */
  redact($redact: Document): this {
    assertUninitialized(this);
    this[kPipeline].push({ $redact });
    return this;
  }

  /** Add a skip stage to the aggregation pipeline */
  skip($skip: number): this {
    assertUninitialized(this);
    this[kPipeline].push({ $skip });
    return this;
  }

  /** Add a sort stage to the aggregation pipeline */
  sort($sort: Sort): this {
    assertUninitialized(this);
    this[kPipeline].push({ $sort });
    return this;
  }

  /** Add a unwind stage to the aggregation pipeline */
  unwind($unwind: number): this {
    assertUninitialized(this);
    this[kPipeline].push({ $unwind });
    return this;
  }

  // deprecated methods
  /** @deprecated Add a geoNear stage to the aggregation pipeline */
  geoNear($geoNear: Document): this {
    assertUninitialized(this);
    this[kPipeline].push({ $geoNear });
    return this;
  }
}
