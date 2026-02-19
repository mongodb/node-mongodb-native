import { loadContextifiedMongoDBModule } from './tools/runner/vm_context_helper';

type all = typeof import('./mongodb');
let exportSource: all;
try {
  exportSource = loadContextifiedMongoDBModule() as all;
} catch (error) {
  throw new Error(
    `Failed to load contextified MongoDB module: ${error instanceof Error ? error.message : String(error)}`
  );
}

// Export public API from the contextified module
export const {
  aws4Sign,
  Collection,
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent,
  CSOTTimeoutContext,
  Db,
  Double,
  HostAddress,
  isHello,
  LegacyTimeoutContext,
  Long,
  MongoAPIError,
  MongoBulkWriteError,
  MongoClient,
  MongoCredentials,
  MongoInvalidArgumentError,
  MongoLoggableComponent,
  MongoLogger,
  MongoParseError,
  MongoServerError,
  MongoRuntimeError,
  ObjectId,
  parseOptions,
  ReadConcern,
  ReadPreference,
  resolveSRVRecord,
  ReturnDocument,
  ServerApiVersion,
  SeverityLevel,
  Timeout,
  TimeoutContext,
  TimeoutError,
  TopologyType,
  WriteConcern
} = exportSource;

// Export types from the contextified module
export type {
  AuthMechanism,
  CompressorName,
  MongoClientOptions,
  ServerApi,
  WriteConcernSettings
} from './tools/runner/bundle/types/index';

// Export "clashing" types from the contextified module.
// These are types that clash with the objects of the same name (eg Collection), so we need to export them separately to avoid type errors.
import type {
  Collection as _CollectionType,
  CommandFailedEvent as _CommandFailedEventType,
  CommandStartedEvent as _CommandStartedEventType,
  CommandSucceededEvent as _CommandSucceededEventType,
  HostAddress as _HostAddressType,
  MongoClient as _MongoClientType,
  Timeout as _TimeoutType,
  TopologyType as _TopologyType
} from './tools/runner/bundle/types/index';
export type Collection = _CollectionType;
export type CommandFailedEvent = _CommandFailedEventType;
export type CommandStartedEvent = _CommandStartedEventType;
export type CommandSucceededEvent = _CommandSucceededEventType;
export type HostAddress = _HostAddressType;
export type MongoClient = _MongoClientType;
export type Timeout = _TimeoutType;
export type TopologyType = _TopologyType;
