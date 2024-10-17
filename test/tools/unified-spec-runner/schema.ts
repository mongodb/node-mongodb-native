import type {
  Document,
  MongoLoggableComponent,
  ObjectId,
  ReadConcernLevel,
  ReadPreferenceMode,
  ServerApiVersion,
  SeverityLevel,
  TagSet,
  TopologyType,
  W
} from '../../mongodb';
import { type TestConfiguration } from '../runner/config';
import { type UnifiedThread } from './entities';

export const SupportedVersion = '^1.0';

export const OperationNames = [
  'abortTransaction',
  'aggregate',
  'assertCollectionExists',
  'assertCollectionNotExists',
  'assertIndexExists',
  'assertIndexNotExists',
  'assertDifferentLsidOnLastTwoCommands',
  'assertSameLsidOnLastTwoCommands',
  'assertSessionDirty',
  'assertSessionNotDirty',
  'assertSessionPinned',
  'assertSessionUnpinned',
  'assertSessionTransactionState',
  'assertNumberConnectionsCheckedOut',
  'bulkWrite',
  'close',
  'commitTransaction',
  'createChangeStream',
  'createCollection',
  'createFindCursor',
  'createIndex',
  'deleteOne',
  'dropCollection',
  'endSession',
  'find',
  'findOneAndReplace',
  'findOneAndUpdate',
  'findOneAndDelete',
  'failPoint',
  'insertOne',
  'insertMany',
  'iterateUntilDocumentOrError',
  'listCollections',
  'listDatabases',
  'listIndexes',
  'replaceOne',
  'startTransaction',
  'targetedFailPoint',
  'delete',
  'download',
  'upload',
  'withTransaction',
  'countDocuments',
  'deleteMany',
  'distinct',
  'estimatedDocumentCount',
  'runCommand',
  'updateMany',
  'updateOne',
  'rename',
  'createDataKey',
  'rewrapManyDataKey',
  'deleteKey',
  'getKey',
  'getKeys',
  'addKeyAltName',
  'removeKeyAltName',
  'getKeyByAltName'
] as const;
export type OperationName = (typeof OperationNames)[number];

export interface OperationDescription {
  name: OperationName;
  object: string;
  arguments?: Document;
  expectError?: ExpectedError;
  expectResult?: unknown;
  saveResultAsEntity?: string;
  ignoreResultAndError?: boolean;
}
export interface UnifiedSuite {
  description: string;
  schemaVersion: string;
  runOnRequirements?: RunOnRequirement[];
  createEntities?: EntityDescription[];
  /** Data inserted before **all tests */
  initialData?: CollectionData[];
  tests: Test[];
  _yamlAnchors?: Document;
}
export const TopologyName = Object.freeze({
  single: 'single',
  replicaset: 'replicaset',
  sharded: 'sharded',
  shardedReplicaset: 'sharded-replicaset',
  loadBalanced: 'load-balanced'
} as const);

export type TopologyName = (typeof TopologyName)[keyof typeof TopologyName];
export interface RunOnRequirement {
  serverless?: 'forbid' | 'allow' | 'require';
  auth?: boolean;
  authMechanism?: string;
  maxServerVersion?: string;
  minServerVersion?: string;
  topologies?: TopologyName[];
  serverParameters?: Document;
  csfle?: boolean;
}
export type ObservableCommandEventId =
  | 'commandStartedEvent'
  | 'commandSucceededEvent'
  | 'commandFailedEvent';
export type ObservableCmapEventId =
  | 'connectionPoolCreatedEvent'
  | 'connectionPoolClosedEvent'
  | 'connectionPoolReadyEvent'
  | 'connectionPoolClearedEvent'
  | 'connectionCreatedEvent'
  | 'connectionReadyEvent'
  | 'connectionClosedEvent'
  | 'connectionCheckOutStartedEvent'
  | 'connectionCheckOutFailedEvent'
  | 'connectionCheckedOutEvent'
  | 'connectionCheckedInEvent';
