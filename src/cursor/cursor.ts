import { emitDeprecatedOptionWarning } from '../utils';
import { PromiseProvider } from '../promise_provider';
import { ReadPreference } from '../read_preference';
import { Transform, PassThrough } from 'stream';
import { deprecate } from 'util';
import { MongoError } from '../error';
import { CoreCursor, CursorState } from './core_cursor';
import { handleCallback, maybePromise, formattedOrderClause } from '../utils';
import { executeOperation } from '../operations/execute_operation';
import { each } from '../operations/cursor_ops';
import { CountOperation } from '../operations/count';
import type { Callback, Document } from '../types';
import type { OperationBase } from '../operations/operation';
import type { CollectionTransform } from '../operations/list_collections';

/**
 * @file The **Cursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 *
 * **CURSORS Cannot directly be instantiated**
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
 *     col.find({}).toArray(function(err, items) {
 *       expect(err).to.not.exist;
 *       test.equal(4, items.length);
 *       client.close();
 *     });
 *   });
 * });
 */

/**
 * Namespace provided by the code module
 *
 * @external CoreCursor
 * @external Readable
 */

// Flags allowed for cursor
const flags = ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'exhaust', 'partial'];
const fields = ['numberOfRetries', 'tailableRetryInterval'];

export interface CursorPrivate {
  /** Transforms functions */
  transforms: CollectionTransform;
  numberOfRetries: number;
  tailableRetryInterval: number;
  currentNumberOfRetries: number;
  explicitlyIgnoreSession: boolean;

  state: number; // Should be enum
}

/**
 * Creates a new Cursor instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class Cursor
 * @extends external:CoreCursor
 * @extends external:Readable
 * @property {string} sortValue Cursor query sort setting.
 * @property {boolean} timeout Is Cursor able to time out.
 * @property {ReadPreference} readPreference Get cursor ReadPreference.
 * @fires Cursor#data
 * @fires Cursor#end
 * @fires Cursor#close
 * @fires Cursor#readable
 * @returns {Cursor} a Cursor instance.
 * @example
 * Cursor cursor options.
 *
 * collection.find({}).project({a:1})                             // Create a projection of field a
 * collection.find({}).skip(1).limit(10)                          // Skip 1 and limit 10
 * collection.find({}).batchSize(5)                               // Set batchSize on cursor to 5
 * collection.find({}).filter({a:1})                              // Set query on the cursor
 * collection.find({}).comment('add a comment')                   // Add a comment to the query, allowing to correlate queries
 * collection.find({}).addCursorFlag('tailable', true)            // Set cursor as tailable
 * collection.find({}).addCursorFlag('noCursorTimeout', true)     // Set cursor as noCursorTimeout
 * collection.find({}).addCursorFlag('awaitData', true)           // Set cursor as awaitData
 * collection.find({}).addCursorFlag('partial', true)             // Set cursor as partial
 * collection.find({}).addQueryModifier('$orderby', {a:1})        // Set $orderby {a:1}
 * collection.find({}).max(10)                                    // Set the cursor max
 * collection.find({}).maxTimeMS(1000)                            // Set the cursor maxTimeMS
 * collection.find({}).min(100)                                   // Set the cursor min
 * collection.find({}).returnKey(true)                            // Set the cursor returnKey
 * collection.find({}).setReadPreference(ReadPreference.PRIMARY)  // Set the cursor readPreference
 * collection.find({}).showRecordId(true)                         // Set the cursor showRecordId
 * collection.find({}).sort([['a', 1]])                           // Sets the sort order of the cursor query
 * collection.find({}).hint('a_1')                                // Set the cursor hint
 *
 * All options are chainable, so one can do the following.
 *
 * collection.find({}).maxTimeMS(1000).maxScan(100).skip(1).toArray(..)
 */
