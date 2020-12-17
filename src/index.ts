import { Instrumentation } from './apm';
import { AbstractCursor } from './cursor/abstract_cursor';
import { AggregationCursor } from './cursor/aggregation_cursor';
import { FindCursor } from './cursor/find_cursor';
import { ListIndexesCursor } from './operations/indexes';
import { ListCollectionsCursor } from './operations/list_collections';
import { PromiseProvider } from './promise_provider';
import { Admin } from './admin';
import { MongoClient } from './mongo_client';
import { Db } from './db';
import { Collection } from './collection';
import { ReadPreference } from './read_preference';
import { Logger } from './logger';
import { GridFSBucket } from './gridfs-stream';
import type { Callback } from './utils';

// Set up the instrumentation method
/** @public */
function instrument(callback: Callback): Instrumentation;
function instrument(options?: unknown, callback?: Callback): Instrumentation {
  if (typeof options === 'function') {
    callback = options as Callback;
    options = {};
  }

  const instrumentation = new Instrumentation();
  instrumentation.instrument(MongoClient, callback);
  return instrumentation;
}

export {
  Binary,
  Code,
  DBRef,
  Double,
  Int32,
  Long,
  MinKey,
  MaxKey,
  ObjectId,
  Timestamp,
  Decimal128
} from './bson';

// NOTE: fix this up after ts-bson lands
/** @public */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const Map = require('bson').Map;
/** @public */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const BSONSymbol = require('bson').BSONSymbol;
/** @public */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const BSONRegExp = require('bson').BSONRegExp;

export {
  MongoError,
  MongoNetworkError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoParseError,
  MongoWriteConcernError
} from './error';
export { MongoBulkWriteError, BulkWriteOptions, AnyBulkWriteOperation } from './bulk/common';
export {
  // Utils
  instrument,
  PromiseProvider as Promise,
  // Actual driver classes exported
  Admin,
  MongoClient,
  Db,
  Collection,
  ReadPreference,
  Logger,
  AbstractCursor,
  AggregationCursor,
  FindCursor,
  ListIndexesCursor,
  ListCollectionsCursor,
  GridFSBucket
};

