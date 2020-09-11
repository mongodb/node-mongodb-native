import { MongoError } from '../error';
import { Cursor, CursorState, CursorOptions } from './cursor';
import { deprecate } from 'util';
import type { AggregateOperation, AggregateOptions } from '../operations/aggregate';
import type { Document } from '../bson';
import type { Sort } from '../operations/find';
import type { Topology } from '../sdam/topology';

/** @public */
export interface AggregationCursorOptions extends CursorOptions, AggregateOptions {}

/**
 * The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 * @public
 */
export class AggregationCursor extends Cursor<AggregateOperation, AggregationCursorOptions> {
  /** @internal */
  constructor(
    topology: Topology,
    operation: AggregateOperation,
    options: AggregationCursorOptions = {}
  ) {
    super(topology, operation, options);
  }

  /** Set the batch size for the cursor. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation} */
  batchSize(batchSize: number): this {
    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (typeof batchSize !== 'number') {
      throw new MongoError('batchSize requires an integer');
    }

    this.operation.options.batchSize = batchSize;
    this.cursorBatchSize = batchSize;
    return this;
  }

  /** Add a group stage to the aggregation pipeline */
  group($group: Document): this {
    this.operation.addToPipeline({ $group });
    return this;
  }

  /** Add a limit stage to the aggregation pipeline */
  limit($limit: number): this {
    this.operation.addToPipeline({ $limit });
    return this;
  }

  /** Add a match stage to the aggregation pipeline */
  match($match: Document): this {
    this.operation.addToPipeline({ $match });
    return this;
  }

  /** Add a maxTimeMS stage to the aggregation pipeline */
  maxTimeMS(maxTimeMS: number): this {
    this.operation.options.maxTimeMS = maxTimeMS;
    return this;
  }

  /** Add a out stage to the aggregation pipeline */
  out($out: number): this {
    this.operation.addToPipeline({ $out });
    return this;
  }

  /** Add a project stage to the aggregation pipeline */
  project($project: Document): this {
    this.operation.addToPipeline({ $project });
    return this;
  }

  /** Add a lookup stage to the aggregation pipeline */
  lookup($lookup: Document): this {
    this.operation.addToPipeline({ $lookup });
    return this;
  }

  /** Add a redact stage to the aggregation pipeline */
  redact($redact: Document): this {
    this.operation.addToPipeline({ $redact });
    return this;
  }

  /** Add a skip stage to the aggregation pipeline */
  skip($skip: number): this {
    this.operation.addToPipeline({ $skip });
    return this;
  }

  /** Add a sort stage to the aggregation pipeline */
  sort($sort: Sort): this {
    this.operation.addToPipeline({ $sort });
    return this;
  }

  /** Add a unwind stage to the aggregation pipeline */
  unwind($unwind: number): this {
    this.operation.addToPipeline({ $unwind });
    return this;
  }

  // deprecated methods
  /** @deprecated Add a geoNear stage to the aggregation pipeline */
  geoNear = deprecate(($geoNear: Document) => {
    this.operation.addToPipeline({ $geoNear });
    return this;
  }, 'The `$geoNear` stage is deprecated in MongoDB 4.0, and removed in version 4.2.');
}
