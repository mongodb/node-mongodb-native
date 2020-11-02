import Denque = require('denque');
import { EventEmitter } from 'events';
import { MongoError, AnyError, isResumableError } from './error';
import { Cursor, CursorOptions, CursorStream, CursorStreamOptions } from './cursor/cursor';
import { AggregateOperation, AggregateOptions } from './operations/aggregate';
import { loadCollection, loadDb, loadMongoClient } from './dynamic_loaders';
import {
  relayEvents,
  maxWireVersion,
  calculateDurationInMs,
  now,
  maybePromise,
  MongoDBNamespace,
  Callback
} from './utils';
import type { ReadPreference } from './read_preference';
import type { Timestamp, Document } from './bson';
import type { Topology } from './sdam/topology';
import type { OperationParent } from './operations/command';
import type { CollationOptions } from './cmap/wire_protocol/write_command';
const kResumeQueue = Symbol('resumeQueue');
const kCursorStream = Symbol('cursorStream');

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
 * Represents a specific point in time on a server. Can be retrieved by using {@link Db.command}
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

/** @internal */
export class ChangeStreamStream extends CursorStream {
  constructor(cursor: ChangeStreamCursor) {
    super(cursor);
  }
}

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @public
 */
export class ChangeStream extends EventEmitter {
  pipeline: Document[];
  options: ChangeStreamOptions;
  parent: OperationParent;
  namespace: MongoDBNamespace;
  type: symbol;
  topology: Topology;
  cursor?: ChangeStreamCursor;
  closed: boolean;
  streamOptions?: CursorStreamOptions;
  [kResumeQueue]: Denque;
  [kCursorStream]?: CursorStream;

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
   * @param parent - The parent object that created this change stream
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
   */
  constructor(
    parent: OperationParent,
    pipeline: Document[] = [],
    options: ChangeStreamOptions = {}
  ) {
    super();

    const Collection = loadCollection();
    const Db = loadDb();
    const MongoClient = loadMongoClient();

    this.pipeline = pipeline;
    this.options = options;

    this.parent = parent;
    this.namespace = parent.s.namespace;
    if (parent instanceof Collection) {
      this.type = CHANGE_DOMAIN_TYPES.COLLECTION;
      this.topology = parent.s.db.s.topology;
    } else if (parent instanceof Db) {
      this.type = CHANGE_DOMAIN_TYPES.DATABASE;
      this.topology = parent.s.topology;
    } else if (parent instanceof MongoClient) {
      this.type = CHANGE_DOMAIN_TYPES.CLUSTER;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.topology = parent.topology!;
    } else {
      throw new TypeError(
        'parent provided to ChangeStream constructor is not an instance of Collection, Db, or MongoClient'
      );
    }

    if (!this.options.readPreference && parent.readPreference) {
      this.options.readPreference = parent.readPreference;
    }

    this[kResumeQueue] = new Denque();

    // Create contained Change Stream cursor
    this.cursor = createChangeStreamCursor(this, options);

    this.closed = false;

    // Listen for any `change` listeners being added to ChangeStream
    this.on('newListener', eventName => {
      if (eventName === 'change' && this.cursor && this.listenerCount('change') === 0) {
        streamEvents(this, this.cursor);
      }
    });

    this.on('removeListener', eventName => {
      if (eventName === 'change' && this.listenerCount('change') === 0 && this.cursor) {
        this[kCursorStream]?.removeAllListeners(CursorStream.DATA);
      }
    });
  }

