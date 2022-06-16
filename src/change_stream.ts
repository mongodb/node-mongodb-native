import Denque = require('denque');
import type { Readable } from 'stream';
import { setTimeout } from 'timers';

import type { Binary, Document, Timestamp } from './bson';
import { Collection } from './collection';
import { CHANGE, CLOSE, END, ERROR, INIT, MORE, RESPONSE, RESUME_TOKEN_CHANGED } from './constants';
import type { AbstractCursorEvents, CursorStreamOptions } from './cursor/abstract_cursor';
import { ChangeStreamCursor, ChangeStreamCursorOptions } from './cursor/change_stream_cursor';
import { Db } from './db';
import {
  AnyError,
  isResumableError,
  MongoAPIError,
  MongoChangeStreamError,
  MongoRuntimeError
} from './error';
import { MongoClient } from './mongo_client';
import { InferIdType, TypedEventEmitter } from './mongo_types';
import type { AggregateOptions } from './operations/aggregate';
import type { CollationOptions, OperationParent } from './operations/command';
import type { ReadPreference } from './read_preference';
import type { Topology } from './sdam/topology';
import type { ServerSessionId } from './sessions';
import {
  calculateDurationInMs,
  Callback,
  filterOptions,
  getTopology,
  maxWireVersion,
  maybePromise,
  MongoDBNamespace,
  now
} from './utils';

/** @internal */
const kResumeQueue = Symbol('resumeQueue');
/** @internal */
const kCursorStream = Symbol('cursorStream');
/** @internal */
const kClosed = Symbol('closed');
/** @internal */
const kMode = Symbol('mode');

const CHANGE_STREAM_OPTIONS = [
  'resumeAfter',
  'startAfter',
  'startAtOperationTime',
  'fullDocument',
  'fullDocumentBeforeChange',
  'showExpandedEvents'
] as const;

const CHANGE_DOMAIN_TYPES = {
  COLLECTION: Symbol('Collection'),
  DATABASE: Symbol('Database'),
  CLUSTER: Symbol('Cluster')
};

interface TopologyWaitOptions {
  start?: number;
  timeout?: number;
  readPreference?: ReadPreference;
}

const SELECTION_TIMEOUT = 30000;

const CHANGE_STREAM_EVENTS = [RESUME_TOKEN_CHANGED, END, CLOSE];

const NO_RESUME_TOKEN_ERROR =
  'A change stream document has been received that lacks a resume token (_id).';
const NO_CURSOR_ERROR = 'ChangeStream has no cursor';
const CHANGESTREAM_CLOSED_ERROR = 'ChangeStream is closed';

/**
 * @public
 * @deprecated Please use the ChangeStreamCursorOptions type instead.
 */
export interface ResumeOptions {
  startAtOperationTime?: Timestamp;
  batchSize?: number;
  maxAwaitTimeMS?: number;
  collation?: CollationOptions;
  readPreference?: ReadPreference;
  resumeAfter?: ResumeToken;
  startAfter?: ResumeToken;
  fullDocument?: string;
}

/**
 * Represents the logical starting point for a new ChangeStream or resuming a ChangeStream on the server.
 * @see https://www.mongodb.com/docs/manual/changeStreams/#std-label-change-stream-resume
 * @public
 */
export type ResumeToken = unknown;

/**
 * Represents a specific point in time on a server. Can be retrieved by using `db.command()`
 * @public
 * @see https://docs.mongodb.com/manual/reference/method/db.runCommand/#response
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
  /**
   * Allowed values: 'updateLookup', 'whenAvailable', 'required'.
   *
   * When set to 'updateLookup', the change notification for partial updates
   * will include both a delta describing the changes to the document as well
   * as a copy of the entire document that was changed from some time after
   * the change occurred.
   *
   * When set to 'whenAvailable', configures the change stream to return the
   * post-image of the modified document for replace and update change events
   * if the post-image for this event is available.
   *
   * When set to 'required', the same behavior as 'whenAvailable' except that
   * an error is raised if the post-image is not available.
   */
  fullDocument?: string;

  /**
   * Allowed values: 'whenAvailable', 'required', 'off'.
   *
   * The default is to not send a value, which is equivalent to 'off'.
   *
   * When set to 'whenAvailable', configures the change stream to return the
   * pre-image of the modified document for replace, update, and delete change
   * events if it is available.
   *
   * When set to 'required', the same behavior as 'whenAvailable' except that
   * an error is raised if the pre-image is not available.
   */
  fullDocumentBeforeChange?: string;
  /** The maximum amount of time for the server to wait on new documents to satisfy a change stream query. */
  maxAwaitTimeMS?: number;
  /**
   * Allows you to start a changeStream after a specified event.
   * @see https://docs.mongodb.com/manual/changeStreams/#resumeafter-for-change-streams
   */
  resumeAfter?: ResumeToken;
  /**
   * Similar to resumeAfter, but will allow you to start after an invalidated event.
   * @see https://docs.mongodb.com/manual/changeStreams/#startafter-for-change-streams
   */
  startAfter?: ResumeToken;
  /** Will start the changeStream after the specified operationTime. */
  startAtOperationTime?: OperationTime;
  /**
   * The number of documents to return per batch.
   * @see https://docs.mongodb.com/manual/reference/command/aggregate
   */
  batchSize?: number;

  /**
   * When enabled, configures the change stream to include extra change events.
   *
   * - createIndexes
   * - dropIndexes
   * - modify
   * - create
   * - shardCollection
   * - reshardCollection
   * - refineCollectionShardKey
   */
  showExpandedEvents?: boolean;
}