export class Cursor extends CoreCursor {
  /**
   * @param {any} topology
   * @param {any} operation
   * @param {any} [options]
   */
  s: any;
  constructor(topology: any, operation: OperationBase, options?: any) {
    super(topology, operation, options);

    options = options || {};
    if (this.operation) {
      options = this.operation.options;
    }

    emitDeprecatedOptionWarning(options, ['promiseLibrary']);

    // Tailable cursor options
    const numberOfRetries = options.numberOfRetries || 5;
    const tailableRetryInterval = options.tailableRetryInterval || 500;
    const currentNumberOfRetries = numberOfRetries;

    // Internal cursor state
    this.s = {
      // Tailable cursor options
      numberOfRetries: numberOfRetries,
      tailableRetryInterval: tailableRetryInterval,
      currentNumberOfRetries: currentNumberOfRetries,
      // State
      state: CursorState.INIT,
      // explicitlyIgnoreSession
      explicitlyIgnoreSession: !!options.explicitlyIgnoreSession
    };

    // Optional ClientSession
    if (!options.explicitlyIgnoreSession && options.session) {
      this.cursorState.session = options.session;
    }

    // Translate correctly
    if (this.options.noCursorTimeout === true) {
      this.addCursorFlag('noCursorTimeout', true);
    }

    // Get the batchSize
    let batchSize = 1000;
    if (this.cmd.cursor && this.cmd.cursor.batchSize) {
      batchSize = this.cmd.cursor.batchSize;
    } else if (options.cursor && options.cursor.batchSize) {
      batchSize = options.cursor.batchSize;
    } else if (typeof options.batchSize === 'number') {
      batchSize = options.batchSize;
    }

    // Set the batchSize
    this.setCursorBatchSize(batchSize);
  }

  get readPreference() {
    if (this.operation) {
      return this.operation.readPreference;
    }

    return this.options.readPreference;
  }

  get sortValue() {
    return this.cmd.sort;
  }

  _initializeCursor(callback: Callback) {
    if (this.operation && this.operation.session != null) {
      this.cursorState.session = this.operation.session;
    } else {
      // implicitly create a session if one has not been provided
      if (
        !this.s.explicitlyIgnoreSession &&
        !this.cursorState.session &&
        this.topology.hasSessionSupport()
      ) {
        this.cursorState.session = this.topology.startSession({ owner: this });

        if (this.operation) {
          this.operation.session = this.cursorState.session;
        }
      }
    }

    super._initializeCursor(callback);
  }

  /**
   * Check if there is any document still available in the cursor
   *
   * @function
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  hasNext(callback?: Callback): Promise<void> | void {
    if (this.s.state === CursorState.CLOSED || (this.isDead && this.isDead())) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    return maybePromise(callback, (cb: any) => {
      const cursor = this;
      if (cursor.isNotified()) {
        return cb(undefined, false);
      }

      cursor._next((err?: any, doc?: any) => {
        if (err) return cb(err);
        if (doc == null || cursor.s.state === CursorState.CLOSED || cursor.isDead()) {
          return cb(undefined, false);
        }

        cursor.s.state = CursorState.OPEN;
        cursor.cursorState.cursorIndex--;
        cb(undefined, true);
      });
    });
  }

  /**
   * Get the next available document from the cursor, returns null if no more documents are available.
   *
   * @function
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  next(callback?: Callback): Promise<void> | void {
    return maybePromise(callback, (cb: any) => {
      const cursor = this;
      if (cursor.s.state === CursorState.CLOSED || (cursor.isDead && cursor.isDead())) {
        cb(MongoError.create({ message: 'Cursor is closed', driver: true }));
        return;
      }

      if (cursor.s.state === CursorState.INIT && cursor.cmd.sort) {
        try {
          cursor.cmd.sort = formattedOrderClause(cursor.cmd.sort);
        } catch (err) {
          return cb(err);
        }
      }

      cursor._next((err?: any, doc?: any) => {
        if (err) return cb(err);
        cursor.s.state = CursorState.OPEN;
        cb(undefined, doc);
      });
    });
  }

  /**
   * Set the cursor query
   *
   * @function
   * @param {object} filter The filter object used for the cursor.
   * @returns {Cursor}
   */
  filter(filter: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.query = filter;
    return this;
  }

