'use strict';

const { MongoError } = require('../error');
const Cursor = require('./cursor');
const { CursorState } = require('./core_cursor');
const { deprecate } = require('util');

// type imports
/** @typedef {import('stream').Readable} Readable */
/** @typedef {import('../logger')} Logger */

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
 *     test.equal(null, err);
 *     // Show that duplicate records got dropped
 *     col.aggregation({}, {cursor: {}}).toArray(function(err, items) {
 *       test.equal(null, err);
 *       test.equal(4, items.length);
 *       client.close();
 *     });
 *   });
 * });
 */

/**
 * Creates a new Aggregation Cursor instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class AggregationCursor
 * @extends Cursor
 * @fires AggregationCursor#data
 * @fires AggregationCursor#end
 * @fires AggregationCursor#close
 * @fires AggregationCursor#readable
 * @returns {AggregationCursor} an AggregationCursor instance.
 */
class AggregationCursor extends Cursor {
  constructor(topology, operation, options) {
    super(topology, operation, options);
  }

  /**
   * Set the batch size for the cursor.
   *
   * @function
   * @param {number} value The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @throws {MongoError}
   * @returns {AggregationCursor}
   */
  batchSize(value) {
    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'batchSize requires an integer', driver: true });
    }

    this.operation.options.batchSize = value;
    this.setCursorBatchSize(value);
    return this;
  }

  /**
   * Add a geoNear stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The geoNear stage document.
   * @returns {AggregationCursor}
   */
  geoNear(document) {
    this.operation.addToPipeline({ $geoNear: document });
    return this;
  }

  /**
   * Add a group stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The group stage document.
   * @returns {AggregationCursor}
   */
  group(document) {
    this.operation.addToPipeline({ $group: document });
    return this;
  }

  /**
   * Add a limit stage to the aggregation pipeline
   *
   * @function
   * @param {number} value The state limit value.
   * @returns {AggregationCursor}
   */
  limit(value) {
    this.operation.addToPipeline({ $limit: value });
    return this;
  }

  /**
   * Add a match stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The match stage document.
   * @returns {AggregationCursor}
   */
  match(document) {
    this.operation.addToPipeline({ $match: document });
    return this;
  }

  /**
   * Add a maxTimeMS stage to the aggregation pipeline
   *
   * @function
   * @param {number} value The state maxTimeMS value.
   * @returns {AggregationCursor}
   */
  maxTimeMS(value) {
    this.operation.options.maxTimeMS = value;
    return this;
  }

  /**
   * Add a out stage to the aggregation pipeline
   *
   * @function
   * @param {number} destination The destination name.
   * @returns {AggregationCursor}
   */
  out(destination) {
    this.operation.addToPipeline({ $out: destination });
    return this;
  }

  /**
   * Add a project stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The project stage document.
   * @returns {AggregationCursor}
   */
  project(document) {
    this.operation.addToPipeline({ $project: document });
    return this;
  }

  /**
   * Add a lookup stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The lookup stage document.
   * @returns {AggregationCursor}
   */
  lookup(document) {
    this.operation.addToPipeline({ $lookup: document });
    return this;
  }

  /**
   * Add a redact stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The redact stage document.
   * @returns {AggregationCursor}
   */
  redact(document) {
    this.operation.addToPipeline({ $redact: document });
    return this;
  }

  /**
   * Add a skip stage to the aggregation pipeline
   *
   * @function
   * @param {number} value The state skip value.
   * @returns {AggregationCursor}
   */
  skip(value) {
    this.operation.addToPipeline({ $skip: value });
    return this;
  }

  /**
   * Add a sort stage to the aggregation pipeline
   *
   * @function
   * @param {object} document The sort stage document.
   * @returns {AggregationCursor}
   */
  sort(document) {
    this.operation.addToPipeline({ $sort: document });
    return this;
  }

  /**
   * Add a unwind stage to the aggregation pipeline
   *
   * @function
   * @param {number} field The unwind field name.
   * @returns {AggregationCursor}
   */
  unwind(field) {
    this.operation.addToPipeline({ $unwind: field });
    return this;
  }

  /**
   * Return the cursor logger
   *
   * @function
   * @returns {Logger} return the cursor logger
   */
  getLogger() {
    return this.logger;
  }
}

// aliases
AggregationCursor.prototype.get = AggregationCursor.prototype.toArray;

// deprecated methods
deprecate(
  AggregationCursor.prototype.geoNear,
  'The `$geoNear` stage is deprecated in MongoDB 4.0, and removed in version 4.2.'
);

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
 * @param {AggregationCursorResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * Check if there is any document still available in the cursor
 *
 * @function AggregationCursor.prototype.hasNext
 * @param {AggregationCursorResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * The callback format for results
 *
 * @callback AggregationCursorToArrayResultCallback
 * @param {MongoError} [error] An error instance representing the error during the execution.
 * @param {object[]} [documents] All the documents the satisfy the cursor.
 */

/**
 * Returns an array of documents. The caller is responsible for making sure that there
 * is enough memory to store the results. Note that the array only contain partial
 * results when this cursor had been previously accessed. In that case,
 * cursor.rewind() can be used to reset the cursor.
 *
 * @function AggregationCursor.prototype.toArray
 * @param {AggregationCursorToArrayResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * The callback format for results
 *
 * @callback AggregationCursorResultCallback
 * @param {MongoError} [error] An error instance representing the error during the execution.
 * @param {object} [result] The result object if the command was executed successfully.
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
 * @param {AggregationCursorResultCallback} callback The result callback.
 * @throws {MongoError}
 * @returns {null}
 */

/**
 * Close the cursor, sending a AggregationCursor command and emitting close.
 *
 * @function AggregationCursor.prototype.close
 * @param {AggregationCursorResultCallback} [callback] The result callback.
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
 * @param {AggregationCursorResultCallback} [callback] The result callback.
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
 * @callback AggregationCursorIteratorCallback
 * @param {object} doc An emitted document for the iterator
 */

/**
 * The callback error format for the forEach iterator method
 *
 * @callback AggregationCursorEndCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 */

/**
 * Iterates over all the documents for this cursor using the iterator, callback pattern.
 *
 * @function AggregationCursor.prototype.forEach
 * @param {AggregationCursorIteratorCallback} iterator The iteration callback.
 * @param {AggregationCursorEndCallback} callback The end callback.
 * @throws {MongoError}
 * @returns {null}
 */

module.exports = AggregationCursor;