/** @public */
export interface ChangeStreamNameSpace {
  db: string;
  coll: string;
}

/** @public */
export interface ChangeStreamDocumentKey<TSchema extends Document = Document> {
  /**
   * For unsharded collections this contains a single field `_id`.
   * For sharded collections, this will contain all the components of the shard key
   */
  documentKey: { _id: InferIdType<TSchema>; [shardKey: string]: any };
}

/** @public */
export interface ChangeStreamDocumentCommon {
  /**
   * The id functions as an opaque token for use when resuming an interrupted
   * change stream.
   */
  _id: ResumeToken;
  /**
   * The timestamp from the oplog entry associated with the event.
   * For events that happened as part of a multi-document transaction, the associated change stream
   * notifications will have the same clusterTime value, namely the time when the transaction was committed.
   * On a sharded cluster, events that occur on different shards can have the same clusterTime but be
   * associated with different transactions or even not be associated with any transaction.
   * To identify events for a single transaction, you can use the combination of lsid and txnNumber in the change stream event document.
   */
  clusterTime?: Timestamp;

  /**
   * The transaction number.
   * Only present if the operation is part of a multi-document transaction.
   *
   * **NOTE:** txnNumber can be a Long if promoteLongs is set to false
   */
  txnNumber?: number;

  /**
   * The identifier for the session associated with the transaction.
   * Only present if the operation is part of a multi-document transaction.
   */
  lsid?: ServerSessionId;
}

/** @public */
export interface ChangeStreamDocumentCollectionUUID {
  /**
   * The UUID (Binary subtype 4) of the collection that the operation was performed on.
   *
   * Only present when the `showExpandedEvents` flag is enabled.
   *
   * **NOTE:** collectionUUID will be converted to a NodeJS Buffer if the promoteBuffers
   *    flag is enabled.
   *
   * @since 6.1.0
   */
  collectionUUID: Binary;
}

