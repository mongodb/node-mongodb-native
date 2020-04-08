'use strict';

const ReadPreference = require('../read_preference');
const { MongoError } = require('../error');
const Cursor = require('./cursor');
const { CursorState } = require('./core_cursor');

// type imports
/** @typedef {import('../logger')} Logger */

/**
 * @file The **CommandCursor** class is an internal class that embodies a
 * generalized cursor based on a MongoDB command allowing for iteration over the
 * results returned. It supports one by one document iteration, conversion to an
 * array or can be iterated as a Node 0.10.X or higher stream
 *
 * **CommandCursor Cannot directly be instantiated**
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
 *   const col = client.db(dbName).collection('listCollectionsExample1');
 *   // Insert a bunch of documents
 *   col.insert([{a:1, b:1}
 *     , {a:2, b:2}, {a:3, b:3}
 *     , {a:4, b:4}], {w:1}, function(err, result) {
 *     test.equal(null, err);
 *     // List the database collections available
 *     db.listCollections().toArray(function(err, items) {
 *       test.equal(null, err);
 *       client.close();
 *     });
 *   });
 * });
 */

/**
 * Creates a new Command Cursor instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class CommandCursor
 * @extends Cursor
 * @fires CommandCursor#data
 * @fires CommandCursor#end
 * @fires CommandCursor#close
 * @fires CommandCursor#readable
 * @returns {CommandCursor} an CommandCursor instance.
 */
class CommandCursor extends Cursor {
  constructor(topology, ns, cmd, options) {
    super(topology, ns, cmd, options);
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @function
   * @param {(string|ReadPreference)} readPreference The new read preference for the cursor.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  setReadPreference(readPreference) {
    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (this.s.state !== CursorState.INIT) {
      throw MongoError.create({
        message: 'cannot change cursor readPreference after cursor has been accessed',
        driver: true
      });
    }

    if (readPreference instanceof ReadPreference) {
      this.options.readPreference = readPreference;
    } else if (typeof readPreference === 'string') {
      this.options.readPreference = new ReadPreference(readPreference);
    } else {
      throw new TypeError('Invalid read preference: ' + readPreference);
    }

    return this;
  }

  /**
   * Set the batch size for the cursor.
   *
   * @function
   * @param {number} value The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   * @throws {MongoError}
   * @returns {CommandCursor}
   */
  batchSize(value) {
    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'batchSize requires an integer', driver: true });
    }

    if (this.cmd.cursor) {
      this.cmd.cursor.batchSize = value;
    }

    this.setCursorBatchSize(value);
    return this;
  }

  /**
   * Add a maxTimeMS stage to the aggregation pipeline
   *
   * @function
   * @param {number} value The state maxTimeMS value.
   * @returns {CommandCursor}
   */
  maxTimeMS(value) {
    if (this.topology.lastIsMaster().minWireVersion > 2) {
      this.cmd.maxTimeMS = value;
    }

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
CommandCursor.prototype.get = CommandCursor.prototype.toArray;

/**
 * CommandCursor stream data event, fired for each document in the cursor.
 *
 * @event CommandCursor#data
 * @type {object}
 */

/**
 * CommandCursor stream end event
 *
 * @event CommandCursor#end
 * @type {null}
 */

/**
 * CommandCursor stream close event
 *
 * @event CommandCursor#close
 * @type {null}
 */

/**
 * CommandCursor stream readable event
 *
 * @event CommandCursor#readable
 * @type {null}
 */

/**
 * Get the next available document from the cursor, returns null if no more documents are available.
 *
 * @function CommandCursor.prototype.next
 * @param {CommandCursorResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * Check if there is any document still available in the cursor
 *
 * @function CommandCursor.prototype.hasNext
 * @param {CommandCursorResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * The callback format for results
 *
 * @callback CommandCursorToArrayResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object[]} documents All the documents the satisfy the cursor.
 */

/**
 * Returns an array of documents. The caller is responsible for making sure that there
 * is enough memory to store the results. Note that the array only contain partial
 * results when this cursor had been previously accessed.
 *
 * @function CommandCursor.prototype.toArray
 * @param {CommandCursorToArrayResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * The callback format for results
 *
 * @callback CommandCursorResultCallback
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
 * @function CommandCursor.prototype.each
 * @param {CommandCursorResultCallback} callback The result callback.
 * @throws {MongoError}
 * @returns {null}
 */

/**
 * Close the cursor, sending a KillCursor command and emitting close.
 *
 * @function CommandCursor.prototype.close
 * @param {CommandCursorResultCallback} [callback] The result callback.
 * @returns {Promise} returns Promise if no callback passed
 */

/**
 * Is the cursor closed
 *
 * @function CommandCursor.prototype.isClosed
 * @returns {boolean}
 */

/**
 * Clone the cursor
 *
 * @function CommandCursor.prototype.clone
 * @returns {CommandCursor}
 */

/**
 * Resets the cursor
 *
 * @function CommandCursor.prototype.rewind
 * @returns {CommandCursor}
 */

/**
 * The callback format for the forEach iterator method
 *
 * @callback CommandCursorIteratorCallback
 * @param {object} doc An emitted document for the iterator
 */

/**
 * The callback error format for the forEach iterator method
 *
 * @callback CommandCursorEndCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 */

module.exports = CommandCursor;
