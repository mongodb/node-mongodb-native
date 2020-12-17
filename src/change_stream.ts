import Denque = require('denque');
import { EventEmitter } from 'events';
import { MongoError, AnyError, isResumableError } from './error';
import { AggregateOperation, AggregateOptions } from './operations/aggregate';
import {
  relayEvents,
  maxWireVersion,
  calculateDurationInMs,
  now,
  maybePromise,
  MongoDBNamespace,
  Callback,
  getTopology
} from './utils';
import type { ReadPreference } from './read_preference';
import type { Timestamp, Document } from './bson';
import type { Topology } from './sdam/topology';
import type { OperationParent, CollationOptions } from './operations/command';
import { MongoClient } from './mongo_client';
import { Db } from './db';
import { Collection } from './collection';
import type { Readable } from 'stream';
import {
  AbstractCursor,
  AbstractCursorOptions,
  CursorStreamOptions
} from './cursor/abstract_cursor';
import type { ClientSession } from './sessions';
import { executeOperation, ExecutionResult } from './operations/execute_operation';

const kResumeQueue = Symbol('resumeQueue');
const kCursorStream = Symbol('cursorStream');
const kClosed = Symbol('closed');

const CHANGE_STREAM_OPTIONS = ['resumeAfter', 'startAfter', 'startAtOperationTime', 'fullDocument'];
const CURSOR_OPTIONS = ['batchSize', 'maxAwaitTimeMS', 'collation', 'readPreference'].concat(
  CHANGE_STREAM_OPTIONS
);

const CHANGE_DOMAIN_TYPES = {
  COLLECTION: Symbol('Collection'),
  DATABASE: Symbol('Database'),
  CLUSTER: Symbol('Cluster')
};

const NO_RESUME_TOKEN_ERROR = new MongoError(
  'A change stream document has been received that lacks a resume token (_id).'
);
const NO_CURSOR_ERROR = new MongoError('ChangeStream has no cursor');
const CHANGESTREAM_CLOSED_ERROR = new MongoError('ChangeStream is closed');

/** @public */
export interface ResumeOptions {
  startAtOperationTime?: Timestamp;
  batchSize?: number;
  maxAwaitTimeMS?: number;
  collation?: CollationOptions;
  readPreference?: ReadPreference;
}

/**
 * Represents the logical starting point for a new or resuming {@link https://docs.mongodb.com/master/changeStreams/#change-stream-resume-token| Change Stream} on the server.
 * @public
 */
export type ResumeToken = unknown;

/**
 * Represents a specific point in time on a server. Can be retrieved by using {@link Db#command}
 * @public
 * @remarks
 * See {@link https://docs.mongodb.com/manual/reference/method/db.runCommand/#response| Run Command Response}
 */
export type OperationTime = Timestamp;

/** @public */
export interface PipeOptions {
  end?: boolean;
}

/**
 * Options that can be passed to a ChangeStream. Note that startAfter, resumeAfter, and startAtOperationTime are all mutually exclusive, and the server will error if more than one is specified.
 * @public
 */
export interface ChangeStreamOptions extends AggregateOptions {
  /** Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred. */
  fullDocument?: string;
  /** The maximum amount of time for the server to wait on new documents to satisfy a change stream query. */
  maxAwaitTimeMS?: number;
  /** Allows you to start a changeStream after a specified event. See {@link https://docs.mongodb.com/master/changeStreams/#resumeafter-for-change-streams|ChangeStream documentation}. */
  resumeAfter?: ResumeToken;
  /** Similar to resumeAfter, but will allow you to start after an invalidated event. See {@link https://docs.mongodb.com/master/changeStreams/#startafter-for-change-streams|ChangeStream documentation}. */
  startAfter?: ResumeToken;
  /** Will start the changeStream after the specified operationTime. */
  startAtOperationTime?: OperationTime;
  /** The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}. */
  batchSize?: number;
}

interface ChangeStreamDocument {
  /**
   * The id functions as an opaque token for use when resuming an interrupted
   * change stream.
   */
  _id: Document;

  /**
   * Describes the type of operation represented in this change notification.
   */
  operationType:
    | 'insert'
    | 'update'
    | 'replace'
    | 'delete'
    | 'invalidate'
    | 'drop'
    | 'dropDatabase'
    | 'rename';

  /**
   * Contains two fields: “db” and “coll” containing the database and
   * collection name in which the change happened.
   */
  ns: Document;