export type ObservableSdamEventId =
  | 'serverDescriptionChangedEvent'
  | 'serverHeartbeatStartedEvent'
  | 'serverHeartbeatFailedEvent'
  | 'serverHeartbeatSucceededEvent'
  | 'topologyOpeningEvent'
  | 'topologyDescriptionChangedEvent'
  | 'topologyClosedEvent'
  | 'serverOpeningEvent'
  | 'serverClosedEvent';

export interface ClientEntity {
  id: string;
  uriOptions?: Document;
  useMultipleMongoses?: boolean;
  observeEvents?: (ObservableCommandEventId | ObservableCmapEventId | ObservableSdamEventId)[];
  observeLogMessages?: Record<MongoLoggableComponent, SeverityLevel>;
  ignoreCommandMonitoringEvents?: string[];
  serverApi?: ServerApi;
  observeSensitiveCommands?: boolean;
  storeEventsAsEntities?: StoreEventsAsEntity[];
}
export interface DatabaseEntity {
  id: string;
  client: string;
  databaseName: string;
  databaseOptions?: CollectionOrDatabaseOptions;
}
export interface CollectionEntity {
  id: string;
  database: string;
  collectionName: string;
  collectionOptions?: CollectionOrDatabaseOptions;
}
export interface SessionEntity {
  id: string;
  client: string;
  sessionOptions?: Document;
}
export interface BucketEntity {
  id: string;
  database: string;
  bucketOptions?: Document;
}
export interface StreamEntity {
  id: string;
  hexBytes: string;
}

export type StringOrPlaceholder = string | { $$placeholder: number };

type UnnamedKMSProviders = {
  aws?: {
    accessKeyId: StringOrPlaceholder;
    secretAccessKey: StringOrPlaceholder;
    sessionToken: StringOrPlaceholder;
  };
  azure?: {
    tenantId: StringOrPlaceholder;
    clientId: StringOrPlaceholder;
    clientSecret: StringOrPlaceholder;
    identityPlatformEndpoint: StringOrPlaceholder;
  };
  gcp?: {
    email: StringOrPlaceholder;
    privateKey: StringOrPlaceholder;
    endPoint: StringOrPlaceholder;
  };
  kmip?: {
    endpoint: StringOrPlaceholder;
  };
  local?: {
    key: StringOrPlaceholder;
  };
};
export interface ClientEncryptionEntity {
  id: string;
  clientEncryptionOpts: {
    /** this is the id of the client entity to use as the keyvault client */
    keyVaultClient: string;
    keyVaultNamespace: string;
    kmsProviders: UnnamedKMSProviders & {
      [key: string]:
        | UnnamedKMSProviders['aws']
        | UnnamedKMSProviders['gcp']
        | UnnamedKMSProviders['azure']
        | UnnamedKMSProviders['kmip']
        | UnnamedKMSProviders['local']
        | undefined;
    };
  };
}

export type KMSProvidersEntity = ClientEncryptionEntity['clientEncryptionOpts']['kmsProviders'];

export type EntityDescription =
  | { client: ClientEntity }
  | { database: DatabaseEntity }
  | { collection: CollectionEntity }
  | { bucket: BucketEntity }
  | { thread: Pick<UnifiedThread, 'id'> }
  | { stream: StreamEntity }
  | { session: SessionEntity }
  | { clientEncryption: ClientEncryptionEntity };

export interface ServerApi {
  version: ServerApiVersion;
  strict?: boolean;
  deprecationErrors?: boolean;
}
export interface CollectionOrDatabaseOptions {
  readConcern?: {
    level: ReadConcernLevel;
  };
  readPreference?: {
    mode: ReadPreferenceMode;
    maxStalenessSeconds: number;
    tags: TagSet[];
    hedge: { enabled: boolean };
  };
  writeConcern?: {
    w: W;
    wtimeoutMS: number;
    journal: boolean;
  };
}
export interface CollectionData {
  collectionName: string;
  databaseName: string;
  createOptions?: Document;
  documents: Document[];
}
export interface Test {
  description: string;
  runOnRequirements?: RunOnRequirement[];
  skipReason?: string;
  operations: OperationDescription[];
  expectEvents?: ExpectedEventsForClient[];
  expectLogMessages?: ExpectedLogMessagesForClient[];
  outcome?: CollectionData[];
}
export interface ExpectedEventsForClient {
  client: string;
  eventType?: 'command' | 'cmap' | 'sdam';
  events: ExpectedEvent[];
  ignoreExtraEvents?: boolean;
}

