import { emitDeprecatedOptionWarning } from '../utils';
import { PromiseProvider } from '../promise_provider';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { Transform, PassThrough } from 'stream';
import { deprecate } from 'util';
import { MongoError } from '../error';
import {
  CoreCursor,
  CursorState,
  CoreCursorOptions,
  CoreCursorPrivate,
  StreamOptions,
  CursorCloseOptions,
  DocumentTransforms
} from './core_cursor';
import { maybePromise, formattedOrderClause } from '../utils';
import { executeOperation } from '../operations/execute_operation';
import { each, EachCallback } from '../operations/cursor_ops';
import { CountOperation, CountOptions } from '../operations/count';
import type { Callback, Document, AnyError } from '../types';
import type { Logger } from '../logger';
import type { Topology } from '../sdam/topology';
import type { ClientSession } from '../sessions';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { Sort, SortDirection } from '../operations/find';
import type { Hint, OperationBase } from '../operations/operation';

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

// Flags allowed for cursor
const FLAGS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'exhaust',
  'partial'
] as const;

export type CursorFlag = typeof FLAGS[number];

const FIELDS = ['numberOfRetries', 'tailableRetryInterval'] as const;

export interface CursorPrivate extends CoreCursorPrivate {
  /** Transforms functions */
  transforms?: DocumentTransforms;
  numberOfRetries: number;
  tailableRetryInterval: number;
  currentNumberOfRetries: number;
  explicitlyIgnoreSession: boolean;

  state: number; // Should be enum
}

export interface CursorOptions extends CoreCursorOptions {
  cursorFactory?: typeof Cursor;
  tailableRetryInterval?: number;
  explicitlyIgnoreSession?: boolean;
  cursor?: Cursor;
  /** The internal topology of the created cursor */
  topology?: Topology;
  /** Session to use for the operation */
  numberOfRetries?: number;
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
export class Cursor<
  O extends OperationBase = OperationBase,
  T extends CursorOptions = CursorOptions
> extends CoreCursor<O, T> {
  s: CursorPrivate;
  constructor(topology: Topology, operation: O, options: T = {} as T) {
    super(topology, operation, options);

    if (this.operation) {
      options = this.operation.options as T;
    }

    emitDeprecatedOptionWarning(options, ['promiseLibrary']);

    // Tailable cursor options
    const numberOfRetries = options.numberOfRetries || 5;
    const tailableRetryInterval = options.tailableRetryInterval || 500;
    const currentNumberOfRetries = numberOfRetries;

    // Get the batchSize
    let batchSize = 1000;
    if (this.cmd.cursor && this.cmd.cursor.batchSize) {
      batchSize = this.cmd.cursor.batchSize;
    } else if (options.cursor && options.cursor.batchSize) {
      batchSize = options.cursor.cursorBatchSize ?? 1000;
    } else if (typeof options.batchSize === 'number') {
      batchSize = options.batchSize;
    }
    // Internal cursor state
    this.s = {
      // Tailable cursor options
      numberOfRetries: numberOfRetries,
      tailableRetryInterval: tailableRetryInterval,
      currentNumberOfRetries: currentNumberOfRetries,
      // State
      state: CursorState.INIT,
      // explicitlyIgnoreSession
      explicitlyIgnoreSession: !!options.explicitlyIgnoreSession,
      batchSize
    };

    // Optional ClientSession
    if (!options.explicitlyIgnoreSession && options.session) {
      this.cursorState.session = options.session;
    }

    // Translate correctly
    if (this.options.noCursorTimeout === true) {
      this.addCursorFlag('noCursorTimeout', true);
    }
  }

  get readPreference(): ReadPreference {
    if (this.operation) {
      return this.operation.readPreference!;
    }

    return this.options.readPreference!;
  }

  get sortValue(): Sort {
    return this.cmd.sort;
  }

  _initializeCursor(callback: Callback): void {
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

  /** Check if there is any document still available in the cursor */
  hasNext(callback?: Callback): Promise<void> | void {
    if (this.s.state === CursorState.CLOSED || (this.isDead && this.isDead())) {
      throw new MongoError('Cursor is closed');
    }

    return maybePromise(callback, (cb: Callback) => {
      if (this.isNotified()) {
        return cb(undefined, false);
      }

      this._next((err, doc) => {
        if (err) return cb(err);
        if (doc == null || this.s.state === CursorState.CLOSED || this.isDead()) {
          return cb(undefined, false);
        }

        this.s.state = CursorState.OPEN;
        this.cursorState.cursorIndex--;
        cb(undefined, true);
      });
    });
  }

  /** Get the next available document from the cursor, returns null if no more documents are available. */
  next(callback?: Callback<Document>): Promise<Document> | void {
    return maybePromise(callback, (cb: Callback) => {
      if (this.s.state === CursorState.CLOSED || (this.isDead && this.isDead())) {
        cb(new MongoError('Cursor is closed'));
        return;
      }

      if (this.s.state === CursorState.INIT && this.cmd.sort) {
        try {
          this.cmd.sort = formattedOrderClause(this.cmd.sort);
        } catch (err) {
          return cb(err);
        }
      }

      this._next((err, doc) => {
        if (err) return cb(err);
        this.s.state = CursorState.OPEN;
        cb(undefined, doc);
      });
    });
  }

  /** Set the cursor query */
  filter(filter: Document): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.query = filter;
    return this;
  }

  /**
   * @deprecated Instead, use maxTimeMS option or the helper {@link Cursor.maxTimeMS}.
   * Set the cursor maxScan
   *
   * @param maxScan - Constrains the query to only scan the specified number of documents when fulfilling the query
   */
  maxScan(maxScan: number): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.maxScan = maxScan;
    return this;
  }