/** @public */
export interface ChangeStreamDocumentOperationDescription {
  /**
   * An description of the operation.
   *
   * Only present when the `showExpandedEvents` flag is enabled.
   *
   * @since 6.1.0
   */
  operationDescription?: Document;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#insert-event
 */
export interface ChangeStreamInsertDocument<TSchema extends Document = Document>
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentKey<TSchema>,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'insert';
  /** This key will contain the document being inserted */
  fullDocument: TSchema;
  /** Namespace the insert event occured on */
  ns: ChangeStreamNameSpace;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#update-event
 */
export interface ChangeStreamUpdateDocument<TSchema extends Document = Document>
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentKey<TSchema>,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'update';
  /**
   * This is only set if `fullDocument` is set to `'updateLookup'`
   * Contains the point-in-time post-image of the modified document if the
   * post-image is available and either 'required' or 'whenAvailable' was
   * specified for the 'fullDocument' option when creating the change stream.
   */
  fullDocument?: TSchema;
  /** Contains a description of updated and removed fields in this operation */
  updateDescription: UpdateDescription<TSchema>;
  /** Namespace the update event occured on */
  ns: ChangeStreamNameSpace;
  /**
   * Contains the pre-image of the modified or deleted document if the
   * pre-image is available for the change event and either 'required' or
   * 'whenAvailable' was specified for the 'fullDocumentBeforeChange' option
   * when creating the change stream. If 'whenAvailable' was specified but the
   * pre-image is unavailable, this will be explicitly set to null.
   */
  fullDocumentBeforeChange?: TSchema;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#replace-event
 */
export interface ChangeStreamReplaceDocument<TSchema extends Document = Document>
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentKey<TSchema> {
  /** Describes the type of operation represented in this change notification */
  operationType: 'replace';
  /** The fullDocument of a replace event represents the document after the insert of the replacement document */
  fullDocument: TSchema;
  /** Namespace the replace event occured on */
  ns: ChangeStreamNameSpace;
  /**
   * Contains the pre-image of the modified or deleted document if the
   * pre-image is available for the change event and either 'required' or
   * 'whenAvailable' was specified for the 'fullDocumentBeforeChange' option
   * when creating the change stream. If 'whenAvailable' was specified but the
   * pre-image is unavailable, this will be explicitly set to null.
   */
  fullDocumentBeforeChange?: TSchema;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#delete-event
 */
export interface ChangeStreamDeleteDocument<TSchema extends Document = Document>
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentKey<TSchema>,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'delete';
  /** Namespace the delete event occured on */
  ns: ChangeStreamNameSpace;
  /**
   * Contains the pre-image of the modified or deleted document if the
   * pre-image is available for the change event and either 'required' or
   * 'whenAvailable' was specified for the 'fullDocumentBeforeChange' option
   * when creating the change stream. If 'whenAvailable' was specified but the
   * pre-image is unavailable, this will be explicitly set to null.
   */
  fullDocumentBeforeChange?: TSchema;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#drop-event
 */
export interface ChangeStreamDropDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'drop';
  /** Namespace the drop event occured on */
  ns: ChangeStreamNameSpace;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#rename-event
 */
export interface ChangeStreamRenameDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'rename';
  /** The new name for the `ns.coll` collection */
  to: { db: string; coll: string };
  /** The "from" namespace that the rename occured on */
  ns: ChangeStreamNameSpace;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#dropdatabase-event
 */
export interface ChangeStreamDropDatabaseDocument extends ChangeStreamDocumentCommon {
  /** Describes the type of operation represented in this change notification */
  operationType: 'dropDatabase';
  /** The database dropped */
  ns: { db: string };
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#invalidate-event
 */
export interface ChangeStreamInvalidateDocument extends ChangeStreamDocumentCommon {
  /** Describes the type of operation represented in this change notification */
  operationType: 'invalidate';
}

/**
 * Only present when the `showExpandedEvents` flag is enabled.
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamCreateIndexDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID,
    ChangeStreamDocumentOperationDescription {
  /** Describes the type of operation represented in this change notification */
  operationType: 'createIndexes';
}

/**
 * Only present when the `showExpandedEvents` flag is enabled.
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamDropIndexDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID,
    ChangeStreamDocumentOperationDescription {
  /** Describes the type of operation represented in this change notification */
  operationType: 'dropIndexes';
}

/**
 * Only present when the `showExpandedEvents` flag is enabled.
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamCollModDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'modify';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamCreateDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID {
  /** Describes the type of operation represented in this change notification */
  operationType: 'create';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamShardCollectionDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID,
    ChangeStreamDocumentOperationDescription {
  /** Describes the type of operation represented in this change notification */
  operationType: 'shardCollection';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamReshardCollectionDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID,
    ChangeStreamDocumentOperationDescription {
  /** Describes the type of operation represented in this change notification */
  operationType: 'reshardCollection';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export interface ChangeStreamRefineCollectionShardKeyDocument
  extends ChangeStreamDocumentCommon,
    ChangeStreamDocumentCollectionUUID,
    ChangeStreamDocumentOperationDescription {
  /** Describes the type of operation represented in this change notification */
  operationType: 'refineCollectionShardKey';
}

/** @public */
export type ChangeStreamDocument<TSchema extends Document = Document> =
  | ChangeStreamInsertDocument<TSchema>
  | ChangeStreamUpdateDocument<TSchema>
  | ChangeStreamReplaceDocument<TSchema>
  | ChangeStreamDeleteDocument<TSchema>
  | ChangeStreamDropDocument
  | ChangeStreamRenameDocument
  | ChangeStreamDropDatabaseDocument
  | ChangeStreamInvalidateDocument
  | ChangeStreamCreateIndexDocument
  | ChangeStreamCreateDocument
  | ChangeStreamCollModDocument
  | ChangeStreamDropIndexDocument
  | ChangeStreamShardCollectionDocument
  | ChangeStreamReshardCollectionDocument
  | ChangeStreamRefineCollectionShardKeyDocument;

/** @public */
export interface UpdateDescription<TSchema extends Document = Document> {
  /**
   * A document containing key:value pairs of names of the fields that were
   * changed, and the new value for those fields.
   */
  updatedFields?: Partial<TSchema>;

  /**
   * An array of field names that were removed from the document.
   */
  removedFields?: string[];

  /**
   * An array of documents which record array truncations performed with pipeline-based updates using one or more of the following stages:
   * - $addFields
   * - $set
   * - $replaceRoot
   * - $replaceWith
   */
  truncatedArrays?: Array<{
    /** The name of the truncated field. */
    field: string;
    /** The number of elements in the truncated array. */
    newSize: number;
  }>;
}

/** @public */
export type ChangeStreamEvents<
  TSchema extends Document = Document,
  TChange extends Document = ChangeStreamDocument<TSchema>
> = {
  resumeTokenChanged(token: ResumeToken): void;
  init(response: any): void;
  more(response?: any): void;
  response(): void;
  end(): void;
  error(error: Error): void;
  change(change: TChange): void;
} & AbstractCursorEvents;

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @public
 */
export class ChangeStream<
  TSchema extends Document = Document,
  TChange extends Document = ChangeStreamDocument<TSchema>
> extends TypedEventEmitter<ChangeStreamEvents<TSchema, TChange>> {
  pipeline: Document[];
  options: ChangeStreamOptions;
  parent: MongoClient | Db | Collection;
  namespace: MongoDBNamespace;
  type: symbol;
  /** @internal */
  cursor: ChangeStreamCursor<TSchema, TChange> | undefined;
  streamOptions?: CursorStreamOptions;
  /** @internal */
  [kResumeQueue]: Denque<Callback<ChangeStreamCursor<TSchema, TChange>>>;
  /** @internal */
  [kCursorStream]?: Readable & AsyncIterable<TChange>;
  /** @internal */
  [kClosed]: boolean;
  /** @internal */
  [kMode]: false | 'iterator' | 'emitter';

  /** @event */
  static readonly RESPONSE = RESPONSE;
  /** @event */
  static readonly MORE = MORE;
  /** @event */
  static readonly INIT = INIT;
  /** @event */
  static readonly CLOSE = CLOSE;
  /**
   * Fired for each new matching change in the specified namespace. Attaching a `change`
   * event listener to a Change Stream will switch the stream into flowing mode. Data will
   * then be passed as soon as it is available.
   * @event
   */
  static readonly CHANGE = CHANGE;
  /** @event */
  static readonly END = END;
  /** @event */
  static readonly ERROR = ERROR;
  /**
   * Emitted each time the change stream stores a new resume token.
   * @event
   */
  static readonly RESUME_TOKEN_CHANGED = RESUME_TOKEN_CHANGED;

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
      throw new MongoChangeStreamError(
        'Parent provided to ChangeStream constructor must be an instance of Collection, Db, or MongoClient'
      );
    }

    this.parent = parent;
    this.namespace = parent.s.namespace;
    if (!this.options.readPreference && parent.readPreference) {
      this.options.readPreference = parent.readPreference;
    }

    this[kResumeQueue] = new Denque();

    // Create contained Change Stream cursor
    this.cursor = this._createChangeStreamCursor(options);

    this[kClosed] = false;
    this[kMode] = false;

    // Listen for any `change` listeners being added to ChangeStream
    this.on('newListener', eventName => {
      if (eventName === 'change' && this.cursor && this.listenerCount('change') === 0) {
        this._streamEvents(this.cursor);
      }
    });

    this.on('removeListener', eventName => {
      if (eventName === 'change' && this.listenerCount('change') === 0 && this.cursor) {
        this[kCursorStream]?.removeAllListeners('data');
      }
    });
  }

  /** @internal */
  get cursorStream(): (Readable & AsyncIterable<TChange>) | undefined {
    return this[kCursorStream];
  }

  /** The cached resume token that is used to resume after the most recently returned change. */
  get resumeToken(): ResumeToken {
    return this.cursor?.resumeToken;
  }

  /** Check if there is any document still available in the Change Stream */
  hasNext(): Promise<boolean>;
  hasNext(callback: Callback<boolean>): void;
  hasNext(callback?: Callback): Promise<boolean> | void {
    this._setIsIterator();
    return maybePromise(callback, cb => {
      this._getCursor((err, cursor) => {
        if (err || !cursor) return cb(err); // failed to resume, raise an error
        cursor.hasNext(cb);
      });
    });
  }

  /** Get the next available document from the Change Stream. */
  next(): Promise<TChange>;
  next(callback: Callback<TChange>): void;
  next(callback?: Callback<TChange>): Promise<TChange> | void {
    this._setIsIterator();
    return maybePromise(callback, cb => {
      this._getCursor((err, cursor) => {
        if (err || !cursor) return cb(err); // failed to resume, raise an error
        cursor.next((error, change) => {
          if (error) {
            this[kResumeQueue].push(() => this.next(cb));
            this._processError(error, cb);
            return;
          }
          this._processNewChange(change ?? null, cb);
        });
      });
    });
  }

  /**
   * Try to get the next available document from the Change Stream's cursor or `null` if an empty batch is returned
   */
  tryNext(): Promise<Document | null>;
  tryNext(callback: Callback<Document | null>): void;
  tryNext(callback?: Callback<Document | null>): Promise<Document | null> | void {
    this._setIsIterator();
    return maybePromise(callback, cb => {
      this._getCursor((err, cursor) => {
        if (err || !cursor) return cb(err); // failed to resume, raise an error
        return cursor.tryNext(cb);
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
        this._endStream();
        this.cursor = undefined;
        return cb(err);
      });
    });
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   * @throws MongoDriverError if this.cursor is undefined
   */
  stream(options?: CursorStreamOptions): Readable & AsyncIterable<TChange> {
    this.streamOptions = options;
    if (!this.cursor) throw new MongoChangeStreamError(NO_CURSOR_ERROR);
    return this.cursor.stream(options);
  }

  /** @internal */
  private _setIsEmitter(): void {
    if (this[kMode] === 'iterator') {
      // TODO(NODE-3485): Replace with MongoChangeStreamModeError
      throw new MongoAPIError(
        'ChangeStream cannot be used as an EventEmitter after being used as an iterator'
      );
    }
    this[kMode] = 'emitter';
  }

  /** @internal */
  private _setIsIterator(): void {
    if (this[kMode] === 'emitter') {
      // TODO(NODE-3485): Replace with MongoChangeStreamModeError
      throw new MongoAPIError(
        'ChangeStream cannot be used as an iterator after being used as an EventEmitter'
      );
    }
    this[kMode] = 'iterator';
  }

  /**
   * Create a new change stream cursor based on self's configuration
   * @internal
   */
  private _createChangeStreamCursor(
    options: ChangeStreamOptions | ChangeStreamCursorOptions
  ): ChangeStreamCursor<TSchema, TChange> {
    const changeStreamStageOptions = filterOptions(options, CHANGE_STREAM_OPTIONS);
    if (this.type === CHANGE_DOMAIN_TYPES.CLUSTER) {
      changeStreamStageOptions.allChangesForCluster = true;
    }
    const pipeline = [{ $changeStream: changeStreamStageOptions }, ...this.pipeline];

    const client: MongoClient | null =
      this.type === CHANGE_DOMAIN_TYPES.CLUSTER
        ? (this.parent as MongoClient)
        : this.type === CHANGE_DOMAIN_TYPES.DATABASE
        ? (this.parent as Db).s.client
        : this.type === CHANGE_DOMAIN_TYPES.COLLECTION
        ? (this.parent as Collection).s.db.s.client
        : null;

    if (client == null) {
      // This should never happen because of the assertion in the constructor
      throw new MongoRuntimeError(
        `Changestream type should only be one of cluster, database, collection. Found ${this.type.toString()}`
      );
    }

    const changeStreamCursor = new ChangeStreamCursor<TSchema, TChange>(
      client,
      this.namespace,
      pipeline,
      options
    );

    for (const event of CHANGE_STREAM_EVENTS) {
      changeStreamCursor.on(event, e => this.emit(event, e));
    }

    if (this.listenerCount(ChangeStream.CHANGE) > 0) {
      this._streamEvents(changeStreamCursor);
    }

    return changeStreamCursor;
  }

  /**
   * This method performs a basic server selection loop, satisfying the requirements of
   * ChangeStream resumability until the new SDAM layer can be used.
   * @internal
   */
  private _waitForTopologyConnected(
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
        // TODO(NODE-3497): Replace with MongoNetworkTimeoutError
        return callback(new MongoRuntimeError('Timed out waiting for connection'));
      }

      this._waitForTopologyConnected(topology, options, callback);
    }, 500); // this is an arbitrary wait time to allow SDAM to transition
  }

  /** @internal */
  private _closeWithError(error: AnyError, callback?: Callback): void {
    if (!callback) {
      this.emit(ChangeStream.ERROR, error);
    }

    this.close(() => callback && callback(error));
  }

  /** @internal */
  private _streamEvents(cursor: ChangeStreamCursor<TSchema, TChange>): void {
    this._setIsEmitter();
    const stream = this[kCursorStream] ?? cursor.stream();
    this[kCursorStream] = stream;
    stream.on('data', change => this._processNewChange(change));
    stream.on('error', error => this._processError(error));
  }

  /** @internal */
  private _endStream(): void {
    const cursorStream = this[kCursorStream];
    if (cursorStream) {
      ['data', 'close', 'end', 'error'].forEach(event => cursorStream.removeAllListeners(event));
      cursorStream.destroy();
    }

    this[kCursorStream] = undefined;
  }

  /** @internal */
  private _processNewChange(change: TChange | null, callback?: Callback<TChange>) {
    if (this[kClosed]) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      if (callback) callback(new MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
      return;
    }

    // a null change means the cursor has been notified, implicitly closing the change stream
    if (change == null) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      return this._closeWithError(new MongoRuntimeError(CHANGESTREAM_CLOSED_ERROR), callback);
    }

    if (change && !change._id) {
      return this._closeWithError(new MongoChangeStreamError(NO_RESUME_TOKEN_ERROR), callback);
    }

    // cache the resume token
    this.cursor?.cacheResumeToken(change._id);

    // wipe the startAtOperationTime if there was one so that there won't be a conflict
    // between resumeToken and startAtOperationTime if we need to reconnect the cursor
    this.options.startAtOperationTime = undefined;

    // Return the change
    if (!callback) return this.emit(ChangeStream.CHANGE, change);
    return callback(undefined, change);
  }

  /** @internal */
  private _processError(error: AnyError, callback?: Callback) {
    const cursor = this.cursor;

    // If the change stream has been closed explicitly, do not process error.
    if (this[kClosed]) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      if (callback) callback(new MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
      return;
    }

    // if the resume succeeds, continue with the new cursor
    const resumeWithCursor = (newCursor: ChangeStreamCursor<TSchema, TChange>) => {
      this.cursor = newCursor;
      this._processResumeQueue();
    };

    if (cursor && isResumableError(error, maxWireVersion(cursor.server))) {
      this.cursor = undefined;

      // stop listening to all events from old cursor
      this._endStream();

      // close internal cursor, ignore errors
      cursor.close();

      const topology = getTopology(this.parent);
      this._waitForTopologyConnected(topology, { readPreference: cursor.readPreference }, err => {
        // if the topology can't reconnect, close the stream
        if (err) return this._closeWithError(err, callback);

        // create a new cursor, preserving the old cursor's options
        const newCursor = this._createChangeStreamCursor(cursor.resumeOptions);

        // attempt to continue in emitter mode
        if (!callback) return resumeWithCursor(newCursor);

        // attempt to continue in iterator mode
        newCursor.hasNext(err => {
          // if there's an error immediately after resuming, close the stream
          if (err) return this._closeWithError(err);
          resumeWithCursor(newCursor);
        });
      });
      return;
    }

    // if initial error wasn't resumable, raise an error and close the change stream
    return this._closeWithError(error, callback);
  }

  /** @internal */
  private _getCursor(callback: Callback<ChangeStreamCursor<TSchema, TChange>>) {
    if (this[kClosed]) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      callback(new MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
      return;
    }

    // if a cursor exists and it is open, return it
    if (this.cursor) {
      callback(undefined, this.cursor);
      return;
    }

    // no cursor, queue callback until topology reconnects
    this[kResumeQueue].push(callback);
  }

  /**
   * Drain the resume queue when a new has become available
   * @internal
   *
   * @param error - error getting a new cursor
   */
  private _processResumeQueue(error?: Error) {
    while (this[kResumeQueue].length) {
      const request = this[kResumeQueue].pop();
      if (!request) break; // Should never occur but TS can't use the length check in the while condition

      if (!error) {
        if (this[kClosed]) {
          // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
          request(new MongoAPIError(CHANGESTREAM_CLOSED_ERROR));
          return;
        }
        if (!this.cursor) {
          request(new MongoChangeStreamError(NO_CURSOR_ERROR));
          return;
        }
      }
      request(error, this.cursor ?? undefined);
    }
  }
}