export type ExpectedEvent = ExpectedCommandEvent | ExpectedCmapEvent | ExpectedSdamEvent;

export interface ExpectedLogMessagesForClient {
  client: string;
  messages: ExpectedLogMessage[];
  /**
   * Optional array of expectedLogMessage objects. Unordered set of messages, which MUST
   * be ignored on the corresponding client while executing operations. The test runner
   * MUST exclude all log messages from observed messages that match any of the messages
   * in ignoreMessages array before messages evaluation. Matching rules used to match
   * messages in ignoreMessages are identical to match rules used for messages matching.
   */
  ignoreMessages: ExpectedLogMessage[];
  /**
   * Specifies how the messages array is matched against the observed logs. If false,
   * observed logs after all specified logs have matched MUST cause a test failure;
   * if true, observed logs after all specified logs have been matched MUST NOT cause
   * a test failure. Defaults to false.
   */
  ignoreExtraMessages: boolean;
}

export interface ExpectedCommandEvent {
  commandStartedEvent?: {
    command?: Document;
    commandName?: string;
    databaseName?: string;
    hasServerConnectionId?: boolean;
  };
  commandSucceededEvent?: {
    reply?: Document;
    commandName?: string;
    hasServerConnectionId?: boolean;
  };
  commandFailedEvent?: {
    commandName?: string;
    hasServerConnectionId?: boolean;
  };
}
export interface ExpectedCmapEvent {
  poolCreatedEvent?: Record<string, never>;
  poolReadyEvent?: Record<string, never>;
  poolClearedEvent?: {
    serviceId?: ObjectId;
    hasServiceId?: boolean;
    interruptInUseConnections?: boolean;
  };
  poolClosedEvent?: Record<string, never>;
  connectionCreatedEvent?: Record<string, never>;
  connectionReadyEvent?: Record<string, never>;
  connectionClosedEvent?: {
    reason?: string;
    hasServiceId?: boolean;
  };
  connectionCheckOutStartedEvent?: Record<string, never>;
  connectionCheckOutFailedEvent?: Record<string, never>;
  connectionCheckedOutEvent?: Record<string, never>;
  connectionCheckedInEvent?: Record<string, never>;
}

export interface ExpectedSdamEvent {
  serverDescriptionChangedEvent?: {
    previousDescription?: {
      type?: string;
    };
    newDescription?: {
      type?: string;
    };
  };
  serverHeartbeatStartedEvent?: {
    awaited?: boolean;
  };
  serverHeartbeatFailedEvent?: {
    awaited?: boolean;
  };
  serverHeartbeatSucceededEvent?: {
    topologyId?: any;
    awaited?: boolean;
  };
  topologyDescriptionChangedEvent?: {
    topologyId?: any;
    previousDescription?: {
      type?: TopologyType;
    };
    newDescription?: {
      type?: TopologyType;
    };
  };
  topologyOpeningEvent?: {
    topologyId?: any;
  };
  topologyClosedEvent?: {
    topologyId?: any;
  };
  serverOpeningEvent?: {
    topologyId?: any;
  };
  serverClosedEvent?: {
    topologyId?: any;
  };
}
export interface StoreEventsAsEntity {
  id: string;
  events: string[];
}
export interface ExpectedError {
  isError?: true;
  isTimeoutError?: boolean;
  isClientError?: boolean;
  errorContains?: string;
  errorCode?: number;
  errorCodeName?: string;
  errorLabelsContain?: string[];
  errorLabelsOmit?: string[];
  expectResult?: unknown;
  errorResponse?: Document;
}

export interface ExpectedLogMessage {
  level: SeverityLevel;
  component: MongoLoggableComponent;
  failureIsRedacted?: boolean;
  data: Document;
}

/**
 * A type that represents the test filter provided to the unifed runner.
 */
export type TestFilter = (test: Test, ctx: TestConfiguration) => string | false;
