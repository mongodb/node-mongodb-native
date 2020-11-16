import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { deprecate } from 'util';
import { Long, Document, BSONSerializeOptions } from '../bson';
import { MongoError, MongoNetworkError, AnyError } from '../error';
import { Logger } from '../logger';
import { executeOperation } from '../operations/execute_operation';
import { CountOperation, CountOptions } from '../operations/count';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { Callback, emitDeprecatedOptionWarning, maybePromise, MongoDBNamespace } from '../utils';
import { Sort, SortDirection, formatSort } from '../sort';
import { PromiseProvider } from '../promise_provider';
import type { OperationTime, ResumeToken } from '../change_stream';
import type { CloseOptions } from '../cmap/connection_pool';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import { Aspect, Hint, OperationBase } from '../operations/operation';
import type { Topology } from '../sdam/topology';
import { CommandOperation, CommandOperationOptions } from '../operations/command';
import type { ReadConcern } from '../read_concern';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Explain, ExplainVerbosityLike } from '../explain';

const kCursor = Symbol('cursor');

/**
 * Flags allowed for cursor
 * @public
 */
export const FLAGS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'exhaust',
  'partial'
] as const;

/** @public */
export type CursorFlag = typeof FLAGS[number];

/** @public */
export const FIELDS = ['numberOfRetries', 'tailableRetryInterval'] as const;

/** @public */
export interface DocumentTransforms {
  /** Transform each document returned */
  doc(doc: Document): Document;
  /** Transform the value returned from the initial query */
  query?(doc: Document): Document | Document[];
}

/** @internal */
export interface CursorPrivate {
  /** Transforms functions */
  transforms?: DocumentTransforms;
  numberOfRetries: number;
  tailableRetryInterval: number;
  currentNumberOfRetries: number;
  explicitlyIgnoreSession: boolean;
  batchSize: number;

  state: CursorState;
  readConcern?: ReadConcern;
}

/**
 * Possible states for a cursor
 * @public
 */
export enum CursorState {
  INIT = 0,
  OPEN = 1,
  CLOSED = 2,
  GET_MORE = 3
}

/** @public */
export interface CursorOptions extends CommandOperationOptions {
  noCursorTimeout?: boolean;
  tailable?: boolean;
  awaitData?: boolean;
  /** @deprecated Use `awaitData` instead */
  awaitdata?: boolean;
  raw?: boolean;
  hint?: Hint;
  limit?: number;
  skip?: number;
  /** The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/| find command documentation} and {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}. */
  batchSize?: number;
  /** Initial documents list for cursor */
  documents?: Document[];
  /** Transform function */
  transforms?: DocumentTransforms;
  cursorFactory?: typeof Cursor;
  tailableRetryInterval?: number;
  explicitlyIgnoreSession?: boolean;
  cursor?: Document;
  /** The internal topology of the created cursor */
  topology?: Topology;
  /** Session to use for the operation */
  numberOfRetries?: number;
  sort?: Sort;
}

/** @public */
export interface CursorCloseOptions {
  /** Bypass calling killCursors when closing the cursor. */
  skipKillCursors?: boolean;
}

/** @public */
export interface CursorStreamOptions {
  /** A transformation method applied to each document emitted by the stream */
  transform?(doc: Document): Document;
}

/** @public */
export class CursorStream extends Readable {
  [kCursor]: Cursor;
  options: CursorStreamOptions;

  /** @event */
  static readonly CLOSE = 'close' as const;
  /** @event */
  static readonly DATA = 'data' as const;
  /** @event */
  static readonly END = 'end' as const;
  /** @event */
  static readonly FINISH = 'finish' as const;
  /** @event */
  static readonly ERROR = 'error' as const;
  /** @event */
  static readonly PAUSE = 'pause' as const;
  /** @event */
  static readonly READABLE = 'readable' as const;
  /** @event */
  static readonly RESUME = 'resume' as const;

  constructor(cursor: Cursor, options?: CursorStreamOptions) {
    super({ objectMode: true });
    this[kCursor] = cursor;
    this.options = options || {};
  }

  destroy(err?: AnyError): void {
    this.pause();
    this[kCursor].close();
    super.destroy(err);
  }

