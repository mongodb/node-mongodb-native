import { Admin } from './admin';
import { ObjectId } from './bson';
import { Collection } from './collection';
import { AbstractCursor } from './cursor/abstract_cursor';
import { AggregationCursor } from './cursor/aggregation_cursor';
import { FindCursor } from './cursor/find_cursor';
import { Db } from './db';
import { GridFSBucket } from './gridfs';
import { Logger } from './logger';
import { MongoClient } from './mongo_client';
import { CancellationToken } from './mongo_types';
import { ListIndexesCursor } from './operations/indexes';
import { ListCollectionsCursor } from './operations/list_collections';
import { PromiseProvider } from './promise_provider';

export {
  Binary,
  BSONRegExp,
  BSONSymbol,
  Code,
  DBRef,
  Decimal128,
  Double,
  Int32,
  Long,
  Map,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp
} from './bson';
/**
 * @public
 * @deprecated Please use `ObjectId`
 */
export const ObjectID = ObjectId;

export { AnyBulkWriteOperation, BulkWriteOptions, MongoBulkWriteError } from './bulk/common';
export {
  MongoAPIError,
  MongoBatchReExecutionError,
  MongoChangeStreamError,
  MongoCompatibilityError,
  MongoCursorExhaustedError,
  MongoCursorInUseError,
  MongoDecompressionError,
  MongoDriverError,
  MongoError,
  MongoExpiredSessionError,
  MongoGridFSChunkError,
  MongoGridFSStreamError,
  MongoInvalidArgumentError,
  MongoKerberosError,
  MongoMissingCredentialsError,
  MongoMissingDependencyError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoNotConnectedError,
  MongoParseError,
  MongoRuntimeError,
  MongoServerClosedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoSystemError,
  MongoTopologyClosedError,
  MongoTransactionError,
  MongoWriteConcernError
} from './error';
export {
  AbstractCursor,
  // Actual driver classes exported
  Admin,
  AggregationCursor,
  CancellationToken,
  Collection,
  Db,
  FindCursor,
  GridFSBucket,
  ListCollectionsCursor,
  ListIndexesCursor,
  Logger,
  MongoClient,
  // Utils
  PromiseProvider as Promise
};

// enums
export { BatchType } from './bulk/common';
export { GSSAPICanonicalizationValue } from './cmap/auth/gssapi';
export { AuthMechanism } from './cmap/auth/providers';
export { Compressor } from './cmap/wire_protocol/compression';
export { CURSOR_FLAGS } from './cursor/abstract_cursor';
export { AutoEncryptionLoggerLevel } from './deps';
export { ExplainVerbosity } from './explain';
export { LoggerLevel } from './logger';
export { ServerApiVersion } from './mongo_client';
export { BSONType } from './mongo_types';
export { ReturnDocument } from './operations/find_and_modify';
export { ProfilingLevel } from './operations/set_profiling_level';
export { ReadConcernLevel } from './read_concern';
export { ReadPreferenceMode } from './read_preference';
export { ServerType, TopologyType } from './sdam/common';

// Helper classes
export { ReadConcern } from './read_concern';
export { ReadPreference } from './read_preference';
export { WriteConcern } from './write_concern';

