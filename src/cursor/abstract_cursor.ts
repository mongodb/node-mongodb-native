import { Readable, Transform } from 'stream';

import { type BSONSerializeOptions, type Document, Long, pluckBSONSerializeOptions } from '../bson';
import { type CursorResponse } from '../cmap/wire_protocol/responses';
import {
  MongoAPIError,
  MongoCursorExhaustedError,
  MongoCursorInUseError,
  MongoInvalidArgumentError,
  MongoRuntimeError,
  MongoTailableCursorError
} from '../error';
import type { MongoClient } from '../mongo_client';
import { TypedEventEmitter } from '../mongo_types';
import { executeOperation } from '../operations/execute_operation';
import { GetMoreOperation } from '../operations/get_more';
import { KillCursorsOperation } from '../operations/kill_cursors';
import { ReadConcern, type ReadConcernLike } from '../read_concern';
import { ReadPreference, type ReadPreferenceLike } from '../read_preference';
import type { Server } from '../sdam/server';
import { ClientSession, maybeClearPinnedConnection } from '../sessions';
import { type MongoDBNamespace, squashError } from '../utils';

/**
 * @internal
 * TODO(NODE-2882): A cursor's getMore commands must be run on the same server it was started on
 * and the same session must be used for the lifetime of the cursor. This object serves to get the
 * server and session (along with the response) out of executeOperation back to the AbstractCursor.
 *
 * There may be a better design for communicating these values back to the cursor, currently an operation
 * MUST store the selected server on itself so it can be read after executeOperation has returned.
 */
export interface InitialCursorResponse {
  /** The server selected for the operation */
  server: Server;
  /** The session used for this operation, may be implicitly created */
  session?: ClientSession;
  /** The raw server response for the operation */
  response: CursorResponse;
}

/** @public */
export const CURSOR_FLAGS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'exhaust',
  'partial'
] as const;

/** @public */
export interface CursorStreamOptions {
  /** A transformation method applied to each document emitted by the stream */
  transform?(this: void, doc: Document): Document;
}

/** @public */
export type CursorFlag = (typeof CURSOR_FLAGS)[number];

/** @public */
export interface AbstractCursorOptions extends BSONSerializeOptions {
  session?: ClientSession;
  readPreference?: ReadPreferenceLike;
  readConcern?: ReadConcernLike;
  /**
   * Specifies the number of documents to return in each response from MongoDB
   */
  batchSize?: number;
  /**
   * When applicable `maxTimeMS` controls the amount of time the initial command
   * that constructs a cursor should take. (ex. find, aggregate, listCollections)
   */
  maxTimeMS?: number;
  /**
   * When applicable `maxAwaitTimeMS` controls the amount of time subsequent getMores
   * that a cursor uses to fetch more data should take. (ex. cursor.next())
   */
  maxAwaitTimeMS?: number;
  /**
   * Comment to apply to the operation.
   *
   * In server versions pre-4.4, 'comment' must be string.  A server
   * error will be thrown if any other type is provided.
   *
   * In server versions 4.4 and above, 'comment' can be any valid BSON type.
   */
  comment?: unknown;
  /**
   * By default, MongoDB will automatically close a cursor when the
   * client has exhausted all results in the cursor. However, for [capped collections](https://www.mongodb.com/docs/manual/core/capped-collections)
   * you may use a Tailable Cursor that remains open after the client exhausts
   * the results in the initial cursor.
   */
  tailable?: boolean;
  /**
   * If awaitData is set to true, when the cursor reaches the end of the capped collection,
   * MongoDB blocks the query thread for a period of time waiting for new data to arrive.
   * When new data is inserted into the capped collection, the blocked thread is signaled
   * to wake up and return the next batch to the client.
   */
  awaitData?: boolean;
  noCursorTimeout?: boolean;
  /** @internal TODO(NODE-5688): make this public */
  timeoutMS?: number;
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
  private cursorId: Long | null;
  /** @internal */
  private cursorSession: ClientSession;
  /** @internal */
  private selectedServer?: Server;
  /** @internal */
  private cursorNamespace: MongoDBNamespace;
  /** @internal */
  private documents: CursorResponse | null = null;
  /** @internal */
  private cursorClient: MongoClient;
  /** @internal */
  private transform?: (doc: TSchema) => any;
  /** @internal */
  private initialized: boolean;
  /** @internal */
  private isClosed: boolean;
  /** @internal */
  private isKilled: boolean;
  /** @internal */
  protected readonly cursorOptions: InternalAbstractCursorOptions;

