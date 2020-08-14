import { MongoError } from '../error';
import { Cursor, CursorOptions } from './cursor';
import { CursorState } from './core_cursor';
import { deprecate } from 'util';
import type { AggregateOperation, AggregateOptions } from '../operations/aggregate';
import type { Document } from '../types';
import type { Sort } from '../operations/find';
import type { Topology } from '../sdam/topology';

/**
 * @file The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 *
 * **AGGREGATIONCURSOR Cannot directly be instantiated**
 * @example
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Create a collection we want to drop later
 *   const col = client.db(dbName).collection('createIndexExample1');
 *   // Insert a bunch of documents
 *   col.insert([{a:1, b:1}
 *     , {a:2, b:2}, {a:3, b:3}
 *     , {a:4, b:4}], {w:1}, function(err, result) {
 *     expect(err).to.not.exist;
 *     // Show that duplicate records got dropped
 *     col.aggregation({}, {cursor: {}}).toArray(function(err, items) {
 *       expect(err).to.not.exist;
 *       test.equal(4, items.length);
 *       client.close();
 *     });
 *   });
 * });
 */

export interface AggregationCursorOptions extends CursorOptions, AggregateOptions {}

/**
 * Creates a new Aggregation Cursor instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class AggregationCursor
 * @extends external:Readable
 * @fires AggregationCursor#data
 * @fires AggregationCursor#end
 * @fires AggregationCursor#close
 * @fires AggregationCursor#readable
 * @returns {AggregationCursor} an AggregationCursor instance.
 */
export class AggregationCursor extends Cursor<AggregateOperation, AggregationCursorOptions> {
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