// events
export {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from './cmap/command_monitoring_events';
export {
  ConnectionCheckedInEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolMonitoringEvent,
  ConnectionReadyEvent
} from './cmap/connection_pool_events';
export {
  ServerClosedEvent,
  ServerDescriptionChangedEvent,
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerOpeningEvent,
  TopologyClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent
} from './sdam/events';
export { SrvPollingEvent } from './sdam/srv_polling';

// type only exports below, these are removed from emitted JS
export type { AdminPrivate } from './admin';
export type { BSONSerializeOptions, Document } from './bson';
export type { deserialize, serialize } from './bson';
export type {
  BulkResult,
  BulkWriteOperationError,
  BulkWriteResult,
  DeleteManyModel,
  DeleteOneModel,
  InsertOneModel,
  ReplaceOneModel,
  UpdateManyModel,
  UpdateOneModel,
  WriteConcernError,
  WriteError
} from './bulk/common';
export type {
  Batch,
  BulkOperationBase,
  BulkOperationPrivate,
  FindOperators,
  WriteConcernErrorData
} from './bulk/common';
export type { OrderedBulkOperation } from './bulk/ordered';
export type { UnorderedBulkOperation } from './bulk/unordered';
export type {
  ChangeStream,
  ChangeStreamCursor,
  ChangeStreamCursorOptions,
  ChangeStreamDocument,
  ChangeStreamEvents,
  ChangeStreamOptions,
  OperationTime,
  PipeOptions,
  ResumeOptions,
  ResumeToken,
  UpdateDescription
} from './change_stream';
export type {
  AuthMechanismProperties,
  MongoCredentials,
  MongoCredentialsOptions
} from './cmap/auth/mongo_credentials';
export type {
  GetMore,
  KillCursor,
  Msg,
  OpGetMoreOptions,
  OpQueryOptions,
  Query,
  WriteProtocolMessageType
} from './cmap/commands';
export type { LEGAL_TCP_SOCKET_OPTIONS, LEGAL_TLS_SOCKET_OPTIONS, Stream } from './cmap/connect';
export type {
  CommandOptions,
  Connection,
  ConnectionEvents,
  ConnectionOptions,
  DestroyOptions,
  GetMoreOptions,
  ProxyOptions,
  QueryOptions
} from './cmap/connection';
export type {
  CloseOptions,
  ConnectionPool,
  ConnectionPoolEvents,
  ConnectionPoolOptions,
  WaitQueueMember,
  WithConnectionCallback
} from './cmap/connection_pool';
export type {
  MessageStream,
  MessageStreamOptions,
  OperationDescription
} from './cmap/message_stream';
export type { ConnectionPoolMetrics } from './cmap/metrics';
export type { StreamDescription, StreamDescriptionOptions } from './cmap/stream_description';
export type { CompressorName } from './cmap/wire_protocol/compression';
export type { CollectionOptions, CollectionPrivate, ModifyResult } from './collection';
export type { MONGO_CLIENT_EVENTS } from './constants';
export type {
  AbstractCursorEvents,
  AbstractCursorOptions,
  CursorCloseOptions,
  CursorFlag,
  CursorStreamOptions
} from './cursor/abstract_cursor';
export type { InternalAbstractCursorOptions } from './cursor/abstract_cursor';
export type { AggregationCursorOptions } from './cursor/aggregation_cursor';
export type { DbOptions, DbPrivate } from './db';
export type { AutoEncrypter, AutoEncryptionOptions, AutoEncryptionTlsOptions } from './deps';
export type { Encrypter, EncrypterOptions } from './encrypter';
export type { AnyError, ErrorDescription, MongoNetworkErrorOptions } from './error';
export type { Explain, ExplainOptions, ExplainVerbosityLike } from './explain';
export type {
  GridFSBucketReadStream,
  GridFSBucketReadStreamOptions,
  GridFSBucketReadStreamOptionsWithRevision,
  GridFSBucketReadStreamPrivate,
  GridFSFile
} from './gridfs/download';
export type { GridFSBucketEvents, GridFSBucketOptions, GridFSBucketPrivate } from './gridfs/index';
export type {
  GridFSBucketWriteStream,
  GridFSBucketWriteStreamOptions,
  GridFSChunk
} from './gridfs/upload';
export type { LoggerFunction, LoggerOptions } from './logger';
export type {
  Auth,
  DriverInfo,
  MongoClientEvents,
  MongoClientOptions,
  MongoClientPrivate,
  MongoOptions,
  PkFactory,
  ServerApi,
  SupportedNodeConnectionOptions,
  SupportedSocketOptions,
  SupportedTLSConnectionOptions,
  SupportedTLSSocketOptions,
  WithSessionCallback
} from './mongo_client';
export type {
  CommonEvents,
  EventsDescription,
  GenericListener,
  TypedEventEmitter
} from './mongo_types';
export type {
  AcceptedFields,
  AddToSetOperators,
  AlternativeType,
  ArrayOperator,
  BitwiseFilter,
  BSONTypeAlias,
  Condition,
  EnhancedOmit,
  Filter,
  FilterOperations,
  FilterOperators,
  Flatten,
  InferIdType,
  IntegerType,
  IsAny,
  Join,
  KeysOfAType,
  KeysOfOtherType,
  MatchKeysAndValues,
  NestedPaths,
  NonObjectIdLikeDocument,
  NotAcceptedFields,
  NumericType,
  OneOrMore,
  OnlyFieldsOfType,
  OptionalId,
  OptionalUnlessRequiredId,
  Projection,
  ProjectionOperators,
  PropertyType,
  PullAllOperator,
  PullOperator,
  PushOperator,
  RegExpOrString,
  RootFilterOperators,
  SchemaMember,
  SetFields,
  UpdateFilter,
  WithId,
  WithoutId
} from './mongo_types';
export type { AddUserOptions, RoleSpecification } from './operations/add_user';
export type {
  AggregateOperation,
  AggregateOptions,
  DB_AGGREGATE_COLLECTION
} from './operations/aggregate';
export type {
  CollationOptions,
  CommandOperation,
  CommandOperationOptions,
  OperationParent
} from './operations/command';
export type { IndexInformationOptions } from './operations/common_functions';
export type { CountOptions } from './operations/count';
export type { CountDocumentsOptions } from './operations/count_documents';
export type {
  CreateCollectionOptions,
  TimeSeriesCollectionOptions
} from './operations/create_collection';
export type { DeleteOptions, DeleteResult, DeleteStatement } from './operations/delete';
export type { DistinctOptions } from './operations/distinct';
export type { DropCollectionOptions, DropDatabaseOptions } from './operations/drop';
export type { EstimatedDocumentCountOptions } from './operations/estimated_document_count';
export type { EvalOptions } from './operations/eval';
export type { ExecutionResult } from './operations/execute_operation';
export type { FindOptions } from './operations/find';
export type {
  FindOneAndDeleteOptions,
  FindOneAndReplaceOptions,
  FindOneAndUpdateOptions
} from './operations/find_and_modify';
export type {
  CreateIndexesOptions,
  DropIndexesOptions,
  IndexDescription,
  IndexDirection,
  IndexSpecification,
  ListIndexesOptions
} from './operations/indexes';
export type { InsertManyResult, InsertOneOptions, InsertOneResult } from './operations/insert';
export type { CollectionInfo, ListCollectionsOptions } from './operations/list_collections';
export type { ListDatabasesOptions, ListDatabasesResult } from './operations/list_databases';
export type {
  FinalizeFunction,
  MapFunction,
  MapReduceOptions,
  ReduceFunction
} from './operations/map_reduce';
export type { AbstractOperation, Hint, OperationOptions } from './operations/operation';
export type { ProfilingLevelOptions } from './operations/profiling_level';
export type { RemoveUserOptions } from './operations/remove_user';
export type { RenameOptions } from './operations/rename';
export type { RunCommandOptions } from './operations/run_command';
export type { SetProfilingLevelOptions } from './operations/set_profiling_level';
export type {
  CollStats,
  CollStatsOptions,
  DbStatsOptions,
  WiredTigerData
} from './operations/stats';
export type {
  ReplaceOptions,
  UpdateOptions,
  UpdateResult,
  UpdateStatement
} from './operations/update';
export type { ValidateCollectionOptions } from './operations/validate_collection';
export type { ReadConcernLike } from './read_concern';
export type {
  HedgeOptions,
  ReadPreferenceFromOptions,
  ReadPreferenceLike,
  ReadPreferenceLikeOptions,
  ReadPreferenceOptions
} from './read_preference';
export type { ClusterTime, TimerQueue } from './sdam/common';
export type {
  Monitor,
  MonitorEvents,
  MonitorOptions,
  MonitorPrivate,
  RTTPinger,
  RTTPingerOptions
} from './sdam/monitor';
export type { Server, ServerEvents, ServerOptions, ServerPrivate } from './sdam/server';
export type {
  ServerDescription,
  ServerDescriptionOptions,
  TagSet,
  TopologyVersion
} from './sdam/server_description';
export type { ServerSelector } from './sdam/server_selection';
export type { SrvPoller, SrvPollerEvents, SrvPollerOptions } from './sdam/srv_polling';
export type {
  ConnectOptions,
  SelectServerOptions,
  ServerCapabilities,
  ServerSelectionCallback,
  ServerSelectionRequest,
  Topology,
  TopologyEvents,
  TopologyOptions,
  TopologyPrivate
} from './sdam/topology';
export type { TopologyDescription, TopologyDescriptionOptions } from './sdam/topology_description';
export type {
  ClientSession,
  ClientSessionEvents,
  ClientSessionOptions,
  EndSessionOptions,
  ServerSession,
  ServerSessionId,
  ServerSessionPool,
  WithTransactionCallback
} from './sessions';
export type { Sort, SortDirection, SortDirectionForCmd, SortForCmd } from './sort';
export type { Transaction, TransactionOptions, TxnState } from './transactions';
export type {
  BufferPool,
  Callback,
  ClientMetadata,
  ClientMetadataOptions,
  EventEmitterWithState,
  HostAddress,
  InterruptibleAsyncInterval,
  MongoDBNamespace
} from './utils';
export type { W, WriteConcernOptions, WriteConcernSettings } from './write_concern';