  /**
   * Only present for ops of type ‘insert’, ‘update’, ‘replace’, and
   * ‘delete’.
   *
   * For unsharded collections this contains a single field, _id, with the
   * value of the _id of the document updated.  For sharded collections,
   * this will contain all the components of the shard key in order,
   * followed by the _id if the _id isn’t part of the shard key.
   */
  documentKey?: Document;

  /**
   * Only present for ops of type ‘update’.
   *
   * Contains a description of updated and removed fields in this
   * operation.
   */
  updateDescription?: UpdateDescription;

  /**
   * Always present for operations of type ‘insert’ and ‘replace’. Also
   * present for operations of type ‘update’ if the user has specified ‘updateLookup’
   * in the ‘fullDocument’ arguments to the ‘$changeStream’ stage.
   *
   * For operations of type ‘insert’ and ‘replace’, this key will contain the
   * document being inserted, or the new version of the document that is replacing
   * the existing document, respectively.
   *
   * For operations of type ‘update’, this key will contain a copy of the full
   * version of the document from some point after the update occurred. If the
   * document was deleted since the updated happened, it will be null.
   */
  fullDocument?: Document;
}

interface UpdateDescription {
  /**
   * A document containing key:value pairs of names of the fields that were
   * changed, and the new value for those fields.
   */
  updatedFields: Document;

  /**
   * An array of field names that were removed from the document.
   */
  removedFields: string[];
}

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @public
 */
export class ChangeStream extends EventEmitter {
  pipeline: Document[];
  options: ChangeStreamOptions;
  parent: MongoClient | Db | Collection;
  namespace: MongoDBNamespace;
  type: symbol;
  /** @internal */
  cursor?: ChangeStreamCursor;
  streamOptions?: CursorStreamOptions;
  /** @internal */
  [kResumeQueue]: Denque;
  /** @internal */
  [kCursorStream]?: Readable;
  /** @internal */
  [kClosed]: boolean;

  /** @event */
  static readonly CLOSE = 'close' as const;
  /**
   * Fired for each new matching change in the specified namespace. Attaching a `change`
   * event listener to a Change Stream will switch the stream into flowing mode. Data will
   * then be passed as soon as it is available.
   * @event
   */
  static readonly CHANGE = 'change' as const;
  /** @event */
  static readonly END = 'end' as const;
  /** @event */
  static readonly ERROR = 'error' as const;
  /**
   * Emitted each time the change stream stores a new resume token.
   * @event
   */
  static readonly RESUME_TOKEN_CHANGED = 'resumeTokenChanged' as const;

  /**
   * @internal
   *
   * @param parent - The parent object that created this change stream
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
   */
  constructor(
    parent: OperationParent,
    pipeline: Document[] = [],
    options: ChangeStreamOptions = {}
  ) {
    super();

    this.pipeline = pipeline;
    this.options = options;

    if (parent instanceof Collection) {
      this.type = CHANGE_DOMAIN_TYPES.COLLECTION;
    } else if (parent instanceof Db) {
      this.type = CHANGE_DOMAIN_TYPES.DATABASE;
    } else if (parent instanceof MongoClient) {
      this.type = CHANGE_DOMAIN_TYPES.CLUSTER;
    } else {
      throw new TypeError(
        'parent provided to ChangeStream constructor is not an instance of Collection, Db, or MongoClient'
      );
    }

    this.parent = parent;
    this.namespace = parent.s.namespace;
    if (!this.options.readPreference && parent.readPreference) {
      this.options.readPreference = parent.readPreference;
    }

    this[kResumeQueue] = new Denque();

    // Create contained Change Stream cursor
    this.cursor = createChangeStreamCursor(this, options);

    this[kClosed] = false;

    // Listen for any `change` listeners being added to ChangeStream
    this.on('newListener', eventName => {
      if (eventName === 'change' && this.cursor && this.listenerCount('change') === 0) {
        streamEvents(this, this.cursor);
      }
    });

    this.on('removeListener', eventName => {
      if (eventName === 'change' && this.listenerCount('change') === 0 && this.cursor) {
        this[kCursorStream]?.removeAllListeners('data');
      }
    });
  }

  /** @internal */
  get cursorStream(): Readable | undefined {
    return this[kCursorStream];
  }

  /** The cached resume token that is used to resume after the most recently returned change. */
  get resumeToken(): ResumeToken {
    return this.cursor?.resumeToken;
  }