export type { AdminPrivate } from './admin';
export type { Instrumentation } from './apm';
export type { Document, BSONSerializeOptions } from './bson';
export type {
  InsertOneModel,
  ReplaceOneModel,
  UpdateOneModel,
  UpdateManyModel,
  DeleteOneModel,
  DeleteManyModel,
  BulkResult,
  BulkWriteResult,
  WriteError,
  WriteConcernError,
  BulkWriteOperationError
} from './bulk/common';
export type {
  ChangeStream,
  ChangeStreamOptions,
  ChangeStreamCursor,
  ResumeToken,
  PipeOptions,
  ChangeStreamCursorOptions,
  OperationTime,
  ResumeOptions
} from './change_stream';
export type { AuthMechanism, AuthMechanismId } from './cmap/auth/defaultAuthProviders';
export type { MongoCredentials, MongoCredentialsOptions } from './cmap/auth/mongo_credentials';
export type {
  WriteProtocolMessageType,
  Query,
  GetMore,
  Msg,
  KillCursor,
  OpGetMoreOptions,
  OpQueryOptions
} from './cmap/commands';
export type { Stream } from './cmap/connect';
export type {
  Connection,
  ConnectionOptions,
  DestroyOptions,
  CommandOptions,
  QueryOptions,
  GetMoreOptions
} from './cmap/connection';
export type {
  CloseOptions,
  ConnectionPoolOptions,
  WaitQueueMember,
  WithConnectionCallback,
  ConnectionPool
} from './cmap/connection_pool';
export type {
  OperationDescription,
  MessageStream,
  MessageStreamOptions
} from './cmap/message_stream';
export type { StreamDescription, StreamDescriptionOptions } from './cmap/stream_description';
export type { CompressorName, Compressor } from './cmap/wire_protocol/compression';
export type { CollectionPrivate, CollectionOptions } from './collection';
export type { AggregationCursorOptions } from './cursor/aggregation_cursor';
export type {
  CursorCloseOptions,
  CursorStreamOptions,
  AbstractCursorOptions,
  CURSOR_FLAGS,
  CursorFlag
} from './cursor/abstract_cursor';
export type { DbPrivate, DbOptions } from './db';
export type { AutoEncryptionOptions, AutoEncryptionLoggerLevels, AutoEncrypter } from './deps';
export type { AnyError, ErrorDescription } from './error';
export type { Explain, ExplainOptions, ExplainVerbosity, ExplainVerbosityLike } from './explain';
export type {
  GridFSBucketReadStream,
  GridFSBucketReadStreamOptions,
  GridFSBucketReadStreamOptionsWithRevision,
  GridFSBucketReadStreamPrivate,
  GridFSFile
} from './gridfs-stream/download';
export type { GridFSBucketOptions, GridFSBucketPrivate } from './gridfs-stream/index';
export type {
  GridFSBucketWriteStreamOptions,
  TFileId,
  GridFSBucketWriteStream
} from './gridfs-stream/upload';
export type { LoggerOptions, LoggerFunction, LoggerLevel } from './logger';
export type {
  MongoClientPrivate,
  MongoClientOptions,
  WithSessionCallback,
  PkFactory,
  MongoURIOptions,
  LogLevel,
  LogLevelId,
  Auth,
  DriverInfo,
  MongoOptions,
  HostAddress
} from './mongo_client';
export type { AddUserOptions } from './operations/add_user';
export type {
  AggregateOptions,
  AggregateOperation,
  DB_AGGREGATE_COLLECTION
} from './operations/aggregate';
export type {
  CommandOperationOptions,
  OperationParent,
  CommandOperation,
  CollationOptions
} from './operations/command';
export type { IndexInformationOptions } from './operations/common_functions';
export type { CountOptions } from './operations/count';
export type { CountDocumentsOptions } from './operations/count_documents';
export type { CreateCollectionOptions } from './operations/create_collection';
export type { DeleteOptions, DeleteResult, DeleteStatement } from './operations/delete';
export type { DistinctOptions } from './operations/distinct';
export type { DropCollectionOptions, DropDatabaseOptions } from './operations/drop';
export type { EstimatedDocumentCountOptions } from './operations/estimated_document_count';
export type { EvalOptions } from './operations/eval';
export type { FindOptions } from './operations/find';
export type { Sort, SortDirection } from './sort';
export type { FindAndModifyOptions } from './operations/find_and_modify';
export type {
  IndexSpecification,
  CreateIndexesOptions,
  IndexDescription,
  DropIndexesOptions,
  ListIndexesOptions,
  IndexDirection
} from './operations/indexes';
export type { InsertOneResult, InsertOneOptions, InsertManyResult } from './operations/insert';
export type { ListCollectionsOptions } from './operations/list_collections';
export type { ListDatabasesResult, ListDatabasesOptions } from './operations/list_databases';
export type {
  MapFunction,
  ReduceFunction,
  MapReduceOptions,
  FinalizeFunction
} from './operations/map_reduce';
export type { Hint, OperationOptions, AbstractOperation } from './operations/operation';
export type { ProfilingLevelOptions } from './operations/profiling_level';
export type { RemoveUserOptions } from './operations/remove_user';
export type { RenameOptions } from './operations/rename';
export type { RunCommandOptions } from './operations/run_command';
export type { ProfilingLevel, SetProfilingLevelOptions } from './operations/set_profiling_level';
export type { CollStatsOptions, DbStatsOptions } from './operations/stats';
export type {
  UpdateResult,
  UpdateOptions,
  ReplaceOptions,
  UpdateStatement
} from './operations/update';
export type { ValidateCollectionOptions } from './operations/validate_collection';
export type {
  ReadConcern,
  ReadConcernLike,
  ReadConcernLevel,
  ReadConcernLevelId
} from './read_concern';
export type {
  ReadPreferenceLike,
  ReadPreferenceModeId,
  ReadPreferenceMode,
  ReadPreferenceOptions,
  ReadPreferenceLikeOptions,
  ReadPreferenceFromOptions,
  HedgeOptions
} from './read_preference';
export type { ClusterTime, ServerType, TimerQueue, TopologyType } from './sdam/common';
export type { TopologyDescriptionChangedEvent } from './sdam/events';
export type {
  Monitor,
  MonitorPrivate,
  MonitorOptions,
  RTTPinger,
  RTTPingerOptions
} from './sdam/monitor';
export type { Server, ServerPrivate, ServerOptions } from './sdam/server';
export type {
  TopologyVersion,
  TagSet,
  ServerDescription,
  ServerDescriptionOptions
} from './sdam/server_description';
export type { ServerSelector } from './sdam/server_selection';
export type { SrvPoller, SrvPollingEvent, SrvPollerOptions } from './sdam/srv_polling';
export type {
  Topology,
  TopologyPrivate,
  ServerSelectionRequest,
  TopologyOptions,
  ServerCapabilities,
  ConnectOptions,
  SelectServerOptions,
  ServerSelectionCallback,
  ServerAddress
} from './sdam/topology';
export type { TopologyDescription, TopologyDescriptionOptions } from './sdam/topology_description';
export type {
  ClientSession,
  ClientSessionOptions,
  ServerSessionPool,
  ServerSession,
  ServerSessionId,
  WithTransactionCallback
} from './sessions';
export type { TransactionOptions, Transaction, TxnState } from './transactions';
export type {
  Callback,
  ClientMetadata,
  ClientMetadataOptions,
  MongoDBNamespace,
  InterruptibleAsyncInterval,
  BufferPool
} from './utils';
export type { WriteConcern, W, WriteConcernOptions, WriteConcernSettings } from './write_concern';
export type { ExecutionResult } from './operations/execute_operation';
export type { InternalAbstractCursorOptions } from './cursor/abstract_cursor';
export type {
  BulkOperationBase,
  BulkOperationPrivate,
  BatchType,
  BatchTypeId,
  FindOperators,
  Batch
} from './bulk/common';
export type { OrderedBulkOperation } from './bulk/ordered';
export type { UnorderedBulkOperation } from './bulk/unordered';
