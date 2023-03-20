import type {
  Document,
  MongoLoggableComponent,
  ObjectId,
  ReadConcernLevel,
  ReadPreferenceMode,
  SeverityLevel,
  TagSet,
  W
} from '../../mongodb';
import { FindCursor, MongoClient, ServerApiVersion } from '../../mongodb';
import { TestConfiguration } from '../runner/config';
import { UnifiedThread } from './entities';

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
export const TopologyType = Object.freeze({
  single: 'single',
  replicaset: 'replicaset',
  sharded: 'sharded',
  shardedReplicaset: 'sharded-replicaset',
  loadBalanced: 'load-balanced'
} as const);

export type TopologyId = (typeof TopologyType)[keyof typeof TopologyType];
export interface RunOnRequirement {
  serverless?: 'forbid' | 'allow' | 'require';
  auth?: boolean;
  maxServerVersion?: string;
  minServerVersion?: string;
  topologies?: TopologyId[];
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

export interface ClientEntity {
  id: string;
  uriOptions?: Document;
  useMultipleMongoses?: boolean;
  observeEvents?: (ObservableCommandEventId | ObservableCmapEventId)[];
  observeLogMessages?: Record<MongoLoggableComponent, SeverityLevel>;
  ignoreCommandMonitoringEvents?: string[];
  serverApi?: ServerApi;
  observeSensitiveCommands?: boolean;
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

export interface ClientEncryptionEntity {
  id: string;
  clientEncryptionOpts: {
    /** this is the id of the client entity to use as the keyvault client */
    keyVaultClient: string;
    keyVaultNamespace: string;
    kmsProviders: {
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
}

export interface ExpectedCommandEvent {
  commandStartedEvent?: {
    command?: Document;
    commandName?: string;
    databaseName?: string;
  };
  commandSucceededEvent?: {
    reply?: Document;
    commandName?: string;
  };
  commandFailedEvent?: {
    commandName?: string;
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
}
export interface ExpectedError {
  isError?: true;
  isClientError?: boolean;
  errorContains?: string;
  errorCode?: number;
  errorCodeName?: string;
  errorLabelsContain?: string[];
  errorLabelsOmit?: string[];
  expectResult?: unknown;
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

/**
 * This interface represents the bare minimum of type information needed to get *some* type
 * safety on the client encryption object in unified tests.
 */
export interface ClientEncryption {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (client: MongoClient, options: any): ClientEncryption;
  createDataKey(provider, options?: Document): Promise<any>;
  rewrapManyDataKey(filter, options): Promise<any>;
  deleteKey(id): Promise<any>;
  getKey(id): Promise<any>;
  getKeys(): FindCursor;
  addKeyAltName(id, keyAltName): Promise<any>;
  removeKeyAltName(id, keyAltName): Promise<any>;
  getKeyByAltName(keyAltName): Promise<any>;
}
