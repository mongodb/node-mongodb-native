import { Callback, maybePromise, MongoDBNamespace, ns } from '../utils';
import { Long, Document, BSONSerializeOptions, pluckBSONSerializeOptions } from '../bson';
import { ClientSession, maybeClearPinnedConnection } from '../sessions';
import {
  AnyError,
  MongoRuntimeError,
  MongoNetworkError,
  MongoInvalidArgumentError,
  MongoCursorExhaustedError,
  MongoTailableCursorError,
  MongoCursorInUseError
} from '../error';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import type { Server } from '../sdam/server';
import type { Topology } from '../sdam/topology';
import { Readable, Transform } from 'stream';
import { executeOperation, ExecutionResult } from '../operations/execute_operation';
import { GetMoreOperation } from '../operations/get_more';
import { ReadConcern, ReadConcernLike } from '../read_concern';
import { TODO_NODE_3286, TypedEventEmitter } from '../mongo_types';

/** @internal */
const kId = Symbol('id');
/** @internal */
const kDocuments = Symbol('documents');
/** @internal */
const kServer = Symbol('server');
/** @internal */
const kNamespace = Symbol('namespace');
/** @internal */
const kTopology = Symbol('topology');
/** @internal */
const kSession = Symbol('session');
/** @internal */
const kOptions = Symbol('options');
/** @internal */
const kTransform = Symbol('transform');
/** @internal */
const kInitialized = Symbol('initialized');
/** @internal */
const kClosed = Symbol('closed');
/** @internal */
const kKilled = Symbol('killed');

/** @public */
export const CURSOR_FLAGS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'exhaust',
  'partial'
] as const;

/** @public
 * @deprecated This interface is deprecated */
export interface CursorCloseOptions {
  /** Bypass calling killCursors when closing the cursor. */
  /** @deprecated  the skipKillCursors option is deprecated */
  skipKillCursors?: boolean;
}

/** @public */
export interface CursorStreamOptions {
  /** A transformation method applied to each document emitted by the stream */
  transform?(doc: Document): Document;
}

/** @public */
export type CursorFlag = typeof CURSOR_FLAGS[number];

/** @public */
export interface AbstractCursorOptions extends BSONSerializeOptions {
  session?: ClientSession;
  readPreference?: ReadPreferenceLike;
  readConcern?: ReadConcernLike;
  batchSize?: number;
  maxTimeMS?: number;
  comment?: Document | string;
  tailable?: boolean;
  awaitData?: boolean;
  noCursorTimeout?: boolean;
}

/** @internal */
export type InternalAbstractCursorOptions = Omit<AbstractCursorOptions, 'readPreference'> & {
  // resolved
  readPreference: ReadPreference;
  readConcern?: ReadConcern;

  // cursor flags, some are deprecated
  oplogReplay?: boolean;
  exhaust?: boolean;
  partial?: boolean;
};

/** @public */
export type AbstractCursorEvents = {
  [AbstractCursor.CLOSE](): void;
};

/** @public */
export abstract class AbstractCursor<
  TSchema = any,
  CursorEvents extends AbstractCursorEvents = AbstractCursorEvents