  /** Check if there is any document still available in the Change Stream */
  hasNext(callback?: Callback): Promise<void> | void {
    return maybePromise(callback, cb => {
      getCursor(this, (err, cursor) => {
        if (err || !cursor) return cb(err); // failed to resume, raise an error
        cursor.hasNext(cb);
      });
    });
  }

  /** Get the next available document from the Change Stream. */
  next(callback?: Callback): Promise<void> | void {
    return maybePromise(callback, cb => {
      getCursor(this, (err, cursor) => {
        if (err || !cursor) return cb(err); // failed to resume, raise an error
        cursor.next((error, change) => {
          if (error) {
            this[kResumeQueue].push(() => this.next(cb));
            processError(this, error, cb);
            return;
          }
          processNewChange(this, change as ChangeStreamDocument, cb);
        });
      });
    });
  }

  /** Is the cursor closed */
  get closed(): boolean {
    return this[kClosed] || (this.cursor?.closed ?? false);
  }

  /** Close the Change Stream */
  close(callback?: Callback): Promise<void> | void {
    this[kClosed] = true;

    return maybePromise(callback, cb => {
      if (!this.cursor) {
        return cb();
      }

      const cursor = this.cursor;
      return cursor.close(err => {
        endStream(this);
        this.cursor = undefined;
        return cb(err);
      });
    });
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   * @throws MongoError if this.cursor is undefined
   */
  stream(options?: CursorStreamOptions): Readable {
    this.streamOptions = options;
    if (!this.cursor) throw NO_CURSOR_ERROR;
    return this.cursor.stream(options);
  }

  /**
   * Try to get the next available document from the Change Stream's cursor or `null` if an empty batch is returned
   */
  tryNext(): Promise<Document | null>;
  tryNext(callback: Callback<Document | null>): void;
  tryNext(callback?: Callback<Document | null>): Promise<Document | null> | void {
    return maybePromise(callback, cb => {
      getCursor(this, (err, cursor) => {
        if (err || !cursor) return cb(err); // failed to resume, raise an error
        return cursor.tryNext(cb);
      });
    });
  }
}

/** @internal */
export interface ChangeStreamCursorOptions extends AbstractCursorOptions {
  startAtOperationTime?: OperationTime;
  resumeAfter?: ResumeToken;
  startAfter?: boolean;
}

/** @internal */
export class ChangeStreamCursor extends AbstractCursor {
  _resumeToken: ResumeToken;
  startAtOperationTime?: OperationTime;
  hasReceived?: boolean;
  resumeAfter: ResumeToken;
  startAfter: ResumeToken;
  options: ChangeStreamCursorOptions;

  postBatchResumeToken?: ResumeToken;
  pipeline: Document[];

  constructor(
    topology: Topology,
    namespace: MongoDBNamespace,
    pipeline: Document[] = [],
    options: ChangeStreamCursorOptions = {}
  ) {
    super(topology, namespace, options);

    this.pipeline = pipeline;
    this.options = options;
    this._resumeToken = null;
    this.startAtOperationTime = options.startAtOperationTime;

    if (options.startAfter) {
      this.resumeToken = options.startAfter;
    } else if (options.resumeAfter) {
      this.resumeToken = options.resumeAfter;
    }
  }

  set resumeToken(token: ResumeToken) {
    this._resumeToken = token;
    this.emit(ChangeStream.RESUME_TOKEN_CHANGED, token);
  }

  get resumeToken(): ResumeToken {
    return this._resumeToken;
  }

  get resumeOptions(): ResumeOptions {
    const result = {} as ResumeOptions;
    for (const optionName of CURSOR_OPTIONS) {
      if (Reflect.has(this.options, optionName)) {
        Reflect.set(result, optionName, Reflect.get(this.options, optionName));
      }
    }

    if (this.resumeToken || this.startAtOperationTime) {
      ['resumeAfter', 'startAfter', 'startAtOperationTime'].forEach(key =>
        Reflect.deleteProperty(result, key)
      );

      if (this.resumeToken) {
        const resumeKey =
          this.options.startAfter && !this.hasReceived ? 'startAfter' : 'resumeAfter';
        Reflect.set(result, resumeKey, this.resumeToken);
      } else if (this.startAtOperationTime && maxWireVersion(this.server) >= 7) {
        result.startAtOperationTime = this.startAtOperationTime;
      }
    }

    return result;
  }

  cacheResumeToken(resumeToken: ResumeToken): void {
    if (this.bufferedCount() === 0 && this.postBatchResumeToken) {
      this.resumeToken = this.postBatchResumeToken;
    } else {
      this.resumeToken = resumeToken;
    }
    this.hasReceived = true;
  }

