/// <reference types="node" />
import { Binary } from 'bson';
import BufferList = require('bl');
import { Code } from 'bson';
import type { ConnectionOptions as ConnectionOptions_2 } from 'tls';
import * as crypto from 'crypto';
import { DBRef } from 'bson';
import { Decimal128 } from 'bson';
import Denque = require('denque');
import * as dns from 'dns';
import { Double } from 'bson';
import { Duplex } from 'stream';
import { DuplexOptions } from 'stream';
import { EventEmitter } from 'events';
import { Int32 } from 'bson';
import type { IpcNetConnectOpts } from 'net';
import { Long } from 'bson';
import { MaxKey } from 'bson';
import { MinKey } from 'bson';
import { ObjectId } from 'bson';
import { Readable } from 'stream';
import type { SerializeOptions } from 'bson';
import type { Socket } from 'net';
import type { TcpNetConnectOpts } from 'net';
import { Timestamp } from 'bson';
import type { TLSSocket } from 'tls';
import { Transform } from 'stream';
import { Writable } from 'stream';

/** @public */
export declare interface AddUserOptions extends CommandOperationOptions {
  /** @deprecated Please use db.command('createUser', ...) instead for this option */
  digestPassword?: null;
  /** Roles associated with the created user (only Mongodb 2.6 or higher) */
  roles?: string | string[];
  /** Custom data associated with the user (only Mongodb 2.6 or higher) */
  customData?: Document;
}

/**
 * @public
 * The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 *
 * **ADMIN Cannot directly be instantiated**
 *
 * @example
 * ```js
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 *
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Use the admin database for the operation
 *   const adminDb = client.db(dbName).admin();
 *
 *   // List all the available databases
 *   adminDb.listDatabases(function(err, dbs) {
 *     expect(err).to.not.exist;
 *     test.ok(dbs.databases.length > 0);
 *     client.close();
 *   });
 * });
 * ```
 */