  /** @internal */
  _read(): void {
    const cursor = this[kCursor];
    if ((cursor.s && cursor.s.state === CursorState.CLOSED) || cursor.isDead()) {
      this.push(null);
      return;
    }

    // Get the next item
    nextFunction(cursor, (err, result) => {
      if (err) {
        if (cursor.s && cursor.s.state === CursorState.CLOSED) return;
        if (!cursor.isDead()) this.emit(CursorStream.ERROR, err);
        cursor.close(() => this.emit(CursorStream.END));
        return;
      }

      // If we provided a transformation method
      if (typeof this.options.transform === 'function' && result != null) {
        this.push(this.options.transform(result));
        return;
      }

      // Return the result
      this.push(result);

      if (result === null && cursor.isDead()) {
        this.once(CursorStream.END, () => {
          cursor.close();
          this.emit(CursorStream.FINISH);
        });
      }
    });
  }
}

/**
 * **CURSORS Cannot directly be instantiated**
 * The `Cursor` class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 * @public
 *
 * @example
 * ```js
 * // Create a projection of field a
 * collection.find({}).project({a:1})
 * // Skip 1 and limit 10
 * collection.find({}).skip(1).limit(10)
 * // Set batchSize on cursor to 5
 * collection.find({}).batchSize(5)
 * // Set query on the cursor
 * collection.find({}).filter({a:1})
 * // Add a comment to the query, allowing to correlate queries
 * collection.find({}).comment('add a comment')
 * // Set cursor as tailable
 * collection.find({}).addCursorFlag('tailable', true)
 * // Set cursor as noCursorTimeout
 * collection.find({}).addCursorFlag('noCursorTimeout', true)
 * // Set cursor as awaitData
 * collection.find({}).addCursorFlag('awaitData', true)
 * // Set cursor as partial
 * collection.find({}).addCursorFlag('partial', true)
 * // Set $orderby {a:1}
 * collection.find({}).addQueryModifier('$orderby', {a:1})
 * // Set the cursor max
 * collection.find({}).max(10)
 * // Set the cursor maxTimeMS
 * collection.find({}).maxTimeMS(1000)
 * // Set the cursor min
 * collection.find({}).min(100)
 * // Set the cursor returnKey
 * collection.find({}).returnKey(true)
 * // Set the cursor readPreference
 * collection.find({}).setReadPreference(ReadPreference.PRIMARY)
 * // Set the cursor showRecordId
 * collection.find({}).showRecordId(true)
 * // Sets the sort order of the cursor query
 * collection.find({}).sort([['a', 1]])
 * // Set the cursor hint
 * collection.find({}).hint('a_1')
 * ```
 *
 * All options are chainable, so one can do the following.
 *
 * ```js
 * const docs = await collection.find({})
 *   .maxTimeMS(1000)
 *   .skip(1)
 *   .toArray()
 * ```
 */
export class Cursor<
  O extends OperationBase = OperationBase,
  T extends CursorOptions = CursorOptions