  _processBatch(batchName: string, response?: Document): void {
    const cursor = response?.cursor || {};
    if (cursor.postBatchResumeToken) {
      this.postBatchResumeToken = cursor.postBatchResumeToken;

      if (cursor[batchName].length === 0) {
        this.resumeToken = cursor.postBatchResumeToken;
      }
    }
  }

  clone(): ChangeStreamCursor {
    return new ChangeStreamCursor(this.topology, this.namespace, this.pipeline, {
      ...this.cursorOptions
    });
  }

  _initialize(session: ClientSession, callback: Callback<ExecutionResult>): void {
    const aggregateOperation = new AggregateOperation(
      { s: { namespace: this.namespace } },
      this.pipeline,
      {
        ...this.cursorOptions,
        ...this.options,
        session
      }
    );

    executeOperation(this.topology, aggregateOperation, (err, response) => {
      if (err || response == null) {
        return callback(err);
      }

      const server = aggregateOperation.server;
      if (
        this.startAtOperationTime == null &&
        this.resumeAfter == null &&
        this.startAfter == null &&
        maxWireVersion(server) >= 7
      ) {
        this.startAtOperationTime = response.operationTime;
      }

      this._processBatch('firstBatch', response);

      this.emit('init', response);
      this.emit('response');

      // TODO: NODE-2882
      callback(undefined, { server, session, response });
    });
  }

