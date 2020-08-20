import { Instrumentation } from './apm';
import { Cursor, AggregationCursor, CommandCursor } from './cursor';
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
function instrument(options: any, callback: Callback) {
  if (typeof options === 'function') {
    callback = options;
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
export const Map = require('bson').Map;
/** @public */
export const BSONSymbol = require('bson').BSONSymbol;
/** @public */
export const BSONRegExp = require('bson').BSONRegExp;

export {
  MongoError,
  MongoNetworkError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoParseError,
  MongoWriteConcernError
} from './error';
export {
  BulkResult,
  BulkIdDocument,
  BulkOp,
  InsertOneModel,
  InsertManyModel,
  ReplaceOneModel,
  UpdateOneModel,
  UpdateManyModel,
  RemoveOneModel,
  RemoveManyModel,
  DeleteOneModel,
  DeleteManyModel,
  InsertOneOptions,
  InsertManyOptions,
  ReplaceOneOptions,
  UpdateOneOptions,
  UpdateManyOptions,
  RemoveOneOptions,
  RemoveManyOptions,
  DeleteOneOptions,
  DeleteManyOptions,
  AnyModel,
  BulkWriteError as MongoBulkWriteError
} from './bulk/common';
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
  AggregationCursor,
  CommandCursor,
  Cursor,
  GridFSBucket
};

export type { AdminPrivate } from './admin';
export type { Instrumentation } from './apm';
export type { Document, BSONSerializeOptions } from './bson';
export type { BulkWriteResult, WriteError, WriteConcernError } from './bulk/common';
export type {
  ChangeStream,
  ChangeStreamOptions,
  ChangeStreamCursor,
  ResumeToken,
  PipeOptions,
  ChangeStreamCursorOptions,
  OperationTime
} from './change_stream';
export type { AuthMechanism } from './cmap/auth/defaultAuthProviders';
export type { MongoCredentials, MongoCredentialsOptions } from './cmap/auth/mongo_credentials';
export type {
  CommandResult,
  WriteProtocolMessageType,
  Query,
  GetMore,
  Msg,
  KillCursor,
  OpGetMoreOptions,
  OpQueryOptions
} from './cmap/commands';
export type { Stream } from './cmap/connect';
export type { Connection, ConnectionOptions, DestroyOptions } from './cmap/connection';
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
export type { CommandOptions } from './cmap/wire_protocol/command';
export type { CompressorName, Compressor } from './cmap/wire_protocol/compression';
export type { GetMoreOptions } from './cmap/wire_protocol/get_more';
export type {
  InsertOptions as WireInsertOptions,
  UpdateOptions as WireUpdateOptions,
  RemoveOptions as WireRemoveOptions
} from './cmap/wire_protocol/index';
export type { QueryOptions } from './cmap/wire_protocol/query';
export type { CollationOptions, WriteCommandOptions } from './cmap/wire_protocol/write_command';
export type { CollectionPrivate, CollectionOptions } from './collection';
export type { AggregationCursorOptions } from './cursor/aggregation_cursor';
export type { CommandCursorOptions } from './cursor/command_cursor';
export type {
  CoreCursor,
  CursorCloseOptions,
  DocumentTransforms,
  StreamOptions,
  CoreCursorOptions,
  InternalCursorState,
  CoreCursorPrivate,
  CursorState
} from './cursor/core_cursor';
export type {
  CursorOptions,
  CursorPrivate,
  FIELDS as CURSOR_FIELDS,
  FLAGS as CURSOR_FLAGS,
  CursorFlag
} from './cursor/cursor';
export type { DbPrivate, DbOptions } from './db';
export type { AutoEncryptionOptions, AutoEncryptionLoggerLevels, AutoEncrypter } from './deps';
export type { AnyError, ErrorDescription } from './error';
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
  Auth,
  DriverInfo,
  PkFactoryAbstract,
  PkFactoryLiteral
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
  CommandOperation
} from './operations/command';
export type { IndexInformationOptions } from './operations/common_functions';
export type { CountOptions } from './operations/count';
export type { CountDocumentsOptions } from './operations/count_documents';
export type { CreateCollectionOptions } from './operations/create_collection';
export type { EachCallback } from './operations/cursor_ops';
export type { DeleteOptions, DeleteResult } from './operations/delete';
export type { DistinctOptions } from './operations/distinct';
export type { DropCollectionOptions, DropDatabaseOptions } from './operations/drop';
export type { EstimatedDocumentCountOptions } from './operations/estimated_document_count';
export type { EvalOptions } from './operations/eval';
export type { FindOptions, Sort, SortDirection } from './operations/find';
export type { FindAndModifyOptions } from './operations/find_and_modify';
export type {
  IndexSpecification,
  CreateIndexesOptions,
  IndexDescription,
  DropIndexesOptions,
  ListIndexesOptions,
  IndexDirection
} from './operations/indexes';
export type { InsertOneResult, InsertOptions } from './operations/insert';
export type { InsertManyResult } from './operations/insert_many';
export type { ListCollectionsOptions } from './operations/list_collections';
export type { ListDatabasesResult, ListDatabasesOptions } from './operations/list_databases';
export type {
  MapFunction,
  ReduceFunction,
  MapReduceOptions,
  FinalizeFunction
} from './operations/map_reduce';
export type { Hint, OperationOptions, OperationBase } from './operations/operation';
export type { ProfilingLevelOptions } from './operations/profiling_level';
export type { RemoveUserOptions } from './operations/remove_user';
export type { RenameOptions } from './operations/rename';
export type { ReplaceOptions } from './operations/replace_one';
export type { RunCommandOptions } from './operations/run_command';
export type { ProfilingLevel, SetProfilingLevelOptions } from './operations/set_profiling_level';
export type { CollStatsOptions, DbStatsOptions } from './operations/stats';
export type { UpdateResult, UpdateOptions } from './operations/update';
export type { ValidateCollectionOptions } from './operations/validate_collection';
export type { ReadConcern, ReadConcernLevel } from './read_concern';
export type {
  ReadPreferenceLike,
  ReadPreferenceMode,
  ReadPreferenceOptions,
  ReadPreferenceLikeOptions,
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
  ServerAddress,
  TopologyOptions,
  ServerCapabilities,
  ConnectOptions,
  SelectServerOptions,
  ServerSelectionCallback
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
  MongoDBNamespace,
  ClientMetadata,
  InterruptableAsyncInterval,
  ClientMetadataOptions
} from './utils';
export type { WriteConcern, W, WriteConcernOptions } from './write_concern';
