import { Logger } from '../logger';
import { ReadPreference } from '../read_preference';
import { MongoDBNamespace, Callback } from '../utils';
import { executeOperation } from '../operations/execute_operation';
import { Readable } from 'stream';
import { MongoError, MongoNetworkError } from '../error';
import { Long, Document, BSONSerializeOptions } from '../bson';
import type { OperationBase, Hint } from '../operations/operation';
import type { Topology } from '../sdam/topology';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { OperationTime, ResumeToken } from '../change_stream';
import type { CommandOperationOptions } from '../operations/command';
import type { CloseOptions } from '../cmap/connection_pool';
import type { ReadConcern } from '../read_concern';

/** @public */
export interface DocumentTransforms {
  /** Transform each document returned */
  doc(doc: Document): Document;
  /** Transform the value returned from the initial query */
  query?(doc: Document): Document | Document[];
}

/** @internal */
export interface CoreCursorPrivate {
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

/** @public */
export interface CursorCloseOptions {
  /** Bypass calling killCursors when closing the cursor. */
  skipKillCursors?: boolean;
}

/** @public */
export interface StreamOptions {
  /** A transformation method applied to each document emitted by the stream */
  transform?(doc: Document): Document;
}

/** @public Possible states for a cursor */
export enum CursorState {
  INIT = 0,
  OPEN = 1,
  CLOSED = 2,
  GET_MORE = 3
}

/** @public */
export interface CoreCursorOptions extends CommandOperationOptions {
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
}

/**
 * The **CoreCursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query.
 * @internal
 */
export class CoreCursor<
  O extends OperationBase = OperationBase,
  T extends CoreCursorOptions = CoreCursorOptions
> extends Readable {
  operation: O;
  server?: Server;
  ns: string;
  namespace: MongoDBNamespace;
  cmd: Document;
  options: T;
  topology: Topology;
  logger: Logger;
  query?: Document;
  s!: CoreCursorPrivate;

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
  streamOptions?: StreamOptions;
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

  /**
   * Create a new core `Cursor` instance.
   * **NOTE** Not to be instantiated directly
   *
   * @param topology - The server topology instance.
   * @param operation - The cursor-generating operation to run
   * @param options - Optional settings for the cursor
   */
  constructor(topology: Topology, operation: O, options: T = {} as T) {
    super({ objectMode: true });

    const cmd = operation.cmd ? operation.cmd : {};

    // Set local values
    this.operation = operation;
    this.ns = this.operation.ns.toString();
    this.namespace = MongoDBNamespace.fromString(this.ns);
    this.cmd = cmd;
    this.options = this.operation.options as T;
    this.topology = topology;

    const { limit, skip, batchSize } = getLimitSkipBatchSizeDefaults(options, cmd);

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
    this._batchSize = batchSize;

    if (typeof options.session === 'object') {
      this.session = options.session;
    }

    // Logger
    this.logger = new Logger('Cursor', topology.s.options);
  }

  get id(): Long | undefined {
    return this.cursorId;
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

  /** @internal Retrieve the next document from the cursor */
  _next(callback: Callback<Document>): void {
    nextFunction(this, callback);
  }

  /** Clone the cursor */
  clone(): this {
    return new (this.constructor as any)(this.topology, this.operation, this.options);
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
      this.tailable = false;
      this.awaitData = false;
    }
  }

  // Internal methods
  /** @internal */
  _read(): void {
    if ((this.s && this.s.state === CursorState.CLOSED) || this.isDead()) {
      this.push(null);
      return;
    }

    // Get the next item
    this._next((err, result) => {
      if (err) {
        if (this.listeners(CoreCursor.ERROR) && this.listeners(CoreCursor.ERROR).length > 0) {
          this.emit(CoreCursor.ERROR, err);
        }
        if (!this.isDead()) this.close();

        // Emit end event
        this.emit(CoreCursor.END);
        this.emit(CoreCursor.FINISH);
        return;
      }

      // If we provided a transformation method
      if (
        this.streamOptions &&
        typeof this.streamOptions.transform === 'function' &&
        result != null
      ) {
        this.push(this.streamOptions.transform(result));
        return;
      }

      // Return the result
      this.push(result);

      if (result === null && this.isDead()) {
        this.once(CoreCursor.END, () => {
          this.close();
          this.emit(CoreCursor.FINISH);
        });
      }
    });
  }

  close(): void;
  close(callback: Callback): void;
  close(options: CursorCloseOptions): Promise<void>;
  close(options: CursorCloseOptions, callback: Callback): void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(options?: CursorCloseOptions | Callback, callback?: Callback): Promise<void> | void {
    throw new Error('Method not implemented.');
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

  /** @internal */
  _initializeCursor(callback: Callback): void {
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
}

/** Validate if the cursor is dead but was not explicitly killed by user */
function isCursorDeadButNotkilled(self: CoreCursor, callback: Callback) {
  // Cursor is dead but not marked killed, return null
  if (self.dead && !self.killed) {
    self.killed = true;
    setCursorNotified(self, callback);
    return true;
  }

  return false;
}

/** Validate if the cursor is dead and was killed by user */
function isCursorDeadAndKilled(self: CoreCursor, callback: Callback) {
  if (self.dead && self.killed) {
    callback(new MongoError('cursor is dead'));
    return true;
  }

  return false;
}

/** Validate if the cursor was killed by the user */
function isCursorKilled(self: CoreCursor, callback: Callback) {
  if (self.killed) {
    setCursorNotified(self, callback);
    return true;
  }

  return false;
}

/** Mark cursor as being dead and notified */
function setCursorDeadAndNotified(self: CoreCursor, callback: Callback) {
  self.dead = true;
  setCursorNotified(self, callback);
}

/** Mark cursor as being notified */
function setCursorNotified(self: CoreCursor, callback: Callback) {
  _setCursorNotifiedImpl(self, () => callback(undefined, null));
}

/** @internal */
function _setCursorNotifiedImpl(self: CoreCursor, callback: Callback) {
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
function nextFunction(self: CoreCursor, callback: Callback) {
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
function getLimitSkipBatchSizeDefaults(options: CoreCursorOptions, cmd: Document) {
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