  /** @event */
  static readonly CLOSE = 'close' as const;

  /** @internal */
  protected constructor(
    client: MongoClient,
    namespace: MongoDBNamespace,
    options: AbstractCursorOptions = {}
  ) {
    super();

    if (!client.s.isMongoClient) {
      throw new MongoRuntimeError('Cursor must be constructed with MongoClient');
    }
    this.cursorClient = client;
    this.cursorNamespace = namespace;
    this.cursorId = null;
    this.initialized = false;
    this.isClosed = false;
    this.isKilled = false;
    this.cursorOptions = {
      readPreference:
        options.readPreference && options.readPreference instanceof ReadPreference
          ? options.readPreference
          : ReadPreference.primary,
      ...pluckBSONSerializeOptions(options)
    };
    this.cursorOptions.timeoutMS = options.timeoutMS;

    const readConcern = ReadConcern.fromOptions(options);
    if (readConcern) {
      this.cursorOptions.readConcern = readConcern;
    }

    if (typeof options.batchSize === 'number') {
      this.cursorOptions.batchSize = options.batchSize;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (options.comment !== undefined) {
      this.cursorOptions.comment = options.comment;
    }

    if (typeof options.maxTimeMS === 'number') {
      this.cursorOptions.maxTimeMS = options.maxTimeMS;
    }

    if (typeof options.maxAwaitTimeMS === 'number') {
      this.cursorOptions.maxAwaitTimeMS = options.maxAwaitTimeMS;
    }

    if (options.session instanceof ClientSession) {
      this.cursorSession = options.session;
    } else {
      this.cursorSession = this.cursorClient.startSession({ owner: this, explicit: false });
    }
  }

  /**
   * The cursor has no id until it receives a response from the initial cursor creating command.
   *
   * It is non-zero for as long as the database has an open cursor.
   *
   * The initiating command may receive a zero id if the entire result is in the `firstBatch`.
   */
  get id(): Long | undefined {
    return this.cursorId ?? undefined;
  }

  /** @internal */
  get isDead() {
    return (this.cursorId?.isZero() ?? false) || this.isClosed || this.isKilled;
  }

  /** @internal */
  get client(): MongoClient {
    return this.cursorClient;
  }

  /** @internal */
  get server(): Server | undefined {
    return this.selectedServer;
  }

  get namespace(): MongoDBNamespace {
    return this.cursorNamespace;
  }

  get readPreference(): ReadPreference {
    return this.cursorOptions.readPreference;
  }

  get readConcern(): ReadConcern | undefined {
    return this.cursorOptions.readConcern;
  }

  /** @internal */
  get session(): ClientSession {
    return this.cursorSession;
  }

  set session(clientSession: ClientSession) {
    this.cursorSession = clientSession;
  }

  /**
   * The cursor is closed and all remaining locally buffered documents have been iterated.
   */
  get closed(): boolean {
    return this.isClosed && (this.documents?.length ?? 0) === 0;
  }

  /**
   * A `killCursors` command was attempted on this cursor.
   * This is performed if the cursor id is non zero.
   */
  get killed(): boolean {
    return this.isKilled;
  }

  get loadBalanced(): boolean {
    return !!this.cursorClient.topology?.loadBalanced;
  }

  /** Returns current buffered documents length */
  bufferedCount(): number {
    return this.documents?.length ?? 0;
  }

  /** Returns current buffered documents */
  readBufferedDocuments(number?: number): TSchema[] {
    const bufferedDocs: TSchema[] = [];
    const documentsToRead = Math.min(
      number ?? this.documents?.length ?? 0,
      this.documents?.length ?? 0
    );

    for (let count = 0; count < documentsToRead; count++) {
      const document = this.documents?.shift(this.cursorOptions);
      if (document != null) {
        bufferedDocs.push(document);
      }
    }

    return bufferedDocs;
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<TSchema, void, void> {
    if (this.isClosed) {
      return;
    }

    try {
      while (true) {
        if (this.isKilled) {
          return;
        }

        if (this.closed) {
          return;
        }

        if (this.cursorId != null && this.isDead && (this.documents?.length ?? 0) === 0) {
          return;
        }

        const document = await this.next();

        // eslint-disable-next-line no-restricted-syntax
        if (document === null) {
          return;
        }

        yield document;
      }
    } finally {
      // Only close the cursor if it has not already been closed. This finally clause handles
      // the case when a user would break out of a for await of loop early.
      if (!this.isClosed) {
        try {
          await this.close();
        } catch (error) {
          squashError(error);
        }
      }
    }
  }

  stream(options?: CursorStreamOptions): Readable & AsyncIterable<TSchema> {
    if (options?.transform) {
      const transform = options.transform;
      const readable = new ReadableCursorStream(this);

      const transformedStream = readable.pipe(
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

      // Bubble errors to transformed stream, because otherwise no way
      // to handle this error.
      readable.on('error', err => transformedStream.emit('error', err));

      return transformedStream;
    }

    return new ReadableCursorStream(this);
  }

  async hasNext(): Promise<boolean> {
    if (this.cursorId === Long.ZERO) {
      return false;
    }

    do {
      if ((this.documents?.length ?? 0) !== 0) {
        return true;
      }
      await this.fetchBatch();
    } while (!this.isDead || (this.documents?.length ?? 0) !== 0);

    return false;
  }

  /** Get the next available document from the cursor, returns null if no more documents are available. */
  async next(): Promise<TSchema | null> {
    if (this.cursorId === Long.ZERO) {
      throw new MongoCursorExhaustedError();
    }

    do {
      const doc = this.documents?.shift(this.cursorOptions);
      if (doc != null) {
        if (this.transform != null) return await this.transformDocument(doc);
        return doc;
      }
      await this.fetchBatch();
    } while (!this.isDead || (this.documents?.length ?? 0) !== 0);

    return null;
  }

  /**
   * Try to get the next available document from the cursor or `null` if an empty batch is returned
   */
  async tryNext(): Promise<TSchema | null> {
    if (this.cursorId === Long.ZERO) {
      throw new MongoCursorExhaustedError();
    }

    let doc = this.documents?.shift(this.cursorOptions);
    if (doc != null) {
      if (this.transform != null) return await this.transformDocument(doc);
      return doc;
    }

    await this.fetchBatch();

    doc = this.documents?.shift(this.cursorOptions);
    if (doc != null) {
      if (this.transform != null) return await this.transformDocument(doc);
      return doc;
    }

    return null;
  }

  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * If the iterator returns `false`, iteration will stop.
   *
   * @param iterator - The iteration callback.
   * @deprecated - Will be removed in a future release. Use for await...of instead.
   */
  async forEach(iterator: (doc: TSchema) => boolean | void): Promise<void> {
    if (typeof iterator !== 'function') {
      throw new MongoInvalidArgumentError('Argument "iterator" must be a function');
    }
    for await (const document of this) {
      const result = iterator(document);
      if (result === false) {
        break;
      }
    }
  }

  async close(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   */
  async toArray(): Promise<TSchema[]> {
    const array = [];
    for await (const document of this) {
      array.push(document);
    }
    return array;
  }

  /**
   * Add a cursor flag to the cursor
   *
   * @param flag - The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
   * @param value - The flag boolean value.
   */
  addCursorFlag(flag: CursorFlag, value: boolean): this {
    this.throwIfInitialized();
    if (!CURSOR_FLAGS.includes(flag)) {
      throw new MongoInvalidArgumentError(`Flag ${flag} is not one of ${CURSOR_FLAGS}`);
    }

    if (typeof value !== 'boolean') {
      throw new MongoInvalidArgumentError(`Flag ${flag} must be a boolean value`);
    }

    this.cursorOptions[flag] = value;
    return this;
  }

  /**
   * Map all documents using the provided function
   * If there is a transform set on the cursor, that will be called first and the result passed to
   * this function's transform.
   *
   * @remarks
   *
   * **Note** Cursors use `null` internally to indicate that there are no more documents in the cursor. Providing a mapping
   * function that maps values to `null` will result in the cursor closing itself before it has finished iterating
   * all documents.  This will **not** result in a memory leak, just surprising behavior.  For example:
   *
   * ```typescript
   * const cursor = collection.find({});
   * cursor.map(() => null);
   *
   * const documents = await cursor.toArray();
   * // documents is always [], regardless of how many documents are in the collection.
   * ```
   *
   * Other falsey values are allowed:
   *
   * ```typescript
   * const cursor = collection.find({});
   * cursor.map(() => '');
   *
   * const documents = await cursor.toArray();
   * // documents is now an array of empty strings
   * ```
   *
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
    this.throwIfInitialized();
    const oldTransform = this.transform;
    if (oldTransform) {
      this.transform = doc => {
        return transform(oldTransform(doc));
      };
    } else {
      this.transform = transform;
    }

    return this as unknown as AbstractCursor<T>;
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @param readPreference - The new read preference for the cursor.
   */
  withReadPreference(readPreference: ReadPreferenceLike): this {
    this.throwIfInitialized();
    if (readPreference instanceof ReadPreference) {
      this.cursorOptions.readPreference = readPreference;
    } else if (typeof readPreference === 'string') {
      this.cursorOptions.readPreference = ReadPreference.fromString(readPreference);
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
    this.throwIfInitialized();
    const resolvedReadConcern = ReadConcern.fromOptions({ readConcern });
    if (resolvedReadConcern) {
      this.cursorOptions.readConcern = resolvedReadConcern;
    }

    return this;
  }

  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   *
   * @param value - Number of milliseconds to wait before aborting the query.
   */
  maxTimeMS(value: number): this {
    this.throwIfInitialized();
    if (typeof value !== 'number') {
      throw new MongoInvalidArgumentError('Argument for maxTimeMS must be a number');
    }

    this.cursorOptions.maxTimeMS = value;
    return this;
  }

  /**
   * Set the batch size for the cursor.
   *
   * @param value - The number of documents to return per batch. See {@link https://www.mongodb.com/docs/manual/reference/command/find/|find command documentation}.
   */
  batchSize(value: number): this {
    this.throwIfInitialized();
    if (this.cursorOptions.tailable) {
      throw new MongoTailableCursorError('Tailable cursor does not support batchSize');
    }

    if (typeof value !== 'number') {
      throw new MongoInvalidArgumentError('Operation "batchSize" requires an integer');
    }

    this.cursorOptions.batchSize = value;
    return this;
  }

  /**
   * Rewind this cursor to its uninitialized state. Any options that are present on the cursor will
   * remain in effect. Iterating this cursor will cause new queries to be sent to the server, even
   * if the resultant data has already been retrieved by this cursor.
   */
  rewind(): void {
    if (!this.initialized) {
      return;
    }

    this.cursorId = null;
    this.documents?.clear();
    this.isClosed = false;
    this.isKilled = false;
    this.initialized = false;

    const session = this.cursorSession;
    if (session) {
      // We only want to end this session if we created it, and it hasn't ended yet
      if (session.explicit === false) {
        if (!session.hasEnded) {
          // eslint-disable-next-line github/no-then
          session.endSession().then(undefined, squashError);
        }
        this.cursorSession = this.cursorClient.startSession({ owner: this, explicit: false });
      }
    }
  }

  /**
   * Returns a new uninitialized copy of this cursor, with options matching those that have been set on the current instance
   */
  abstract clone(): AbstractCursor<TSchema>;

  /** @internal */
  protected abstract _initialize(
    session: ClientSession | undefined
  ): Promise<InitialCursorResponse>;

  /** @internal */
  async getMore(batchSize: number): Promise<CursorResponse> {
    if (this.cursorId == null) {
      throw new MongoRuntimeError(
        'Unexpected null cursor id. A cursor creating command should have set this'
      );
    }
    if (this.selectedServer == null) {
      throw new MongoRuntimeError(
        'Unexpected null selectedServer. A cursor creating command should have set this'
      );
    }
    const getMoreOperation = new GetMoreOperation(
      this.cursorNamespace,
      this.cursorId,
      this.selectedServer,
      {
        ...this.cursorOptions,
        session: this.cursorSession,
        batchSize
      }
    );

    return await executeOperation(this.cursorClient, getMoreOperation);
  }

  /**
   * @internal
   *
   * This function is exposed for the unified test runner's createChangeStream
   * operation.  We cannot refactor to use the abstract _initialize method without
   * a significant refactor.
   */
  private async cursorInit(): Promise<void> {
    try {
      const state = await this._initialize(this.cursorSession);
      const response = state.response;
      this.selectedServer = state.server;
      this.cursorId = response.id;
      this.cursorNamespace = response.ns ?? this.namespace;
      this.documents = response;
      this.initialized = true; // the cursor is now initialized, even if it is dead
    } catch (error) {
      // the cursor is now initialized, even if an error occurred
      this.initialized = true;
      await this.cleanup(error);
      throw error;
    }

    if (this.isDead) {
      await this.cleanup();
    }

    return;
  }

  /** @internal Attempt to obtain more documents */
  private async fetchBatch(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    if (this.isDead) {
      // if the cursor is dead, we clean it up
      // cleanupCursor should never throw, but if it does it indicates a bug in the driver
      // and we should surface the error
      await this.cleanup();
      return;
    }

    if (this.cursorId == null) {
      await this.cursorInit();
      // If the cursor died or returned documents, return
      if ((this.documents?.length ?? 0) !== 0 || this.isDead) return;
      // Otherwise, run a getMore
    }

    // otherwise need to call getMore
    const batchSize = this.cursorOptions.batchSize || 1000;

    try {
      const response = await this.getMore(batchSize);
      this.cursorId = response.id;
      this.documents = response;
    } catch (error) {
      try {
        await this.cleanup(error);
      } catch (error) {
        // `cleanupCursor` should never throw, squash and throw the original error
        squashError(error);
      }
      throw error;
    }

    if (this.isDead) {
      // If we successfully received a response from a cursor BUT the cursor indicates that it is exhausted,
      // we intentionally clean up the cursor to release its session back into the pool before the cursor
      // is iterated.  This prevents a cursor that is exhausted on the server from holding
      // onto a session indefinitely until the AbstractCursor is iterated.
      //
      // cleanupCursorAsync should never throw, but if it does it indicates a bug in the driver
      // and we should surface the error
      await this.cleanup();
    }
  }

  /** @internal */
  private async cleanup(error?: Error) {
    this.isClosed = true;
    const session = this.cursorSession;
    try {
      if (
        !this.isKilled &&
        this.cursorId &&
        !this.cursorId.isZero() &&
        this.cursorNamespace &&
        this.selectedServer &&
        !session.hasEnded
      ) {
        this.isKilled = true;
        const cursorId = this.cursorId;
        this.cursorId = Long.ZERO;
        await executeOperation(
          this.cursorClient,
          new KillCursorsOperation(cursorId, this.cursorNamespace, this.selectedServer, {
            session
          })
        );
      }
    } catch (error) {
      squashError(error);
    } finally {
      if (session?.owner === this) {
        await session.endSession({ error });
      }
      if (!session?.inTransaction()) {
        maybeClearPinnedConnection(session, { error });
      }

      this.emitClose();
    }
  }

  /** @internal */
  private hasEmittedClose = false;
  /** @internal */
  private emitClose() {
    try {
      if (!this.hasEmittedClose && ((this.documents?.length ?? 0) === 0 || this.isClosed)) {
        // @ts-expect-error: CursorEvents is generic so Parameters<CursorEvents["close"]> may not be assignable to `[]`. Not sure how to require extenders do not add parameters.
        this.emit('close');
      }
    } finally {
      this.hasEmittedClose = true;
    }
  }

  /** @internal */
  private async transformDocument(document: NonNullable<TSchema>): Promise<TSchema> {
    if (this.transform == null) return document;

    try {
      const transformedDocument = this.transform(document);
      // eslint-disable-next-line no-restricted-syntax
      if (transformedDocument === null) {
        const TRANSFORM_TO_NULL_ERROR =
          'Cursor returned a `null` document, but the cursor is not exhausted.  Mapping documents to `null` is not supported in the cursor transform.';
        throw new MongoAPIError(TRANSFORM_TO_NULL_ERROR);
      }
      return transformedDocument;
    } catch (transformError) {
      try {
        await this.close();
      } catch (closeError) {
        squashError(closeError);
      }
      throw transformError;
    }
  }

  /** @internal */
  protected throwIfInitialized() {
    if (this.initialized) throw new MongoCursorInUseError();
  }
}

class ReadableCursorStream extends Readable {
  private _cursor: AbstractCursor;
  private _readInProgress = false;

  constructor(cursor: AbstractCursor) {
    super({
      objectMode: true,
      autoDestroy: false,
      highWaterMark: 1
    });
    this._cursor = cursor;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override _read(size: number): void {
    if (!this._readInProgress) {
      this._readInProgress = true;
      this._readNext();
    }
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    // eslint-disable-next-line github/no-then
    this._cursor.close().then(
      () => callback(error),
      closeError => callback(closeError)
    );
  }

  private _readNext() {
    if (this._cursor.id === Long.ZERO) {
      this.push(null);
      return;
    }

    // eslint-disable-next-line github/no-then
    this._cursor.next().then(
      result => {
        if (result == null) {
          this.push(null);
        } else if (this.destroyed) {
          // eslint-disable-next-line github/no-then
          this._cursor.close().then(undefined, squashError);
        } else {
          if (this.push(result)) {
            return this._readNext();
          }

          this._readInProgress = false;
        }
      },
      err => {
        // NOTE: This is questionable, but we have a test backing the behavior. It seems the
        //       desired behavior is that a stream ends cleanly when a user explicitly closes
        //       a client during iteration. Alternatively, we could do the "right" thing and
        //       propagate the error message by removing this special case.
        if (err.message.match(/server is closed/)) {
          // eslint-disable-next-line github/no-then
          this._cursor.close().then(undefined, squashError);
          return this.push(null);
        }

        // NOTE: This is also perhaps questionable. The rationale here is that these errors tend
        //       to be "operation was interrupted", where a cursor has been closed but there is an
        //       active getMore in-flight. This used to check if the cursor was killed but once
        //       that changed to happen in cleanup legitimate errors would not destroy the
        //       stream. There are change streams test specifically test these cases.
        if (err.message.match(/operation was interrupted/)) {
          return this.push(null);
        }

        // NOTE: The two above checks on the message of the error will cause a null to be pushed
        //       to the stream, thus closing the stream before the destroy call happens. This means
        //       that either of those error messages on a change stream will not get a proper
        //       'error' event to be emitted (the error passed to destroy). Change stream resumability
        //       relies on that error event to be emitted to create its new cursor and thus was not
        //       working on 4.4 servers because the error emitted on failover was "interrupted at
        //       shutdown" while on 5.0+ it is "The server is in quiesce mode and will shut down".
        //       See NODE-4475.
        return this.destroy(err);
      }
    );
  }
}
