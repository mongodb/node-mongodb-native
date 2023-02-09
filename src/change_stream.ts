import type { Readable } from 'stream';

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
import type { ServerSessionId } from './sessions';
import { filterOptions, getTopology, MongoDBNamespace } from './utils';

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

const CHANGE_STREAM_EVENTS = [RESUME_TOKEN_CHANGED, END, CLOSE];

const NO_RESUME_TOKEN_ERROR =
  'A change stream document has been received that lacks a resume token (_id).';
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
   * @sinceServerVersion 6.1.0
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
   * @sinceServerVersion 6.1.0
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
  /** Namespace the insert event occurred on */
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
  /** Namespace the update event occurred on */
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
  /** Namespace the replace event occurred on */
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
  /** Namespace the delete event occurred on */
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
  /** Namespace the drop event occurred on */
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
  /** The "from" namespace that the rename occurred on */
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

  /**
   * A document containing additional information about any ambiguous update paths from the update event.  The document
   * maps the full ambiguous update path to an array containing the actual resolved components of the path.  For example,
   * given a document shaped like `{ a: { '0': 0 } }`, and an update of `{ $inc: 'a.0' }`, disambiguated paths would look like
   * the following:
   *
   * ```
   *   {
   *     'a.0': ['a', '0']
   *   }
   * ```
   *
   * This field is only present when there are ambiguous paths that are updated as a part of the update event and `showExpandedEvents`
   * is enabled for the change stream.
   * @sinceServerVersion 6.1.0
   */
  disambiguatedPaths?: Document;
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
  cursor: ChangeStreamCursor<TSchema, TChange>;
  streamOptions?: CursorStreamOptions;
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
  async hasNext(): Promise<boolean> {
    this._setIsIterator();
    // Change streams must resume indefinitely while each resume event succeeds.
    // This loop continues until either a change event is received or until a resume attempt
    // fails.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const hasNext = await this.cursor.hasNext();
        return hasNext;
      } catch (error) {
        try {
          await this._processErrorIteratorMode(error);
        } catch (error) {
          try {
            await this.close();
          } catch {
            // We are not concerned with errors from close()
          }
          throw error;
        }
      }
    }
  }

  /** Get the next available document from the Change Stream. */
  async next(): Promise<TChange> {
    this._setIsIterator();
    // Change streams must resume indefinitely while each resume event succeeds.
    // This loop continues until either a change event is received or until a resume attempt
    // fails.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const change = await this.cursor.next();
        const processedChange = this._processChange(change ?? null);
        return processedChange;
      } catch (error) {
        try {
          await this._processErrorIteratorMode(error);
        } catch (error) {
          try {
            await this.close();
          } catch {
            // We are not concerned with errors from close()
          }
          throw error;
        }
      }
    }
  }

  /**
   * Try to get the next available document from the Change Stream's cursor or `null` if an empty batch is returned
   */
  async tryNext(): Promise<Document | null> {
    this._setIsIterator();
    // Change streams must resume indefinitely while each resume event succeeds.
    // This loop continues until either a change event is received or until a resume attempt
    // fails.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const change = await this.cursor.tryNext();
        return change ?? null;
      } catch (error) {
        try {
          await this._processErrorIteratorMode(error);
        } catch (error) {
          try {
            await this.close();
          } catch {
            // We are not concerned with errors from close()
          }
          throw error;
        }
      }
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<TChange, void, void> {
    if (this.closed) {
      return;
    }

    try {
      // Change streams run indefinitely as long as errors are resumable
      // So the only loop breaking condition is if `next()` throws
      while (true) {
        yield await this.next();
      }
    } finally {
      try {
        await this.close();
      } catch {
        // we're not concerned with errors from close()
      }
    }
  }

  /** Is the cursor closed */
  get closed(): boolean {
    return this[kClosed] || this.cursor.closed;
  }

  /** Close the Change Stream */
  async close(): Promise<void> {
    this[kClosed] = true;

    const cursor = this.cursor;
    try {
      await cursor.close();
    } finally {
      this._endStream();
    }
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   *
   * NOTE: When using a Stream to process change stream events, the stream will
   * NOT automatically resume in the case a resumable error is encountered.
   *
   * @throws MongoChangeStreamError if the underlying cursor or the change stream is closed
   */
  stream(options?: CursorStreamOptions): Readable & AsyncIterable<TChange> {
    if (this.closed) {
      throw new MongoChangeStreamError(CHANGESTREAM_CLOSED_ERROR);
    }

    this.streamOptions = options;
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

  /** @internal */
  private _closeEmitterModeWithError(error: AnyError): void {
    this.emit(ChangeStream.ERROR, error);

    this.close().catch(() => null);
  }

  /** @internal */
  private _streamEvents(cursor: ChangeStreamCursor<TSchema, TChange>): void {
    this._setIsEmitter();
    const stream = this[kCursorStream] ?? cursor.stream();
    this[kCursorStream] = stream;
    stream.on('data', change => {
      try {
        const processedChange = this._processChange(change);
        this.emit(ChangeStream.CHANGE, processedChange);
      } catch (error) {
        this.emit(ChangeStream.ERROR, error);
      }
    });
    stream.on('error', error => this._processErrorStreamMode(error));
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
  private _processChange(change: TChange | null): TChange {
    if (this[kClosed]) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      throw new MongoAPIError(CHANGESTREAM_CLOSED_ERROR);
    }

    // a null change means the cursor has been notified, implicitly closing the change stream
    if (change == null) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      throw new MongoRuntimeError(CHANGESTREAM_CLOSED_ERROR);
    }

    if (change && !change._id) {
      throw new MongoChangeStreamError(NO_RESUME_TOKEN_ERROR);
    }

    // cache the resume token
    this.cursor.cacheResumeToken(change._id);

    // wipe the startAtOperationTime if there was one so that there won't be a conflict
    // between resumeToken and startAtOperationTime if we need to reconnect the cursor
    this.options.startAtOperationTime = undefined;

    return change;
  }

  /** @internal */
  private _processErrorStreamMode(changeStreamError: AnyError) {
    // If the change stream has been closed explicitly, do not process error.
    if (this[kClosed]) return;

    if (isResumableError(changeStreamError, this.cursor.maxWireVersion)) {
      this._endStream();
      this.cursor.close().catch(() => null);

      const topology = getTopology(this.parent);
      topology.selectServer(this.cursor.readPreference, {}, serverSelectionError => {
        if (serverSelectionError) return this._closeEmitterModeWithError(changeStreamError);
        this.cursor = this._createChangeStreamCursor(this.cursor.resumeOptions);
      });
    } else {
      this._closeEmitterModeWithError(changeStreamError);
    }
  }

  /** @internal */
  private async _processErrorIteratorMode(changeStreamError: AnyError) {
    if (this[kClosed]) {
      // TODO(NODE-3485): Replace with MongoChangeStreamClosedError
      throw new MongoAPIError(CHANGESTREAM_CLOSED_ERROR);
    }

    if (!isResumableError(changeStreamError, this.cursor.maxWireVersion)) {
      try {
        await this.close();
      } catch {
        // ignore errors from close
      }
      throw changeStreamError;
    }

    await this.cursor.close().catch(() => null);
    const topology = getTopology(this.parent);
    try {
      await topology.selectServerAsync(this.cursor.readPreference, {});
      this.cursor = this._createChangeStreamCursor(this.cursor.resumeOptions);
    } catch {
      // if the topology can't reconnect, close the stream
      await this.close();
      throw changeStreamError;
    }
  }
}