> extends TypedEventEmitter<CursorEvents> {
  /** @internal */
  [kId]?: Long;
  /** @internal */
  [kSession]?: ClientSession;
  /** @internal */
  [kServer]?: Server;
  /** @internal */
  [kNamespace]: MongoDBNamespace;
  /** @internal */
  [kDocuments]: TSchema[];
  /** @internal */
  [kTopology]: Topology;
  /** @internal */
  [kTransform]?: (doc: TSchema) => Document;
  /** @internal */
  [kInitialized]: boolean;
  /** @internal */
  [kClosed]: boolean;
  /** @internal */
  [kKilled]: boolean;
  /** @internal */
  [kOptions]: InternalAbstractCursorOptions;

  /** @event */
  static readonly CLOSE = 'close' as const;

  /** @internal */
  constructor(
    topology: Topology,
    namespace: MongoDBNamespace,
    options: AbstractCursorOptions = {}
  ) {
    super();

    this[kTopology] = topology;
    this[kNamespace] = namespace;
    this[kDocuments] = []; // TODO: https://github.com/microsoft/TypeScript/issues/36230
    this[kInitialized] = false;
    this[kClosed] = false;
    this[kKilled] = false;
    this[kOptions] = {
      readPreference:
        options.readPreference && options.readPreference instanceof ReadPreference
          ? options.readPreference
          : ReadPreference.primary,
      ...pluckBSONSerializeOptions(options)
    };

    const readConcern = ReadConcern.fromOptions(options);
    if (readConcern) {
      this[kOptions].readConcern = readConcern;
    }

    if (typeof options.batchSize === 'number') {
      this[kOptions].batchSize = options.batchSize;
    }

    if (options.comment != null) {
      this[kOptions].comment = options.comment;
    }

    if (typeof options.maxTimeMS === 'number') {
      this[kOptions].maxTimeMS = options.maxTimeMS;
    }

    if (options.session instanceof ClientSession) {
      this[kSession] = options.session;
    }
  }

  get id(): Long | undefined {
    return this[kId];
  }

  /** @internal */
  get topology(): Topology {
    return this[kTopology];
  }

  /** @internal */
  get server(): Server | undefined {
    return this[kServer];
  }

  get namespace(): MongoDBNamespace {
    return this[kNamespace];
  }

  get readPreference(): ReadPreference {
    return this[kOptions].readPreference;
  }

  get readConcern(): ReadConcern | undefined {
    return this[kOptions].readConcern;
  }

  /** @internal */
  get session(): ClientSession | undefined {
    return this[kSession];
  }

  set session(clientSession: ClientSession | undefined) {
    this[kSession] = clientSession;
  }

  /** @internal */
  get cursorOptions(): InternalAbstractCursorOptions {
    return this[kOptions];
  }

  get closed(): boolean {
    return this[kClosed];
  }

  get killed(): boolean {
    return this[kKilled];
  }

  get loadBalanced(): boolean {
    return this[kTopology].loadBalanced;
  }

  /** Returns current buffered documents length */
  bufferedCount(): number {
    return this[kDocuments].length;
  }

  /** Returns current buffered documents */
  readBufferedDocuments(number?: number): TSchema[] {
    return this[kDocuments].splice(0, number ?? this[kDocuments].length);
  }

  [Symbol.asyncIterator](): AsyncIterator<TSchema, void> {
    return {
      next: () =>
        this.next().then(value =>
          value != null ? { value, done: false } : { value: undefined, done: true }
        )
    };
  }

  stream(options?: CursorStreamOptions): Readable {
    if (options?.transform) {
      const transform = options.transform;
      const readable = makeCursorStream(this);

      return readable.pipe(
        new Transform({
          objectMode: true,
          highWaterMark: 1,
          transform(chunk, _, callback) {
            try {
              const transformed = transform(chunk);
              callback(undefined, transformed);
            } catch (err) {
              callback(err);
            }
          }
        })
      );
    }

    return makeCursorStream(this);
  }

  hasNext(): Promise<boolean>;
  hasNext(callback: Callback<boolean>): void;
  hasNext(callback?: Callback<boolean>): Promise<boolean> | void {
    return maybePromise(callback, done => {
      if (this[kId] === Long.ZERO) {
        return done(undefined, false);
      }

      if (this[kDocuments].length) {
        return done(undefined, true);
      }

      next<TSchema>(this, true, (err, doc) => {
        if (err) return done(err);

        if (doc) {
          this[kDocuments].unshift(doc);
          done(undefined, true);
          return;
        }

        done(undefined, false);
      });
    });
  }

  /** Get the next available document from the cursor, returns null if no more documents are available. */
  next(): Promise<TSchema | null>;
  next(callback: Callback<TSchema | null>): void;
  next(callback?: Callback<TSchema | null>): Promise<TSchema | null> | void;
  next(callback?: Callback<TSchema | null>): Promise<TSchema | null> | void {
    return maybePromise(callback, done => {
      if (this[kId] === Long.ZERO) {
        return done(new MongoCursorExhaustedError());
      }

      next(this, true, done);
    });
  }

  /**
   * Try to get the next available document from the cursor or `null` if an empty batch is returned
   */
  tryNext(): Promise<TSchema | null>;
  tryNext(callback: Callback<TSchema | null>): void;
  tryNext(callback?: Callback<TSchema | null>): Promise<TSchema | null> | void {
    return maybePromise(callback, done => {
      if (this[kId] === Long.ZERO) {
        return done(new MongoCursorExhaustedError());
      }

      next(this, false, done);
    });
  }

  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * @param iterator - The iteration callback.
   * @param callback - The end callback.
   */
  forEach(iterator: (doc: TSchema) => boolean | void): Promise<void>;
  forEach(iterator: (doc: TSchema) => boolean | void, callback: Callback<void>): void;
  forEach(
    iterator: (doc: TSchema) => boolean | void,
    callback?: Callback<void>
  ): Promise<void> | void {
    if (typeof iterator !== 'function') {
      throw new MongoInvalidArgumentError('Argument "iterator" must be a function');
    }
    return maybePromise(callback, done => {
      const transform = this[kTransform];
      const fetchDocs = () => {
        next<TSchema>(this, true, (err, doc) => {
          if (err || doc == null) return done(err);
          let result;
          // NOTE: no need to transform because `next` will do this automatically
          try {
            result = iterator(doc); // TODO(NODE-3283): Improve transform typing
          } catch (error) {
            return done(error);
          }

          if (result === false) return done();

          // these do need to be transformed since they are copying the rest of the batch
          const internalDocs = this[kDocuments].splice(0, this[kDocuments].length);
          for (let i = 0; i < internalDocs.length; ++i) {
            try {
              result = iterator(
                (transform ? transform(internalDocs[i]) : internalDocs[i]) as TSchema // TODO(NODE-3283): Improve transform typing
              );
            } catch (error) {
              return done(error);
            }
            if (result === false) return done();
          }

          fetchDocs();
        });
      };

      fetchDocs();
    });
  }

  close(): void;
  close(callback: Callback): void;
  /**
   * @deprecated options argument is deprecated
   */
  close(options: CursorCloseOptions): Promise<void>;
  /**
   * @deprecated options argument is deprecated
   */
  close(options: CursorCloseOptions, callback: Callback): void;
  close(options?: CursorCloseOptions | Callback, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    const needsToEmitClosed = !this[kClosed];
    this[kClosed] = true;

    return maybePromise(callback, done => cleanupCursor(this, { needsToEmitClosed }, done));
  }

  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   *
   * @param callback - The result callback.
   */
  toArray(): Promise<TSchema[]>;
  toArray(callback: Callback<TSchema[]>): void;
  toArray(callback?: Callback<TSchema[]>): Promise<TSchema[]> | void {
    return maybePromise(callback, done => {
      const docs: TSchema[] = [];
      const transform = this[kTransform];
      const fetchDocs = () => {
        // NOTE: if we add a `nextBatch` then we should use it here
        next<TSchema>(this, true, (err, doc) => {
          if (err) return done(err);
          if (doc == null) return done(undefined, docs);

          // NOTE: no need to transform because `next` will do this automatically
          docs.push(doc);

          // these do need to be transformed since they are copying the rest of the batch
          const internalDocs = (
            transform
              ? this[kDocuments].splice(0, this[kDocuments].length).map(transform)
              : this[kDocuments].splice(0, this[kDocuments].length)
          ) as TSchema[]; // TODO(NODE-3283): Improve transform typing

          if (internalDocs) {
            docs.push(...internalDocs);
          }

          fetchDocs();
        });
      };

      fetchDocs();
    });
  }

  /**
   * Add a cursor flag to the cursor
   *
   * @param flag - The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
   * @param value - The flag boolean value.
   */
  addCursorFlag(flag: CursorFlag, value: boolean): this {
    assertUninitialized(this);
    if (!CURSOR_FLAGS.includes(flag)) {
      throw new MongoInvalidArgumentError(`Flag ${flag} is not one of ${CURSOR_FLAGS}`);
    }

    if (typeof value !== 'boolean') {
      throw new MongoInvalidArgumentError(`Flag ${flag} must be a boolean value`);
    }

    this[kOptions][flag] = value;
    return this;
  }

  /**
   * Map all documents using the provided function
   * If there is a transform set on the cursor, that will be called first and the result passed to
   * this function's transform.
   *
   * @remarks
   * **Note for Typescript Users:** adding a transform changes the return type of the iteration of this cursor,
   * it **does not** return a new instance of a cursor. This means when calling map,
   * you should always assign the result to a new variable in order to get a correctly typed cursor variable.
   * Take note of the following example:
   *
   * @example
   * ```typescript
   * const cursor: FindCursor<Document> = coll.find();
   * const mappedCursor: FindCursor<number> = cursor.map(doc => Object.keys(doc).length);
   * const keyCounts: number[] = await mappedCursor.toArray(); // cursor.toArray() still returns Document[]
   * ```
   * @param transform - The mapping transformation method.
   */
  map<T = any>(transform: (doc: TSchema) => T): AbstractCursor<T> {
    assertUninitialized(this);
    const oldTransform = this[kTransform] as (doc: TSchema) => TSchema; // TODO(NODE-3283): Improve transform typing
    if (oldTransform) {
      this[kTransform] = doc => {
        return transform(oldTransform(doc));
      };
    } else {
      this[kTransform] = transform;
    }

    return this as unknown as AbstractCursor<T>;
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @param readPreference - The new read preference for the cursor.
   */
  withReadPreference(readPreference: ReadPreferenceLike): this {
    assertUninitialized(this);
    if (readPreference instanceof ReadPreference) {
      this[kOptions].readPreference = readPreference;
    } else if (typeof readPreference === 'string') {
      this[kOptions].readPreference = ReadPreference.fromString(readPreference);
    } else {
      throw new MongoInvalidArgumentError(`Invalid read preference: ${readPreference}`);
    }

    return this;
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @param readPreference - The new read preference for the cursor.
   */
  withReadConcern(readConcern: ReadConcernLike): this {
    assertUninitialized(this);
    const resolvedReadConcern = ReadConcern.fromOptions({ readConcern });
    if (resolvedReadConcern) {
      this[kOptions].readConcern = resolvedReadConcern;
    }

    return this;
  }

  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   *
   * @param value - Number of milliseconds to wait before aborting the query.
   */
  maxTimeMS(value: number): this {
    assertUninitialized(this);
    if (typeof value !== 'number') {
      throw new MongoInvalidArgumentError('Argument for maxTimeMS must be a number');
    }

    this[kOptions].maxTimeMS = value;
    return this;
  }

  /**
   * Set the batch size for the cursor.
   *
   * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   */
  batchSize(value: number): this {
    assertUninitialized(this);
    if (this[kOptions].tailable) {
      throw new MongoTailableCursorError('Tailable cursor does not support batchSize');
    }

    if (typeof value !== 'number') {
      throw new MongoInvalidArgumentError('Operation "batchSize" requires an integer');
    }

    this[kOptions].batchSize = value;
    return this;
  }

  /**
   * Rewind this cursor to its uninitialized state. Any options that are present on the cursor will
   * remain in effect. Iterating this cursor will cause new queries to be sent to the server, even
   * if the resultant data has already been retrieved by this cursor.
   */
  rewind(): void {
    if (!this[kInitialized]) {
      return;
    }

    this[kId] = undefined;
    this[kDocuments] = [];
    this[kClosed] = false;
    this[kKilled] = false;
    this[kInitialized] = false;

    const session = this[kSession];
    if (session) {
      // We only want to end this session if we created it, and it hasn't ended yet
      if (session.explicit === false && !session.hasEnded) {
        session.endSession();
      }

      this[kSession] = undefined;
    }
  }

  /**
   * Returns a new uninitialized copy of this cursor, with options matching those that have been set on the current instance
   */
  abstract clone(): AbstractCursor<TSchema>;

  /** @internal */
  abstract _initialize(
    session: ClientSession | undefined,
    callback: Callback<ExecutionResult>
  ): void;

  /** @internal */
  _getMore(batchSize: number, callback: Callback<Document>): void {
    const cursorId = this[kId];
    const cursorNs = this[kNamespace];
    const server = this[kServer];

    if (cursorId == null) {
      callback(new MongoRuntimeError('Unable to iterate cursor with no id'));
      return;
    }

    if (server == null) {
      callback(new MongoRuntimeError('Unable to iterate cursor without selected server'));
      return;
    }

    const getMoreOperation = new GetMoreOperation(cursorNs, cursorId, server, {
      ...this[kOptions],
      session: this[kSession],
      batchSize
    });

    executeOperation(this.topology, getMoreOperation, callback);
  }
}

function nextDocument<T>(cursor: AbstractCursor): T | null | undefined {
  if (cursor[kDocuments] == null || !cursor[kDocuments].length) {
    return null;
  }

  const doc = cursor[kDocuments].shift();
  if (doc) {
    const transform = cursor[kTransform];
    if (transform) {
      return transform(doc) as T;
    }

    return doc;
  }

  return null;
}

function next<T>(cursor: AbstractCursor, blocking: boolean, callback: Callback<T | null>): void {
  const cursorId = cursor[kId];
  if (cursor.closed) {
    return callback(undefined, null);
  }

  if (cursor[kDocuments] && cursor[kDocuments].length) {
    callback(undefined, nextDocument(cursor));
    return;
  }

  if (cursorId == null) {
    // All cursors must operate within a session, one must be made implicitly if not explicitly provided
    if (cursor[kSession] == null && cursor[kTopology].hasSessionSupport()) {
      cursor[kSession] = cursor[kTopology].startSession({ owner: cursor, explicit: false });
    }

    cursor._initialize(cursor[kSession], (err, state) => {
      if (state) {
        const response = state.response;
        cursor[kServer] = state.server;
        cursor[kSession] = state.session;

        if (response.cursor) {
          cursor[kId] =
            typeof response.cursor.id === 'number'
              ? Long.fromNumber(response.cursor.id)
              : response.cursor.id;

          if (response.cursor.ns) {
            cursor[kNamespace] = ns(response.cursor.ns);
          }

          cursor[kDocuments] = response.cursor.firstBatch;
        } else {
          // NOTE: This is for support of older servers (<3.2) which do not use commands
          cursor[kId] =
            typeof response.cursorId === 'number'
              ? Long.fromNumber(response.cursorId)
              : response.cursorId;
          cursor[kDocuments] = response.documents;
        }

        // When server responses return without a cursor document, we close this cursor
        // and return the raw server response. This is often the case for explain commands
        // for example
        if (cursor[kId] == null) {
          cursor[kId] = Long.ZERO;
          // TODO(NODE-3286): ExecutionResult needs to accept a generic parameter
          cursor[kDocuments] = [state.response as TODO_NODE_3286];
        }
      }

      // the cursor is now initialized, even if an error occurred or it is dead
      cursor[kInitialized] = true;

      if (err || cursorIsDead(cursor)) {
        return cleanupCursor(cursor, { error: err }, () => callback(err, nextDocument(cursor)));
      }

      next(cursor, blocking, callback);
    });

    return;
  }

  if (cursorIsDead(cursor)) {
    return cleanupCursor(cursor, undefined, () => callback(undefined, null));
  }

  // otherwise need to call getMore
  const batchSize = cursor[kOptions].batchSize || 1000;
  cursor._getMore(batchSize, (err, response) => {
    if (response) {
      const cursorId =
        typeof response.cursor.id === 'number'
          ? Long.fromNumber(response.cursor.id)
          : response.cursor.id;

      cursor[kDocuments] = response.cursor.nextBatch;
      cursor[kId] = cursorId;
    }

    if (err || cursorIsDead(cursor)) {
      return cleanupCursor(cursor, { error: err }, () => callback(err, nextDocument(cursor)));
    }

    if (cursor[kDocuments].length === 0 && blocking === false) {
      return callback(undefined, null);
    }

    next(cursor, blocking, callback);
  });
}

function cursorIsDead(cursor: AbstractCursor): boolean {
  const cursorId = cursor[kId];
  return !!cursorId && cursorId.isZero();
}

function cleanupCursor(
  cursor: AbstractCursor,
  options: { error?: AnyError | undefined; needsToEmitClosed?: boolean } | undefined,
  callback: Callback
): void {
  const cursorId = cursor[kId];
  const cursorNs = cursor[kNamespace];
  const server = cursor[kServer];
  const session = cursor[kSession];
  const error = options?.error;
  const needsToEmitClosed = options?.needsToEmitClosed ?? cursor[kDocuments].length === 0;

  if (error) {
    if (cursor.loadBalanced && error instanceof MongoNetworkError) {
      return completeCleanup();
    }
  }

  if (cursorId == null || server == null || cursorId.isZero() || cursorNs == null) {
    if (needsToEmitClosed) {
      cursor[kClosed] = true;
      cursor[kId] = Long.ZERO;
      cursor.emit(AbstractCursor.CLOSE);
    }

    if (session) {
      if (session.owner === cursor) {
        return session.endSession({ error }, callback);
      }

      if (!session.inTransaction()) {
        maybeClearPinnedConnection(session, { error });
      }
    }

    return callback();
  }

  function completeCleanup() {
    if (session) {
      if (session.owner === cursor) {
        return session.endSession({ error }, () => {
          cursor.emit(AbstractCursor.CLOSE);
          callback();
        });
      }

      if (!session.inTransaction()) {
        maybeClearPinnedConnection(session, { error });
      }
    }

    cursor.emit(AbstractCursor.CLOSE);
    return callback();
  }

  cursor[kKilled] = true;
  server.killCursors(
    cursorNs,
    [cursorId],
    { ...pluckBSONSerializeOptions(cursor[kOptions]), session },
    () => completeCleanup()
  );
}

/** @internal */
export function assertUninitialized(cursor: AbstractCursor): void {
  if (cursor[kInitialized]) {
    throw new MongoCursorInUseError();
  }
}

function makeCursorStream<TSchema extends Document>(cursor: AbstractCursor<TSchema>) {
  const readable = new Readable({
    objectMode: true,
    autoDestroy: false,
    highWaterMark: 1
  });

  let initialized = false;
  let reading = false;
  let needToClose = true; // NOTE: we must close the cursor if we never read from it, use `_construct` in future node versions

  readable._read = function () {
    if (initialized === false) {
      needToClose = false;
      initialized = true;
    }

    if (!reading) {
      reading = true;
      readNext();
    }
  };

  readable._destroy = function (error, cb) {
    if (needToClose) {
      cursor.close(err => process.nextTick(cb, err || error));
    } else {
      cb(error);
    }
  };

  function readNext() {
    needToClose = false;
    next(cursor, true, (err, result) => {
      needToClose = err ? !cursor.closed : result != null;

      if (err) {
        // NOTE: This is questionable, but we have a test backing the behavior. It seems the
        //       desired behavior is that a stream ends cleanly when a user explicitly closes
        //       a client during iteration. Alternatively, we could do the "right" thing and
        //       propagate the error message by removing this special case.
        if (err.message.match(/server is closed/)) {
          cursor.close();
          return readable.push(null);
        }

        // NOTE: This is also perhaps questionable. The rationale here is that these errors tend
        //       to be "operation interrupted", where a cursor has been closed but there is an
        //       active getMore in-flight. This used to check if the cursor was killed but once
        //       that changed to happen in cleanup legitimate errors would not destroy the
        //       stream. There are change streams test specifically test these cases.
        if (err.message.match(/interrupted/)) {
          return readable.push(null);
        }

        return readable.destroy(err);
      }

      if (result == null) {
        readable.push(null);
      } else if (readable.destroyed) {
        cursor.close();
      } else {
        if (readable.push(result)) {
          return readNext();
        }

        reading = false;
      }
    });
  }

  return readable;
}