  /** @internal */
  get cursorStream(): CursorStream | undefined {
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
        if (err) return cb(err); // failed to resume, raise an error
        if (!cursor) return cb(new MongoError('Cursor is undefined'));
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
  isClosed(): boolean {
    return this.closed || (this.cursor?.isClosed() ?? false);
  }

  /** Close the Change Stream */
  close(callback?: Callback): Promise<void> | void {
    return maybePromise(callback, cb => {
      if (this.closed) return cb();

      // flag the change stream as explicitly closed
      this.closed = true;

      if (!this.cursor) return cb();

      // Tidy up the existing cursor
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
  stream(options?: CursorStreamOptions): ChangeStreamStream {
    this.streamOptions = options;
    if (!this.cursor) {
      throw new MongoError('ChangeStream has no cursor, unable to stream');
    }
    return this.cursor.stream(options);
  }
}

/** @public */
export interface ChangeStreamCursorOptions extends CursorOptions {
  startAtOperationTime?: OperationTime;
  resumeAfter?: ResumeToken;
  startAfter?: boolean;
}

/** @internal */
export class ChangeStreamCursor extends Cursor<AggregateOperation, ChangeStreamCursorOptions> {
  _resumeToken: ResumeToken;
  startAtOperationTime?: OperationTime;
  hasReceived?: boolean;
  resumeAfter: ResumeToken;
  startAfter: ResumeToken;

  constructor(
    topology: Topology,
    operation: AggregateOperation,
    options: ChangeStreamCursorOptions
  ) {
    super(topology, operation, options);

    options = options || {};
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

  _initializeCursor(callback: Callback): void {
    super._initializeCursor((err, response) => {
      if (err || response == null) {
        callback(err, response);
        return;
      }

      if (
        this.startAtOperationTime == null &&
        this.resumeAfter == null &&
        this.startAfter == null &&
        maxWireVersion(this.server) >= 7
      ) {
        this.startAtOperationTime = response.operationTime;
      }

      this._processBatch('firstBatch', response);

      this.emit('init', response);
      this.emit('response');
      callback(err, response);
    });
  }

  _getMore(callback: Callback): void {
    super._getMore((err, response) => {
      if (err) {
        callback(err);
        return;
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
  self: ChangeStream,
  options: ChangeStreamOptions
): ChangeStreamCursor {
  const changeStreamStageOptions: Document = { fullDocument: options.fullDocument || 'default' };
  applyKnownOptions(changeStreamStageOptions, options, CHANGE_STREAM_OPTIONS);
  if (self.type === CHANGE_DOMAIN_TYPES.CLUSTER) {
    changeStreamStageOptions.allChangesForCluster = true;
  }

  const pipeline = [{ $changeStream: changeStreamStageOptions } as Document].concat(self.pipeline);
  const cursorOptions = applyKnownOptions({}, options, CURSOR_OPTIONS);
  const changeStreamCursor = new ChangeStreamCursor(
    self.topology,
    new AggregateOperation(self.parent, pipeline, options),
    cursorOptions
  );

  relayEvents(changeStreamCursor, self, ['resumeTokenChanged', 'end', 'close']);

  if (self.listenerCount(ChangeStream.CHANGE) > 0) streamEvents(self, changeStreamCursor);
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
  if (!callback) changeStream.emit(ChangeStream.ERROR, error);
  changeStream.close(() => callback && callback(error));
}

function streamEvents(changeStream: ChangeStream, cursor: ChangeStreamCursor): void {
  const stream = changeStream[kCursorStream] || cursor.stream();
  changeStream[kCursorStream] = stream;
  stream.on(CursorStream.DATA, change => processNewChange(changeStream, change));
  stream.on(CursorStream.ERROR, error => processError(changeStream, error));
}

function endStream(changeStream: ChangeStream): void {
  const cursorStream = changeStream[kCursorStream];
  if (cursorStream) {
    [CursorStream.DATA, CursorStream.CLOSE, CursorStream.END, CursorStream.ERROR].forEach(event =>
      cursorStream.removeAllListeners(event)
    );

    cursorStream.destroy();
  }

  changeStream[kCursorStream] = undefined;
}

function processNewChange(
  changeStream: ChangeStream,
  change: ChangeStreamDocument,
  callback?: Callback
) {
  if (changeStream.closed) {
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
  const topology = changeStream.topology;
  const cursor = changeStream.cursor;

  // If the change stream has been closed explicitly, do not process error.
  if (changeStream.closed) {
    if (callback) callback(new MongoError('ChangeStream is closed'));
    return;
  }

  // if the resume succeeds, continue with the new cursor
  function resumeWithCursor(newCursor: ChangeStreamCursor) {
    changeStream.cursor = newCursor;
    processResumeQueue(changeStream);
  }

  // otherwise, raise an error and close the change stream
  function unresumableError(err: AnyError) {
    if (!callback) changeStream.emit(ChangeStream.ERROR, err);
    changeStream.close(() => processResumeQueue(changeStream, err));
  }

  if (cursor && isResumableError(error as MongoError, maxWireVersion(cursor.server))) {
    changeStream.cursor = undefined;

    // stop listening to all events from old cursor
    endStream(changeStream);

    // close internal cursor, ignore errors
    cursor.close();

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
  if (changeStream.isClosed()) {
    callback(new MongoError('ChangeStream is closed.'));
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
    if (changeStream.isClosed() && !err) {
      request(new MongoError('Change Stream is not open.'));
      return;
    }
    request(err, changeStream.cursor);
  }
}