  _getMore(batchSize: number, callback: Callback): void {
    super._getMore(batchSize, (err, response) => {
      if (err) {
        return callback(err);
      }

      this._processBatch('nextBatch', response);

      this.emit('more', response);
      this.emit('response');
      callback(err, response);
    });
  }
}

/**
 * Create a new change stream cursor based on self's configuration
 * @internal
 */
function createChangeStreamCursor(
  changeStream: ChangeStream,
  options: ChangeStreamOptions
): ChangeStreamCursor {
  const changeStreamStageOptions: Document = { fullDocument: options.fullDocument || 'default' };
  applyKnownOptions(changeStreamStageOptions, options, CHANGE_STREAM_OPTIONS);
  if (changeStream.type === CHANGE_DOMAIN_TYPES.CLUSTER) {
    changeStreamStageOptions.allChangesForCluster = true;
  }

  const pipeline = [{ $changeStream: changeStreamStageOptions } as Document].concat(
    changeStream.pipeline
  );

  const cursorOptions = applyKnownOptions({}, options, CURSOR_OPTIONS);
  const changeStreamCursor = new ChangeStreamCursor(
    getTopology(changeStream.parent),
    changeStream.namespace,
    pipeline,
    cursorOptions
  );

  relayEvents(changeStreamCursor, changeStream, ['resumeTokenChanged', 'end', 'close']);
  if (changeStream.listenerCount(ChangeStream.CHANGE) > 0) {
    streamEvents(changeStream, changeStreamCursor);
  }

  return changeStreamCursor;
}

function applyKnownOptions(target: Document, source: Document, optionNames: string[]) {
  optionNames.forEach(name => {
    if (source[name]) {
      target[name] = source[name];
    }
  });

  return target;
}

interface TopologyWaitOptions {
  start?: number;
  timeout?: number;
  readPreference?: ReadPreference;
}
// This method performs a basic server selection loop, satisfying the requirements of
// ChangeStream resumability until the new SDAM layer can be used.
const SELECTION_TIMEOUT = 30000;
function waitForTopologyConnected(
  topology: Topology,
  options: TopologyWaitOptions,
  callback: Callback
) {
  setTimeout(() => {
    if (options && options.start == null) {
      options.start = now();
    }

    const start = options.start || now();
    const timeout = options.timeout || SELECTION_TIMEOUT;
    if (topology.isConnected()) {
      return callback();
    }

    if (calculateDurationInMs(start) > timeout) {
      return callback(new MongoError('Timed out waiting for connection'));
    }

    waitForTopologyConnected(topology, options, callback);
  }, 500); // this is an arbitrary wait time to allow SDAM to transition
}

function closeWithError(changeStream: ChangeStream, error: AnyError, callback?: Callback): void {
  if (!callback) {
    changeStream.emit(ChangeStream.ERROR, error);
  }

  changeStream.close(() => callback && callback(error));
}

function streamEvents(changeStream: ChangeStream, cursor: ChangeStreamCursor): void {
  const stream = changeStream[kCursorStream] || cursor.stream();
  changeStream[kCursorStream] = stream;
  stream.on('data', change => processNewChange(changeStream, change));
  stream.on('error', error => processError(changeStream, error));
}

function endStream(changeStream: ChangeStream): void {
  const cursorStream = changeStream[kCursorStream];
  if (cursorStream) {
    ['data', 'close', 'end', 'error'].forEach(event => cursorStream.removeAllListeners(event));
    cursorStream.destroy();
  }

  changeStream[kCursorStream] = undefined;
}

function processNewChange(
  changeStream: ChangeStream,
  change: ChangeStreamDocument,
  callback?: Callback
) {
  if (changeStream[kClosed]) {
    if (callback) callback(CHANGESTREAM_CLOSED_ERROR);
    return;
  }

  // a null change means the cursor has been notified, implicitly closing the change stream
  if (change == null) {
    return closeWithError(changeStream, CHANGESTREAM_CLOSED_ERROR, callback);
  }

  if (change && !change._id) {
    return closeWithError(changeStream, NO_RESUME_TOKEN_ERROR, callback);
  }

  // cache the resume token
  changeStream.cursor?.cacheResumeToken(change._id);

  // wipe the startAtOperationTime if there was one so that there won't be a conflict
  // between resumeToken and startAtOperationTime if we need to reconnect the cursor
  changeStream.options.startAtOperationTime = undefined;

  // Return the change
  if (!callback) return changeStream.emit(ChangeStream.CHANGE, change);
  return callback(undefined, change);
}

function processError(changeStream: ChangeStream, error: AnyError, callback?: Callback) {
  const cursor = changeStream.cursor;

  // If the change stream has been closed explicitly, do not process error.
  if (changeStream[kClosed]) {
    if (callback) callback(CHANGESTREAM_CLOSED_ERROR);
    return;
  }

  // if the resume succeeds, continue with the new cursor
  function resumeWithCursor(newCursor: ChangeStreamCursor) {
    changeStream.cursor = newCursor;
    processResumeQueue(changeStream);
  }

  // otherwise, raise an error and close the change stream
  function unresumableError(err: AnyError) {
    if (!callback) {
      changeStream.emit(ChangeStream.ERROR, err);
    }

    changeStream.close(() => processResumeQueue(changeStream, err));
  }

  if (cursor && isResumableError(error as MongoError, maxWireVersion(cursor.server))) {
    changeStream.cursor = undefined;

    // stop listening to all events from old cursor
    endStream(changeStream);

    // close internal cursor, ignore errors
    cursor.close();

    const topology = getTopology(changeStream.parent);
    waitForTopologyConnected(topology, { readPreference: cursor.readPreference }, err => {
      // if the topology can't reconnect, close the stream
      if (err) return unresumableError(err);

      // create a new cursor, preserving the old cursor's options
      const newCursor = createChangeStreamCursor(changeStream, cursor.resumeOptions);

      // attempt to continue in emitter mode
      if (!callback) return resumeWithCursor(newCursor);

      // attempt to continue in iterator mode
      newCursor.hasNext(err => {
        // if there's an error immediately after resuming, close the stream
        if (err) return unresumableError(err);
        resumeWithCursor(newCursor);
      });
    });
    return;
  }

  // if initial error wasn't resumable, raise an error and close the change stream
  return closeWithError(changeStream, error, callback);
}

/**
 * Safely provides a cursor across resume attempts
 *
 * @param changeStream - the parent ChangeStream
 */
function getCursor(changeStream: ChangeStream, callback: Callback<ChangeStreamCursor>) {
  if (changeStream[kClosed]) {
    callback(CHANGESTREAM_CLOSED_ERROR);
    return;
  }

  // if a cursor exists and it is open, return it
  if (changeStream.cursor) {
    callback(undefined, changeStream.cursor);
    return;
  }

  // no cursor, queue callback until topology reconnects
  changeStream[kResumeQueue].push(callback);
}

/**
 * Drain the resume queue when a new has become available
 *
 * @param changeStream - the parent ChangeStream
 * @param err - error getting a new cursor
 */
function processResumeQueue(changeStream: ChangeStream, err?: Error) {
  while (changeStream[kResumeQueue].length) {
    const request = changeStream[kResumeQueue].pop();
    if (!err) {
      if (changeStream[kClosed]) {
        request(CHANGESTREAM_CLOSED_ERROR);
        return;
      }
      if (!changeStream.cursor) {
        request(NO_CURSOR_ERROR);
        return;
      }
    }
    request(err, changeStream.cursor);
  }
}