  /**
   * Set the cursor hint
   *
   * @param hint - If specified, then the query system will only consider plans using the hinted index.
   */
  hint(hint: Hint): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.hint = hint;
    return this;
  }

  /**
   * Set the cursor min
   *
   * @param min - Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
   */
  min(min: number): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.min = min;
    return this;
  }

  /**
   * Set the cursor max
   *
   * @param max Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
   */
  max(max: number): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.max = max;
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
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.returnKey = value;
    return this;
  }

  /**
   * Modifies the output of a query by adding a field $recordId to matching documents. $recordId is the internal key which uniquely identifies a document in a collection.
   *
   * @param value - The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
   */
  showRecordId(value: boolean): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.showDiskLoc = value;
    return this;
  }

  /**
   * Set the cursor snapshot
   *
   * @deprecated as of MongoDB 4.0
   *
   * @param value - The $snapshot operator prevents the cursor from returning a document more than once because an intervening write operation results in a move of the document.
   */
  snapshot(value: boolean): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.snapshot = value;
    return this;
  }

  /**
   * Set a node.js specific cursor option
   *
   * @param field - The cursor option to set 'numberOfRetries' | 'tailableRetryInterval'.
   *
   * @param value - The field value.
   */
  setCursorOption(field: typeof FIELDS[number], value: number): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (!FIELDS.includes(field)) {
      throw new MongoError(`option ${field} is not a supported option ${FIELDS}`);
    }

    Object.assign(this.s, { [field]: value });
    if (field === 'numberOfRetries') this.s.currentNumberOfRetries = value as number;
    return this;
  }

  /**
   * Add a cursor flag to the cursor
   *
   * @param flag The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
   *
   * @param value - The flag boolean value.
   */
  addCursorFlag(flag: CursorFlag, value: boolean): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (!FLAGS.includes(flag)) {
      throw new MongoError(`flag ${flag} is not a supported flag ${FLAGS}`);
    }

    if (typeof value !== 'boolean') {
      throw new MongoError(`flag ${flag} must be a boolean value`);
    }

    this.cmd[flag] = value;
    return this;
  }

  /**
   * Add a query modifier to the cursor query
   *
   * @param name - The query modifier (must start with $, such as $orderby etc)
   * @param value - The modifier value.
   */
  addQueryModifier(name: string, value: string | boolean | number): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (name[0] !== '$') {
      throw new MongoError(`${name} is not a valid query modifier`);
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
   * @param value - The comment attached to this query.
   */
  comment(value: string): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.comment = value;
    return this;
  }

  /**
   * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
   *
   * @param value - Number of milliseconds to wait before aborting the tailed query.
   */
  maxAwaitTimeMS(value: number): this {
    if (typeof value !== 'number') {
      throw new MongoError('maxAwaitTimeMS must be a number');
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.maxAwaitTimeMS = value;
    return this;
  }

  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   *
   * @param value - Number of milliseconds to wait before aborting the query.
   */
  maxTimeMS(value: number): this {
    if (typeof value !== 'number') {
      throw new MongoError('maxTimeMS must be a number');
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.maxTimeMS = value;
    return this;
  }

  /**
   * Sets a field projection for the query.
   *
   * @param value The field projection object.
   */
  project(value: Document): this {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.fields = value;
    return this;
  }

  /**
   * Sets the sort order of the cursor query.
   *
   * @param sort - The key or keys set for the sort.
   * @param direction - The direction of the sorting (1 or -1).
   */
  sort(sort: Sort | string, direction?: SortDirection): this {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support sorting", driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    let order = sort;

    // We have an array of arrays, we need to preserve the order of the sort
    // so we will us a Map
    if (Array.isArray(order) && Array.isArray(order[0])) {
      this.cmd.sort = new Map<string, unknown>(
        (order as [string, SortDirection][]).map(([key, dir]) => {
          if (dir === 'asc') {
            return [key, 1];
          } else if (dir === 'desc') {
            return [key, -1];
          } else if (dir === 1 || dir === -1 || dir.$meta) {
            return [key, dir];
          } else {
            throw new MongoError(
              "Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]"
            );
          }

          return [key, null];
        })
      );

      return this;
    }

    if (direction != null) {
      order = [[sort as string, direction]];
    }

    this.cmd.sort = order;
    return this;
  }

  /**
   * Set the batch size for the cursor.
   *
   * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   */
  batchSize(value: number): this {
    if (this.options.tailable) {
      throw new MongoError('Tailable cursor does not support batchSize');
    }

    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (typeof value !== 'number') {
      throw new MongoError('batchSize requires an integer');
    }

    this.cmd.batchSize = value;
    this.cursorBatchSize = value;
    return this;
  }

  /**
   * Set the collation options for the cursor.
   *
   * @param value - The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
   */
  collation(value: CollationOptions): this {
    this.cmd.collation = value;
    return this;
  }

  /**
   * Set the limit for the cursor.
   *
   * @param value - The limit for the cursor query.
   */
  limit(value: number): this {
    if (this.options.tailable) {
      throw new MongoError('Tailable cursor does not support limit');
    }

    if (this.s.state === CursorState.OPEN || this.s.state === CursorState.CLOSED || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (typeof value !== 'number') {
      throw new MongoError('limit requires an integer');
    }

    this.cmd.limit = value;
    this.cursorLimit = value;
    return this;
  }

  /**
   * Set the skip for the cursor.
   *
   * @param value - The skip for the cursor query.
   */
  skip(value: number): this {
    if (this.options.tailable) {
      throw new MongoError('Tailable cursor does not support skip');
    }

    if (this.s.state === CursorState.OPEN || this.s.state === CursorState.CLOSED || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (typeof value !== 'number') {
      throw new MongoError('skip requires an integer');
    }

    if (this.cmd) {
      this.cmd.skip = value;
    }
    this.cursorSkip = value;
    return this;
  }

  /**
   * @deprecated
   * Iterates over all the documents for this cursor. As with **{cursor.toArray}**,
   * not all of the elements will be iterated if this cursor had been previously accessed.
   * In that case, **{cursor.rewind}** can be used to reset the cursor. However, unlike
   * **{cursor.toArray}**, the cursor will only hold a maximum of batch size elements
   * at any given time if batch size is specified. Otherwise, the caller is responsible
   * for making sure that the entire result can fit the memory.
   */
  each(callback: EachCallback): void {
    // Rewind cursor state
    this.rewind();
    // Set current cursor to INIT
    this.s.state = CursorState.INIT;
    // Run the query
    each(this, callback);
  }

  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * @param iterator - The iteration callback.
   * @param callback - The end callback.
   */
  forEach(iterator: (doc: Document) => void, callback?: Callback): Promise<Document> | void {
    const Promise = PromiseProvider.get();
    // Rewind cursor state
    this.rewind();

    // Set current cursor to INIT
    this.s.state = CursorState.INIT;

    if (typeof callback === 'function') {
      each(this, (err, doc) => {
        if (err) {
          callback(err);
          return false;
        }

        if (doc != null) {
          iterator(doc);
          return true;
        }

        if (doc == null) {
          callback(undefined);
          return false;
        }
      });
    } else {
      return new Promise<Document>((fulfill, reject) => {
        each(this, (err, doc) => {
          if (err) {
            reject(err);
            return false;
          } else if (doc == null) {
            fulfill();
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
   * @param readPreference - The new read preference for the cursor.
   */
  setReadPreference(readPreference: ReadPreferenceLike): this {
    if (this.s.state !== CursorState.INIT) {
      throw new MongoError('cannot change cursor readPreference after cursor has been accessed');
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
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   *
   * @param callback - The result callback.
   */
  toArray(): Promise<Document[]>;
  toArray(callback: Callback<Document[]>): void;
  toArray(callback?: Callback<Document[]>): Promise<Document[]> | void {
    if (this.options.tailable) {
      throw new MongoError('Tailable cursor cannot be converted to array');
    }

    return maybePromise(callback, (cb: Callback) => {
      const items: Document[] = [];
      // Reset cursor
      this.rewind();
      this.s.state = CursorState.INIT;

      // Fetch all the documents
      const fetchDocs = () => {
        this._next((err, doc) => {
          if (err) {
            return cb(err);
          }

          if (doc == null) {
            return this.close({ skipKillCursors: true }, () => cb(undefined, items));
          }

          // Add doc to items
          items.push(doc);

          // Get all buffered objects
          if (this.bufferedCount() > 0) {
            const docs = this.readBufferedDocuments(this.bufferedCount());
            items.push(...docs);
          }

          // Attempt a fetch
          fetchDocs();
        });
      };

      fetchDocs();
    });
  }

  /**
   * Get the count of documents for this cursor
   *
   * @param applySkipLimit - Should the count command apply limit and skip settings on the cursor or in the passed in options.
   */
  count(
    applySkipLimit?: boolean,
    options?: CountOptions,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (this.cmd.query == null) {
      throw new MongoError('count can only be used with find command');
    }

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

  /** Close the cursor, sending a KillCursor command and emitting close. */
  close(): void;
  close(callback: Callback): void;
  close(options: CursorCloseOptions): Promise<void>;
  close(options: CursorCloseOptions, callback: Callback): void;
  close(
    optionsOrCallback?: CursorCloseOptions | Callback,
    callback?: Callback
  ): Promise<void> | void {
    const options =
      typeof optionsOrCallback === 'function' ? { skipKillCursors: false } : optionsOrCallback!;
    callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

    return maybePromise(callback, (cb: Callback) => {
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
   * @param transform - The mapping transformation method.
   */
  map(transform: DocumentTransforms['doc']): this {
    if (this.cursorState.transforms && this.cursorState.transforms.doc) {
      const oldTransform = this.cursorState.transforms.doc;
      this.cursorState.transforms.doc = doc => {
        return transform(oldTransform(doc));
      };
    } else {
      this.cursorState.transforms = { doc: transform };
    }

    return this;
  }

  isClosed(): boolean {
    return this.isDead();
  }

  destroy(err?: AnyError): void {
    if (err) this.emit('error', err);
    this.pause();
    this.close();
  }

  /** Return a modified Readable stream including a possible transform method. */
  stream(options?: StreamOptions): this {
    // TODO: replace this method with transformStream in next major release
    this.cursorState.streamOptions = options || {};
    return this;
  }

  /**
   * Return a modified Readable stream that applies a given transform function, if supplied. If none supplied,
   * returns a stream of unmodified docs.
   */
  transformStream(options?: StreamOptions): Transform {
    const streamOptions: typeof options = options || {};
    if (typeof streamOptions.transform === 'function') {
      const stream = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          if (streamOptions.transform) {
            this.push(streamOptions.transform(chunk));
          }
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
   * @param callback - The result callback.
   */
  explain(callback?: Callback): Promise<unknown> | void {
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

    return maybePromise(callback, (cb: Callback) => {
      CoreCursor.prototype._next.apply(this, [cb]);
    });
  }

  /** Return the cursor logger */
  getLogger(): Logger {
    return this.logger;
  }
}

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