  /**
   * Set the cursor maxScan
   *
   * @function
   * @param {object} maxScan Constrains the query to only scan the specified number of documents when fulfilling the query
   * @deprecated as of MongoDB 4.0
   * @returns {Cursor}
   */
  maxScan(maxScan: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.maxScan = maxScan;
    return this;
  }

  /**
   * Set the cursor hint
   *
   * @function
   * @param {object} hint If specified, then the query system will only consider plans using the hinted index.
   * @returns {Cursor}
   */
  hint(hint: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.hint = hint;
    return this;
  }

  /**
   * Set the cursor min
   *
   * @function
   * @param {object} min Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
   * @returns {Cursor}
   */
  min(min: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.min = min;
    return this;
  }

  /**
   * Set the cursor max
   *
   * @function
   * @param {object} max Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
   * @returns {Cursor}
   */
  max(max: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.max = max;
    return this;
  }

  /**
   * Set the cursor returnKey. If set to true, modifies the cursor to only return the index field or fields for the results of the query, rather than documents. If set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields.
   *
   * @function
   * @param {boolean} value the returnKey value.
   * @returns {Cursor}
   */
  returnKey(value: boolean): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.returnKey = value;
    return this;
  }

  /**
   * Set the cursor showRecordId
   *
   * @function
   * @param {object} value The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
   * @returns {Cursor}
   */
  showRecordId(value: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.showDiskLoc = value;
    return this;
  }

  /**
   * Set the cursor snapshot
   *
   * @function
   * @param {object} value The $snapshot operator prevents the cursor from returning a document more than once because an intervening write operation results in a move of the document.
   * @deprecated as of MongoDB 4.0
   * @returns {Cursor}
   */
  snapshot(value: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.snapshot = value;
    return this;
  }

  /**
   * Set a node.js specific cursor option
   *
   * @function
   * @param {string} field The cursor option to set ['numberOfRetries', 'tailableRetryInterval'].
   * @param {object} value The field value.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  setCursorOption(field: string, value: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (fields.indexOf(field) === -1) {
      throw MongoError.create({
        message: `option ${field} is not a supported option ${fields}`,
        driver: true
      });
    }

    this.s[field] = value;
    if (field === 'numberOfRetries') this.s.currentNumberOfRetries = value;
    return this;
  }

  /**
   * Add a cursor flag to the cursor
   *
   * @function
   * @param {string} flag The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial'].
   * @param {boolean} value The flag boolean value.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  addCursorFlag(flag: string, value: boolean): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (flags.indexOf(flag) === -1) {
      throw MongoError.create({
        message: `flag ${flag} is not a supported flag ${flags}`,
        driver: true
      });
    }

    if (typeof value !== 'boolean') {
      throw MongoError.create({ message: `flag ${flag} must be a boolean value`, driver: true });
    }

    this.cmd[flag] = value;
    return this;
  }

  /**
   * Add a query modifier to the cursor query
   *
   * @function
   * @param {string} name The query modifier (must start with $, such as $orderby etc)
   * @param {string|boolean|number} value The modifier value.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  addQueryModifier(name: string, value: any): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (name[0] !== '$') {
      throw MongoError.create({ message: `${name} is not a valid query modifier`, driver: true });
    }

    // Strip of the $
    const field = name.substr(1);
    // Set on the command
    this.cmd[field] = value;
    // Deal with the special case for sort
    if (field === 'orderby') this.cmd.sort = this.cmd[field];
    return this;
  }

  /**
   * Add a comment to the cursor query allowing for tracking the comment in the log.
   *
   * @function
   * @param {string} value The comment attached to this query.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  comment(value: string): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.comment = value;
    return this;
  }

  /**
   * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
   *
   * @function
   * @param {number} value Number of milliseconds to wait before aborting the tailed query.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  maxAwaitTimeMS(value: number): Cursor {
    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'maxAwaitTimeMS must be a number', driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.maxAwaitTimeMS = value;
    return this;
  }

  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   *
   * @function
   * @param {number} value Number of milliseconds to wait before aborting the query.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  maxTimeMS(value: number): Cursor {
    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'maxTimeMS must be a number', driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.maxTimeMS = value;
    return this;
  }

  /**
   * Sets a field projection for the query.
   *
   * @function
   * @param {object} value The field projection object.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  project(value: object): Cursor {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.fields = value;
    return this;
  }

  /**
   * Sets the sort order of the cursor query.
   *
   * @function
   * @param {(string|Array|object)} keyOrList The key or keys set for the sort.
   * @param {number} [direction] The direction of the sorting (1 or -1).
   * @throws {MongoError}
   * @returns {Cursor}
   */
  sort(keyOrList: any, direction?: number): Cursor {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support sorting", driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    let order = keyOrList;

    // We have an array of arrays, we need to preserve the order of the sort
    // so we will us a Map
    if (Array.isArray(order) && Array.isArray(order[0])) {
      order = new Map(
        order.map((x: any) => {
          const value: any = [x[0], null];
          if (x[1] === 'asc') {
            value[1] = 1;
          } else if (x[1] === 'desc') {
            value[1] = -1;
          } else if (x[1] === 1 || x[1] === -1 || x[1].$meta) {
            value[1] = x[1];
          } else {
            throw new MongoError(
              "Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]"
            );
          }

          return value;
        })
      );
    }

    if (direction != null) {
      order = [[keyOrList, direction]];
    }

    this.cmd.sort = order;
    return this;
  }

  /**
   * Set the batch size for the cursor.
   *
   * @function
   * @param {number} value The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  batchSize(value: number): Cursor {
    if (this.options.tailable) {
      throw MongoError.create({
        message: "Tailable cursor doesn't support batchSize",
        driver: true
      });
    }

    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'batchSize requires an integer', driver: true });
    }

    this.cmd.batchSize = value;
    this.setCursorBatchSize(value);
    return this;
  }

  /**
   * Set the collation options for the cursor.
   *
   * @function
   * @param {object} value The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
   * @throws {MongoError}
   * @returns {Cursor}
   */
  collation(value: object): Cursor {
    this.cmd.collation = value;
    return this;
  }

  /**
   * Set the limit for the cursor.
   *
   * @function
   * @param {number} value The limit for the cursor query.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  limit(value: number): Cursor {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support limit", driver: true });
    }

    if (this.s.state === CursorState.OPEN || this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'limit requires an integer', driver: true });
    }

    this.cmd.limit = value;
    this.setCursorLimit(value);
    return this;
  }

  /**
   * Set the skip for the cursor.
   *
   * @function
   * @param {number} value The skip for the cursor query.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  skip(value: number): Cursor {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support skip", driver: true });
    }

    if (this.s.state === CursorState.OPEN || this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'skip requires an integer', driver: true });
    }

    this.cmd.skip = value;
    this.setCursorSkip(value);
    return this;
  }

  /**
   * The callback format for results
   *
   * @callback Cursor~resultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {(object|null|boolean)} result The result object if the command was executed successfully.
   */

  /**
   * Resets the cursor
   *
   * @function external:CoreCursor#rewind
   * @returns {null}
   */

  /**
   * Iterates over all the documents for this cursor. As with **{cursor.toArray}**,
   * not all of the elements will be iterated if this cursor had been previously accessed.
   * In that case, **{cursor.rewind}** can be used to reset the cursor. However, unlike
   * **{cursor.toArray}**, the cursor will only hold a maximum of batch size elements
   * at any given time if batch size is specified. Otherwise, the caller is responsible
   * for making sure that the entire result can fit the memory.
   *
   * @function
   * @deprecated
   * @param {Cursor~resultCallback} callback The result callback.
   * @throws {MongoError}
   * @returns {void}
   */
  each(callback: Callback): void {
    // Rewind cursor state
    this.rewind();
    // Set current cursor to INIT
    this.s.state = CursorState.INIT;
    // Run the query
    each(this, callback);
  }

  /**
   * The callback format for the forEach iterator method
   *
   * @callback Cursor~iteratorCallback
   * @param {object} doc An emitted document for the iterator
   */

  /**
   * The callback error format for the forEach iterator method
   *
   * @callback Cursor~endCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   */

  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * @function
   * @param {Cursor~iteratorCallback} iterator The iteration callback.
   * @param {Cursor~endCallback} callback The end callback.
   * @throws {MongoError}
   * @returns {Promise<void> | void} if no callback supplied
   */
  forEach(iterator: any, callback?: Callback): Promise<void> | void {
    const Promise = PromiseProvider.get();
    // Rewind cursor state
    this.rewind();

    // Set current cursor to INIT
    this.s.state = CursorState.INIT;

    if (typeof callback === 'function') {
      each(this, (err?: any, doc?: any) => {
        if (err) {
          callback!(err);
          return false;
        }

        if (doc != null) {
          iterator(doc);
          return true;
        }

        if (doc == null && callback) {
          const internalCallback = callback;
          callback = undefined;
          internalCallback(undefined);
          return false;
        }
      });
    } else {
      return new Promise((fulfill: any, reject: any) => {
        each(this, (err?: any, doc?: any) => {
          if (err) {
            reject(err);
            return false;
          } else if (doc == null) {
            fulfill(null);
            return false;
          } else {
            iterator(doc);
            return true;
          }
        });
      });
    }
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @function
   * @param {(string|ReadPreference)} readPreference The new read preference for the cursor.
   * @throws {MongoError}
   * @returns {Cursor}
   */
  setReadPreference(readPreference: any): Cursor {
    if (this.s.state !== CursorState.INIT) {
      throw MongoError.create({
        message: 'cannot change cursor readPreference after cursor has been accessed',
        driver: true
      });
    }

    if (readPreference instanceof ReadPreference) {
      this.options.readPreference = readPreference;
    } else if (typeof readPreference === 'string') {
      this.options.readPreference = ReadPreference.fromString(readPreference);
    } else {
      throw new TypeError('Invalid read preference: ' + readPreference);
    }

    return this;
  }

  /**
   * The callback format for results
   *
   * @callback Cursor~toArrayResultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {object[]} documents All the documents the satisfy the cursor.
   */

  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   *
   * @function
   * @param {Cursor~toArrayResultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  toArray(callback: Callback<Document[]>): Promise<void> | void {
    if (this.options.tailable) {
      throw MongoError.create({
        message: 'Tailable cursor cannot be converted to array',
        driver: true
      });
    }

    return maybePromise(callback, (cb: any) => {
      const cursor = this;
      const items: any = [];
      // Reset cursor
      cursor.rewind();
      cursor.s.state = CursorState.INIT;

      // Fetch all the documents
      const fetchDocs = () => {
        cursor._next((err?: any, doc?: any) => {
          if (err) {
            return handleCallback(cb, err);
          }

          if (doc == null) {
            return cursor.close({ skipKillCursors: true }, () => handleCallback(cb, null, items));
          }

          // Add doc to items
          items.push(doc);

          // Get all buffered objects
          if (cursor.bufferedCount() > 0) {
            const docs = cursor.readBufferedDocuments(cursor.bufferedCount());
            Array.prototype.push.apply(items, docs);
          }

          // Attempt a fetch
          fetchDocs();
        });
      };

      fetchDocs();
    });
  }

  /**
   * The callback format for results
   *
   * @callback Cursor~countResultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {number} count The count of documents.
   */

  /**
   * Get the count of documents for this cursor
   *
   * @function
   * @param {boolean} [applySkipLimit=true] Should the count command apply limit and skip settings on the cursor or in the passed in options.
   * @param {object} [options] Optional settings.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {Cursor~countResultCallback} [callback] The result callback.
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  count(applySkipLimit?: boolean, options?: any, callback?: Callback): Promise<void> | void {
    if (this.cmd.query == null)
      throw MongoError.create({
        message: 'count can only be used with find command',
        driver: true
      });

    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    if (typeof applySkipLimit === 'function') {
      callback = applySkipLimit;
      applySkipLimit = true;
    }

    if (this.cursorState.session) {
      options = Object.assign({}, options, { session: this.cursorState.session });
    }

    const countOperation = new CountOperation(this, !!applySkipLimit, options);
    return executeOperation(this.topology, countOperation, callback);
  }

  /**
   * Close the cursor, sending a KillCursor command and emitting close.
   *
   * @function
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.skipKillCursors] Bypass calling killCursors when closing the cursor.
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  close(options?: any, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, { skipKillCursors: false }, options);
    return maybePromise(callback!, (cb: any) => {
      this.s.state = CursorState.CLOSED;
      if (!options.skipKillCursors) {
        // Kill the cursor
        this.kill();
      }

      this._endSession(() => {
        this.emit('close');
        cb(undefined, this);
      });
    });
  }

  /**
   * Map all documents using the provided function
   *
   * @function
   * @param {Function} [transform] The mapping transformation method.
   * @returns {Cursor}
   */
  map(transform?: Function): Cursor {
    if (this.cursorState.transforms && this.cursorState.transforms.doc) {
      const oldTransform = this.cursorState.transforms.doc;
      this.cursorState.transforms.doc = (doc: any) => {
        return transform!(oldTransform(doc));
      };
    } else {
      this.cursorState.transforms = { doc: transform };
    }

    return this;
  }

  /**
   * Is the cursor closed
   *
   * @function
   * @returns {boolean}
   */
  isClosed(): boolean {
    return this.isDead();
  }

  destroy(err: any) {
    if (err) this.emit('error', err);
    this.pause();
    this.close();
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   *
   * @function
   * @param {object} [options] Optional settings.
   * @param {Function} [options.transform] A transformation method applied to each document emitted by the stream.
   * @returns {Cursor}
   * TODO: replace this method with transformStream in next major release
   */
  stream(options?: any): Cursor {
    this.cursorState.streamOptions = options || {};
    return this;
  }

  /**
   * Return a modified Readable stream that applies a given transform function, if supplied. If none supplied,
   * returns a stream of unmodified docs.
   *
   * @function
   * @param {object} [options] Optional settings.
   * @param {Function} [options.transform] A transformation method applied to each document emitted by the stream.
   */
  transformStream(options?: any) {
    const streamOptions = options || {};
    if (typeof streamOptions.transform === 'function') {
      const stream = new Transform({
        objectMode: true,
        transform(chunk: any, encoding: any, callback: Callback) {
          this.push(streamOptions.transform(chunk));
          callback();
        }
      });

      return this.pipe(stream);
    }

    return this.pipe(new PassThrough({ objectMode: true }));
  }

  /**
   * Execute the explain for the cursor
   *
   * @function
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @returns {Promise<void> | void} returns Promise if no callback passed
   */
  explain(callback?: Callback): Promise<void> | void {
    // NOTE: the next line includes a special case for operations which do not
    //       subclass `CommandOperationV2`. To be removed asap.
    if (this.operation && this.operation.cmd == null) {
      this.operation.options.explain = true;
      this.operation.fullResponse = false;
      return executeOperation(this.topology, this.operation, callback);
    }

    this.cmd.explain = true;

    // Do we have a readConcern
    if (this.cmd.readConcern) {
      delete this.cmd['readConcern'];
    }

    return maybePromise(callback, (cb: any) => {
      CoreCursor.prototype._next.apply(this, [cb]);
    });
  }

  /**
   * Return the cursor logger
   *
   * @function
   * @returns {Logger} return the cursor logger
   */
  getLogger(): any {
    return this.logger;
  }
}

/**
 * Cursor stream data event, fired for each document in the cursor.
 *
 * @event Cursor#data
 * @type {object}
 */

/**
 * Cursor stream end event
 *
 * @event Cursor#end
 * @type {null}
 */

/**
 * Cursor stream close event
 *
 * @event Cursor#close
 * @type {null}
 */

/**
 * Cursor stream readable event
 *
 * @event Cursor#readable
 * @type {null}
 */

// deprecated methods
deprecate(Cursor.prototype.each, 'Cursor.each is deprecated. Use Cursor.forEach instead.');
deprecate(
  Cursor.prototype.maxScan,
  'Cursor.maxScan is deprecated, and will be removed in a later version'
);

deprecate(
  Cursor.prototype.snapshot,
  'Cursor Snapshot is deprecated, and will be removed in a later version'
);
