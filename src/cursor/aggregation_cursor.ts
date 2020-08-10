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
export class AggregationCursor extends Cursor<AggregationCursorOptions> {
  operation!: AggregateOperation;

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

/**
 * AggregationCursor stream data event, fired for each document in the cursor.
 *
 * @event AggregationCursor#data
 * @type {object}
 */

/**
 * AggregationCursor stream end event
 *
 * @event AggregationCursor#end
 * @type {null}
 */

/**
 * AggregationCursor stream close event
 *
 * @event AggregationCursor#close
 * @type {null}
 */

/**
 * AggregationCursor stream readable event
 *
 * @event AggregationCursor#readable
 * @type {null}
 */

/**
 * Get the next available document from the cursor, returns null if no more documents are available.
 *
 * @function AggregationCursor.prototype.next
 * @param {AggregationCursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * Check if there is any document still available in the cursor
 *
 * @function AggregationCursor.prototype.hasNext
 * @param {AggregationCursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * The callback format for results
 *
 * @callback AggregationCursor~toArrayResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object[]} documents All the documents the satisfy the cursor.
 */

/**
 * Returns an array of documents. The caller is responsible for making sure that there
 * is enough memory to store the results. Note that the array only contain partial
 * results when this cursor had been previously accessed. In that case,
 * cursor.rewind() can be used to reset the cursor.
 *
 * @function AggregationCursor.prototype.toArray
 * @param {AggregationCursor~toArrayResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * The callback format for results
 *
 * @callback AggregationCursor~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

/**
 * Iterates over all the documents for this cursor. As with **{cursor.toArray}**,
 * not all of the elements will be iterated if this cursor had been previously accessed.
 * In that case, **{cursor.rewind}** can be used to reset the cursor. However, unlike
 * **{cursor.toArray}**, the cursor will only hold a maximum of batch size elements
 * at any given time if batch size is specified. Otherwise, the caller is responsible
 * for making sure that the entire result can fit the memory.
 *
 * @function AggregationCursor.prototype.each
 * @deprecated
 * @param {AggregationCursor~resultCallback} callback The result callback.
 * @throws {MongoError}
 * @returns {null}
 */

/**
 * Close the cursor, sending a AggregationCursor command and emitting close.
 *
 * @function AggregationCursor.prototype.close
 * @param {AggregationCursor~resultCallback} [callback] The result callback.
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * Is the cursor closed
 *
 * @function AggregationCursor.prototype.isClosed
 * @returns {boolean}
 */

/**
 * Execute the explain for the cursor
 *
 * @function AggregationCursor.prototype.explain
 * @param {AggregationCursor~resultCallback} [callback] The result callback.
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * Clone the cursor
 *
 * @function AggregationCursor.prototype.clone
 * @returns {AggregationCursor}
 */

/**
 * Resets the cursor
 *
 * @function AggregationCursor.prototype.rewind
 * @returns {AggregationCursor}
 */

/**
 * The callback format for the forEach iterator method
 *
 * @callback AggregationCursor~iteratorCallback
 * @param {object} doc An emitted document for the iterator
 */

/**
 * The callback error format for the forEach iterator method
 *
 * @callback AggregationCursor~endCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 */

/**
 * Iterates over all the documents for this cursor using the iterator, callback pattern.
 *
 * @function AggregationCursor.prototype.forEach
 * @param {AggregationCursor~iteratorCallback} iterator The iteration callback.
 * @param {AggregationCursor~endCallback} callback The end callback.
 * @throws {MongoError}
 * @returns {null}
 */