export declare class Admin {
  /** @internal */
  s: AdminPrivate;
  /** @internal Create a new Admin instance (INTERNAL TYPE, do not instantiate directly) */
  constructor(db: Db);
  /**
   * Execute a command
   *
   * @param command - The command to execute
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  command(command: Document): Promise<Document>;
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  buildInfo(): Promise<Document>;
  buildInfo(callback: Callback<Document>): void;
  buildInfo(options: CommandOperationOptions): Promise<Document>;
  buildInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  serverInfo(): Promise<Document>;
  serverInfo(callback: Callback<Document>): void;
  serverInfo(options: CommandOperationOptions): Promise<Document>;
  serverInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Retrieve this db's server status.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  serverStatus(): Promise<Document>;
  serverStatus(callback: Callback<Document>): void;
  serverStatus(options: CommandOperationOptions): Promise<Document>;
  serverStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Ping the MongoDB server and retrieve results
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  ping(): Promise<Document>;
  ping(callback: Callback<Document>): void;
  ping(options: CommandOperationOptions): Promise<Document>;
  ping(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param password - An optional password for the new user
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  addUser(username: string): Promise<Document>;
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  addUser(
    username: string,
    password: string,
    options: AddUserOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  removeUser(username: string): Promise<boolean>;
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  /**
   * Validate an existing collection
   *
   * @param collectionName - The name of the collection to validate.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  validateCollection(collectionName: string): Promise<Document>;
  validateCollection(collectionName: string, callback: Callback<Document>): void;
  validateCollection(collectionName: string, options: ValidateCollectionOptions): Promise<Document>;
  validateCollection(
    collectionName: string,
    options: ValidateCollectionOptions,
    callback: Callback<Document>
  ): void;
  /**
   * List the available databases
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  listDatabases(): Promise<ListDatabasesResult>;
  listDatabases(callback: Callback<ListDatabasesResult>): void;
  listDatabases(options: ListDatabasesOptions): Promise<ListDatabasesResult>;
  listDatabases(options: ListDatabasesOptions, callback: Callback<ListDatabasesResult>): void;
  /**
   * Get ReplicaSet status
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replSetGetStatus(): Promise<Document>;
  replSetGetStatus(callback: Callback<Document>): void;
  replSetGetStatus(options: CommandOperationOptions): Promise<Document>;
  replSetGetStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
}

/** @internal */
export declare interface AdminPrivate {
  db: Db;
}

/** @internal */
export declare class AggregateOperation<T = Document> extends CommandOperation<
  AggregateOptions,
  T
> {
  target: string | typeof DB_AGGREGATE_COLLECTION;
  pipeline: Document[];
  hasWriteStage: boolean;
  constructor(parent: OperationParent, pipeline: Document[], options?: AggregateOptions);
  get canRetryRead(): boolean;
  addToPipeline(stage: Document): void;
  execute(server: Server, callback: Callback<T>): void;
}

/** @public */
export declare interface AggregateOptions extends CommandOperationOptions {
  /** allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 \>). */
  allowDiskUse?: boolean;
  /** The number of documents to return per batch. See [aggregation documentation](https://docs.mongodb.com/manual/reference/command/aggregate). */
  batchSize?: number;
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** Return the query as cursor, on 2.6 \> it returns as a real cursor on pre 2.6 it returns as an emulated cursor. */
  cursor?: Document;
  /** Explain returns the aggregation execution plan (requires mongodb 2.6 \>) */
  explain?: boolean;
  /** specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. */
  maxAwaitTimeMS?: number;
  /** Specify collation. */
  collation?: CollationOptions;
  /** Add an index selection hint to an aggregation command */
  hint?: Hint;
  full?: boolean;
  out?: string;
}

/**
 * @public
 * The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 */
export declare class AggregationCursor extends Cursor<
  AggregateOperation,
  AggregationCursorOptions
> {
  /** @internal */
  constructor(
    topology: Topology,
    operation: AggregateOperation,
    options?: AggregationCursorOptions
  );
  /** Set the batch size for the cursor. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation} */
  batchSize(batchSize: number): this;
  /** Add a group stage to the aggregation pipeline */
  group($group: Document): this;
  /** Add a limit stage to the aggregation pipeline */
  limit($limit: number): this;
  /** Add a match stage to the aggregation pipeline */
  match($match: Document): this;
  /** Add a maxTimeMS stage to the aggregation pipeline */
  maxTimeMS(maxTimeMS: number): this;
  /** Add a out stage to the aggregation pipeline */
  out($out: number): this;
  /** Add a project stage to the aggregation pipeline */
  project($project: Document): this;
  /** Add a lookup stage to the aggregation pipeline */
  lookup($lookup: Document): this;
  /** Add a redact stage to the aggregation pipeline */
  redact($redact: Document): this;
  /** Add a skip stage to the aggregation pipeline */
  skip($skip: number): this;
  /** Add a sort stage to the aggregation pipeline */
  sort($sort: Sort): this;
  /** Add a unwind stage to the aggregation pipeline */
  unwind($unwind: number): this;
  /** @deprecated Add a geoNear stage to the aggregation pipeline */
  geoNear: ($geoNear: Document) => this;
}

/** @public */
export declare interface AggregationCursorOptions extends CursorOptions, AggregateOptions {}

/** @public */
export declare type AnyError = MongoError | Error;

/** @public */
export declare interface Auth {
  /** The username for auth */
  user?: string;
  /** The password for auth */
  pass?: string;
}

/** @public */
export declare enum AuthMechanism {
  MONGODB_AWS = 'MONGODB-AWS',
  MONGODB_CR = 'MONGODB-CR',
  MONGODB_DEFAULT = 'DEFAULT',
  MONGODB_GSSAPI = 'GSSAPI',
  MONGODB_PLAIN = 'PLAIN',
  MONGODB_SCRAM_SHA1 = 'SCRAM-SHA-1',
  MONGODB_SCRAM_SHA256 = 'SCRAM-SHA-256',
  MONGODB_X509 = 'MONGODB-X509'
}

/** @public */
export declare interface AutoEncrypter {
  init(cb: Callback): void;
  teardown(force: boolean, callback: Callback): void;
  encrypt(ns: string, cmd: Document, options: any, callback: Callback<Document>): void;
  decrypt(cmd: Document, options: any, callback: Callback<Document>): void;
}

/** @public */
export declare const enum AutoEncryptionLoggerLevels {
  FatalError = 0,
  Error = 1,
  Warning = 2,
  Info = 3,
  Trace = 4
}

/** @public */
export declare interface AutoEncryptionOptions {
  /** A `MongoClient` used to fetch keys from a key vault */
  keyVaultClient?: MongoClient;
  /** The namespace where keys are stored in the key vault */
  keyVaultNamespace?: string;
  /** Configuration options that are used by specific KMS providers during key generation, encryption, and decryption. */
  kmsProviders?: {
    /** Configuration options for using 'aws' as your KMS provider */
    aws?: {
      /** The access key used for the AWS KMS provider */
      accessKeyId?: string;
      /** The secret access key used for the AWS KMS provider */
      secretAccessKey?: string;
    };
    /** Configuration options for using 'local' as your KMS provider */
    local?: {
      /** The master key used to encrypt/decrypt data keys. A 96-byte long Buffer. */
      key?: Buffer;
    };
  };
  /**
   * A map of namespaces to a local JSON schema for encryption
   *
   * **NOTE**: Supplying options.schemaMap provides more security than relying on JSON Schemas obtained from the server.
   * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending decrypted data that should be encrypted.
   * Schemas supplied in the schemaMap only apply to configuring automatic encryption for client side encryption.
   * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
   */
  schemaMap?: Document;
  /** Allows the user to bypass auto encryption, maintaining implicit decryption */
  bypassAutoEncryption?: boolean;
  options?: {
    /** An optional hook to catch logging messages from the underlying encryption engine */
    logger?: (level: AutoEncryptionLoggerLevels, message: string) => void;
  };
  extraOptions?: {
    /**
     * A local process the driver communicates with to determine how to encrypt values in a command.
     * Defaults to "mongodb://%2Fvar%2Fmongocryptd.sock" if domain sockets are available or "mongodb://localhost:27020" otherwise
     */
    mongocryptdURI?: string;
    /** If true, autoEncryption will not attempt to spawn a mongocryptd before connecting  */
    mongocryptdBypassSpawn?: boolean;
    /** The path to the mongocryptd executable on the system */
    mongocryptdSpawnPath?: string;
    /** Command line arguments to use when auto-spawning a mongocryptd */
    mongocryptdSpawnArgs?: string[];
  };
}
export { Binary };

/** @public */
export declare const BSONRegExp: any;

/** @public BSON Serialization options. TODO: Remove me when types from BSON are updated */
export declare interface BSONSerializeOptions extends SerializeOptions {
  /** Return document results as raw BSON buffers */
  fieldsAsRaw?: {
    [key: string]: boolean;
  };
  /** Promotes BSON values to native types where possible, set to false to only receive wrapper types */
  promoteValues?: boolean;
  /** Promotes Binary BSON values to native Node Buffers */
  promoteBuffers?: boolean;
  /** Promotes long values to number if they fit inside the 53 bits resolution */
  promoteLongs?: boolean;
  /** Serialize functions on any object */
  serializeFunctions?: boolean;
  /** Specify if the BSON serializer should ignore undefined fields */
  ignoreUndefined?: boolean;
  raw?: boolean;
}

/** @public */
export declare const BSONSymbol: any;

/**
 * @public
 * The result of a bulk write.
 */
export declare class BulkWriteResult {
  result: any;
  n: number;
  /** Number of documents inserted. */
  insertedCount: number;
  /** Number of documents matched for update. */
  matchedCount: number;
  /** Number of documents modified. */
  modifiedCount: number;
  /** Number of documents deleted. */
  deletedCount: number;
  /** Number of documents upserted. */
  upsertedCount: number;
  /** Inserted document generated Id's, hash key is the index of the originating operation */
  insertedIds: {
    [key: number]: ObjectId;
  };
  /** Upserted document generated Id's, hash key is the index of the originating operation */
  upsertedIds: {
    [key: number]: ObjectId;
  };
  /**
   * Create a new BulkWriteResult instance
   *
   * **NOTE:** Internal Type, do not instantiate directly
   *
   * @param bulkResult
   */
  constructor(bulkResult: any);
  /**
   * Evaluates to true if the bulk operation correctly executes
   *
   * @type {boolean}
   */
  get ok(): any;
  /**
   * The number of inserted documents
   *
   * @type {number}
   */
  get nInserted(): any;
  /**
   * Number of upserted documents
   *
   * @type {number}
   */
  get nUpserted(): any;
  /**
   * Number of matched documents
   *
   * @type {number}
   */
  get nMatched(): any;
  /**
   * Number of documents updated physically on disk
   *
   * @type {number}
   */
  get nModified(): any;
  /**
   * Number of removed documents
   *
   * @type {number}
   */
  get nRemoved(): any;
  /**
   * Returns an array of all inserted ids
   *
   * @returns {object[]}
   */
  getInsertedIds(): object[];
  /**
   * Returns an array of all upserted ids
   *
   * @returns {object[]}
   */
  getUpsertedIds(): object[];
  /**
   * Returns the upserted id at the given index
   *
   * @param index the number of the upserted id to return, returns undefined if no result for passed in index
   * @returns {object}
   */
  getUpsertedIdAt(index: number): object;
  /**
   * Returns raw internal result
   *
   * @returns {object}
   */
  getRawResponse(): object;
  /**
   * Returns true if the bulk operation contains a write error
   *
   * @returns {boolean}
   */
  hasWriteErrors(): boolean;
  /**
   * Returns the number of write errors off the bulk operation
   *
   * @returns {number}
   */
  getWriteErrorCount(): number;
  /**
   * Returns a specific write error object
   *
   * @param index of the write error to return, returns null if there is no result for passed in index
   * @returns {WriteError|undefined}
   */
  getWriteErrorAt(index: number): WriteError | undefined;
  /**
   * Retrieve all write errors
   *
   * @returns {WriteError[]}
   */
  getWriteErrors(): WriteError[];
  /**
   * Retrieve lastOp if available
   *
   * @returns {object}
   */
  getLastOp(): object;
  /**
   * Retrieve the write concern error if any
   *
   * @returns {WriteConcernError|undefined}
   */
  getWriteConcernError(): WriteConcernError | undefined;
  /**
   * @returns {object}
   */
  toJSON(): object;
  /**
   * @returns {string}
   */
  toString(): string;
  /**
   * @returns {boolean}
   */
  isOk(): boolean;
}

/** @public MongoDB Driver style callback */
export declare type Callback<T = any> = (error?: AnyError, result?: T) => void;

/**
 * @public
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 */
export declare class ChangeStream extends EventEmitter {
  pipeline: Document[];
  options: ChangeStreamOptions;
  parent: OperationParent;
  namespace: MongoDBNamespace;
  type: symbol;
  topology: Topology;
  cursor?: ChangeStreamCursor;
  closed: boolean;
  pipeDestinations: Writable[];
  streamOptions?: StreamOptions;
  [kResumeQueue]: Denque;
  /** @event */
  static readonly CLOSE: 'close';
  /**
   * Fired for each new matching change in the specified namespace. Attaching a `change`
   * event listener to a Change Stream will switch the stream into flowing mode. Data will
   * then be passed as soon as it is available.
   * @event
   */
  static readonly CHANGE: 'change';
  /** @event */
  static readonly END: 'end';
  /** @event */
  static readonly ERROR: 'error';
  /**
   * Emitted each time the change stream stores a new resume token.
   * @event
   */
  static readonly RESUME_TOKEN_CHANGED: 'resumeTokenChanged';
  /**
   * @param parent - The parent object that created this change stream
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
   */
  constructor(parent: OperationParent, pipeline?: Document[], options?: ChangeStreamOptions);
  /** The cached resume token that is used to resume after the most recently returned change. */
  get resumeToken(): ResumeToken;
  /** Check if there is any document still available in the Change Stream */
  hasNext(callback?: Callback): Promise<void> | void;
  /** Get the next available document from the Change Stream. */
  next(callback?: Callback): Promise<void> | void;
  /** Is the cursor closed */
  isClosed(): boolean;
  /** Close the Change Stream */
  close(callback?: Callback): Promise<void> | void;
  /**
   * This method pulls all the data out of a readable stream, and writes it to the supplied destination,
   * automatically managing the flow so that the destination is not overwhelmed by a fast readable stream.
   *
   * @param destination - The destination for writing data
   * @param options - {@link https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options| NodeJS Pipe options}
   * @throws MongoError if this.cursor is undefined
   */
  pipe(destination: Writable, options?: PipeOptions): Writable;
  /**
   * This method will remove the hooks set up for a previous pipe() call.
   *
   * @param destination - The destination for writing data
   * @throws MongoError if this.cursor is undefined
   */
  unpipe(destination?: Writable): ChangeStreamCursor;
  /**
   * Return a modified Readable stream including a possible transform method.
   * @throws MongoError if this.cursor is undefined
   */
  stream(options?: StreamOptions): ChangeStreamCursor;
  /**
   * This method will cause a stream in flowing mode to stop emitting data events. Any data that becomes available will remain in the internal buffer.
   * @throws MongoError if this.cursor is undefined
   */
  pause(): ChangeStreamCursor;
  /**
   * This method will cause the readable stream to resume emitting data events.
   * @throws MongoError if this.cursor is undefined
   */
  resume(): ChangeStreamCursor;
}

/** @internal */
export declare class ChangeStreamCursor extends Cursor<
  AggregateOperation,
  ChangeStreamCursorOptions
> {
  _resumeToken: ResumeToken;
  startAtOperationTime?: OperationTime;
  hasReceived?: boolean;
  resumeAfter: ResumeToken;
  startAfter: ResumeToken;
  constructor(
    topology: Topology,
    operation: AggregateOperation,
    options: ChangeStreamCursorOptions
  );
  set resumeToken(token: unknown);
  get resumeToken(): unknown;
  get resumeOptions(): Document;
  cacheResumeToken(resumeToken: ResumeToken): void;
  _processBatch(batchName: string, response?: Document): void;
  _initializeCursor(callback: Callback): void;
  _getMore(callback: Callback): void;
}

/** @public */
export declare interface ChangeStreamCursorOptions extends CursorOptions {
  startAtOperationTime?: OperationTime;
  resumeAfter?: ResumeToken;
  startAfter?: boolean;
}

/**
 * @public
 * Options that can be passed to a ChangeStream. Note that startAfter, resumeAfter, and startAtOperationTime are all mutually exclusive, and the server will error if more than one is specified.
 */
export declare interface ChangeStreamOptions extends AggregateOptions {
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

/** @public */
export declare interface ClientMetadata {
  driver: {
    name: string;
    version: string;
  };
  os: {
    type: string;
    name: NodeJS.Platform;
    architecture: string;
    version: string;
  };
  platform: string;
  version?: string;
  application?: {
    name: string;
  };
}

/** @public */
export declare interface ClientMetadataOptions {
  driverInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  appname?: string;
}

/**
 * @public
 * A class representing a client session on the server
 *
 * NOTE: not meant to be instantiated directly.
 */
export declare class ClientSession extends EventEmitter {
  topology: Topology;
  sessionPool: ServerSessionPool;
  hasEnded: boolean;
  serverSession?: ServerSession;
  clientOptions?: MongoClientOptions;
  supports: {
    causalConsistency: boolean;
  };
  clusterTime?: ClusterTime;
  operationTime?: Timestamp;
  explicit: boolean;
  owner: symbol | CoreCursor;
  defaultTransactionOptions: TransactionOptions;
  transaction: Transaction;
  /**
   * Create a client session.
   *
   * @param topology - The current client's topology (Internal Class)
   * @param sessionPool - The server session pool (Internal Class)
   * @param options - Optional settings
   * @param clientOptions - Optional settings provided when creating a MongoClient
   */
  constructor(
    topology: Topology,
    sessionPool: ServerSessionPool,
    options: ClientSessionOptions,
    clientOptions?: MongoClientOptions
  );
  /** The server id associated with this session */
  get id(): ServerSessionId | undefined;
  /**
   * Ends this session on the server
   *
   * @param options - Optional settings. Currently reserved for future use
   * @param callback - Optional callback for completion of this operation
   */
  endSession(): void;
  endSession(callback: Callback<void>): void;
  endSession(options: Record<string, unknown>, callback: Callback<void>): void;
  /**
   * Advances the operationTime for a ClientSession.
   *
   * @param operationTime - the `BSON.Timestamp` of the operation type it is desired to advance to
   */
  advanceOperationTime(operationTime: Timestamp): void;
  /**
   * Used to determine if this session equals another
   *
   * @param session - The session to compare to
   */
  equals(session: ClientSession): boolean;
  /** Increment the transaction number on the internal ServerSession */
  incrementTransactionNumber(): void;
  /** @returns whether this session is currently in a transaction or not */
  inTransaction(): boolean;
  /**
   * Starts a new transaction with the given options.
   *
   * @param options - Options for the transaction
   */
  startTransaction(options?: TransactionOptions): void;
  /**
   * Commits the currently active transaction in this session.
   *
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  commitTransaction(): Promise<Document>;
  commitTransaction(callback: Callback<Document>): void;
  /**
   * Aborts the currently active transaction in this session.
   *
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  abortTransaction(): Promise<Document>;
  abortTransaction(callback: Callback<Document>): void;
  /**
   * This is here to ensure that ClientSession is never serialized to BSON.
   */
  toBSON(): void;
  /**
   * Runs a provided lambda within a transaction, retrying either the commit operation
   * or entire transaction as needed (and when the error permits) to better ensure that
   * the transaction can complete successfully.
   *
   * IMPORTANT: This method requires the user to return a Promise, all lambdas that do not
   * return a Promise will result in undefined behavior.
   *
   * @param fn - A lambda to run within a transaction
   * @param options - Optional settings for the transaction
   */
  withTransaction(fn: WithTransactionCallback, options?: TransactionOptions): Promise<any>;
}

/** @public */
export declare interface ClientSessionOptions {
  /** Whether causal consistency should be enabled on this session */
  causalConsistency?: boolean;
  /** The default TransactionOptions to use for transactions started on this session. */
  defaultTransactionOptions?: TransactionOptions;
  owner: symbol | Cursor;
  explicit?: boolean;
  initialClusterTime?: ClusterTime;
}

/** @public */
export declare interface CloseOptions {
  force?: boolean;
}

/** @public */
export declare interface ClusterTime {
  clusterTime: Timestamp;
  signature: {
    hash: Binary;
    keyId: Long;
  };
}
export { Code };

/** @public */
export declare interface CollationOptions {
  locale: string;
  caseLevel: boolean;
  caseFirst: string;
  strength: number;
  numericOrdering: boolean;
  alternate: string;
  maxVariable: string;
  backwards: boolean;
}

/** @public */
export declare interface Collection {
  /** @deprecated Use {@link Collection.dropIndexes#Class} instead */
  dropAllIndexes(): void;
  removeMany(
    filter: Document,
    options?: DeleteOptions,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void;
  removeOne(
    filter: Document,
    options?: DeleteOptions,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void;
  findAndModify(this: any, query: any, sort: any, doc: any, options: any, callback: Callback): any;
}

/**
 * @public
 * The **Collection** class is an internal class that embodies a MongoDB collection
 * allowing for insert/update/remove/find and other command operation on that MongoDB collection.
 *
 * **COLLECTION Cannot directly be instantiated**
 *
 * @example
 * ```js
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
 *   // Show that duplicate records got dropped
 *   col.find({}).toArray(function(err, items) {
 *     expect(err).to.not.exist;
 *     test.equal(4, items.length);
 *     client.close();
 *   });
 * });
 * ```
 */
export declare class Collection implements OperationParent {
  /** @internal */
  s: CollectionPrivate;
  /** @internal Create a new Collection instance (INTERNAL TYPE, do not instantiate directly) */
  constructor(db: Db, name: string, options?: CollectionOptions);
  /**
   * The name of the database this collection belongs to
   * @readonly
   */
  get dbName(): string;
  /**
   * The name of this collection
   * @readonly
   */
  get collectionName(): string;
  /**
   * The namespace of this collection, in the format `${this.dbName}.${this.collectionName}`
   * @readonly
   */
  get namespace(): string;
  /**
   * The current readConcern of the collection. If not explicitly defined for
   * this collection, will be inherited from the parent DB
   * @readonly
   */
  get readConcern(): ReadConcern | undefined;
  /**
   * The current readPreference of the collection. If not explicitly defined for
   * this collection, will be inherited from the parent DB
   * @readonly
   */
  get readPreference(): ReadPreference | undefined;
  /**
   * The current writeConcern of the collection. If not explicitly defined for
   * this collection, will be inherited from the parent DB
   * @readonly
   */
  get writeConcern(): WriteConcern | undefined;
  /** The current index hint for the collection */
  get hint(): Hint | undefined;
  set hint(v: Hint | undefined);
  /**
   * Inserts a single document into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param doc - The document to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insertOne(doc: Document): Promise<InsertOneResult>;
  insertOne(doc: Document, callback: Callback<InsertOneResult>): void;
  insertOne(doc: Document, options: InsertOptions): Promise<InsertOneResult>;
  insertOne(doc: Document, options: InsertOptions, callback: Callback<InsertOneResult>): void;
  /**
   * Inserts an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param docs - The documents to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insertMany(docs: Document[]): Promise<InsertManyResult>;
  insertMany(docs: Document[], callback: Callback<InsertManyResult>): void;
  insertMany(docs: Document[], options: InsertOptions): Promise<InsertManyResult>;
  insertMany(docs: Document[], options: InsertOptions, callback: Callback<InsertManyResult>): void;
  /**
   * Perform a bulkWrite operation without a fluent API
   *
   * Legal operation types are
   *
   * ```js
   *  { insertOne: { document: { a: 1 } } }
   *
   *  { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
   *
   *  { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
   *
   *  { updateMany: { filter: {}, update: {$set: {"a.$[i].x": 5}}, arrayFilters: [{ "i.x": 5 }]} }
   *
   *  { deleteOne: { filter: {c:1} } }
   *
   *  { deleteMany: { filter: {c:1} } }
   *
   *  { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}
   *```
   *
   * If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param operations - Bulk operations to perform
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   * @throws MongoError if operations is not an array
   */
  bulkWrite(operations: Document[]): Promise<BulkWriteResult>;
  bulkWrite(operations: Document[], callback: Callback<BulkWriteResult>): void;
  bulkWrite(operations: Document[], options: InsertOptions): Promise<BulkWriteResult>;
  bulkWrite(
    operations: Document[],
    options: InsertOptions,
    callback: Callback<BulkWriteResult>
  ): void;
  /**
   * Update a single document in a collection
   *
   * @param filter - The Filter used to select the document to update
   * @param update - The update operations to be applied to the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateOne(filter: Document, update: Document): Promise<UpdateResult>;
  updateOne(filter: Document, update: Document, callback: Callback<UpdateResult>): void;
  updateOne(filter: Document, update: Document, options: UpdateOptions): Promise<UpdateResult>;
  updateOne(
    filter: Document,
    update: Document,
    options: UpdateOptions,
    callback: Callback<UpdateResult>
  ): void;
  /**
   * Replace a document in a collection with another document
   *
   * @param filter - The Filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replaceOne(filter: Document, replacement: Document): Promise<UpdateResult>;
  replaceOne(filter: Document, replacement: Document, callback: Callback<UpdateResult>): void;
  replaceOne(
    filter: Document,
    replacement: Document,
    options: ReplaceOptions
  ): Promise<UpdateResult>;
  replaceOne(
    filter: Document,
    replacement: Document,
    options: ReplaceOptions,
    callback: Callback<UpdateResult>
  ): void;
  /**
   * Update multiple documents in a collection
   *
   * @param filter - The Filter used to select the documents to update
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateMany(filter: Document, update: Document): Promise<UpdateResult>;
  updateMany(filter: Document, update: Document, callback: Callback<UpdateResult>): void;
  updateMany(filter: Document, update: Document, options: UpdateOptions): Promise<UpdateResult>;
  updateMany(
    filter: Document,
    update: Document,
    options: UpdateOptions,
    callback: Callback<UpdateResult>
  ): void;
  /**
   * Delete a document from a collection
   *
   * @param filter - The Filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  deleteOne(filter: Document): Promise<DeleteResult>;
  deleteOne(filter: Document, callback: Callback<DeleteResult>): void;
  deleteOne(filter: Document, options: DeleteOptions): Promise<DeleteResult>;
  deleteOne(filter: Document, options: DeleteOptions, callback?: Callback<DeleteResult>): void;
  /**
   * Delete multiple documents from a collection
   *
   * @param filter - The Filter used to select the documents to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  deleteMany(filter: Document): Promise<DeleteResult>;
  deleteMany(filter: Document, callback: Callback<DeleteResult>): void;
  deleteMany(filter: Document, options: DeleteOptions): Promise<DeleteResult>;
  deleteMany(filter: Document, options: DeleteOptions, callback: Callback<DeleteResult>): void;
  /**
   * Rename the collection.
   *
   * @param newName - New name of of the collection.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  rename(newName: string): Promise<Collection>;
  rename(newName: string, callback: Callback<Collection>): void;
  rename(newName: string, options: RenameOptions): Promise<Collection> | void;
  rename(newName: string, options: RenameOptions, callback: Callback<Collection>): void;
  /**
   * Drop the collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  drop(): Promise<boolean>;
  drop(callback: Callback<boolean>): void;
  drop(options: DropCollectionOptions): Promise<boolean>;
  drop(options: DropCollectionOptions, callback: Callback<boolean>): void;
  /**
   * Fetches the first document that matches the query
   *
   * @param query - Query for find Operation
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOne(): Promise<Document>;
  findOne(callback: Callback<Document>): void;
  findOne(query: Document): Promise<Document>;
  findOne(query: Document, callback?: Callback<Document>): void;
  findOne(query: Document, options: FindOptions): Promise<Document>;
  findOne(query: Document, options: FindOptions, callback: Callback<Document>): void;
  /**
   * Creates a cursor for a query that can be used to iterate over results from MongoDB
   *
   * @param query - The cursor query object.
   * @param options - Optional settings for the command
   */
  find(): Cursor;
  find(query: Document): Cursor;
  find(query: Document, options: FindOptions): Cursor;
  /**
   * Returns the options of the collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  options(): Promise<Document>;
  options(callback: Callback<Document>): void;
  options(options: OperationOptions): Promise<Document>;
  options(options: OperationOptions, callback: Callback<Document>): void;
  /**
   * Returns if the collection is a capped collection
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  isCapped(): Promise<boolean>;
  isCapped(callback: Callback<boolean>): void;
  isCapped(options: OperationOptions): Promise<boolean>;
  isCapped(options: OperationOptions, callback: Callback<boolean>): void;
  /**
   * Creates an index on the db and collection collection.
   *
   * @param indexSpec - The field name or index specification to create an index for
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   *
   * @example
   * ```js
   * const collection = client.db('foo').collection('bar');
   *
   * await collection.createIndex({ a: 1, b: -1 });
   *
   * // Alternate syntax for { c: 1, d: -1 } that ensures order of indexes
   * await collection.createIndex([ [c, 1], [d, -1] ]);
   *
   * // Equivalent to { e: 1 }
   * await collection.createIndex('e');
   *
   * // Equivalent to { f: 1, g: 1 }
   * await collection.createIndex(['f', 'g'])
   *
   * // Equivalent to { h: 1, i: -1 }
   * await collection.createIndex([ { h: 1 }, { i: -1 } ]);
   *
   * // Equivalent to { j: 1, k: -1, l: 2d }
   * await collection.createIndex(['j', ['k', -1], { l: '2d' }])
   * ```
   */
  createIndex(indexSpec: IndexSpecification): Promise<Document>;
  createIndex(indexSpec: IndexSpecification, callback: Callback<Document>): void;
  createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions): Promise<Document>;
  createIndex(
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Creates multiple indexes in the collection, this method is only supported for
   * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
   * error.
   *
   * **Note**: Unlike {@link (Collection:class).createIndex| createIndex}, this function takes in raw index specifications.
   * Index specifications are defined {@link http://docs.mongodb.org/manual/reference/command/createIndexes/| here}.
   *
   * @param indexSpecs - An array of index specifications to be created
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   *
   * @example
   * ```js
   * const collection = client.db('foo').collection('bar');
   * await collection.createIndexes([
   *   // Simple index on field fizz
   *   {
   *     key: { fizz: 1 },
   *   }
   *   // wildcard index
   *   {
   *     key: { '$**': 1 }
   *   },
   *   // named index on darmok and jalad
   *   {
   *     key: { darmok: 1, jalad: -1 }
   *     name: 'tanagra'
   *   }
   * ]);
   * ```
   */
  createIndexes(indexSpecs: IndexDescription[]): Promise<Document>;
  createIndexes(indexSpecs: IndexDescription[], callback: Callback<Document>): void;
  createIndexes(indexSpecs: IndexDescription[], options: CreateIndexesOptions): Promise<Document>;
  createIndexes(
    indexSpecs: IndexDescription[],
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Drops an index from this collection.
   *
   * @param indexName - Name of the index to drop.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropIndex(indexName: string): Promise<Document>;
  dropIndex(indexName: string, callback: Callback<Document>): void;
  dropIndex(indexName: string, options: DropIndexesOptions): Promise<Document>;
  dropIndex(indexName: string, options: DropIndexesOptions, callback: Callback<Document>): void;
  /**
   * Drops all indexes from this collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropIndexes(): Promise<Document>;
  dropIndexes(callback: Callback<Document>): void;
  dropIndexes(options: DropIndexesOptions): Promise<Document>;
  dropIndexes(options: DropIndexesOptions, callback: Callback<Document>): void;
  /**
   * Get the list of all indexes information for the collection.
   *
   * @param options - Optional settings for the command
   */
  listIndexes(options?: ListIndexesOptions): CommandCursor;
  /**
   * Checks if one or more indexes exist on the collection, fails on first non-existing index
   *
   * @param indexes - One or more index names to check.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexExists(indexes: string | string[]): Promise<boolean>;
  indexExists(indexes: string | string[], callback: Callback<boolean>): void;
  indexExists(indexes: string | string[], options: IndexInformationOptions): Promise<boolean>;
  indexExists(
    indexes: string | string[],
    options: IndexInformationOptions,
    callback: Callback<boolean>
  ): void;
  /**
   * Retrieves this collections index info.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexInformation(): Promise<Document>;
  indexInformation(callback: Callback<Document>): void;
  indexInformation(options: IndexInformationOptions): Promise<Document>;
  indexInformation(options: IndexInformationOptions, callback: Callback<Document>): void;
  /**
   * Gets an estimate of the count of documents in a collection using collection metadata.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  estimatedDocumentCount(): Promise<number>;
  estimatedDocumentCount(callback: Callback<number>): void;
  estimatedDocumentCount(options: EstimatedDocumentCountOptions): Promise<number>;
  estimatedDocumentCount(options: EstimatedDocumentCountOptions, callback: Callback<number>): void;
  /**
   * Gets the number of documents matching the filter.
   * For a fast count of the total documents in a collection see {@link Collection.estimatedDocumentCount| estimatedDocumentCount}.
   * **Note**: When migrating from {@link Collection.count| count} to {@link Collection.countDocuments| countDocuments}
   * the following query operators must be replaced:
   *
   * | Operator | Replacement |
   * | -------- | ----------- |
   * | `$where`   | [`$expr`][1] |
   * | `$near`    | [`$geoWithin`][2] with [`$center`][3] |
   * | `$nearSphere` | [`$geoWithin`][2] with [`$centerSphere`][4] |
   *
   * [1]: https://docs.mongodb.com/manual/reference/operator/query/expr/
   * [2]: https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
   * [3]: https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
   * [4]: https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
   *
   * @param query - The query for the count
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   *
   * @see https://docs.mongodb.com/manual/reference/operator/query/expr/
   * @see https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
   * @see https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
   * @see https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
   */
  countDocuments(): Promise<number>;
  countDocuments(callback: Callback<number>): void;
  countDocuments(query: Document): Promise<number>;
  countDocuments(callback: Callback<number>): void;
  countDocuments(query: Document, options: CountDocumentsOptions): Promise<number>;
  countDocuments(query: Document, options: CountDocumentsOptions, callback: Callback<number>): void;
  /**
   * The distinct command returns a list of distinct values for the given key across a collection.
   *
   * @param key - Field of the document to find distinct values for
   * @param query - The query for filtering the set of documents to which we apply the distinct filter.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  distinct(key: string): Promise<Document[]>;
  distinct(key: string, callback: Callback<Document[]>): void;
  distinct(key: string, query: Document): Promise<Document[]>;
  distinct(key: string, query: Document, callback: Callback<Document[]>): void;
  distinct(key: string, query: Document, options: DistinctOptions): Promise<Document[]>;
  distinct(
    key: string,
    query: Document,
    options: DistinctOptions,
    callback: Callback<Document[]>
  ): void;
  /**
   * Retrieve all the indexes on the collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexes(): Promise<Document>;
  indexes(callback: Callback<Document>): void;
  indexes(options: IndexInformationOptions): Promise<Document>;
  indexes(options: IndexInformationOptions, callback: Callback<Document>): void;
  /**
   * Get all the collection statistics.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  stats(): Promise<Document>;
  stats(callback: Callback<Document>): void;
  stats(options: CollStatsOptions): Promise<Document>;
  stats(options: CollStatsOptions, callback: Callback<Document>): void;
  /**
   * Find a document and delete it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The Filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndDelete(filter: Document): Promise<Document>;
  findOneAndDelete(filter: Document, callback: Callback<Document>): void;
  findOneAndDelete(filter: Document, options: FindAndModifyOptions): Promise<Document>;
  findOneAndDelete(
    filter: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Find a document and replace it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The Filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndReplace(filter: Document, replacement: Document): Promise<Document>;
  findOneAndReplace(filter: Document, replacement: Document, callback: Callback<Document>): void;
  findOneAndReplace(
    filter: Document,
    replacement: Document,
    options: FindAndModifyOptions
  ): Promise<Document>;
  findOneAndReplace(
    filter: Document,
    replacement: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Find a document and update it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The Filter used to select the document to update
   * @param update - Update operations to be performed on the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndUpdate(filter: Document, update: Document): Promise<Document>;
  findOneAndUpdate(filter: Document, update: Document, callback: Callback<Document>): void;
  findOneAndUpdate(
    filter: Document,
    update: Document,
    options: FindAndModifyOptions
  ): Promise<Document>;
  findOneAndUpdate(
    filter: Document,
    update: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Execute an aggregation framework pipeline against the collection, needs MongoDB \>= 2.2
   *
   * @param pipeline - An array of aggregation pipelines to execute
   * @param options - Optional settings for the command
   */
  aggregate(pipeline?: Document[], options?: AggregateOptions): AggregationCursor;
  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
   *
   * @since 3.0.0
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch(): ChangeStream;
  watch(pipeline?: Document[]): ChangeStream;
  /**
   * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
   *
   * @param map - The mapping function.
   * @param reduce - The reduce function.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction
  ): Promise<Document | Document[]>;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    callback: Callback<Document | Document[]>
  ): void;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    options: MapReduceOptions
  ): Promise<Document | Document[]>;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    options: MapReduceOptions,
    callback: Callback<Document | Document[]>
  ): void;
  /** Initiate an Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order. */
  initializeUnorderedBulkOp(options?: any): any;
  /** Initiate an In order bulk write operation. Operations will be serially executed in the order they are added, creating a new operation for each switch in types. */
  initializeOrderedBulkOp(options?: any): any;
  /** Get the db scoped logger */
  getLogger(): Logger;
  get logger(): Logger;
  /**
   * Inserts a single document or a an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @deprecated Use insertOne, insertMany or bulkWrite instead.
   * @param docs - The documents to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insert(
    docs: Document[],
    options: InsertOptions,
    callback: Callback<InsertManyResult>
  ): Promise<InsertManyResult> | void;
  /**
   * Updates documents.
   *
   * @deprecated use updateOne, updateMany or bulkWrite
   * @param selector - The selector for the update operation.
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  update(
    selector: Document,
    update: Document,
    options: UpdateOptions,
    callback: Callback<Document>
  ): Promise<UpdateResult> | void;
  /**
   * Remove documents.
   *
   * @deprecated use deleteOne, deleteMany or bulkWrite
   * @param selector - The selector for the update operation.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  remove(
    selector: Document,
    options: DeleteOptions,
    callback: Callback
  ): Promise<DeleteResult> | void;
  /**
   * Ensures that an index exists, if it does not it creates it
   *
   * @deprecated use createIndexes instead
   * @param fieldOrSpec - Defines the index.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  ensureIndex(
    fieldOrSpec: string | Document,
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): Promise<Document> | void;
  /**
   * An estimated count of matching documents in the db to a query.
   *
   * **NOTE:** This method has been deprecated, since it does not provide an accurate count of the documents
   * in a collection. To obtain an accurate count of documents in the collection, use {@link Collection.countDocuments| countDocuments}.
   * To obtain an estimated count of all documents in the collection, use {@link Collection.estimatedDocumentCount| estimatedDocumentCount}.
   *
   * @deprecated use {@link Collection.countDocuments| countDocuments} or {@link Collection.estimatedDocumentCount| estimatedDocumentCount} instead
   *
   * @param query - The query for the count.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  count(): Promise<number>;
  count(callback: Callback<number>): void;
  count(query: Document): Promise<number>;
  count(query: Document, callback: Callback<number>): void;
  count(query: Document, options: CountOptions): Promise<number>;
  count(query: Document, options: CountOptions, callback: Callback<number>): Promise<number> | void;
  /**
   * Find and remove a document.
   *
   * @deprecated use findOneAndDelete instead
   *
   * @param query - Query object to locate the object to modify.
   * @param sort - If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findAndRemove(
    query: Document,
    sort: Document,
    options: FindAndModifyOptions,
    callback: Callback
  ): Promise<Document> | void;
  /**
   * Run a group command across a collection
   *
   * @deprecated MongoDB 3.6 or higher no longer supports the group command. We recommend rewriting using the aggregation framework.
   * @param keys - An object, array or function expressing the keys to group by.
   * @param condition - An optional condition that must be true for a row to be considered.
   * @param initial - Initial value of the aggregation counter object.
   * @param reduce - The reduce function aggregates (reduces) the objects iterated
   * @param finalize - An optional function to be run on each item in the result set just before the item is returned.
   * @param command - Specify if you wish to run using the internal group command or using eval, default is true.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  group(
    keys: any,
    condition: any,
    initial: any,
    reduce: any,
    finalize: any,
    command: any,
    options: any,
    callback: Callback
  ): void;
  /**
   * Find and modify a document.
   *
   * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
   *
   * @param query - Query object to locate the object to modify.
   * @param sort - If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
   * @param doc - The fields/vals to be updated.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  _findAndModify(query: Document, sort: Document, doc: Document): Promise<Document>;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    callback: Callback<Document>
  ): void;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    options: FindAndModifyOptions
  ): Promise<Document>;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): Promise<Document> | void;
}

/** @public */
export declare interface CollectionOptions
  extends BSONSerializeOptions,
    WriteConcernOptions,
    LoggerOptions {
  slaveOk?: boolean;
  /** Returns an error if the collection does not exist */
  strict?: boolean;
  /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreferenceLike;
}

/** @internal */
export declare interface CollectionPrivate {
  pkFactory: PkFactory | typeof ObjectId;
  db: Db;
  topology: Topology;
  options: any;
  namespace: MongoDBNamespace;
  readPreference?: ReadPreference;
  slaveOk?: boolean;
  serializeFunctions?: boolean;
  raw?: boolean;
  promoteLongs?: boolean;
  promoteValues?: boolean;
  promoteBuffers?: boolean;
  collectionHint?: Hint;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
}

/** @public */
export declare interface CollStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

/**
 * @public
 * The **CommandCursor** class is an internal class that embodies a
 * generalized cursor based on a MongoDB command allowing for iteration over the
 * results returned. It supports one by one document iteration, conversion to an
 * array or can be iterated as a Node 0.10.X or higher stream
 */
export declare class CommandCursor extends Cursor<CommandOperation, CommandCursorOptions> {
  /** @internal */
  constructor(topology: Topology, operation: CommandOperation, options?: CommandCursorOptions);
  /**
   * Set the ReadPreference for the cursor.
   *
   * @param readPreference - The new read preference for the cursor.
   */
  setReadPreference(readPreference: ReadPreferenceLike): this;
  /**
   * Set the batch size for the cursor.
   *
   * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   * @throws MongoError if cursor is closed/dead or value is not a number
   */
  batchSize(value: number): this;
  /**
   * Add a maxTimeMS stage to the aggregation pipeline
   *
   * @param value - The state maxTimeMS value.
   */
  maxTimeMS(value: number): this;
}

/** @public */
export declare type CommandCursorOptions = CursorOptions;

/** @internal */
export declare abstract class CommandOperation<
  T extends CommandOperationOptions = CommandOperationOptions,
  TResult = Document
> extends OperationBase<T> {
  ns: MongoDBNamespace;
  readPreference: ReadPreference;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  explain: boolean;
  fullResponse?: boolean;
  logger?: Logger;
  constructor(parent: OperationParent, options?: T);
  abstract execute(server: Server, callback: Callback<TResult>): void;
  executeCommand(server: Server, cmd: Document, callback: Callback): void;
}

/** @public */
export declare interface CommandOperationOptions extends OperationOptions, WriteConcernOptions {
  fullResponse?: boolean;
  /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
  readPreference?: ReadPreferenceLike;
  /** Specify ClientSession for this command */
  session?: ClientSession;
  /** Collation */
  collation?: CollationOptions;
  maxTimeMS?: number;
  /** A user-provided comment to attach to this command */
  comment?: string | Document;
  /** Should retry failed writes */
  retryWrites?: boolean;
  dbName?: string;
  authdb?: string;
}

/** @internal */
export declare interface CommandOptions extends BSONSerializeOptions {
  command?: Document;
  slaveOk?: boolean;
  /** Specify read preference if command supports it */
  readPreference?: ReadPreferenceLike;
  raw?: boolean;
  monitoring?: boolean;
  fullResult?: boolean;
  socketTimeout?: number;
  /** Session to use for the operation */
  session?: ClientSession;
  documentsReturnedIn?: string;
  noResponse?: boolean;
  willRetryWrite?: boolean;
  retryWrites?: boolean;
  retrying?: boolean;
}

/**
 * @internal
 * Creates a new CommandResult instance
 *
 * @param result - CommandResult object
 * @param connection - A connection instance associated with this result
 */
export declare class CommandResult {
  ok?: number;
  result: Document;
  connection: Connection;
  message: Document;
  constructor(result: Document, connection: Connection, message: Document);
  /** Convert CommandResult to JSON */
  toJSON(): Document;
  /** Convert CommandResult to String representation */
  toString(): string;
}

/** @public */
export declare enum Compressor {
  none = 0,
  snappy = 1,
  zlib = 2
}

/** @public */
export declare type CompressorName = keyof typeof Compressor;

/** @public */
export declare class Connection extends EventEmitter {
  id: number;
  address: string;
  socketTimeout: number;
  monitorCommands: boolean;
  closed: boolean;
  destroyed: boolean;
  lastIsMasterMS?: number;
  [kDescription]: StreamDescription;
  [kGeneration]: number;
  [kLastUseTime]: number;
  [kAutoEncrypter]?: unknown;
  [kQueue]: Map<number, OperationDescription>;
  [kMessageStream]: MessageStream;
  [kStream]: Stream;
  [kIsMaster]: Document;
  [kClusterTime]: Document;
  /** @event */
  static readonly COMMAND_STARTED: 'commandStarted';
  /** @event */
  static readonly COMMAND_SUCCEEDED: 'commandSucceeded';
  /** @event */
  static readonly COMMAND_FAILED: 'commandFailed';
  /** @event */
  static readonly CLUSTER_TIME_RECEIVED: 'clusterTimeReceived';
  constructor(stream: Stream, options: ConnectionOptions);
  get description(): StreamDescription;
  get ismaster(): Document;
  set ismaster(response: Document);
  get generation(): number;
  get idleTime(): number;
  get clusterTime(): Document;
  get stream(): Stream;
  markAvailable(): void;
  destroy(): void;
  destroy(callback?: Callback): void;
  destroy(options?: DestroyOptions): void;
  destroy(options?: DestroyOptions, callback?: Callback): void;
  command(ns: string, cmd: Document, callback: Callback): void;
  command(ns: string, cmd: Document, options: CommandOptions, callback: Callback): void;
  query(
    ns: string,
    cmd: Document,
    cursorState: InternalCursorState,
    options: QueryOptions,
    callback: Callback
  ): void;
  getMore(
    ns: string,
    cursorState: InternalCursorState,
    batchSize: number,
    options: GetMoreOptions,
    callback: Callback
  ): void;
  killCursors(ns: string, cursorState: InternalCursorState, callback: Callback): void;
  insert(ns: string, ops: Document[], options: WireInsertOptions, callback: Callback): void;
  update(ns: string, ops: Document[], options: WireUpdateOptions, callback: Callback): void;
  remove(ns: string, ops: Document[], options: WireRemoveOptions, callback: Callback): void;
}

/** @public */
export declare interface ConnectionOptions
  extends Partial<TcpNetConnectOpts>,
    Partial<IpcNetConnectOpts>,
    Partial<ConnectionOptions_2>,
    StreamDescriptionOptions,
    LoggerOptions {
  id: number;
  monitorCommands: boolean;
  generation: number;
  autoEncrypter: AutoEncrypter;
  connectionType: typeof Connection;
  credentials?: MongoCredentials;
  connectTimeoutMS?: number;
  connectionTimeout?: number;
  ssl: boolean;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  noDelay?: boolean;
  socketTimeout?: number;
  metadata: ClientMetadata;
  /** Required EventEmitter option */
  captureRejections?: boolean;
}

/** @public NOTE: to be removed as part of NODE-2745 */
export declare interface ConnectionPool {
  isConnected(): boolean;
  write(
    message: any,
    commandOptions: CommandOptions,
    callback: (err: MongoError, ...args: CommandResult[]) => void
  ): void;
}

/** @public A pool of connections which dynamically resizes, and emit events related to pool activity */
export declare class ConnectionPool extends EventEmitter {
  closed: boolean;
  options: Readonly<ConnectionPoolOptions>;
  [kLogger]: Logger;
  [kConnections]: Denque<Connection>;
  /** An integer expressing how many total connections are permitted */
  [kPermits]: number;
  [kMinPoolSizeTimer]?: NodeJS.Timeout;
  /** An integer representing the SDAM generation of the pool */
  [kGeneration_2]: number;
  [kConnectionCounter]: Generator<number>;
  [kCancellationToken]: EventEmitter;
  [kWaitQueue]: Denque<WaitQueueMember>;
  /**
   * Emitted when the connection pool is created.
   * @event
   */
  static readonly CONNECTION_POOL_CREATED: 'connectionPoolCreated';
  /**
   * Emitted once when the connection pool is closed
   * @event
   */
  static readonly CONNECTION_POOL_CLOSED: 'connectionPoolClosed';
  /**
   * Emitted when a connection is created.
   * @event
   */
  static readonly CONNECTION_CREATED: 'connectionCreated';
  /**
   * Emitted when a connection becomes established, and is ready to use
   * @event
   */
  static readonly CONNECTION_READY: 'connectionReady';
  /**
   * Emitted when a connection is closed
   * @event
   */
  static readonly CONNECTION_CLOSED: 'connectionClosed';
  /**
   * Emitted when an attempt to check out a connection begins
   * @event
   */
  static readonly CONNECTION_CHECK_OUT_STARTED: 'connectionCheckOutStarted';
  /**
   * Emitted when an attempt to check out a connection fails
   * @event
   */
  static readonly CONNECTION_CHECK_OUT_FAILED: 'connectionCheckOutFailed';
  /**
   * Emitted each time a connection is successfully checked out of the connection pool
   * @event
   */
  static readonly CONNECTION_CHECKED_OUT: 'connectionCheckedOut';
  /**
   * Emitted each time a connection is successfully checked into the connection pool
   * @event
   */
  static readonly CONNECTION_CHECKED_IN: 'connectionCheckedIn';
  /**
   * Emitted each time the connection pool is cleared and it's generation incremented
   * @event
   */
  static readonly CONNECTION_POOL_CLEARED: 'connectionPoolCleared';
  constructor(options: Partial<ConnectionPoolOptions>);
  /** The address of the endpoint the pool is connected to */
  get address(): string;
  /** An integer representing the SDAM generation of the pool */
  get generation(): number;
  /** An integer expressing how many total connections (active + in use) the pool currently has */
  get totalConnectionCount(): number;
  /** An integer expressing how many connections are currently available in the pool. */
  get availableConnectionCount(): number;
  get waitQueueSize(): number;
  /**
   * Check a connection out of this pool. The connection will continue to be tracked, but no reference to it
   * will be held by the pool. This means that if a connection is checked out it MUST be checked back in or
   * explicitly destroyed by the new owner.
   */
  checkOut(callback: Callback<Connection>): void;
  /**
   * Check a connection into the pool.
   *
   * @param connection - The connection to check in
   */
  checkIn(connection: Connection): void;
  /**
   * Clear the pool
   *
   * Pool reset is handled by incrementing the pool's generation count. Any existing connection of a
   * previous generation will eventually be pruned during subsequent checkouts.
   */
  clear(): void;
  /** Close the pool */
  close(callback: Callback<void>): void;
  close(options: CloseOptions, callback: Callback<void>): void;
  /**
   * Runs a lambda with an implicitly checked out connection, checking that connection back in when the lambda
   * has completed by calling back.
   *
   * NOTE: please note the required signature of `fn`
   *
   * @param fn - A function which operates on a managed connection
   * @param callback - The original callback
   */
  withConnection(fn: WithConnectionCallback, callback?: Callback<Connection>): void;
}

/** @public */
export declare interface ConnectionPoolOptions extends ConnectionOptions {
  /** The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections. */
  maxPoolSize: number;
  /** The minimum number of connections that MUST exist at any moment in a single connection pool. */
  minPoolSize: number;
  /** The maximum amount of time a connection should remain idle in the connection pool before being marked idle. */
  maxIdleTimeMS: number;
  /** The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit. */
  waitQueueTimeoutMS: number;
}

/** @public */
export declare interface ConnectOptions {
  readPreference?: ReadPreference;
}

/**
 * @internal
 * The **CoreCursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query.
 */
export declare class CoreCursor<
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
  cursorState: InternalCursorState;
  logger: Logger;
  query?: Document;
  s: CoreCursorPrivate;
  /** @event */
  static readonly CLOSE: 'close';
  /** @event */
  static readonly DATA: 'data';
  /** @event */
  static readonly END: 'end';
  /** @event */
  static readonly FINISH: 'finish';
  /** @event */
  static readonly ERROR: 'error';
  /** @event */
  static readonly PAUSE: 'pause';
  /** @event */
  static readonly READABLE: 'readable';
  /** @event */
  static readonly RESUME: 'resume';
  /**
   * Create a new core `Cursor` instance.
   * **NOTE** Not to be instantiated directly
   *
   * @param topology - The server topology instance.
   * @param operation - The cursor-generating operation to run
   * @param options - Optional settings for the cursor
   */
  constructor(topology: Topology, operation: O, options?: T);
  set cursorBatchSize(value: number);
  get cursorBatchSize(): number;
  set cursorLimit(value: number);
  get cursorLimit(): number;
  set cursorSkip(value: number);
  get cursorSkip(): number;
  /** @internal Retrieve the next document from the cursor */
  _next(callback: Callback<Document>): void;
  /** Clone the cursor */
  clone(): this;
  /** Checks if the cursor is dead */
  isDead(): boolean;
  /** Checks if the cursor was killed by the application */
  isKilled(): boolean;
  /** Checks if the cursor notified it's caller about it's death */
  isNotified(): boolean;
  /** Returns current buffered documents length */
  bufferedCount(): number;
  /** Returns current buffered documents */
  readBufferedDocuments(number: number): Document[];
  /** Resets local state for this cursor instance, and issues a `killCursors` command to the server */
  kill(callback?: Callback): void;
  /** Resets the cursor */
  rewind(): void;
  /** @internal */
  _read(): void;
  close(): void;
  close(callback: Callback): void;
  close(options: CursorCloseOptions): Promise<void>;
  close(options: CursorCloseOptions, callback: Callback): void;
  /** @internal */
  _endSession(): boolean;
  /** @internal */
  _endSession(options: CloseOptions): boolean;
  /** @internal */
  _endSession(callback: Callback<void>): void;
  /** @internal */
  _getMore(callback: Callback<Document>): void;
  /** @internal */
  _initializeCursor(callback: Callback): void;
}

/** @public */
export declare interface CoreCursorOptions extends CommandOperationOptions {
  noCursorTimeout?: boolean;
  tailable?: boolean;
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

/** @internal */
export declare interface CoreCursorPrivate {
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
export declare interface CountDocumentsOptions extends AggregateOptions {
  /** The number of documents to skip. */
  skip?: number;
  /** The maximum amounts to count before aborting. */
  limit?: number;
}

/** @public */
export declare interface CountOptions extends CommandOperationOptions {
  /** The number of documents to skip. */
  skip?: number;
  /** The maximum amounts to count before aborting. */
  limit?: number;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
  /** An index name hint for the query. */
  hint?: string | Document;
}

/** @public */
export declare interface CreateCollectionOptions extends CommandOperationOptions {
  /** Returns an error if the collection does not exist */
  strict?: boolean;
  /** Create a capped collection */
  capped?: boolean;
  /** @deprecated Create an index on the _id field of the document, True by default on MongoDB 2.6 - 3.0 */
  autoIndexId?: boolean;
  /** The size of the capped collection in bytes */
  size?: number;
  /** The maximum number of documents in the capped collection */
  max?: number;
  /** Available for the MMAPv1 storage engine only to set the usePowerOf2Sizes and the noPadding flag */
  flags?: number;
  /** Allows users to specify configuration to the storage engine on a per-collection basis when creating a collection on MongoDB 3.0 or higher */
  storageEngine?: Document;
  /** Allows users to specify validation rules or expressions for the collection. For more information, see Document Validation on MongoDB 3.2 or higher */
  validator?: Document;
  /** Determines how strictly MongoDB applies the validation rules to existing documents during an update on MongoDB 3.2 or higher */
  validationLevel?: string;
  /** Determines whether to error on invalid documents or just warn about the violations but allow invalid documents to be inserted on MongoDB 3.2 or higher */
  validationAction?: string;
  /** Allows users to specify a default configuration for indexes when creating a collection on MongoDB 3.2 or higher */
  indexOptionDefaults?: Document;
  /** The name of the source collection or view from which to create the view. The name is not the full namespace of the collection or view; i.e. does not include the database name and implies the same database as the view to create on MongoDB 3.4 or higher */
  viewOn?: string;
  /** An array that consists of the aggregation pipeline stage. Creates the view by applying the specified pipeline to the viewOn collection or view on MongoDB 3.4 or higher */
  pipeline?: Document[];
  /** A primary key factory object for generation of custom _id keys. */
  pkFactory?: PkFactory;
}

/** @public */
export declare interface CreateIndexesOptions extends CommandOperationOptions {
  /** Creates the index in the background, yielding whenever possible. */
  background?: boolean;
  /** Creates an unique index. */
  unique?: boolean;
  /** Override the autogenerated index name (useful if the resulting name is larger than 128 bytes) */
  name?: string;
  /** Creates a partial index based on the given filter object (MongoDB 3.2 or higher) */
  partialFilterExpression?: Document;
  /** Creates a sparse index. */
  sparse?: boolean;
  /** Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher) */
  expireAfterSeconds?: number;
  storageEngine?: Document;
  /** (MongoDB 4.4. or higher) Specifies how many data-bearing members of a replica set, including the primary, must complete the index builds successfully before the primary marks the indexes as ready. This option accepts the same values for the "w" field in a write concern plus "votingMembers", which indicates all voting data-bearing nodes. */
  commitQuorum?: number | string;
  weights?: Document;
  default_language?: string;
  language_override?: string;
  textIndexVersion?: number;
  '2dsphereIndexVersion'?: number;
  bits?: number;
  /** For geospatial indexes set the lower bound for the co-ordinates. */
  min?: number;
  /** For geospatial indexes set the high bound for the co-ordinates. */
  max?: number;
  bucketSize?: number;
  wildcardProjection?: Document;
}

/**
 * @public
 * **CURSORS Cannot directly be instantiated**
 * The `Cursor` class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
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
 *   .maxScan(100)
 *   .skip(1)
 *   .toArray()
 * ```
 */
export declare class Cursor<
  O extends OperationBase = OperationBase,
  T extends CursorOptions = CursorOptions
> extends CoreCursor<O, T> {
  /** @internal */
  s: CursorPrivate;
  /** @internal */
  constructor(topology: Topology, operation: O, options?: T);
  get readPreference(): ReadPreference;
  get sortValue(): Sort;
  /** @internal */
  _initializeCursor(callback: Callback): void;
  /** Check if there is any document still available in the cursor */
  hasNext(): Promise<void>;
  hasNext(callback: Callback): void;
  /** Get the next available document from the cursor, returns null if no more documents are available. */
  next(): Promise<Document>;
  next(callback: Callback<Document>): void;
  /** Set the cursor query */
  filter(filter: Document): this;
  /**
   * Set the cursor maxScan
   *
   * @deprecated Instead, use maxTimeMS option or the helper {@link Cursor.maxTimeMS}.
   * @param maxScan - Constrains the query to only scan the specified number of documents when fulfilling the query
   */
  maxScan(maxScan: number): this;
  /**
   * Set the cursor hint
   *
   * @param hint - If specified, then the query system will only consider plans using the hinted index.
   */
  hint(hint: Hint): this;
  /**
   * Set the cursor min
   *
   * @param min - Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
   */
  min(min: number): this;
  /**
   * Set the cursor max
   *
   * @param max - Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
   */
  max(max: number): this;
  /**
   * Set the cursor returnKey.
   * If set to true, modifies the cursor to only return the index field or fields for the results of the query, rather than documents.
   * If set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields.
   *
   * @param value - the returnKey value.
   */
  returnKey(value: boolean): this;
  /**
   * Modifies the output of a query by adding a field $recordId to matching documents. $recordId is the internal key which uniquely identifies a document in a collection.
   *
   * @param value - The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
   */
  showRecordId(value: boolean): this;
  /**
   * Set the cursor snapshot
   *
   * @deprecated as of MongoDB 4.0
   *
   * @param value - The $snapshot operator prevents the cursor from returning a document more than once because an intervening write operation results in a move of the document.
   */
  snapshot(value: boolean): this;
  /**
   * Set a node.js specific cursor option
   *
   * @param field - The cursor option to set 'numberOfRetries' | 'tailableRetryInterval'.
   *
   * @param value - The field value.
   */
  setCursorOption(field: typeof CURSOR_FIELDS[number], value: number): this;
  /**
   * Add a cursor flag to the cursor
   *
   * @param flag - The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
   * @param value - The flag boolean value.
   */
  addCursorFlag(flag: CursorFlag, value: boolean): this;
  /**
   * Add a query modifier to the cursor query
   *
   * @param name - The query modifier (must start with $, such as $orderby etc)
   * @param value - The modifier value.
   */
  addQueryModifier(name: string, value: string | boolean | number): this;
  /**
   * Add a comment to the cursor query allowing for tracking the comment in the log.
   *
   * @param value - The comment attached to this query.
   */
  comment(value: string): this;
  /**
   * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
   *
   * @param value - Number of milliseconds to wait before aborting the tailed query.
   */
  maxAwaitTimeMS(value: number): this;
  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   *
   * @param value - Number of milliseconds to wait before aborting the query.
   */
  maxTimeMS(value: number): this;
  /**
   * Sets a field projection for the query.
   *
   * @param value - The field projection object.
   */
  project(value: Document): this;
  /**
   * Sets the sort order of the cursor query.
   *
   * @param sort - The key or keys set for the sort.
   * @param direction - The direction of the sorting (1 or -1).
   */
  sort(sort: Sort | string, direction?: SortDirection): this;
  /**
   * Set the batch size for the cursor.
   *
   * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   */
  batchSize(value: number): this;
  /**
   * Set the collation options for the cursor.
   *
   * @param value - The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
   */
  collation(value: CollationOptions): this;
  /**
   * Set the limit for the cursor.
   *
   * @param value - The limit for the cursor query.
   */
  limit(value: number): this;
  /**
   * Set the skip for the cursor.
   *
   * @param value - The skip for the cursor query.
   */
  skip(value: number): this;
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
  each(callback: EachCallback): void;
  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * @param iterator - The iteration callback.
   * @param callback - The end callback.
   */
  forEach(iterator: (doc: Document) => void): Promise<Document>;
  forEach(iterator: (doc: Document) => void, callback: Callback): void;
  /**
   * Set the ReadPreference for the cursor.
   *
   * @param readPreference - The new read preference for the cursor.
   */
  setReadPreference(readPreference: ReadPreferenceLike): this;
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
  /** Close the cursor, sending a KillCursor command and emitting close. */
  close(): void;
  close(callback: Callback): void;
  close(options: CursorCloseOptions): Promise<void>;
  close(options: CursorCloseOptions, callback: Callback): void;
  /**
   * Map all documents using the provided function
   *
   * @param transform - The mapping transformation method.
   */
  map(transform: DocumentTransforms['doc']): this;
  isClosed(): boolean;
  destroy(err?: AnyError): void;
  /** Return a modified Readable stream including a possible transform method. */
  stream(options?: StreamOptions): this;
  /**
   * Return a modified Readable stream that applies a given transform function, if supplied. If none supplied,
   * returns a stream of unmodified docs.
   */
  transformStream(options?: StreamOptions): Transform;
  /**
   * Execute the explain for the cursor
   *
   * @param callback - The result callback.
   */
  explain(): Promise<unknown>;
  explain(callback: Callback): void;
  /** Return the cursor logger */
  getLogger(): Logger;
}

/** @public */
export declare const CURSOR_FIELDS: readonly ['numberOfRetries', 'tailableRetryInterval'];

/** @public Flags allowed for cursor */
export declare const CURSOR_FLAGS: readonly [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'exhaust',
  'partial'
];

/** @public */
export declare interface CursorCloseOptions {
  /** Bypass calling killCursors when closing the cursor. */
  skipKillCursors?: boolean;
}

/** @public */
export declare type CursorFlag = typeof CURSOR_FLAGS[number];

/** @public */
export declare interface CursorOptions extends CoreCursorOptions {
  cursorFactory?: typeof Cursor;
  tailableRetryInterval?: number;
  explicitlyIgnoreSession?: boolean;
  cursor?: Document;
  /** The internal topology of the created cursor */
  topology?: Topology;
  /** Session to use for the operation */
  numberOfRetries?: number;
}

/** @internal */
export declare type CursorPrivate = CoreCursorPrivate;

/** @public Possible states for a cursor */
export declare enum CursorState {
  INIT = 0,
  OPEN = 1,
  CLOSED = 2,
  GET_MORE = 3
}

/**
 * @public
 * The **Db** class is a class that represents a MongoDB Database.
 *
 * @example
 * ```js
 * const { MongoClient } = require('mongodb');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Select the database by name
 *   const testDb = client.db(dbName);
 *   client.close();
 * });
 * ```
 */
export declare class Db implements OperationParent {
  /** @internal */
  s: DbPrivate;
  static SYSTEM_NAMESPACE_COLLECTION: string;
  static SYSTEM_INDEX_COLLECTION: string;
  static SYSTEM_PROFILE_COLLECTION: string;
  static SYSTEM_USER_COLLECTION: string;
  static SYSTEM_COMMAND_COLLECTION: string;
  static SYSTEM_JS_COLLECTION: string;
  /**
   * Creates a new Db instance
   *
   * @param databaseName - The name of the database this instance represents.
   * @param topology - The server topology for the database.
   * @param options - Optional settings for Db construction
   */
  constructor(databaseName: string, topology: Topology, options?: DbOptions);
  get databaseName(): string;
  get topology(): Topology;
  get options(): DbOptions | undefined;
  get slaveOk(): boolean;
  get readConcern(): ReadConcern | undefined;
  get readPreference(): ReadPreference;
  get writeConcern(): WriteConcern | undefined;
  get namespace(): string;
  /**
   * Create a new collection on a server with the specified options. Use this to create capped collections.
   * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
   *
   * @param name - The name of the collection to create
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  createCollection(name: string): Promise<Collection>;
  createCollection(name: string, callback: Callback<Collection>): void;
  createCollection(name: string, options: CreateCollectionOptions): Promise<Collection>;
  createCollection(
    name: string,
    options: CreateCollectionOptions,
    callback: Callback<Collection>
  ): void;
  /**
   * Execute a command
   *
   * @param command - The command to run
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  command(command: Document): Promise<Document>;
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  /**
   * Execute an aggregation framework pipeline against the database, needs MongoDB \>= 3.6
   *
   * @param pipeline - An array of aggregation stages to be executed
   * @param options - Optional settings for the command
   */
  aggregate(pipeline?: Document[], options?: AggregateOptions): AggregationCursor;
  /** Return the Admin db instance */
  admin(): Admin;
  /**
   * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you
   * can use it without a callback in the following way: `const collection = db.collection('mycollection');`
   *
   * @param name - the collection name we wish to access.
   * @returns return the new Collection instance if not in strict mode
   */
  collection(name: string): Collection;
  collection(name: string, options: CollectionOptions): Collection;
  collection(name: string, callback: Callback<Collection>): void;
  collection(name: string, options: CollectionOptions, callback: Callback<Collection>): void;
  /**
   * Get all the db statistics.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  stats(): Promise<Document>;
  stats(callback: Callback<Document>): void;
  stats(options: DbStatsOptions): Promise<Document>;
  stats(options: DbStatsOptions, callback: Callback<Document>): void;
  /**
   * List all collections of this database with optional filter
   *
   * @param filter - Query to filter collections by
   * @param options - Optional settings for the command
   */
  listCollections(filter?: Document, options?: ListCollectionsOptions): CommandCursor;
  /**
   * Rename a collection.
   *
   * @param fromCollection - Name of current collection to rename
   * @param toCollection - New name of of the collection
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  renameCollection(fromCollection: string, toCollection: string): Promise<Collection>;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    callback: Callback<Collection>
  ): void;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options: RenameOptions
  ): Promise<Collection>;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options: RenameOptions,
    callback: Callback<Collection>
  ): void;
  /**
   * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @param name - Name of collection to drop
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropCollection(name: string): Promise<boolean>;
  dropCollection(name: string, callback: Callback<boolean>): void;
  dropCollection(name: string, options: DropCollectionOptions): Promise<boolean>;
  dropCollection(name: string, options: DropCollectionOptions, callback: Callback<boolean>): void;
  /**
   * Drop a database, removing it permanently from the server.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropDatabase(): Promise<boolean>;
  dropDatabase(callback: Callback<boolean>): void;
  dropDatabase(options: DropDatabaseOptions): Promise<boolean>;
  dropDatabase(options: DropDatabaseOptions, callback: Callback<boolean>): void;
  /**
   * Fetch all collections for the current db.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  collections(): Promise<Collection[]>;
  collections(callback: Callback<Collection[]>): void;
  collections(options: ListCollectionsOptions): Promise<Collection[]>;
  collections(options: ListCollectionsOptions, callback: Callback<Collection[]>): void;
  /**
   * Runs a command on the database as admin.
   *
   * @param command - The command to run
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  executeDbAdminCommand(command: Document): Promise<void>;
  executeDbAdminCommand(command: Document, callback: Callback): void;
  executeDbAdminCommand(command: Document, options: RunCommandOptions): Promise<void>;
  executeDbAdminCommand(
    command: Document,
    options: RunCommandOptions,
    callback: Callback<void>
  ): void;
  /**
   * Creates an index on the db and collection.
   *
   * @param name - Name of the collection to create the index on.
   * @param indexSpec - Specify the field to index, or an index specification
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  createIndex(name: string, indexSpec: IndexSpecification): Promise<Document>;
  createIndex(name: string, indexSpec: IndexSpecification, callback?: Callback<Document>): void;
  createIndex(
    name: string,
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions
  ): Promise<Document>;
  createIndex(
    name: string,
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param password - An optional password for the new user
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  addUser(username: string): Promise<Document>;
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  addUser(
    username: string,
    password: string,
    options: AddUserOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  removeUser(username: string): Promise<boolean>;
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  /**
   * Set the current profiling level of MongoDB
   *
   * @param level - The new profiling level (off, slow_only, all).
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  setProfilingLevel(level: ProfilingLevel): Promise<ProfilingLevel>;
  setProfilingLevel(level: ProfilingLevel, callback: Callback<ProfilingLevel>): void;
  setProfilingLevel(
    level: ProfilingLevel,
    options: SetProfilingLevelOptions
  ): Promise<ProfilingLevel>;
  setProfilingLevel(
    level: ProfilingLevel,
    options: SetProfilingLevelOptions,
    callback: Callback<ProfilingLevel>
  ): void;
  /**
   * Retrieve the current profiling Level for MongoDB
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  profilingLevel(): Promise<string>;
  profilingLevel(callback: Callback<string>): void;
  profilingLevel(options: ProfilingLevelOptions): Promise<string>;
  profilingLevel(options: ProfilingLevelOptions, callback: Callback<string>): void;
  /**
   * Retrieves this collections index info.
   *
   * @param name - The name of the collection.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexInformation(name: string): Promise<Document>;
  indexInformation(name: string, callback: Callback<Document>): void;
  indexInformation(name: string, options: IndexInformationOptions): Promise<Document>;
  indexInformation(
    name: string,
    options: IndexInformationOptions,
    callback: Callback<Document>
  ): void;
  /** Unref all sockets */
  unref(): void;
  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this database. Will ignore all
   * changes to system collections.
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch(): ChangeStream;
  watch(pipeline?: Document[]): ChangeStream;
  /** Return the db logger */
  getLogger(): Logger;
  get logger(): Logger;
  /**
   * Evaluate JavaScript on the server
   *
   * @deprecated Eval is deprecated on MongoDB 3.2 and forward
   * @param code - JavaScript to execute on server.
   * @param parameters - The parameters for the call.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  eval(code: Code, parameters: Document | Document[]): Promise<Document>;
  eval(code: Code, parameters: Document | Document[], callback: Callback<Document>): void;
  eval(code: Code, parameters: Document | Document[], options: EvalOptions): Promise<Document>;
  eval(
    code: Code,
    parameters: Document | Document[],
    options: EvalOptions,
    callback: Callback<Document>
  ): Promise<Document>;
  /**
   * Ensures that an index exists, if it does not it creates it
   *
   * @deprecated since version 2.0
   * @param name - The index name
   * @param fieldOrSpec - Defines the index.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  ensureIndex(name: string, fieldOrSpec: string | Document): Promise<Document>;
  ensureIndex(name: string, fieldOrSpec: string | Document, callback: Callback<Document>): void;
  ensureIndex(
    name: string,
    fieldOrSpec: string | Document,
    options: CreateIndexesOptions
  ): Promise<Document>;
  ensureIndex(
    name: string,
    fieldOrSpec: string | Document,
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Retrieve the current profiling information for MongoDB
   *
   * @deprecated Query the `system.profile` collection directly.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  profilingInfo(): Promise<Document[]>;
  profilingInfo(callback: Callback<Document[]>): void;
  profilingInfo(options: ProfilingLevelOptions): Promise<Document[]>;
  profilingInfo(options: ProfilingLevelOptions, callback: Callback<Document[]>): void;
}

/** @internal */
export declare const DB_AGGREGATE_COLLECTION: 1;

/** @public */
export declare interface DbOptions
  extends BSONSerializeOptions,
    WriteConcernOptions,
    LoggerOptions {
  /** If the database authentication is dependent on another databaseName. */
  authSource?: string;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreferenceLike;
  /** A primary key factory object for generation of custom _id keys. */
  pkFactory?: PkFactory;
  /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** Should retry failed writes */
  retryWrites?: boolean;
}

/** @internal */
export declare interface DbPrivate {
  topology: Topology;
  options?: DbOptions;
  logger: Logger;
  readPreference?: ReadPreference;
  pkFactory: PkFactory | typeof ObjectId;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  namespace: MongoDBNamespace;
}
export { DBRef };

/** @public */
export declare interface DbStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}
export { Decimal128 };

/** @public */
export declare interface DeleteOptions extends CommandOperationOptions {
  single?: boolean;
}

/** @public */
export declare interface DeleteResult {
  /** Indicates whether this write result was acknowledged */
  acknowledged: boolean;
  /** The number of documents that were deleted */
  deletedCount: number;
  /** The raw result returned from MongoDB. Will vary depending on server version */
  result: Document;
  /** The connection object used for the operation */
  connection?: Connection;
}

/** @public */
export declare interface DestroyOptions {
  /** Force the destruction. */
  force?: boolean;
}

/** @public */
export declare type DistinctOptions = CommandOperationOptions;

/** @public */
export declare interface Document {
  [key: string]: any;
}

/** @public */
export declare interface DocumentTransforms {
  /** Transform each document returned */
  doc(doc: Document): Document;
  /** Transform the value returned from the initial query */
  query?(doc: Document): Document | Document[];
}
export { Double };

/** @public */
export declare interface DriverInfo {
  name?: string;
  version?: string;
  platform?: string;
}

/** @public */
export declare type DropCollectionOptions = CommandOperationOptions;

/** @public */
export declare type DropDatabaseOptions = CommandOperationOptions;

/** @public */
export declare type DropIndexesOptions = CommandOperationOptions;

/** @public */
export declare type EachCallback = (error?: AnyError, result?: Document | null) => boolean | void;

/** @public */
export declare interface ErrorDescription {
  message?: string;
  errmsg?: string;
  $err?: string;
  errorLabels?: string[];
  [key: string]: any;
}

/** @public */
export declare interface EstimatedDocumentCountOptions extends CommandOperationOptions {
  skip?: number;
  limit?: number;
  hint?: Hint;
}

/** @public */
export declare interface EvalOptions extends CommandOperationOptions {
  nolock?: boolean;
}

/** @public */
export declare type FinalizeFunction = (key: string, reducedValue: Document) => Document;

/** @public */
export declare interface FindAndModifyOptions extends CommandOperationOptions {
  /** When false, returns the updated document rather than the original. The default is true. */
  returnOriginal?: boolean;
  /** Upsert the document if it does not exist. */
  upsert?: boolean;
  /** Limits the fields to return for all matching documents. */
  projection?: Document;
  /** @deprecated use `projection` instead */
  fields?: Document;
  /** Determines which document the operation modifies if the query selects multiple documents. */
  sort?: Sort;
  /** Optional list of array filters referenced in filtered positional operators */
  arrayFilters?: Document[];
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
  hint?: Document;
  update?: boolean;
  remove?: boolean;
  new?: boolean;
}

/** @public */
export declare interface FindOptions extends QueryOptions {
  /** Sets the limit of documents returned in the query. */
  limit?: number;
  /** Set to sort the documents coming back from the query. Array of indexes, `[['a', 1]]` etc. */
  sort?: Sort;
  /** The fields to return in the query. Object of fields to either include or exclude (one of, not both), `{'a':1, 'b': 1}` **or** `{'a': 0, 'b': 0}` */
  projection?: Document;
  /** @deprecated Use `options.projection` instead */
  fields?: Document;
  /** Set to skip N documents ahead in your query (useful for pagination). */
  skip?: number;
  /** Tell the query to use specific indexes in the query. Object of indexes to use, `{'_id':1}` */
  hint?: Hint;
  /** Explain the query instead of returning the data. */
  explain?: boolean;
  /** @deprecated Snapshot query. */
  snapshot?: boolean;
  /** Specify if the cursor can timeout. */
  timeout?: boolean;
  /** Specify if the cursor is tailable. */
  tailable?: boolean;
  /** Specify if the cursor is a a tailable-await cursor. Requires `tailable` to be true */
  awaitData?: boolean;
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /** Only return the index key. */
  returnKey?: boolean;
  /** @deprecated Limit the number of items to scan. */
  maxScan?: number;
  /** Set index bounds. */
  min?: number;
  /** Set index bounds. */
  max?: number;
  /** Show disk location of results. */
  showDiskLoc?: boolean;
  /** You can put a $comment field on a query to make looking in the profiler logs simpler. */
  comment?: string | Document;
  /** Specify if the cursor should return partial results when querying against a sharded system */
  partial?: boolean;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. Requires `tailable` and `awaitData` to be true */
  maxAwaitTimeMS?: number;
  /** The server normally times out idle cursors after an inactivity period (10 minutes) to prevent excess memory use. Set this option to prevent that. */
  noCursorTimeout?: boolean;
  /** Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields). */
  collation?: CollationOptions;
  /** Enables writing to temporary files on the server. */
  allowDiskUse?: boolean;
}

/**************************************************************
 * GETMORE
 **************************************************************/
/** @internal */
export declare class GetMore {
  numberToReturn: number;
  requestId: number;
  ns: string;
  cursorId: Long;
  constructor(ns: string, cursorId: Long, opts?: OpGetMoreOptions);
  toBin(): Buffer[];
}

/** @internal */
export declare type GetMoreOptions = CommandOptions;

/**
 * @public
 * Constructor for a streaming GridFS interface
 */
export declare class GridFSBucket extends EventEmitter {
  /** @internal */
  s: GridFSBucketPrivate;
  /**
   * When the first call to openUploadStream is made, the upload stream will
   * check to see if it needs to create the proper indexes on the chunks and
   * files collections. This event is fired either when 1) it determines that
   * no index creation is necessary, 2) when it successfully creates the
   * necessary indexes.
   * @event
   */
  static readonly INDEX: 'index';
  constructor(db: Db, options?: GridFSBucketOptions);
  /**
   * Returns a writable stream (GridFSBucketWriteStream) for writing
   * buffers to GridFS. The stream's 'id' property contains the resulting
   * file's id.
   *
   * @param filename - The value of the 'filename' key in the files doc
   * @param options - Optional settings.
   */
  openUploadStream(
    filename: string,
    options?: GridFSBucketWriteStreamOptions
  ): GridFSBucketWriteStream;
  /**
   * Returns a writable stream (GridFSBucketWriteStream) for writing
   * buffers to GridFS for a custom file id. The stream's 'id' property contains the resulting
   * file's id.
   */
  openUploadStreamWithId(
    id: TFileId,
    filename: string,
    options?: GridFSBucketWriteStreamOptions
  ): GridFSBucketWriteStream;
  /** Returns a readable stream (GridFSBucketReadStream) for streaming file data from GridFS. */
  openDownloadStream(id: TFileId, options?: GridFSBucketReadStreamOptions): GridFSBucketReadStream;
  /**
   * Deletes a file with the given id
   *
   * @param id - The id of the file doc
   */
  delete(id: TFileId): Promise<undefined>;
  delete(id: TFileId, callback: Callback<void>): void;
  /** Convenience wrapper around find on the files collection */
  find(filter: Document, options?: FindOptions): Cursor;
  /**
   * Returns a readable stream (GridFSBucketReadStream) for streaming the
   * file with the given name from GridFS. If there are multiple files with
   * the same name, this will stream the most recent file with the given name
   * (as determined by the `uploadDate` field). You can set the `revision`
   * option to change this behavior.
   */
  openDownloadStreamByName(
    filename: string,
    options?: GridFSBucketReadStreamOptionsWithRevision
  ): GridFSBucketReadStream;
  /**
   * Renames the file with the given _id to the given string
   *
   * @param id - the id of the file to rename
   * @param filename - new name for the file
   */
  rename(id: TFileId, filename: string): Promise<void>;
  rename(id: TFileId, filename: string, callback: Callback<void>): void;
  /** Removes this bucket's files collection, followed by its chunks collection. */
  drop(): Promise<void>;
  drop(callback: Callback<void>): void;
  /** Get the Db scoped logger. */
  getLogger(): Logger;
}

/** @public */
export declare interface GridFSBucketOptions extends WriteConcernOptions {
  /** The 'files' and 'chunks' collections will be prefixed with the bucket name followed by a dot. */
  bucketName?: string;
  /** Number of bytes stored in each chunk. Defaults to 255KB */
  chunkSizeBytes?: number;
  /** Read preference to be passed to read operations */
  readPreference?: ReadPreference;
}

/** @internal */
export declare interface GridFSBucketPrivate {
  db: Db;
  options: {
    bucketName: string;
    chunkSizeBytes: number;
    readPreference?: ReadPreference;
    writeConcern: WriteConcern | undefined;
  };
  _chunksCollection: Collection;
  _filesCollection: Collection;
  checkedIndexes: boolean;
  calledOpenUploadStream: boolean;
}

/**
 * @public
 * A readable stream that enables you to read buffers from GridFS.
 *
 * Do not instantiate this class directly. Use `openDownloadStream()` instead.
 */
export declare class GridFSBucketReadStream extends Readable {
  /** @internal */
  s: GridFSBucketReadStreamPrivate;
  /**
   * An error occurred
   * @event
   */
  static readonly ERROR: 'error';
  /**
   * Fires when the stream loaded the file document corresponding to the provided id.
   * @event
   */
  static readonly FILE: 'file';
  /**
   * Emitted when a chunk of data is available to be consumed.
   * @event
   */
  static readonly DATA: 'data';
  /**
   * Fired when the stream is exhausted (no more data events).
   * @event
   */
  static readonly END: 'end';
  /**
   * Fired when the stream is exhausted and the underlying cursor is killed
   * @event
   */
  static readonly CLOSE: 'close';
  /** @internal
   * @param chunks - Handle for chunks collection
   * @param files - Handle for files collection
   * @param readPreference - The read preference to use
   * @param filter - The query to use to find the file document
   */
  constructor(
    chunks: Collection,
    files: Collection,
    readPreference: ReadPreference | undefined,
    filter: Document,
    options?: GridFSBucketReadStreamOptions
  );
  /**
   * Reads from the cursor and pushes to the stream.
   * Private Impl, do not call directly
   */
  _read(): void;
  /**
   * Sets the 0-based offset in bytes to start streaming from. Throws
   * an error if this stream has entered flowing mode
   * (e.g. if you've already called `on('data')`)
   *
   * @param start - 0-based offset in bytes to start streaming from
   */
  start(start?: number): this;
  /**
   * Sets the 0-based offset in bytes to start streaming from. Throws
   * an error if this stream has entered flowing mode
   * (e.g. if you've already called `on('data')`)
   *
   * @param end - Offset in bytes to stop reading at
   */
  end(end?: number): this;
  /**
   * Marks this stream as aborted (will never push another `data` event)
   * and kills the underlying cursor. Will emit the 'end' event, and then
   * the 'close' event once the cursor is successfully killed.
   *
   * @param callback - called when the cursor is successfully closed or an error occurred.
   */
  abort(callback?: Callback<void>): void;
}

/** @public */
export declare interface GridFSBucketReadStreamOptions {
  sort?: Sort;
  skip?: number;
  /** 0-based offset in bytes to start streaming from */
  start?: number;
  /** 0-based offset in bytes to stop streaming before */
  end?: number;
}

/** @public */
export declare interface GridFSBucketReadStreamOptionsWithRevision
  extends GridFSBucketReadStreamOptions {
  /** The revision number relative to the oldest file with the given filename. 0
   * gets you the oldest file, 1 gets you the 2nd oldest, -1 gets you the
   * newest. */
  revision?: number;
}

/** @internal */
export declare interface GridFSBucketReadStreamPrivate {
  bytesRead: number;
  bytesToTrim: number;
  bytesToSkip: number;
  chunks: Collection;
  cursor?: Cursor;
  expected: number;
  files: Collection;
  filter: Document;
  init: boolean;
  expectedEnd: number;
  file?: GridFSFile;
  options: {
    sort?: Sort;
    skip?: number;
    start: number;
    end: number;
  };
  readPreference?: ReadPreference;
}

/**
 * @public
 * A writable stream that enables you to write buffers to GridFS.
 *
 * Do not instantiate this class directly. Use `openUploadStream()` instead.
 */
export declare class GridFSBucketWriteStream extends Writable {
  bucket: GridFSBucket;
  chunks: Collection;
  filename: string;
  files: Collection;
  options: GridFSBucketWriteStreamOptions;
  done: boolean;
  id: TFileId;
  chunkSizeBytes: number;
  bufToStore: Buffer;
  length: number;
  md5: false | crypto.Hash;
  n: number;
  pos: number;
  state: {
    streamEnd: boolean;
    outstandingRequests: number;
    errored: boolean;
    aborted: boolean;
  };
  writeConcern?: WriteConcern;
  /** @event */
  static readonly ERROR = 'error';
  /**
   * `end()` was called and the write stream successfully wrote the file metadata and all the chunks to MongoDB.
   * @event
   */
  static readonly FINISH = 'finish';
  /** @internal
   * @param bucket - Handle for this stream's corresponding bucket
   * @param filename - The value of the 'filename' key in the files doc
   * @param options - Optional settings.
   */
  constructor(bucket: GridFSBucket, filename: string, options?: GridFSBucketWriteStreamOptions);
  /**
   * Write a buffer to the stream.
   *
   * @param chunk - Buffer to write
   * @param encodingOrCallback - Optional encoding for the buffer
   * @param callback - Function to call when the chunk was added to the buffer, or if the entire chunk was persisted to MongoDB if this chunk caused a flush.
   * @returns False if this write required flushing a chunk to MongoDB. True otherwise.
   */
  write(chunk: Buffer): boolean;
  write(chunk: Buffer, callback: Callback<void>): boolean;
  write(chunk: Buffer, encoding: BufferEncoding | undefined): boolean;
  write(chunk: Buffer, encoding: BufferEncoding | undefined, callback: Callback<void>): boolean;
  /**
   * Places this write stream into an aborted state (all future writes fail)
   * and deletes all chunks that have already been written.
   *
   * @param callback - called when chunks are successfully removed or error occurred
   */
  abort(): Promise<void>;
  abort(callback: Callback<void>): void;
  /**
   * Tells the stream that no more data will be coming in. The stream will
   * persist the remaining data to MongoDB, write the files document, and
   * then emit a 'finish' event.
   *
   * @param chunk - Buffer to write
   * @param encoding - Optional encoding for the buffer
   * @param callback - Function to call when all files and chunks have been persisted to MongoDB
   */
  end(): void;
  end(chunk: Buffer): void;
  end(callback: Callback<GridFSFile | void>): void;
  end(chunk: Buffer, callback: Callback<GridFSFile | void>): void;
  end(chunk: Buffer, encoding: BufferEncoding): void;
  end(
    chunk: Buffer,
    encoding: BufferEncoding | undefined,
    callback: Callback<GridFSFile | void>
  ): void;
}

/** @public */
export declare interface GridFSBucketWriteStreamOptions extends WriteConcernOptions {
  /** Overwrite this bucket's chunkSizeBytes for this file */
  chunkSizeBytes?: number;
  /** Custom file id for the GridFS file. */
  id?: TFileId;
  /** Object to store in the file document's `metadata` field */
  metadata?: Document;
  /** String to store in the file document's `contentType` field */
  contentType?: string;
  /** Array of strings to store in the file document's `aliases` field */
  aliases?: string[];
  /** If true, disables adding an md5 field to file data */
  disableMD5?: boolean;
}

/** @public */
export declare interface GridFSFile {
  _id: GridFSBucketWriteStream['id'];
  length: GridFSBucketWriteStream['length'];
  chunkSize: GridFSBucketWriteStream['chunkSizeBytes'];
  md5?: boolean | string;
  filename: GridFSBucketWriteStream['filename'];
  contentType?: GridFSBucketWriteStream['options']['contentType'];
  aliases?: GridFSBucketWriteStream['options']['aliases'];
  metadata?: GridFSBucketWriteStream['options']['metadata'];
  uploadDate: Date;
}

/** @public */
export declare interface HedgeOptions {
  /** Explicitly enable or disable hedged reads. */
  enabled?: boolean;
}

/** @public */
export declare type Hint = string | Document;

/** @internal */
export declare interface IndexDescription {
  collation?: CollationOptions;
  name?: string;
  key: Document;
}

/** @public */
export declare type IndexDirection = -1 | 1 | '2d' | '2dsphere' | 'text' | 'geoHaystack' | number;

/** @internal */
export declare interface IndexInformationOptions {
  full?: boolean;
  readPreference?: ReadPreference;
  session?: ClientSession;
}

/** @public */
export declare type IndexSpecification =
  | string
  | [string, IndexDirection]
  | {
      [key: string]: IndexDirection;
    }
  | [string, IndexDirection][]
  | {
      [key: string]: IndexDirection;
    }[]
  | IndexSpecification[];

/** @public */
export declare interface InsertManyResult {
  /** The total amount of documents inserted. */
  insertedCount: number;
  /** Map of the index of the inserted document to the id of the inserted document. */
  insertedIds: {
    [key: number]: ObjectId;
  };
  /** All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany */
  ops: Document[];
  /** The raw command result object returned from MongoDB (content might vary by server version). */
  result: Document;
}

/** @public */
export declare interface InsertOneResult {
  /** The total amount of documents inserted */
  insertedCount: number;
  /** The driver generated ObjectId for the insert operation */
  insertedId?: ObjectId;
  /** All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany */
  ops?: Document[];
  /** The connection object used for the operation */
  connection?: Connection;
  /** The raw command result object returned from MongoDB (content might vary by server version) */
  result: Document;
}

/** @public */
export declare interface InsertOptions extends CommandOperationOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails. */
  ordered?: boolean;
  /** @deprecated use `ordered` instead */
  keepGoing?: boolean;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
}

/** @public */
export declare function instrument(options: any, callback: Callback): Instrumentation;

/** @public */
export declare class Instrumentation extends EventEmitter {
  $MongoClient: any;
  $prototypeConnect: any;
  /** @event */
  static readonly STARTED: 'started';
  /** @event */
  static readonly SUCCEEDED: 'succeeded';
  /** @event */
  static readonly FAILED: 'failed';
  constructor();
  instrument(MongoClient: any, callback: Callback): void;
  uninstrument(): void;
}
export { Int32 };

/** @internal */
export declare interface InternalCursorState extends BSONSerializeOptions {
  postBatchResumeToken?: ResumeToken;
  batchSize: number;
  cmd: Document;
  currentLimit: number;
  cursorId?: Long;
  lastCursorId?: Long;
  cursorIndex: number;
  dead: boolean;
  killed: boolean;
  init: boolean;
  notified: boolean;
  documents: Document[];
  limit: number;
  operationTime?: OperationTime;
  reconnect?: boolean;
  session?: ClientSession;
  skip: number;
  streamOptions?: StreamOptions;
  transforms?: DocumentTransforms;
  raw?: boolean;
}

/** @internal */
export declare interface InterruptableAsyncInterval {
  wake(): void;
  stop(): void;
}

declare const kAutoEncrypter: unique symbol;

declare const kBeforeHandshake: unique symbol;

declare const kBuffer: unique symbol;

declare const kCancellationToken: unique symbol;

declare const kCancellationToken_2: unique symbol;

declare const kCancelled: unique symbol;

declare const kCancelled_2: unique symbol;

declare const kClusterTime: unique symbol;

declare const kConnection: unique symbol;

declare const kConnectionCounter: unique symbol;

declare const kConnections: unique symbol;

declare const kDescription: unique symbol;

declare const kErrorLabels: unique symbol;

declare const kGeneration: unique symbol;

declare const kGeneration_2: unique symbol;

/**************************************************************
 * KILLCURSOR
 **************************************************************/
/** @internal */
export declare class KillCursor {
  ns: string;
  requestId: number;
  cursorIds: Long[];
  constructor(ns: string, cursorIds: Long[]);
  toBin(): Buffer[];
}

declare const kIsMaster: unique symbol;

declare const kLastUseTime: unique symbol;

declare const kLogger: unique symbol;

declare const kMessageStream: unique symbol;

declare const kMinPoolSizeTimer: unique symbol;

declare const kMonitor: unique symbol;

declare const kMonitorId: unique symbol;

declare const kPermits: unique symbol;

declare const kQueue: unique symbol;

declare const kResumeQueue: unique symbol;

declare const kRoundTripTime: unique symbol;

declare const kRTTPinger: unique symbol;

declare const kServer: unique symbol;

declare const kStream: unique symbol;

declare const kWaitQueue: unique symbol;

declare const kWaitQueue_2: unique symbol;

/** @public */
export declare interface ListCollectionsOptions extends CommandOperationOptions {
  /** Since 4.0: If true, will only return the collection name in the response, and will omit additional info */
  nameOnly?: boolean;
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
}

/** @public */
export declare interface ListDatabasesOptions extends CommandOperationOptions {
  /** A query predicate that determines which databases are listed */
  filter?: Document;
  /** A flag to indicate whether the command should return just the database names, or return both database names and size information */
  nameOnly?: boolean;
  /** A flag that determines which databases are returned based on the user privileges when access control is enabled */
  authorizedDatabases?: boolean;
}

/** @public */
export declare type ListDatabasesResult = string[] | Document[];

/** @public */
export declare interface ListIndexesOptions extends CommandOperationOptions {
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
}

/**
 * @public
 */
export declare class Logger {
  className: string;
  /**
   * Creates a new Logger instance
   *
   * @param className - The Class name associated with the logging instance
   * @param options - Optional logging settings
   */
  constructor(className: string, options?: LoggerOptions);
  /**
   * Log a message at the debug level
   *
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  debug(message: string, object?: any): void;
  /**
   * Log a message at the warn level
   *
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  warn(message: string, object?: any): void;
  /**
   * Log a message at the info level
   *
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  info(message: string, object?: any): void;
  /**
   * Log a message at the error level
   *
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  error(message: string, object?: any): void;
  /** Is the logger set at info level */
  isInfo(): boolean;
  /** Is the logger set at error level */
  isError(): boolean;
  /** Is the logger set at error level */
  isWarn(): boolean;
  /** Is the logger set at debug level */
  isDebug(): boolean;
  /** Resets the logger to default settings, error and no filtered classes */
  static reset(): void;
  /** Get the current logger function */
  static currentLogger(): LoggerFunction;
  /**
   * Set the current logger function
   *
   * @param logger - Custom logging function
   */
  static setCurrentLogger(logger: LoggerFunction): void;
  /**
   * Filter log messages for a particular classs
   *
   * @param type - The type of filter (currently only class)
   * @param values - The filters to apply
   */
  static filter(type: string, values: string[]): void;
  /**
   * Set the current log level
   *
   * @param newLevel - Set current log level (debug, warn, info, error)
   */
  static setLevel(newLevel: LoggerLevel): void;
}

/** @public */
export declare type LoggerFunction = (message?: any, ...optionalParams: any[]) => void;

/** @public */
export declare enum LoggerLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/** @public */
export declare interface LoggerOptions {
  logger?: LoggerFunction;
  loggerLevel?: LoggerLevel;
}

/** @public */
export declare enum LogLevel {
  'error' = 'error',
  'warn' = 'warn',
  'info' = 'info',
  'debug' = 'debug'
}
export { Long };

/** @public */
declare const Map_2: any;
export { Map_2 as Map };

/** @public */
export declare type MapFunction = () => void;

/** @public */
export declare interface MapReduceOptions extends CommandOperationOptions {
  /** Sets the output target for the map reduce job. */
  out?:
    | 'inline'
    | {
        inline: 1;
      }
    | {
        replace: string;
      }
    | {
        merge: string;
      }
    | {
        reduce: string;
      };
  /** Query filter object. */
  query?: Document;
  /** Sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces. */
  sort?: Sort;
  /** Number of objects to return from collection. */
  limit?: number;
  /** Keep temporary data. */
  keeptemp?: boolean;
  /** Finalize function. */
  finalize?: FinalizeFunction | string;
  /** Can pass in variables that can be access from map/reduce/finalize. */
  scope?: Document;
  /** It is possible to make the execution stay in JS. Provided in MongoDB \> 2.0.X. */
  jsMode?: boolean;
  /** Provide statistics on job execution time. */
  verbose?: boolean;
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
}
export { MaxKey };

/**
 * @internal
 * A duplex stream that is capable of reading and writing raw wire protocol messages, with
 * support for optional compression
 */
export declare class MessageStream extends Duplex {
  maxBsonMessageSize: number;
  [kBuffer]: BufferList;
  constructor(options?: MessageStreamOptions);
  _write(chunk: Buffer, _: unknown, callback: Callback<Buffer>): void;
  _read(): void;
  writeCommand(command: WriteProtocolMessageType, operationDescription: OperationDescription): void;
}

/** @internal */
export declare interface MessageStreamOptions extends DuplexOptions {
  maxBsonMessageSize?: number;
}
export { MinKey };

/**
 * An error indicating an unsuccessful Bulk Write
 * @public
 * @category Error
 */
export declare class MongoBulkWriteError extends MongoError {
  result: any;
  /**
   * Creates a new BulkWriteError
   *
   * @param error The error message
   * @param result The result of the bulk write operation
   */
  constructor(error?: any, result?: BulkWriteResult);
}

/**
 * @public
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 *
 * @example
 * ```js
 * // Connect using a MongoClient instance
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * const mongoClient = new MongoClient(url);
 * mongoClient.connect(function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 * ```
 *
 * @example
 * ```js
 * // Connect using the MongoClient.connect static method
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   const db = client.db(dbName);
 *   client.close();
 * });
 * ```
 */
export declare class MongoClient extends EventEmitter implements OperationParent {
  /** @internal */
  s: MongoClientPrivate;
  topology?: Topology;
  constructor(url: string, options?: MongoClientOptions);
  get readConcern(): ReadConcern | undefined;
  get writeConcern(): WriteConcern | undefined;
  get readPreference(): ReadPreference;
  get logger(): Logger;
  /**
   * Connect to MongoDB using a url
   *
   * @see docs.mongodb.org/manual/reference/connection-string/
   */
  connect(): Promise<MongoClient>;
  connect(callback: Callback<MongoClient>): void;
  /**
   * Close the db and its underlying connections
   *
   * @param force - Force close, emitting no events
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  close(): Promise<void>;
  close(callback: Callback<void>): void;
  close(force: boolean): Promise<void>;
  close(force: boolean, callback: Callback<void>): void;
  /**
   * Create a new Db instance sharing the current socket connections.
   * Db instances are cached so performing db('db1') twice will return the same instance.
   * You can control these behaviors with the options noListener and returnNonCachedInstance.
   *
   * @param dbName - The name of the database we want to use. If not provided, use database name from connection string.
   * @param options - Optional settings for Db construction
   */
  db(dbName: string): Db;
  db(
    dbName: string,
    options: DbOptions & {
      returnNonCachedInstance?: boolean;
    }
  ): Db;
  /** Check if MongoClient is connected */
  isConnected(): boolean;
  /**
   * Connect to MongoDB using a url
   *
   * @see https://docs.mongodb.org/manual/reference/connection-string/
   */
  static connect(url: string): Promise<MongoClient>;
  static connect(url: string, callback: Callback<MongoClient>): void;
  static connect(url: string, options: MongoClientOptions): Promise<MongoClient>;
  static connect(url: string, options: MongoClientOptions, callback: Callback<MongoClient>): void;
  /** Starts a new session on the server */
  startSession(): ClientSession;
  startSession(options: ClientSessionOptions): ClientSession;
  /**
   * Runs a given operation with an implicitly created session. The lifetime of the session
   * will be handled without the need for user interaction.
   *
   * NOTE: presently the operation MUST return a Promise (either explicit or implicitly as an async function)
   *
   * @param options - Optional settings for the command
   * @param callback - An callback to execute with an implicitly created session
   */
  withSession(callback: WithSessionCallback): Promise<void>;
  withSession(options: ClientSessionOptions, callback: WithSessionCallback): Promise<void>;
  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this cluster. Will ignore all
   * changes to system collections, as well as the local, admin, and config databases.
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch(): ChangeStream;
  watch(pipeline?: Document[]): ChangeStream;
  /** Return the mongo client logger */
  getLogger(): Logger;
  /**
   * @deprecated You cannot logout a MongoClient, you can create a new instance.
   */
  logout: (options: any, callback: Callback) => void;
}

/** @public */
export declare interface MongoClientOptions
  extends WriteConcernOptions,
    MongoURIOptions,
    BSONSerializeOptions {
  /** The maximum number of connections in the connection pool. */
  poolSize?: MongoURIOptions['maxPoolSize'];
  /** Validate mongod server certificate against Certificate Authority */
  sslValidate?: boolean;
  /** SSL Certificate store binary buffer. */
  sslCA?: Buffer;
  /** SSL Certificate binary buffer. */
  sslCert?: Buffer;
  /** SSL Key file binary buffer. */
  sslKey?: Buffer;
  /** SSL Certificate pass phrase. */
  sslPass?: string;
  /** SSL Certificate revocation list binary buffer. */
  sslCRL?: Buffer;
  /** Ensure we check server identify during SSL, set to false to disable checking. */
  checkServerIdentity?: boolean | Function;
  /** TCP Connection no delay */
  noDelay?: boolean;
  /** TCP Connection keep alive enabled */
  keepAlive?: boolean;
  /** The number of milliseconds to wait before initiating keepAlive on the TCP socket */
  keepAliveInitialDelay?: number;
  /** Version of IP stack. Can be 4, 6 or null (default). If null, will attempt to connect with IPv6, and will fall back to IPv4 on failure */
  family?: 4 | 6 | null;
  /** Server attempt to reconnect #times */
  reconnectTries?: number;
  /** Server will wait number of milliseconds between retries */
  reconnectInterval?: number;
  /** Control if high availability monitoring runs for Replicaset or Mongos proxies */
  ha?: boolean;
  /** The High availability period for replicaset inquiry */
  haInterval?: number;
  /** Force server to assign `_id` values instead of driver */
  forceServerObjectId?: boolean;
  /** Return document results as raw BSON buffers */
  raw?: boolean;
  /** A primary key factory object for generation of custom `_id` keys */
  pkFactory?: PkFactory;
  /** A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible */
  promiseLibrary?: any;
  /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The logging level */
  loggerLevel?: LogLevel;
  /** Custom logger object */
  logger?: Logger;
  /** Enable the wrapping of the callback in the current domain, disabled by default to avoid perf hit */
  domainsEnabled?: boolean;
  /** Validate MongoClient passed in options for correctness */
  validateOptions?: boolean;
  /** The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections */
  appname?: MongoURIOptions['appName'];
  /** The auth settings for when connection to server. */
  auth?: Auth;
  /** Type of compression to use?: snappy or zlib */
  compression?: CompressorName;
  /** The number of retries for a tailable cursor */
  numberOfRetries?: number;
  /** Enable command monitoring for this client */
  monitorCommands?: boolean;
  /** If present, the connection pool will be initialized with minSize connections, and will never dip below minSize connections */
  minSize?: number;
  /** Determines whether or not to use the new url parser. Enables the new, spec-compliant, url parser shipped in the core driver. This url parser fixes a number of problems with the original parser, and aims to outright replace that parser in the near future. Defaults to true, and must be explicitly set to false to use the legacy url parser. */
  useNewUrlParser?: boolean;
  /** Enables the new unified topology layer */
  useUnifiedTopology?: boolean;
  /** Optionally enable client side auto encryption */
  autoEncryption?: AutoEncryptionOptions;
  /** Allows a wrapping driver to amend the client metadata generated by the driver to include information about the wrapping driver */
  driverInfo?: DriverInfo;
  /** String containing the server name requested via TLS SNI. */
  servername?: string;
  dbName?: string;
}

/** @internal */
export declare interface MongoClientPrivate {
  url: string;
  options?: MongoClientOptions;
  dbCache: Map<string, Db>;
  sessions: Set<ClientSession>;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  namespace: MongoDBNamespace;
  logger: Logger;
}

/**
 * @public
 * A representation of the credentials used by MongoDB
 */
export declare class MongoCredentials {
  /** The username used for authentication */
  readonly username: string;
  /** The password used for authentication */
  readonly password: string;
  /** The database that the user should authenticate against */
  readonly source: string;
  /** The method used to authenticate */
  readonly mechanism: AuthMechanism;
  /** Special properties used by some types of auth mechanisms */
  readonly mechanismProperties: Document;
  constructor(options: MongoCredentialsOptions);
  /** Determines if two MongoCredentials objects are equivalent */
  equals(other: MongoCredentials): boolean;
  /**
   * If the authentication mechanism is set to "default", resolves the authMechanism
   * based on the server version and server supported sasl mechanisms.
   *
   * @param ismaster - An ismaster response from the server
   */
  resolveAuthMechanism(ismaster?: Document): MongoCredentials;
}

/** @public */
export declare interface MongoCredentialsOptions {
  username: string;
  password: string;
  source: string;
  db?: string;
  mechanism?: AuthMechanism;
  mechanismProperties: Document;
}

/** @public */
export declare class MongoDBNamespace {
  db: string;
  collection?: string;
  /**
   * Create a namespace object
   *
   * @param db - database name
   * @param collection - collection name
   */
  constructor(db: string, collection?: string);
  toString(): string;
  withCollection(collection: string): MongoDBNamespace;
  static fromString(namespace?: string): MongoDBNamespace;
}

/**
 * @public
 * @category Error
 */
export declare class MongoError extends Error {
  [kErrorLabels]: Set<string>;
  code?: number;
  codeName?: string;
  writeConcernError?: Document;
  topologyVersion?: TopologyVersion;
  constructor(message: string | Error | ErrorDescription);
  /** Legacy name for server error responses */
  get errmsg(): string;
  /**
   * Creates a new MongoError object
   *
   * @param options - The options used to create the error.
   * @deprecated Use `new MongoError()` instead.
   */
  static create(options: any): MongoError;
  /**
   * Checks the error to see if it has an error label
   *
   * @param label - The error label to check for
   * @returns returns true if the error has the provided error label
   */
  hasErrorLabel(label: string): boolean;
  addErrorLabel(label: any): void;
  get errorLabels(): string[];
}

/**
 * An error indicating an issue with the network, including TCP errors and timeouts.
 * @public
 * @category Error
 */
export declare class MongoNetworkError extends MongoError {
  [kBeforeHandshake]?: boolean;
  constructor(message: string | Error, options?: any);
}

/**
 * An error used when attempting to parse a value (like a connection string)
 * @public
 * @category Error
 */
export declare class MongoParseError extends MongoError {
  constructor(message: string);
}

/**
 * An error signifying a client-side server selection error
 * @public
 * @category Error
 */
export declare class MongoServerSelectionError extends MongoTimeoutError {
  constructor(message: string, reason: any);
}

/**
 * An error signifying a client-side timeout event
 * @public
 * @category Error
 */
export declare class MongoTimeoutError extends MongoError {
  /** An optional reason context for the timeout, generally an error saved during flow of monitoring and selecting servers */
  reason?: string;
  constructor(message: string, reason: any);
}

/**
 * @public
 * Describes all possible URI query options for the mongo client
 * @see https://docs.mongodb.com/manual/reference/connection-string
 */
export declare interface MongoURIOptions
  extends Pick<WriteConcernOptions, 'journal' | 'w' | 'wtimeoutMS'> {
  /** Specifies the name of the replica set, if the mongod is a member of a replica set. */
  replicaSet?: string;
  /** Enables or disables TLS/SSL for the connection. */
  tls?: boolean;
  /** A boolean to enable or disables TLS/SSL for the connection. (The ssl option is equivalent to the tls option.) */
  ssl?: MongoURIOptions['tls'];
  /** Specifies the location of a local .pem file that contains either the client’s TLS/SSL certificate or the client’s TLS/SSL certificate and key. */
  tlsCertificateKeyFile?: string;
  /** Specifies the password to de-crypt the tlsCertificateKeyFile. */
  tlsCertificateKeyFilePassword?: string;
  /** Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance. */
  tlsCAFile?: string;
  /** Bypasses validation of the certificates presented by the mongod/mongos instance */
  tlsAllowInvalidCertificates?: boolean;
  /** Disables hostname validation of the certificate presented by the mongod/mongos instance. */
  tlsAllowInvalidHostnames?: boolean;
  /** Disables various certificate validations. */
  tlsInsecure?: boolean;
  /** The time in milliseconds to attempt a connection before timing out. */
  connectTimeoutMS?: number;
  /** The time in milliseconds to attempt a send or receive on a socket before the attempt times out. */
  socketTimeoutMS?: number;
  /** Comma-delimited string of compressors to enable network compression for communication between this client and a mongod/mongos instance. */
  compressors?: string;
  /** An integer that specifies the compression level if using zlib for network compression. */
  zlibCompressionLevel?: number;
  /** The maximum number of connections in the connection pool. */
  maxPoolSize?: number;
  /** The minimum number of connections in the connection pool. */
  minPoolSize?: number;
  /** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
  maxIdleTimeMS?: number;
  /** A number that the driver multiples the maxPoolSize value to, to provide the maximum number of threads allowed to wait for a connection to become available from the pool. */
  waitQueueMultiple?: number;
  /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
  waitQueueTimeoutMS?: number;
  /** The level of isolation */
  readConcernLevel?: ReadConcernLevel;
  /** Specifies the read preferences for this connection */
  readPreference?: ReadPreferenceMode | ReadPreference;
  /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
  maxStalenessSeconds?: number;
  /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
  readPreferenceTags?: string;
  /** Specify the database name associated with the user’s credentials. */
  authSource?: string;
  /** Specify the authentication mechanism that MongoDB will use to authenticate the connection. */
  authMechanism?: AuthMechanism;
  /** Specify properties for the specified authMechanism as a comma-separated list of colon-separated key-value pairs. */
  authMechanismProperties?: {
    SERVICE_NAME?: string;
    CANONICALIZE_HOST_NAME?: boolean;
    SERVICE_REALM?: string;
  };
  /** Set the Kerberos service name when connecting to Kerberized MongoDB instances. This value must match the service name set on MongoDB instances to which you are connecting. */
  gssapiServiceName?: string;
  /** The size (in milliseconds) of the latency window for selecting among multiple suitable MongoDB instances. */
  localThresholdMS?: number;
  /** Specifies how long (in milliseconds) to block for server selection before throwing an exception.  */
  serverSelectionTimeoutMS?: number;
  /** When true, instructs the driver to scan the MongoDB deployment exactly once after server selection fails and then either select a server or raise an error. When false, the driver blocks and searches for a server up to the serverSelectionTimeoutMS value. */
  serverSelectionTryOnce?: boolean;
  /** heartbeatFrequencyMS controls when the driver checks the state of the MongoDB deployment. Specify the interval (in milliseconds) between checks, counted from the end of the previous check until the beginning of the next one. */
  heartbeatFrequencyMS?: number;
  /** Specify a custom app name. */
  appName?: string;
  /** Enables retryable reads. */
  retryReads?: boolean;
  /** Enable retryable writes. */
  retryWrites?: boolean;
  /** Allow a driver to force a Single topology type with a connection string containing one host */
  directConnection?: boolean;
}

/**
 * An error thrown when the server reports a writeConcernError
 * @public
 * @category Error
 */
export declare class MongoWriteConcernError extends MongoError {
  /** The result document (provided if ok: 1) */
  result?: Document;
  constructor(message: string, result: Document);
}

/** @public */
export declare class Monitor extends EventEmitter {
  /** @internal */
  s: MonitorPrivate;
  address: string;
  options: MonitorOptions;
  connectOptions: ConnectionOptions;
  [kServer]: Server;
  [kConnection]?: Connection;
  [kCancellationToken_2]: EventEmitter;
  [kMonitorId]?: InterruptableAsyncInterval;
  [kRTTPinger]?: RTTPinger;
  constructor(server: Server, options?: Partial<MonitorOptions>);
  connect(): void;
  requestCheck(): void;
  reset(): void;
  close(): void;
}

/** @public */
export declare interface MonitorOptions {
  connectTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
}

/** @internal */
export declare interface MonitorPrivate {
  state: string;
}

/** @internal */
export declare class Msg {
  ns: string;
  command: Document;
  options: OpQueryOptions;
  requestId: number;
  serializeFunctions: boolean;
  ignoreUndefined: boolean;
  checkKeys: boolean;
  maxBsonSize: number;
  checksumPresent: boolean;
  moreToCome: boolean;
  exhaustAllowed: boolean;
  constructor(ns: string, command: Document, options: OpQueryOptions);
  toBin(): Buffer[];
  makeDocumentSegment(buffers: Buffer[], document: Document): number;
  serializeBson(document: Document): Buffer;
  static getRequestId(): number;
}
export { ObjectId };

/**
 * @internal
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect.
 */
export declare abstract class OperationBase<
  T extends OperationOptions = OperationOptions,
  TResult = Document
> {
  options: T;
  ns: MongoDBNamespace;
  cmd: Document;
  readPreference: ReadPreference;
  server: Server;
  cursorState?: InternalCursorState;
  fullResponse?: boolean;
  constructor(options?: T);
  abstract execute(server: Server, callback: Callback<TResult>): void;
  hasAspect(aspect: symbol): boolean;
  set session(session: ClientSession);
  get session(): ClientSession;
  clearSession(): void;
  get canRetryRead(): boolean;
  get canRetryWrite(): boolean;
}

/** @internal */
export declare interface OperationDescription extends BSONSerializeOptions {
  started: number;
  cb: Callback<CommandResult>;
  command: boolean;
  documentsReturnedIn?: string;
  fullResult: boolean;
  noResponse: boolean;
  raw: boolean;
  requestId: number;
  session?: ClientSession;
  socketTimeoutOverride?: boolean;
  agreedCompressor?: CompressorName;
  zlibCompressionLevel?: number;
  $clusterTime?: Document;
}

/** @internal */
export declare interface OperationOptions extends BSONSerializeOptions {
  explain?: boolean;
  session?: ClientSession;
}

/** @internal */
export declare interface OperationParent {
  s: {
    namespace: MongoDBNamespace;
  };
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  readPreference?: ReadPreference;
  logger?: Logger;
}

/**
 * @public
 * Represents a specific point in time on a server. Can be retrieved by using {@link Db.command}
 * @remarks
 * See {@link https://docs.mongodb.com/manual/reference/method/db.runCommand/#response| Run Command Response}
 */
export declare type OperationTime = Timestamp;

/** @internal */
export declare interface OpGetMoreOptions {
  numberToReturn?: number;
}

/** @internal */
export declare interface OpQueryOptions {
  socketTimeout?: number;
  session?: ClientSession;
  documentsReturnedIn?: string;
  numberToSkip?: number;
  numberToReturn?: number;
  returnFieldSelector?: Document;
  pre32Limit?: number;
  serializeFunctions?: boolean;
  ignoreUndefined?: boolean;
  maxBsonSize?: number;
  checkKeys?: boolean;
  slaveOk?: boolean;
  requestId?: number;
  moreToCome?: boolean;
  exhaustAllowed?: boolean;
  readPreference?: ReadPreference;
}

/** @public */
export declare interface PipeOptions {
  end?: boolean;
}

/** @public */
export declare type PkFactory = typeof PkFactoryAbstract | PkFactoryLiteral;

/** @public */
export declare abstract class PkFactoryAbstract {
  abstract createPk(): any;
}

/** @public */
export declare interface PkFactoryLiteral {
  createPk(): any;
}

/** @public */
export declare enum ProfilingLevel {
  off = 'off',
  slowOnly = 'slow_only',
  all = 'all'
}

/** @public */
export declare type ProfilingLevelOptions = CommandOperationOptions;

/**
 * @public
 * Global promise store allowing user-provided promises
 */
declare class Promise_2 {
  /** Validates the passed in promise library */
  static validate(lib: any): lib is PromiseConstructor;
  /** Sets the promise library */
  static set(lib: PromiseConstructor): void;
  /** Get the stored promise library, or resolves passed in */
  static get(): PromiseConstructor;
}
export { Promise_2 as Promise };

/**************************************************************
 * QUERY
 **************************************************************/
/** @internal */
export declare class Query {
  ns: string;
  query: Document;
  numberToSkip: number;
  numberToReturn: number;
  returnFieldSelector?: Document;
  requestId: number;
  pre32Limit?: number;
  serializeFunctions: boolean;
  ignoreUndefined: boolean;
  maxBsonSize: number;
  checkKeys: boolean;
  batchSize: number;
  tailable: boolean;
  slaveOk: boolean;
  oplogReplay: boolean;
  noCursorTimeout: boolean;
  awaitData: boolean;
  exhaust: boolean;
  partial: boolean;
  documentsReturnedIn?: string;
  constructor(ns: string, query: Document, options: OpQueryOptions);
  /** Assign next request Id. */
  incRequestId(): void;
  /** Peek next request Id. */
  nextRequestId(): number;
  /** Increment then return next request Id. */
  static getRequestId(): number;
  toBin(): Buffer[];
}

/** @internal */
export declare interface QueryOptions extends CommandOptions {
  readPreference?: ReadPreferenceLike;
}

/**
 * @public
 * The MongoDB ReadConcern, which allows for control of the consistency and isolation properties
 * of the data read from replica sets and replica set shards.
 *
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html
 */
export declare class ReadConcern {
  level: ReadConcernLevel;
  /** Constructs a ReadConcern from the read concern level.*/
  constructor(level: ReadConcernLevel);
  /**
   * Construct a ReadConcern given an options object.
   *
   * @param options - The options object from which to extract the write concern.
   */
  static fromOptions(options: any): ReadConcern | undefined;
  static get MAJORITY(): string;
  static get AVAILABLE(): string;
  static get LINEARIZABLE(): string;
  static get SNAPSHOT(): string;
}

/** @public */
export declare enum ReadConcernLevel {
  local = 'local',
  majority = 'majority',
  linearizable = 'linearizable',
  available = 'available',
  snapshot = 'snapshot'
}

/**
 * @public
 * The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 *
 * @see https://docs.mongodb.com/manual/core/read-preference/
 */
export declare class ReadPreference {
  mode: ReadPreferenceMode;
  tags?: TagSet[];
  hedge?: HedgeOptions;
  maxStalenessSeconds?: number;
  minWireVersion?: number;
  static PRIMARY: ReadPreferenceMode;
  static PRIMARY_PREFERRED: ReadPreferenceMode;
  static SECONDARY: ReadPreferenceMode;
  static SECONDARY_PREFERRED: ReadPreferenceMode;
  static NEAREST: ReadPreferenceMode;
  static primary: ReadPreference;
  static primaryPreferred: ReadPreference;
  static secondary: ReadPreference;
  static secondaryPreferred: ReadPreference;
  static nearest: ReadPreference;
  /**
   * @param mode - A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
   * @param tags - A tag set used to target reads to members with the specified tag(s). tagSet is not available if using read preference mode primary.
   * @param options - Additional read preference options
   */
  constructor(mode: ReadPreferenceMode, tags?: TagSet[], options?: ReadPreferenceOptions);
  get preference(): ReadPreferenceMode;
  static fromString(mode: string): ReadPreference;
  /**
   * Construct a ReadPreference given an options object.
   *
   * @param options - The options object from which to extract the read preference.
   */
  static fromOptions(options: any): ReadPreference | undefined;
  /**
   * Resolves a read preference based on well-defined inheritance rules. This method will not only
   * determine the read preference (if there is one), but will also ensure the returned value is a
   * properly constructed instance of `ReadPreference`.
   *
   * @param parent - The parent of the operation on which to determine the read preference, used for determining the inherited read preference.
   * @param options - The options passed into the method, potentially containing a read preference
   */
  static resolve(parent?: OperationParent, options?: any): ReadPreference;
  /**
   * Replaces options.readPreference with a ReadPreference instance
   */
  static translate(options: ReadPreferenceLikeOptions): ReadPreferenceLikeOptions;
  /**
   * Validate if a mode is legal
   *
   * @param mode - The string representing the read preference mode.
   */
  static isValid(mode: string): boolean;
  /**
   * Validate if a mode is legal
   *
   * @param mode - The string representing the read preference mode.
   */
  isValid(mode?: string): boolean;
  /**
   * Indicates that this readPreference needs the "slaveOk" bit when sent over the wire
   *
   * @see https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#op-query
   */
  slaveOk(): boolean;
  /**
   * Check if the two ReadPreferences are equivalent
   *
   * @param readPreference - The read preference with which to check equality
   */
  equals(readPreference: ReadPreference): boolean;
  /** Return JSON representation */
  toJSON(): object;
}

/** @public */
export declare type ReadPreferenceLike =
  | ReadPreference
  | ReadPreferenceMode
  | keyof typeof ReadPreferenceMode;

/** @public */
export declare interface ReadPreferenceLikeOptions {
  readPreference?:
    | ReadPreferenceLike
    | {
        mode: ReadPreferenceMode;
        preference: ReadPreferenceMode;
        tags: TagSet[];
        maxStalenessSeconds: number;
      };
}

/** @public */
export declare enum ReadPreferenceMode {
  primary = 'primary',
  primaryPreferred = 'primaryPreferred',
  secondary = 'secondary',
  secondaryPreferred = 'secondaryPreferred',
  nearest = 'nearest'
}

/** @public */
export declare interface ReadPreferenceOptions {
  /** Max secondary read staleness in seconds, Minimum value is 90 seconds.*/
  maxStalenessSeconds?: number;
  /** Server mode in which the same query is dispatched in parallel to multiple replica set members. */
  hedge?: HedgeOptions;
}

/** @public */
export declare type ReduceFunction = (key: string, values: Document[]) => Document;

/** @public */
export declare type RemoveUserOptions = CommandOperationOptions;

/** @public */
export declare interface RenameOptions extends CommandOperationOptions {
  /** Drop the target name collection if it previously exists. */
  dropTarget?: boolean;
  /** Unclear */
  new_collection?: boolean;
}

/** @public */
export declare interface ReplaceOptions extends CommandOperationOptions {
  /** If true, allows the write to opt-out of document level validation */
  bypassDocumentValidation?: boolean;
  /** Specifies a collation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: string | Document;
  /** When true, creates a new document if no document matches the query */
  upsert?: boolean;
  multi?: boolean;
}

/**
 * @public
 * Represents the logical starting point for a new or resuming {@link https://docs.mongodb.com/master/changeStreams/#change-stream-resume-token| Change Stream} on the server.
 */
export declare type ResumeToken = unknown;

/** @public */
export declare class RTTPinger {
  /** @internal */
  [kConnection]?: Connection;
  /** @internal */
  [kCancellationToken_2]: EventEmitter;
  /** @internal */
  [kRoundTripTime]: number;
  /** @internal */
  [kMonitorId]: NodeJS.Timeout;
  closed: boolean;
  constructor(cancellationToken: EventEmitter, options: RTTPingerOptions);
  get roundTripTime(): number;
  close(): void;
}

/** @public */
export declare interface RTTPingerOptions extends ConnectionOptions {
  heartbeatFrequencyMS: number;
}

/** @public */
export declare type RunCommandOptions = CommandOperationOptions;

/** @public */
export declare interface SelectServerOptions {
  readPreference?: ReadPreferenceLike;
  /** How long to block for server selection before throwing an error */
  serverSelectionTimeoutMS?: number;
  session?: ClientSession;
}

/** @public */
export declare class Server extends EventEmitter {
  /** @internal */
  s: ServerPrivate;
  clusterTime?: ClusterTime;
  ismaster?: Document;
  [kMonitor]: Monitor;
  /** @event */
  static readonly SERVER_HEARTBEAT_STARTED: 'serverHeartbeatStarted';
  /** @event */
  static readonly SERVER_HEARTBEAT_SUCCEEDED: 'serverHeartbeatSucceeded';
  /** @event */
  static readonly SERVER_HEARTBEAT_FAILED: 'serverHeartbeatFailed';
  /** @event */
  static readonly CONNECT: 'connect';
  /** @event */
  static readonly DESCRIPTION_RECEIVED: 'descriptionReceived';
  /** @event */
  static readonly CLOSED: 'closed';
  /** @event */
  static readonly ENDED: 'ended';
  /**
   * Create a server
   */
  constructor(topology: Topology, description: ServerDescription, options?: ServerOptions);
  get description(): ServerDescription;
  get name(): string;
  get autoEncrypter(): AutoEncrypter | undefined;
  /**
   * Initiate server connect
   */
  connect(): void;
  /** Destroy the server connection */
  destroy(options?: DestroyOptions, callback?: Callback): void;
  /**
   * Immediately schedule monitoring of this server. If there already an attempt being made
   * this will be a no-op.
   */
  requestCheck(): void;
  /**
   * Execute a command
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param cmd - The command hash
   * @param options - Optional settings
   * @param callback - A callback function
   */
  command(ns: string, cmd: Document, callback: Callback): void;
  command(ns: string, cmd: Document, options: CommandOptions, callback: Callback<Document>): void;
  /**
   * Execute a query against the server
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param cmd - The command document for the query
   * @param cursorState - Internal state of the cursor
   */
  query(
    ns: string,
    cmd: Document,
    cursorState: Partial<InternalCursorState>,
    options: QueryOptions,
    callback: Callback
  ): void;
  /**
   * Execute a `getMore` against the server
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param cursorState - State data associated with the cursor calling this method
   */
  getMore(
    ns: string,
    cursorState: InternalCursorState,
    batchSize: number,
    options: GetMoreOptions,
    callback: Callback<Document>
  ): void;
  /**
   * Execute a `killCursors` command against the server
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param cursorState - State data associated with the cursor calling this method
   */
  killCursors(ns: string, cursorState: InternalCursorState, callback?: Callback): void;
  /**
   * Insert one or more documents
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param ops - An array of documents to insert
   */
  insert(ns: string, ops: Document[], options: WriteCommandOptions, callback: Callback): void;
  /**
   * Perform one or more update operations
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param ops - An array of updates
   */
  update(ns: string, ops: Document[], options: WriteCommandOptions, callback: Callback): void;
  /**
   * Perform one or more remove operations
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param ops - An array of removes
   * @param options - options for removal
   * @param callback - A callback function
   */
  remove(ns: string, ops: Document[], options: WriteCommandOptions, callback: Callback): void;
}

/** @public */
export declare interface ServerAddress {
  host: string;
  port: number;
  domain_socket?: string;
}

/** @public */
export declare class ServerCapabilities {
  maxWireVersion: number;
  minWireVersion: number;
  constructor(ismaster: Document);
  get hasAggregationCursor(): boolean;
  get hasWriteCommands(): boolean;
  get hasTextSearch(): boolean;
  get hasAuthCommands(): boolean;
  get hasListCollectionsCommand(): boolean;
  get hasListIndexesCommand(): boolean;
  get commandsTakeWriteConcern(): boolean;
  get commandsTakeCollation(): boolean;
}

/**
 * @public
 * The client's view of a single server, based on the most recent ismaster outcome.
 *
 * Internal type, not meant to be directly instantiated
 */
export declare class ServerDescription {
  address: string;
  type: ServerType;
  hosts: string[];
  passives: string[];
  arbiters: string[];
  tags: TagSet;
  error?: Error;
  topologyVersion?: TopologyVersion;
  minWireVersion: number;
  maxWireVersion: number;
  roundTripTime: number;
  lastUpdateTime: number;
  lastWriteDate: number;
  me?: string;
  primary?: string;
  setName?: string;
  setVersion?: number;
  electionId?: ObjectId;
  logicalSessionTimeoutMinutes?: number;
  $clusterTime?: ClusterTime;
  /**
   * @internal
   * Create a ServerDescription
   *
   * @param address - The address of the server
   * @param ismaster - An optional ismaster response for this server
   */
  constructor(address: string, ismaster?: Document, options?: ServerDescriptionOptions);
  get allHosts(): string[];
  /** Is this server available for reads*/
  get isReadable(): boolean;
  /** Is this server data bearing */
  get isDataBearing(): boolean;
  /** Is this server available for writes */
  get isWritable(): boolean;
  get host(): string;
  get port(): number;
  /**
   * Determines if another `ServerDescription` is equal to this one per the rules defined
   * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
   */
  equals(other: ServerDescription): boolean;
}

/** @internal */
export declare interface ServerDescriptionOptions {
  /** An Error used for better reporting debugging */
  error?: Error;
  /** The round trip time to ping this server (in ms) */
  roundTripTime?: number;
  /** The topologyVersion */
  topologyVersion?: TopologyVersion;
}

/** @public */
export declare interface ServerOptions extends ConnectionPoolOptions, ClientMetadataOptions {
  credentials?: MongoCredentials;
}

/** @internal */
export declare interface ServerPrivate {
  /** The server description for this server */
  description: ServerDescription;
  /** A copy of the options used to construct this instance */
  options?: ServerOptions;
  /** A logger instance */
  logger: Logger;
  /** The current state of the Server */
  state: string;
  /** The topology this server is a part of */
  topology: Topology;
  /** A connection pool for this server */
  pool: ConnectionPool;
}

/** @public */
export declare type ServerSelectionCallback = Callback<Server>;

/** @internal */
export declare interface ServerSelectionRequest {
  serverSelector: ServerSelector;
  transaction?: Transaction;
  callback: ServerSelectionCallback;
  timer?: NodeJS.Timeout;
  [kCancelled_2]?: boolean;
}

/** @internal */
export declare type ServerSelector = (
  topologyDescription: TopologyDescription,
  servers: ServerDescription[]
) => ServerDescription[];

/**
 * @public
 * Reflects the existence of a session on the server. Can be reused by the session pool.
 * WARNING: not meant to be instantiated directly. For internal use only.
 */
export declare class ServerSession {
  id: ServerSessionId;
  lastUse: number;
  txnNumber: number;
  isDirty: boolean;
  /** @internal */
  constructor();
  /**
   * Determines if the server session has timed out.
   *
   * @param sessionTimeoutMinutes - The server's "logicalSessionTimeoutMinutes"
   */
  hasTimedOut(sessionTimeoutMinutes: number): boolean;
}

/** @internal */
export declare type ServerSessionId = {
  id: Binary;
};

/**
 * @internal
 * Maintains a pool of Server Sessions.
 * For internal use only
 */
export declare class ServerSessionPool {
  topology: Topology;
  sessions: ServerSession[];
  constructor(topology: Topology);
  /** Ends all sessions in the session pool */
  endAllPooledSessions(callback?: Callback<void>): void;
  /**
   * Acquire a Server Session from the pool.
   * Iterates through each session in the pool, removing any stale sessions
   * along the way. The first non-stale session found is removed from the
   * pool and returned. If no non-stale session is found, a new ServerSession is created.
   */
  acquire(): ServerSession;
  /**
   * Release a session to the session pool
   * Adds the session back to the session pool if the session has not timed out yet.
   * This method also removes any stale sessions from the pool.
   *
   * @param session - The session to release to the pool
   */
  release(session: ServerSession): void;
}

/** @public An enumeration of server types we know about */
export declare enum ServerType {
  Standalone = 'Standalone',
  Mongos = 'Mongos',
  PossiblePrimary = 'PossiblePrimary',
  RSPrimary = 'RSPrimary',
  RSSecondary = 'RSSecondary',
  RSArbiter = 'RSArbiter',
  RSOther = 'RSOther',
  RSGhost = 'RSGhost',
  Unknown = 'Unknown'
}

/** @public */
export declare type SetProfilingLevelOptions = CommandOperationOptions;

/** @public */
export declare type Sort =
  | {
      [key: string]: SortDirection;
    }
  | [string, SortDirection][]
  | [string, SortDirection];

/** @public */
export declare type SortDirection =
  | 1
  | -1
  | 'asc'
  | 'desc'
  | {
      $meta: string;
    };

/** @internal */
export declare class SrvPoller extends EventEmitter {
  srvHost: string;
  rescanSrvIntervalMS: number;
  heartbeatFrequencyMS: number;
  logger: Logger;
  haMode: boolean;
  generation: number;
  _timeout?: NodeJS.Timeout;
  constructor(options: SrvPollerOptions);
  get srvAddress(): string;
  get intervalMS(): number;
  start(): void;
  stop(): void;
  schedule(): void;
  success(srvRecords: dns.SrvRecord[]): void;
  failure(message: string, obj?: NodeJS.ErrnoException): void;
  parentDomainMismatch(srvRecord: dns.SrvRecord): void;
  _poll(): void;
}

/** @internal */
export declare interface SrvPollerOptions extends LoggerOptions {
  srvHost: string;
  heartbeatFrequencyMS: number;
}

/**
 * @public
 * @category Event
 */
export declare class SrvPollingEvent {
  srvRecords: dns.SrvRecord[];
  constructor(srvRecords: dns.SrvRecord[]);
  addresses(): Set<string>;
}

/** @public */
export declare type Stream = Socket | TLSSocket;

/** @public */
export declare class StreamDescription {
  address: string;
  type: string;
  minWireVersion?: number;
  maxWireVersion?: number;
  maxBsonObjectSize: number;
  maxMessageSizeBytes: number;
  maxWriteBatchSize: number;
  compressors: CompressorName[];
  compressor?: CompressorName;
  logicalSessionTimeoutMinutes?: number;
  __nodejs_mock_server__: boolean;
  zlibCompressionLevel?: number;
  constructor(address: string, options?: StreamDescriptionOptions);
  receiveResponse(response: Document): void;
}

/** @public */
export declare interface StreamDescriptionOptions {
  compression: {
    compressors: CompressorName[];
  };
}

/** @public */
export declare interface StreamOptions {
  /** A transformation method applied to each document emitted by the stream */
  transform?(doc: Document): Document;
}

/** @public */
export declare type TagSet = {
  [key: string]: string;
};

/** @public */
export declare type TFileId = string | number | object | ObjectId;

/** @internal */
export declare type TimerQueue = Set<NodeJS.Timeout>;
export { Timestamp };

/**
 * @public
 * A container of server instances representing a connection to a MongoDB topology.
 */
export declare class Topology extends EventEmitter {
  /** @internal */
  s: TopologyPrivate;
  /** @internal */
  [kWaitQueue_2]: Denque<ServerSelectionRequest>;
  /** @internal */
  ismaster?: Document;
  /** @internal */
  _type?: string;
  /** @event */
  static readonly SERVER_OPENING: 'serverOpening';
  /** @event */
  static readonly SERVER_CLOSED: 'serverClosed';
  /** @event */
  static readonly SERVER_DESCRIPTION_CHANGED: 'serverDescriptionChanged';
  /** @event */
  static readonly TOPOLOGY_OPENING: 'topologyOpening';
  /** @event */
  static readonly TOPOLOGY_CLOSED: 'topologyClosed';
  /** @event */
  static readonly TOPOLOGY_DESCRIPTION_CHANGED: 'topologyDescriptionChanged';
  /** @event */
  static readonly ERROR: 'error';
  /** @event */
  static readonly OPEN: 'open';
  /** @event */
  static readonly CONNECT: 'connect';
  /**
   * @param seedlist - a string list, or array of ServerAddress instances to connect to
   */
  constructor(seedlist: string | ServerAddress[], options?: TopologyOptions);
  /**
   * @returns A `TopologyDescription` for this topology
   */
  get description(): TopologyDescription;
  capabilities(): ServerCapabilities;
  /** Initiate server connect */
  connect(options?: ConnectOptions, callback?: Callback): void;
  /** Close this topology */
  close(options?: CloseOptions, callback?: Callback): void;
  /**
   * Selects a server according to the selection predicate provided
   *
   * @param selector - An optional selector to select servers by, defaults to a random selection within a latency window
   * @param options - Optional settings related to server selection
   * @param callback - The callback used to indicate success or failure
   * @returns An instance of a `Server` meeting the criteria of the predicate provided
   */
  selectServer(options: SelectServerOptions, callback: Callback<Server>): void;
  selectServer(
    selector: string | ReadPreference | ServerSelector,
    callback: Callback<Server>
  ): void;
  selectServer(
    selector: string | ReadPreference | ServerSelector,
    options: SelectServerOptions,
    callback: Callback<Server>
  ): void;
  /**
   * @returns Whether the topology should initiate selection to determine session support
   */
  shouldCheckForSessionSupport(): boolean;
  /**
   * @returns Whether sessions are supported on the current topology
   */
  hasSessionSupport(): boolean;
  /** Start a logical session */
  startSession(options: ClientSessionOptions, clientOptions?: MongoClientOptions): ClientSession;
  /** Send endSessions command(s) with the given session ids */
  endSessions(sessions: ServerSessionId[], callback?: Callback): void;
  /**
   * Update the internal TopologyDescription with a ServerDescription
   *
   * @param serverDescription - The server to update in the internal list of server descriptions
   */
  serverUpdateHandler(serverDescription: ServerDescription): void;
  auth(credentials?: MongoCredentials, callback?: Callback): void;
  logout(callback: Callback): void;
  /**
   * Execute a command
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param cmd - The command
   */
  command(ns: string, cmd: Document, options: CommandOptions, callback: Callback): void;
  /**
   * Create a new cursor
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param cmd - Can be either a command returning a cursor or a cursorId
   * @param options - Options for the cursor
   */
  cursor(ns: string, cmd: Document, options?: CursorOptions): Cursor;
  get clientMetadata(): ClientMetadata;
  isConnected(): boolean;
  isDestroyed(): boolean;
  unref(): void;
  lastIsMaster(): Document;
  get logicalSessionTimeoutMinutes(): number | undefined;
  get clusterTime(): ClusterTime | undefined;
  set clusterTime(clusterTime: ClusterTime | undefined);
  destroy: (options?: CloseOptions | undefined, callback?: Callback<any> | undefined) => void;
}

/** @public Representation of a deployment of servers */
export declare class TopologyDescription {
  type: TopologyType;
  setName?: string;
  maxSetVersion?: number;
  maxElectionId?: ObjectId;
  servers: Map<string, ServerDescription>;
  stale: boolean;
  compatible: boolean;
  compatibilityError?: string;
  logicalSessionTimeoutMinutes?: number;
  heartbeatFrequencyMS: number;
  localThresholdMS: number;
  commonWireVersion?: number;
  /**
   * Create a TopologyDescription
   */
  constructor(
    topologyType: TopologyType,
    serverDescriptions?: Map<string, ServerDescription>,
    setName?: string,
    maxSetVersion?: number,
    maxElectionId?: ObjectId,
    commonWireVersion?: number,
    options?: TopologyDescriptionOptions
  );
  /**
   * Returns a new TopologyDescription based on the SrvPollingEvent
   */
  updateFromSrvPollingEvent(ev: SrvPollingEvent): TopologyDescription;
  /**
   * Returns a copy of this description updated with a given ServerDescription
   */
  update(serverDescription: ServerDescription): TopologyDescription;
  get error(): Error | undefined;
  /**
   * Determines if the topology description has any known servers
   */
  get hasKnownServers(): boolean;
  /**
   * Determines if this topology description has a data-bearing server available.
   */
  get hasDataBearingServers(): boolean;
  /**
   * Determines if the topology has a definition for the provided address
   */
  hasServer(address: string): boolean;
}

/**
 * Emitted when topology description changes.
 * @public
 * @category Event
 */
export declare class TopologyDescriptionChangedEvent {
  /** A unique identifier for the topology */
  topologyId: number;
  /** The old topology description */
  previousDescription: TopologyDescription;
  /** The new topology description */
  newDescription: TopologyDescription;
  /** @internal */
  constructor(
    topologyId: number,
    previousDescription: TopologyDescription,
    newDescription: TopologyDescription
  );
}

/** @public */
export declare interface TopologyDescriptionOptions {
  heartbeatFrequencyMS?: number;
  localThresholdMS?: number;
}

/** @public */
export declare interface TopologyOptions
  extends ServerOptions,
    BSONSerializeOptions,
    LoggerOptions {
  reconnect: boolean;
  retryWrites?: boolean;
  retryReads?: boolean;
  host: string;
  port?: number;
  credentials?: MongoCredentials;
  /** How long to block for server selection before throwing an error */
  serverSelectionTimeoutMS: number;
  /** The frequency with which topology updates are scheduled */
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
  /** The name of the replica set to connect to */
  replicaSet?: string;
  cursorFactory: typeof Cursor;
  srvHost?: string;
  srvPoller?: SrvPoller;
  /** Indicates that a client should directly connect to a node without attempting to discover its topology type */
  directConnection: boolean;
  metadata: ClientMetadata;
  useRecoveryToken: boolean;
}

/** @internal */
export declare interface TopologyPrivate {
  /** the id of this topology */
  id: number;
  /** passed in options */
  options: TopologyOptions;
  /** initial seedlist of servers to connect to */
  seedlist: ServerAddress[];
  /** initial state */
  state: string;
  /** the topology description */
  description: TopologyDescription;
  serverSelectionTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
  /** allow users to override the cursor factory */
  Cursor: typeof Cursor;
  /** A map of server instances to normalized addresses */
  servers: Map<string, Server>;
  /** Server Session Pool */
  sessionPool: ServerSessionPool;
  /** Active client sessions */
  sessions: Set<ClientSession>;
  credentials?: MongoCredentials;
  clusterTime?: ClusterTime;
  /** timers created for the initial connect to a server */
  connectionTimers: TimerQueue;
  /** related to srv polling */
  srvPoller?: SrvPoller;
  detectTopologyDescriptionChange?: (event: TopologyDescriptionChangedEvent) => void;
  handleSrvPolling?: (event: SrvPollingEvent) => void;
}

/** @public An enumeration of topology types we know about */
export declare enum TopologyType {
  Single = 'Single',
  ReplicaSetNoPrimary = 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary = 'ReplicaSetWithPrimary',
  Sharded = 'Sharded',
  Unknown = 'Unknown'
}

/** @internal */
export declare interface TopologyVersion {
  processId: ObjectId;
  counter: Long;
}

/**
 * @public
 * A class maintaining state related to a server transaction. Internal Only
 */
export declare class Transaction {
  state: TxnState;
  options: TransactionOptions;
  _pinnedServer?: Server;
  _recoveryToken?: Document;
  /** Create a transaction */
  constructor(options?: TransactionOptions);
  get server(): Server | undefined;
  get recoveryToken(): Document | undefined;
  get isPinned(): boolean;
  /**
   * @returns Whether this session is presently in a transaction
   */
  get isActive(): boolean;
  /**
   * Transition the transaction in the state machine
   *
   * @param nextState - The new state to transition to
   */
  transition(nextState: TxnState): void;
  pinServer(server: Server): void;
  unpinServer(): void;
}

/** @public Configuration options for a transaction. */
export declare interface TransactionOptions extends CommandOperationOptions {
  /** A default read concern for commands in this transaction */
  readConcern?: ReadConcern;
  /** A default writeConcern for commands in this transaction */
  writeConcern?: WriteConcern;
  /** A default read preference for commands in this transaction */
  readPreference?: ReadPreference;
  maxCommitTimeMS?: number;
}

/** @internal */
export declare enum TxnState {
  NO_TRANSACTION = 'NO_TRANSACTION',
  STARTING_TRANSACTION = 'STARTING_TRANSACTION',
  TRANSACTION_IN_PROGRESS = 'TRANSACTION_IN_PROGRESS',
  TRANSACTION_COMMITTED = 'TRANSACTION_COMMITTED',
  TRANSACTION_COMMITTED_EMPTY = 'TRANSACTION_COMMITTED_EMPTY',
  TRANSACTION_ABORTED = 'TRANSACTION_ABORTED'
}

/** @public */
export declare interface UpdateOptions extends CommandOperationOptions {
  /** A set of filters specifying to which array elements an update should apply */
  arrayFilters?: Document[];
  /** If true, allows the write to opt-out of document level validation */
  bypassDocumentValidation?: boolean;
  /** Specifies a collation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: string | Document;
  /** When true, creates a new document if no document matches the query */
  upsert?: boolean;
  retryWrites?: boolean;
  multi?: boolean;
}

/** @public */
export declare interface UpdateResult {
  /** The number of documents that matched the filter */
  matchedCount: number;
  /** The number of documents that were modified */
  modifiedCount: number;
  /** The number of documents upserted */
  upsertedCount: number;
  /** The upserted id */
  upsertedId: ObjectId;
  result: Document;
}

/** @public */
export declare interface ValidateCollectionOptions extends CommandOperationOptions {
  /** Validates a collection in the background, without interrupting read or write traffic (only in MongoDB 4.4+) */
  background?: boolean;
}

/** @public */
export declare type W = number | 'majority';

/** @internal */
export declare interface WaitQueueMember {
  callback: Callback<Connection>;
  timer?: NodeJS.Timeout;
  [kCancelled]?: boolean;
}

/** @internal */
export declare type WireInsertOptions = WriteCommandOptions;

/** @internal */
export declare type WireRemoveOptions = WriteCommandOptions;

/** @internal */
export declare type WireUpdateOptions = WriteCommandOptions;

/**
 * @public
 * A callback provided to `withConnection`
 *
 * @param error - An error instance representing the error during the execution.
 * @param connection - The managed connection which was checked out of the pool.
 * @param callback - A function to call back after connection management is complete
 */
export declare type WithConnectionCallback = (
  error: MongoError,
  connection: Connection | undefined,
  callback: Callback<Connection>
) => void;

/** @public */
export declare type WithSessionCallback = (session: ClientSession) => Promise<any> | void;

/** @public */
export declare type WithTransactionCallback = (session: ClientSession) => Promise<any> | void;

/** @internal */
export declare interface WriteCommandOptions extends BSONSerializeOptions, CommandOptions {
  ordered?: boolean;
  writeConcern?: WriteConcern;
  collation?: CollationOptions;
  bypassDocumentValidation?: boolean;
}

/**
 * @public
 * A MongoDB WriteConcern, which describes the level of acknowledgement
 * requested from MongoDB for write operations.
 *
 * @see https://docs.mongodb.com/manual/reference/write-concern/
 */
export declare class WriteConcern {
  /** The write concern */
  w?: W;
  /** The write concern timeout */
  wtimeout?: number;
  /** The journal write concern */
  j?: boolean;
  /** The file sync write concern */
  fsync?: boolean | 1;
  /** Constructs a WriteConcern from the write concern properties. */
  constructor(
    /** The write concern */
    w?: W,
    /** The write concern timeout */
    wtimeout?: number,
    /** The journal write concern */
    j?: boolean,
    /** The file sync write concern */
    fsync?: boolean | 1
  );
  /** Construct a WriteConcern given an options object. */
  static fromOptions(
    options?: WriteConcernOptions | WriteConcern | W,
    inherit?: WriteConcernOptions | WriteConcern
  ): WriteConcern | undefined;
}

/**
 * An error representing a failure by the server to apply the requested write concern to the bulk operation.
 * @public
 * @category Error
 */
export declare class WriteConcernError {
  err: any;
  /**
   * Create a new WriteConcernError instance
   *
   * **NOTE:** Internal Type, do not instantiate directly
   *
   * @param err
   */
  constructor(err: any);
  /**
   * Write concern error code.
   *
   * @type {number}
   */
  get code(): any;
  /**
   * Write concern error message.
   *
   * @type {string}
   */
  get errmsg(): any;
  /**
   * @returns {object}
   */
  toJSON(): object;
  /**
   * @returns {string}
   */
  toString(): string;
}

/** @public */
export declare interface WriteConcernOptions {
  /** The write concern */
  w?: W;
  /** The write concern timeout */
  wtimeout?: number;
  /** The write concern timeout */
  wtimeoutMS?: number;
  /** The journal write concern */
  j?: boolean;
  /** The journal write concern */
  journal?: boolean;
  /** The file sync write concern */
  fsync?: boolean | 1;
  /** Write Concern as an object */
  writeConcern?: WriteConcernOptions | WriteConcern | W;
}

/**
 * An error that occurred during a BulkWrite on the server.
 * @public
 * @category Error
 */
export declare class WriteError {
  err: any;
  /**
   * Create a new WriteError instance
   *
   * **NOTE:** Internal Type, do not instantiate directly
   *
   * @param err
   */
  constructor(err: any);
  /**
   * WriteError code.
   *
   * @type {number}
   */
  get code(): any;
  /**
   * WriteError original bulk operation index.
   *
   * @type {number}
   */
  get index(): any;
  /**
   * WriteError message.
   *
   * @type {string}
   */
  get errmsg(): any;
  /**
   * Returns the underlying operation that caused the error
   *
   * @returns {object}
   */
  getOperation(): object;
  /**
   * @returns {object}
   */
  toJSON(): object;
  /**
   * @returns {string}
   */
  toString(): string;
}

/** @internal */
export declare type WriteProtocolMessageType = Query | Msg | GetMore | KillCursor;

export {};