> extends EventEmitter {
  /** @internal */
  operation: O;
  server?: Server;
  ns: string;
  namespace: MongoDBNamespace;
  cmd: Document;
  options: T;
  topology: Topology;
  logger: Logger;
  query?: Document;
  s: CursorPrivate;

  // INTERNAL CURSOR STATE
  postBatchResumeToken?: ResumeToken;
  currentLimit: number;
  cursorId?: Long;
  lastCursorId?: Long;
  cursorIndex: number;
  dead: boolean;
  killed: boolean;
  init: boolean;
  notified: boolean;
  documents: Document[];
  operationTime?: OperationTime;
  reconnect?: boolean;
  session?: ClientSession;
  streamOptions?: CursorStreamOptions;
  transforms?: DocumentTransforms;
  raw?: boolean;
  tailable: boolean;
  awaitData: boolean;
  bsonOptions?: BSONSerializeOptions;

  // DEPRECATED?
  _batchSize: number;
  _skip: number;
  _limit: number;

  /** @event */
  static readonly ERROR = 'error' as const;

  /** @event */
  static readonly CLOSE = 'close' as const;

  /** @internal */
  /**
   * Create a new core `Cursor` instance.
   * **NOTE** Not to be instantiated directly
   *
   * @param topology - The server topology instance.
   * @param operation - The cursor-generating operation to run
   * @param options - Optional settings for the cursor
   */
  constructor(topology: Topology, operation: O, options: T = {} as T) {
    super();

    const cmd = operation.cmd ? operation.cmd : {};

    // Set local values
    this.operation = operation;
    this.ns = this.operation.ns.toString();
    this.namespace = MongoDBNamespace.fromString(this.ns);
    this.cmd = cmd;
    this.options = this.operation.options as T;
    this.topology = topology;

    const { limit, skip } = getLimitSkipBatchSizeDefaults(options, cmd);

    let cursorId = undefined;
    let lastCursorId = undefined;
    // Did we pass in a cursor id
    if (typeof cmd === 'number') {
      cursorId = Long.fromNumber(cmd);
      lastCursorId = cursorId;
    } else if (cmd instanceof Long) {
      cursorId = cmd;
      lastCursorId = cmd;
    }

    // All internal state
    this.cursorId = cursorId;
    this.lastCursorId = lastCursorId;
    this.documents = options.documents || [];
    this.cursorIndex = 0;
    this.dead = false;
    this.killed = false;
    this.init = false;
    this.notified = false;
    this.currentLimit = 0;
    // Result field name if not a cursor (contains the array of results)
    this.transforms = options.transforms;
    this.raw = typeof options.raw === 'boolean' ? options.raw : cmd && 'raw' in cmd && cmd.raw;
    this.tailable = typeof options.tailable === 'boolean' ? options.tailable : false;
    this.awaitData =
      typeof options.awaitData === 'boolean'
        ? options.awaitData
        : typeof options.awaitdata === 'boolean'
        ? options.awaitdata
        : false;

    // get rid of these?
    this._limit = limit;
    this._skip = skip;

    if (typeof options.session === 'object') {
      this.session = options.session;
    }

    // Logger
    this.logger = new Logger('Cursor', topology.s.options);

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
      batchSize = options.cursor.batchSize ?? 1000;
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
      this.session = options.session;
    }

    // Translate correctly
    if (this.options.noCursorTimeout === true) {
      this.addCursorFlag('noCursorTimeout', true);
    }

    if (this.options.sort) {
      this.cmd.sort = formatSort(this.options.sort);
    }

    // Set the batch size
    this._batchSize = batchSize;
  }

  get id(): Long | undefined {
    if (this.operation) return this.cursorId;
  }

  set cursorBatchSize(value: number) {
    this._batchSize = value;
  }

  get cursorBatchSize(): number {
    return this._batchSize;
  }

  set cursorLimit(value: number) {
    this._limit = value;
  }

  get cursorLimit(): number {
    return this._limit ?? 0;
  }

  set cursorSkip(value: number) {
    this._skip = value;
  }

  get cursorSkip(): number {
    return this._skip;
  }

  get readPreference(): ReadPreference {
    return this.operation.readPreference;
  }

  get sortValue(): Sort {
    return this.cmd.sort;
  }

  /** @internal */
  _initializeCursor(callback: Callback): void {
    if (this.operation && this.operation.session != null) {
      this.session = this.operation.session;
    } else {
      // implicitly create a session if one has not been provided
      if (!this.s.explicitlyIgnoreSession && !this.session && this.topology.hasSessionSupport()) {
        this.session = this.topology.startSession({ owner: this });

        if (this.operation) {
          this.operation.session = this.session;
        }
      }
    }

    // NOTE: this goes away once cursors use `executeOperation`
    if (this.topology.shouldCheckForSessionSupport()) {
      this.topology.selectServer(ReadPreference.primaryPreferred, err => {
        if (err) {
          callback(err);
          return;
        }

        this._initializeCursor(callback);
      });

      return;
    }

    const done: Callback = (err, result) => {
      if (err || (this.cursorId && this.cursorId.isZero())) {
        this._endSession();
      }

      if (
        this.documents.length === 0 &&
        this.cursorId &&
        this.cursorId.isZero() &&
        !this.tailable &&
        !this.awaitData
      ) {
        return setCursorNotified(this, callback);
      }

      callback(err, result);
    };

    const queryCallback: Callback = (err, result) => {
      if (err) {
        return done(err);
      }

      if (result.cursor) {
        const document = result;

        if (result.queryFailure) {
          return done(new MongoError(document));
        }

        // We have an error document, return the error
        if (document.$err || document.errmsg) {
          return done(new MongoError(document));
        }

        // We have a cursor document
        if (document.cursor != null && typeof document.cursor !== 'string') {
          const id = document.cursor.id;
          // If we have a namespace change set the new namespace for getmores
          if (document.cursor.ns) {
            this.ns = document.cursor.ns;
          }

          // Promote id to long if needed
          this.cursorId = typeof id === 'number' ? Long.fromNumber(id) : id;
          this.lastCursorId = this.cursorId;
          this.operationTime = document.operationTime;

          // If we have a firstBatch set it
          if (Array.isArray(document.cursor.firstBatch)) {
            this.documents = document.cursor.firstBatch;
          }

          // Return after processing command cursor
          return done(undefined, result);
        }
      }

      // Otherwise fall back to regular find path
      const cursorId = result.cursorId || 0;
      this.cursorId = cursorId instanceof Long ? cursorId : Long.fromNumber(cursorId);
      this.documents = result.documents || [result];
      this.lastCursorId = result.cursorId;

      // Transform the results with passed in transformation method if provided
      if (this.transforms && typeof this.transforms.query === 'function') {
        const transformedQuery = this.transforms.query(result);
        this.documents = Array.isArray(transformedQuery) ? transformedQuery : [transformedQuery];
      }

      done(undefined, result);
    };

    if (this.logger.isDebug()) {
      this.logger.debug(
        `issue initial query [${JSON.stringify(this.cmd)}] with flags [${JSON.stringify(
          this.query
        )}]`
      );
    }

    executeOperation(this.topology, this.operation as any, (err, result) => {
      if (err || !result) {
        done(err);
        return;
      }

      this.server = this.operation.server;
      this.init = true;

      // set these after execution because the builder might change them before now
      this.bsonOptions = this.operation.bsonOptions;

      // NOTE: this is a special internal method for cloning a cursor, consider removing
      if (this.cursorId != null) {
        return done();
      }

      queryCallback(err, result);
    });
  }

  /** @internal */
  _endSession(): boolean;
  /** @internal */
  _endSession(options: CloseOptions): boolean;
  /** @internal */
  _endSession(callback: Callback<void>): void;
  _endSession(options?: CloseOptions | Callback<void>, callback?: Callback<void>): boolean {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    const session = this.session;

    if (session && (options.force || session.owner === this)) {
      this.session = undefined;

      if (this.operation) {
        this.operation.clearSession();
      }

      session.endSession(callback as Callback<void>);
      return true;
    }

    if (callback) {
      callback();
    }

    return false;
  }

  /** Checks if the cursor is dead */
  isDead(): boolean {
    return this.dead === true;
  }

  /** Checks if the cursor was killed by the application */
  isKilled(): boolean {
    return this.killed === true;
  }

  /** Checks if the cursor notified it's caller about it's death */
  isNotified(): boolean {
    return this.notified === true;
  }

  /** Returns current buffered documents length */
  bufferedCount(): number {
    return this.documents.length - this.cursorIndex;
  }

  /** Returns current buffered documents */
  readBufferedDocuments(number: number): Document[] {
    const unreadDocumentsLength = this.documents.length - this.cursorIndex;
    const length = number < unreadDocumentsLength ? number : unreadDocumentsLength;
    let elements = this.documents.slice(this.cursorIndex, this.cursorIndex + length);

    // Transform the doc with passed in transformation method if provided
    if (this.transforms && typeof this.transforms.doc === 'function') {
      // Transform all the elements
      for (let i = 0; i < elements.length; i++) {
        elements[i] = this.transforms.doc(elements[i]);
      }
    }

    // Ensure we do not return any more documents than the limit imposed
    // Just return the number of elements up to the limit
    if (this._limit > 0 && this.currentLimit + elements.length > this._limit) {
      elements = elements.slice(0, this._limit - this.currentLimit);
      this.kill();
    }

    // Adjust current limit
    this.currentLimit = this.currentLimit + elements.length;
    this.cursorIndex = this.cursorIndex + elements.length;

    // Return elements
    return elements;
  }

  /** Check if there is any document still available in the cursor */
  hasNext(): Promise<void>;
  hasNext(callback: Callback): void;
  hasNext(callback?: Callback): Promise<void> | void {
    if (this.s.state === CursorState.CLOSED || (this.isDead && this.isDead())) {
      throw new MongoError('Cursor is closed');
    }

    return maybePromise(callback, cb => {
      if (this.isNotified()) {
        return cb(undefined, false);
      }

      nextFunction(this, (err, doc) => {
        if (err) return cb(err);
        if (doc == null || this.s.state === CursorState.CLOSED || this.isDead()) {
          return cb(undefined, false);
        }

        this.s.state = CursorState.OPEN;
        this.cursorIndex--;
        cb(undefined, true);
      });
    });
  }

  /** Get the next available document from the cursor, returns null if no more documents are available. */
  next(): Promise<Document>;
  next(callback: Callback<Document>): void;
  next(callback?: Callback<Document>): Promise<Document> | void {
    return maybePromise(callback, cb => {
      if (this.s.state === CursorState.CLOSED || (this.isDead && this.isDead())) {
        cb(new MongoError('Cursor is closed'));
        return;
      }

      nextFunction(this, (err, doc) => {
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
   * @param max - Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
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
   * Set a node.js specific cursor option
   *
   * @param field - The cursor option to set 'numberOfRetries' | 'tailableRetryInterval'.
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
   * @param flag - The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
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

    if (flag === 'tailable') {
      this.tailable = value;
    }

    if (flag === 'awaitData') {
      this.awaitData = value;
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
   * @param value - The field projection object.
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
      throw new MongoError('Tailable cursor does not support sorting');
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    this.cmd.sort = formatSort(sort, direction);
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
    this._batchSize = value;
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

  /** Resets local state for this cursor instance, and issues a `killCursors` command to the server */
  kill(callback?: Callback): void {
    // Set cursor to dead
    this.dead = true;
    this.killed = true;
    // Remove documents
    this.documents = [];

    // If no cursor id just return
    if (this.cursorId == null) {
      if (callback) callback(undefined, null);
      return;
    }

    if (this.cursorId == null || this.cursorId.isZero() || this.init === false) {
      if (callback) callback(undefined, null);
      return;
    }

    if (!this.server) {
      if (callback) callback(new MongoError('Cursor is uninitialized.'));
      return;
    }

    this.server.killCursors(
      this.ns,
      [this.cursorId],
      // TODO: need to pass session here, but its leading to session leaks
      { session: this.session, ...this.bsonOptions },
      callback
    );
  }

  /** Resets the cursor */
  rewind(): void {
    if (this.init) {
      if (!this.dead) {
        this.kill();
      }

      this.currentLimit = 0;
      this.init = false;
      this.dead = false;
      this.killed = false;
      this.notified = false;
      this.documents = [];
      this.cursorId = undefined;
      this.cursorIndex = 0;
    }
  }

  /** Clone the cursor */
  clone(): this {
    return new (this.constructor as any)(this.topology, this.operation, this.options);
  }

  /**
   * Iterates over all the documents for this cursor. As with `cursor.toArray`,
   * not all of the elements will be iterated if this cursor had been previously accessed.
   * In that case, `cursor.rewind` can be used to reset the cursor. However, unlike
   * `cursor.toArray`, the cursor will only hold a maximum of batch size elements
   * at any given time if batch size is specified. Otherwise, the caller is responsible
   * for making sure that the entire result can fit the memory.
   *
   * @deprecated Please use {@link Cursor.forEach} instead
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
  forEach(iterator: (doc: Document) => void): Promise<Document>;
  forEach(iterator: (doc: Document) => void, callback: Callback): void;
  forEach(iterator: (doc: Document) => void, callback?: Callback): Promise<Document> | void {
    if (typeof iterator !== 'function') {
      throw new TypeError('Missing required parameter `iterator`');
    }

    // Rewind cursor state
    this.rewind();

    // Set current cursor to INIT
    this.s.state = CursorState.INIT;

    return maybePromise(callback, done => {
      each(this, (err, doc) => {
        if (err) return done(err);
        if (doc != null) return iterator(doc);
        done();
      });
    });
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

    return maybePromise(callback, cb => {
      const items: Document[] = [];
      // Reset cursor
      this.rewind();
      this.s.state = CursorState.INIT;

      // Fetch all the documents
      const fetchDocs = () => {
        nextFunction(this, (err, doc) => {
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
    if (this.cmd.query == null) {
      throw new MongoError('count can only be used with find command');
    }

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

  /** Close the cursor, sending a KillCursor command and emitting close. */
  close(): Promise<void>;
  close(callback: Callback): void;
  close(options: CursorCloseOptions): Promise<void>;
  close(options: CursorCloseOptions, callback: Callback): void;
  close(
    optionsOrCallback?: CursorCloseOptions | Callback,
    callback?: Callback
  ): Promise<void> | void {
    const options =
      typeof optionsOrCallback === 'function'
        ? { skipKillCursors: false }
        : Object.assign({}, optionsOrCallback);
    callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

    return maybePromise(callback, cb => {
      this.s.state = CursorState.CLOSED;

      if (!options.skipKillCursors) {
        // Kill the cursor
        this.kill(() => {
          this._endSession(() => {
            this.emit(Cursor.CLOSE);
            cb(undefined, this);
          });
        });

        return;
      }

      this._endSession(() => {
        this.emit(Cursor.CLOSE);
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
    if (this.transforms && this.transforms.doc) {
      const oldTransform = this.transforms.doc;
      this.transforms.doc = doc => {
        return transform(oldTransform(doc));
      };
    } else {
      this.transforms = { doc: transform };
    }

    return this;
  }

  isClosed(): boolean {
    return this.isDead();
  }

  /** Return a modified Readable stream including a possible transform method. */
  stream(options?: CursorStreamOptions): CursorStream {
    return new CursorStream(this, options);
  }

  /**
   * Execute the explain for the cursor
   *
   * @param verbosity - The mode in which to run the explain.
   * @param callback - The result callback.
   */
  explain(verbosity?: ExplainVerbosityLike): Promise<unknown>;
  explain(verbosity?: ExplainVerbosityLike, callback?: Callback): Promise<unknown> | void {
    if (typeof verbosity === 'function') (callback = verbosity), (verbosity = true);
    if (verbosity === undefined) verbosity = true;

    // TODO: For now, we need to manually do these checks. This will change after cursor refactor.
    if (
      !(this.operation instanceof CommandOperation) ||
      !this.operation.hasAspect(Aspect.EXPLAINABLE)
    ) {
      throw new MongoError('This command cannot be explained');
    }
    this.operation.explain = new Explain(verbosity);

    return maybePromise(callback, cb => nextFunction(this, cb));
  }

  /** Return the cursor logger */
  getLogger(): Logger {
    return this.logger;
  }

  [Symbol.asyncIterator](): AsyncIterator<Document> {
    const Promise = PromiseProvider.get();
    return {
      next: () => {
        if (this.isClosed()) {
          return Promise.resolve({ value: null, done: true });
        }
        return this.next().then(value => ({ value, done: value === null }));
      }
    };
  }
  // Internal methods

  /** @internal */
  _getMore(callback: Callback<Document>): void {
    if (this.logger.isDebug()) {
      this.logger.debug(`schedule getMore call for query [${JSON.stringify(this.query)}]`);
    }

    if (this.cursorId == null) {
      if (callback) callback(new MongoError('getMore attempted on invalid cursor id'));
      return;
    }

    // Set the current batchSize
    let batchSize = this._batchSize;
    if (this._limit > 0 && this.currentLimit + batchSize > this._limit) {
      batchSize = this._limit - this.currentLimit;
    }

    if (!this.server) {
      return callback(new MongoError('Cursor is uninitialized.'));
    }

    this.server.getMore(
      this.ns,
      this.cursorId,
      { batchSize, session: this.session, ...this.bsonOptions },
      (err, response) => {
        if (response) {
          const cursorId =
            typeof response.cursor.id === 'number'
              ? Long.fromNumber(response.cursor.id)
              : response.cursor.id;

          this.documents = response.cursor.nextBatch;
          this.cursorId = cursorId;
        }

        if (err || (this.cursorId && this.cursorId.isZero())) {
          this._endSession(() => callback(err, response));
          return;
        }

        callback(err, response);
      }
    );
  }
}

/** Validate if the cursor is dead but was not explicitly killed by user */
function isCursorDeadButNotkilled(self: Cursor, callback: Callback) {
  // Cursor is dead but not marked killed, return null
  if (self.dead && !self.killed) {
    self.killed = true;
    setCursorNotified(self, callback);
    return true;
  }

  return false;
}

/** Validate if the cursor is dead and was killed by user */
function isCursorDeadAndKilled(self: Cursor, callback: Callback) {
  if (self.dead && self.killed) {
    callback(new MongoError('cursor is dead'));
    return true;
  }

  return false;
}

/** Validate if the cursor was killed by the user */
function isCursorKilled(self: Cursor, callback: Callback) {
  if (self.killed) {
    setCursorNotified(self, callback);
    return true;
  }

  return false;
}

/** Mark cursor as being dead and notified */
function setCursorDeadAndNotified(self: Cursor, callback: Callback) {
  self.dead = true;
  setCursorNotified(self, callback);
}

/** Mark cursor as being notified */
function setCursorNotified(self: Cursor, callback: Callback) {
  _setCursorNotifiedImpl(self, () => callback(undefined, null));
}

/** @internal */
function _setCursorNotifiedImpl(self: Cursor, callback: Callback) {
  self.notified = true;
  self.documents = [];
  self.cursorIndex = 0;

  if (self.session) {
    self._endSession(callback);
    return;
  }

  return callback();
}

/** @internal */
function nextFunction(self: Cursor, callback: Callback) {
  // We have notified about it
  if (self.notified) {
    return callback(new Error('cursor is exhausted'));
  }

  // Cursor is killed return null
  if (isCursorKilled(self, callback)) return;

  // Cursor is dead but not marked killed, return null
  if (isCursorDeadButNotkilled(self, callback)) return;

  // We have a dead and killed cursor, attempting to call next should error
  if (isCursorDeadAndKilled(self, callback)) return;

  // We have just started the cursor
  if (!self.init) {
    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if (!self.topology.isConnected()) {
      // Only need this for single server, because repl sets and mongos
      // will always continue trying to reconnect
      if (self.topology._type === 'server' && !self.topology.s.options.reconnect) {
        // Reconnect is disabled, so we'll never reconnect
        return callback(new MongoError('no connection available'));
      }
    }

    self._initializeCursor((err, result) => {
      if (err || result === null) {
        callback(err, result);
        return;
      }

      nextFunction(self, callback);
    });

    return;
  }

  const cursorId = self.cursorId;
  if (!cursorId) {
    return callback(new MongoError('Undefined cursor ID'));
  }

  if (self._limit > 0 && self.currentLimit >= self._limit) {
    // Ensure we kill the cursor on the server
    return self.kill(() =>
      // Set cursor in dead and notified state
      setCursorDeadAndNotified(self, callback)
    );
  } else if (self.cursorIndex === self.documents.length && !Long.ZERO.equals(cursorId)) {
    // Ensure an empty cursor state
    self.documents = [];
    self.cursorIndex = 0;

    // Check if topology is destroyed
    if (self.topology.isDestroyed()) {
      return callback(
        new MongoNetworkError('connection destroyed, not possible to instantiate cursor')
      );
    }

    // Execute the next get more
    self._getMore(err => {
      if (err) {
        return callback(err);
      }

      // Tailable cursor getMore result, notify owner about it
      // No attempt is made here to retry, this is left to the user of the
      // core module to handle to keep core simple
      if (self.documents.length === 0 && self.tailable && Long.ZERO.equals(cursorId)) {
        // No more documents in the tailed cursor
        return callback(new MongoError('No more documents in tailed cursor'));
      } else if (self.documents.length === 0 && self.tailable && !Long.ZERO.equals(cursorId)) {
        return nextFunction(self, callback);
      }

      if (self._limit > 0 && self.currentLimit >= self._limit) {
        return setCursorDeadAndNotified(self, callback);
      }

      nextFunction(self, callback);
    });
  } else if (
    self.documents.length === self.cursorIndex &&
    self.tailable &&
    Long.ZERO.equals(cursorId)
  ) {
    return callback(new MongoError('No more documents in tailed cursor'));
  } else if (self.documents.length === self.cursorIndex && Long.ZERO.equals(cursorId)) {
    setCursorDeadAndNotified(self, callback);
  } else {
    if (self._limit > 0 && self.currentLimit >= self._limit) {
      // Ensure we kill the cursor on the server
      self.kill(() =>
        // Set cursor in dead and notified state
        setCursorDeadAndNotified(self, callback)
      );

      return;
    }

    // Increment the current cursor limit
    self.currentLimit += 1;

    // Get the document
    let doc = self.documents[self.cursorIndex++];

    // Doc overflow
    if (!doc || doc.$err) {
      // Ensure we kill the cursor on the server
      self.kill(() =>
        // Set cursor in dead and notified state
        setCursorDeadAndNotified(self, () => callback(new MongoError(doc ? doc.$err : undefined)))
      );

      return;
    }

    // Transform the doc with passed in transformation method if provided
    if (self.transforms && typeof self.transforms.doc === 'function') {
      doc = self.transforms.doc(doc);
    }

    // Return the document
    callback(undefined, doc);
  }
}

/** @internal */
function getLimitSkipBatchSizeDefaults(options: CursorOptions, cmd: Document) {
  cmd = cmd ? cmd : {};
  let limit = options.limit;

  if (!limit) {
    if ('limit' in cmd) {
      limit = cmd.limit;
    }
    if (!limit) {
      limit = 0;
    }
  }
  let skip = options.skip;
  if (!skip) {
    if ('skip' in cmd) {
      skip = cmd.skip;
    }
    if (!skip) {
      skip = 0;
    }
  }
  let batchSize = options.batchSize;
  if (!batchSize) {
    if ('batchSize' in cmd) {
      batchSize = cmd.batchSize;
    }
    if (!batchSize) {
      batchSize = 1000;
    }
  }

  return { limit, skip, batchSize };
}

/** @public */
export type EachCallback = (error?: AnyError, result?: Document | null) => boolean | void;

/**
 * Iterates over all the documents for this cursor. See Cursor.prototype.each for more information.
 * @internal
 *
 * @deprecated Please use forEach instead
 * @param cursor - The Cursor instance on which to run.
 * @param callback - The result callback.
 */
export function each(cursor: Cursor, callback: EachCallback): void {
  if (!callback) throw new MongoError('callback is mandatory');
  if (cursor.isNotified()) return;
  if (cursor.s.state === CursorState.CLOSED || cursor.isDead()) {
    callback(new MongoError('Cursor is closed'));
    return;
  }

  if (cursor.s.state === CursorState.INIT) {
    cursor.s.state = CursorState.OPEN;
  }

  // Define function to avoid global scope escape
  let fn = null;
  // Trampoline all the entries
  if (cursor.bufferedCount() > 0) {
    while ((fn = loop(cursor, callback))) fn(cursor, callback);
    each(cursor, callback);
  } else {
    cursor.next((err, item) => {
      if (err) return callback(err);
      if (item == null) {
        return cursor.close({ skipKillCursors: true }, () => callback(undefined, null));
      }

      if (callback(undefined, item) === false) return;
      each(cursor, callback);
    });
  }
}

/**
 * Trampoline emptying the number of retrieved items without incurring a nextTick operation
 * @internal
 */
function loop(cursor: Cursor, callback: Callback) {
  // No more items we are done
  if (cursor.bufferedCount() === 0) return;
  // Get the next document
  nextFunction(cursor, callback);
  // Loop
  return loop;
}

/**
 * Returns an array of documents. See Cursor.prototype.toArray for more information.
 * @internal
 *
 * @param cursor - The Cursor instance from which to get the next document.
 */
export function toArray(cursor: Cursor, callback: Callback<Document[]>): void {
  const items: Document[] = [];

  // Reset cursor
  cursor.rewind();
  cursor.s.state = CursorState.INIT;

  // Fetch all the documents
  const fetchDocs = () => {
    nextFunction(cursor, (err, doc) => {
      if (err) {
        return callback(err);
      }

      if (doc == null) {
        return cursor.close({ skipKillCursors: true }, () => callback(undefined, items));
      }

      // Add doc to items
      items.push(doc);

      // Get all buffered objects
      if (cursor.bufferedCount() > 0) {
        let docs = cursor.readBufferedDocuments(cursor.bufferedCount());

        // Transform the doc if transform method added
        if (cursor.s.transforms && typeof cursor.s.transforms.doc === 'function') {
          docs = docs.map(cursor.s.transforms.doc);
        }

        items.push(...docs);
      }

      // Attempt a fetch
      fetchDocs();
    });
  };

  fetchDocs();
}

// deprecated methods
deprecate(Cursor.prototype.each, 'Cursor.each is deprecated. Use Cursor.forEach instead.');
