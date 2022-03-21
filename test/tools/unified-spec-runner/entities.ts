import { expect } from 'chai';

import { ChangeStream } from '../../../src/change_stream';
import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from '../../../src/cmap/command_monitoring_events';
import {
  ConnectionCheckedInEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionReadyEvent
} from '../../../src/cmap/connection_pool_events';
import {
  AbstractCursor,
  Collection,
  Db,
  Document,
  GridFSBucket,
  HostAddress,
  MongoClient,
  MongoCredentials
} from '../../../src/index';
import { ReadConcern } from '../../../src/read_concern';
import { ReadPreference } from '../../../src/read_preference';
import { ClientSession } from '../../../src/sessions';
import { WriteConcern } from '../../../src/write_concern';
import { ejson, getEnvironmentalOptions } from '../../tools/utils';
import type { TestConfiguration } from '../runner/config';
import { trace } from './runner';
import type { ClientEntity, EntityDescription } from './schema';
import { makeConnectionString, patchCollectionOptions, patchDbOptions } from './unified-utils';

export interface UnifiedChangeStream extends ChangeStream {
  eventCollector: InstanceType<typeof import('../../tools/utils')['EventCollector']>;
}

export type CommandEvent = CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent;
export type CmapEvent =
  | ConnectionPoolCreatedEvent
  | ConnectionPoolClosedEvent
  | ConnectionCreatedEvent
  | ConnectionReadyEvent
  | ConnectionClosedEvent
  | ConnectionCheckOutStartedEvent
  | ConnectionCheckOutFailedEvent
  | ConnectionCheckedOutEvent
  | ConnectionCheckedInEvent
  | ConnectionPoolClearedEvent;

function getClient(address) {
  return new MongoClient(`mongodb://${address}`, getEnvironmentalOptions());
}

type PushFunction = (e: CommandEvent | CmapEvent) => void;

export class UnifiedMongoClient extends MongoClient {
  commandEvents: CommandEvent[];
  cmapEvents: CmapEvent[];
  failPoints: Document[];
  ignoredEvents: string[];
  observedCommandEvents: ('commandStarted' | 'commandSucceeded' | 'commandFailed')[];
  observedCmapEvents: (
    | 'connectionPoolCreated'
    | 'connectionPoolClosed'
    | 'connectionPoolCleared'
    | 'connectionCreated'
    | 'connectionReady'
    | 'connectionClosed'
    | 'connectionCheckOutStarted'
    | 'connectionCheckOutFailed'
    | 'connectionCheckedOut'
    | 'connectionCheckedIn'
  )[];
  _credentials: MongoCredentials | null;
  _pingEvents = [];
  _initialPingCmapEvents = [];

  static COMMAND_EVENT_NAME_LOOKUP = {
    commandStartedEvent: 'commandStarted',
    commandSucceededEvent: 'commandSucceeded',
    commandFailedEvent: 'commandFailed'
  } as const;

  static CMAP_EVENT_NAME_LOOKUP = {
    poolCreatedEvent: 'connectionPoolCreated',
    poolClosedEvent: 'connectionPoolClosed',
    poolClearedEvent: 'connectionPoolCleared',
    connectionCreatedEvent: 'connectionCreated',
    connectionReadyEvent: 'connectionReady',
    connectionClosedEvent: 'connectionClosed',
    connectionCheckOutStartedEvent: 'connectionCheckOutStarted',
    connectionCheckOutFailedEvent: 'connectionCheckOutFailed',
    connectionCheckedOutEvent: 'connectionCheckedOut',
    connectionCheckedInEvent: 'connectionCheckedIn'
  } as const;

  constructor(uri: string, description: ClientEntity) {
    super(uri, {
      monitorCommands: true,
      ...getEnvironmentalOptions(),
      ...(description.serverApi ? { serverApi: description.serverApi } : {})
    });

    this.commandEvents = [];
    this.cmapEvents = [];
    this.failPoints = [];
    this.ignoredEvents = [
      ...(description.ignoreCommandMonitoringEvents ?? []),
      'configureFailPoint'
    ];
    // FIXME(NODE-3549): hack to get tests passing, extra unexpected events otherwise
    if (process.env.SERVERLESS) {
      this.ignoredEvents.push('ping');
    }
    this.observedCommandEvents = (description.observeEvents ?? [])
      .map(e => UnifiedMongoClient.COMMAND_EVENT_NAME_LOOKUP[e])
      .filter(e => !!e);
    this.observedCmapEvents = (description.observeEvents ?? [])
      .map(e => UnifiedMongoClient.CMAP_EVENT_NAME_LOOKUP[e])
      .filter(e => !!e);
    for (const eventName of this.observedCommandEvents) {
      this.on(eventName, this.pushCommandEvent);
    }
    for (const eventName of this.observedCmapEvents) {
      this.on(eventName, this.pushCmapEvent);
    }
  }

  isIgnored(e: CommandEvent | CmapEvent): boolean {
    return this.ignoredEvents.includes(e.commandName);
  }

  // NOTE: pushCommandEvent must be an arrow function
  pushCommandEvent: (e: CommandEvent) => void = e => {
    if (e.commandName === 'ping' && this.credentials) {
      // initial ping command
      if (this._pingEvents.length === 0) {
        this._pingEvents.push(e);
        return;
      }
      // if there is a CommandSucceedEvent, add that as well
      if (this._pingEvents.length === 1 && e instanceof CommandSucceededEvent) {
        this._pingEvents.push(e);
        return;
      }
    }

    if (!this.isIgnored(e)) {
      this.commandEvents.push(e);
    }
  };

  // NOTE: pushCmapEvent must be an arrow function
  pushCmapEvent: (e: CmapEvent) => void = e => {
    if (this.credentials && this._initialPingCmapEvents.length !== 2) {
      if (e instanceof ConnectionCheckedOutEvent || e instanceof ConnectionCheckedInEvent) {
        this._initialPingCmapEvents.push(e);
        return;
      }
    }
    this.cmapEvents.push(e);
  };

  stopCapturingEvents(pushFn: PushFunction): void {
    const observedEvents = this.observedCommandEvents.concat(this.observedCmapEvents);
    for (const eventName of observedEvents) {
      this.off(eventName, pushFn);
    }
  }

  /** Disables command monitoring for the client and returns a list of the captured events. */
  stopCapturingCommandEvents(): CommandEvent[] {
    this.stopCapturingEvents(this.pushCommandEvent);
    return this.commandEvents;
  }

  stopCapturingCmapEvents(): CmapEvent[] {
    this.stopCapturingEvents(this.pushCmapEvent);
    return this.cmapEvents;
  }

  get credentials() {
    if (this._credentials == null) {
      this._credentials = this.options.credentials;
    }

    return this._credentials;
  }
}

export class FailPointMap extends Map<string, Document> {
  async enableFailPoint(
    addressOrClient: string | HostAddress | UnifiedMongoClient,
    failPoint: Document
  ): Promise<Document> {
    let client: MongoClient;
    let address: string;
    if (addressOrClient instanceof MongoClient) {
      client = addressOrClient;
      address = client.topology.s.seedlist.join(',');
    } else {
      // create a new client
      address = addressOrClient.toString();
      client = getClient(address);
      try {
        await client.connect();
      } catch (error) {
        console.error(`failed to connect enableFailPoint ${address}`);
        throw error;
      }
    }

    const admin = client.db('admin');
    const result = await admin.command(failPoint);

    if (!(addressOrClient instanceof MongoClient)) {
      // we created this client
      await client.close();
    }

    expect(result).to.have.property('ok', 1);
    this.set(address, failPoint.configureFailPoint);
    return result;
  }

  async disableFailPoints(): Promise<void> {
    const entries = Array.from(this.entries());
    await Promise.all(
      entries.map(async ([hostAddress, configureFailPoint]) => {
        if (process.env.SERVERLESS || process.env.LOAD_BALANCER) {
          hostAddress += '?loadBalanced=true';
        }
        const client = getClient(hostAddress);
        try {
          await client.connect();
        } catch (error) {
          console.error(`failed to connect disableFailPoints ${hostAddress}`);
          throw error;
        }
        const admin = client.db('admin');
        const result = await admin.command({ configureFailPoint, mode: 'off' });
        expect(result).to.have.property('ok', 1);
        await client.close();
      })
    );
  }
}

export type Entity =
  | UnifiedMongoClient
  | Db
  | Collection
  | ClientSession
  | AbstractCursor 
  | UnifiedChangeStream
  | GridFSBucket
  | Document; // Results from operations

export type EntityCtor =
  | typeof UnifiedMongoClient
  | typeof Db
  | typeof Collection
  | typeof ClientSession
  | typeof ChangeStream
  | typeof AbstractCursor
  | typeof GridFSBucket;

export type EntityTypeId =
  | 'client'
  | 'db'
  | 'collection'
  | 'session'
  | 'bucket'
  | 'cursor'
  | 'stream';

const ENTITY_CTORS = new Map<EntityTypeId, EntityCtor>();
ENTITY_CTORS.set('client', UnifiedMongoClient);
ENTITY_CTORS.set('db', Db);
ENTITY_CTORS.set('collection', Collection);
ENTITY_CTORS.set('session', ClientSession);
ENTITY_CTORS.set('bucket', GridFSBucket);
ENTITY_CTORS.set('cursor', AbstractCursor);
ENTITY_CTORS.set('stream', ChangeStream);

export class EntitiesMap<E = Entity> extends Map<string, E> {
  failPoints: FailPointMap;

  constructor(entries?: readonly (readonly [string, E])[] | null) {
    super(entries);
    this.failPoints = new FailPointMap();
  }

  mapOf(type: 'client'): EntitiesMap<UnifiedMongoClient>;
  mapOf(type: 'db'): EntitiesMap<Db>;
  mapOf(type: 'collection'): EntitiesMap<Collection>;
  mapOf(type: 'session'): EntitiesMap<ClientSession>;
  mapOf(type: 'bucket'): EntitiesMap<GridFSBucket>;
  mapOf(type: 'cursor'): EntitiesMap<AbstractCursor>;
  mapOf(type: 'stream'): EntitiesMap<UnifiedChangeStream>;
  mapOf(type: EntityTypeId): EntitiesMap<Entity> {
    const ctor = ENTITY_CTORS.get(type);
    if (!ctor) {
      throw new Error(`Unknown type ${type}`);
    }
    return new EntitiesMap(Array.from(this.entries()).filter(([, e]) => e instanceof ctor));
  }

  getEntity(type: 'client', key: string, assertExists?: boolean): UnifiedMongoClient;
  getEntity(type: 'db', key: string, assertExists?: boolean): Db;
  getEntity(type: 'collection', key: string, assertExists?: boolean): Collection;
  getEntity(type: 'session', key: string, assertExists?: boolean): ClientSession;
  getEntity(type: 'bucket', key: string, assertExists?: boolean): GridFSBucket;
  getEntity(type: 'cursor', key: string, assertExists?: boolean): AbstractCursor;
  getEntity(type: 'stream', key: string, assertExists?: boolean): UnifiedChangeStream;
  getEntity(type: EntityTypeId, key: string, assertExists = true): Entity {
    const entity = this.get(key);
    if (!entity) {
      if (assertExists) throw new Error(`Entity '${key}' does not exist`);
      return;
    }
    const ctor = ENTITY_CTORS.get(type);
    if (!ctor) {
      throw new Error(`Unknown type ${type}`);
    }
    if (!(entity instanceof ctor)) {
      throw new Error(`${key} is not an instance of ${type}`);
    }
    return entity;
  }

  async cleanup(): Promise<void> {
    await this.failPoints.disableFailPoints();

    trace('closeCursors');
    for (const [, cursor] of this.mapOf('cursor')) {
      await cursor.close();
    }

    trace('closeStreams');
    for (const [, stream] of this.mapOf('stream')) {
      await stream.close();
    }

    trace('endSessions');
    for (const [, session] of this.mapOf('session')) {
      await session.endSession({ force: true });
    }

    trace('closeClient');
    for (const [, client] of this.mapOf('client')) {
      await client.close();
    }

    trace('clear');
    this.clear();
  }

  static async createEntities(
    config: TestConfiguration,
    entities?: EntityDescription[]
  ): Promise<EntitiesMap> {
    const map = new EntitiesMap();
    for (const entity of entities ?? []) {
      if ('client' in entity) {
        const useMultipleMongoses =
          (config.topologyType === 'LoadBalanced' || config.topologyType === 'Sharded') &&
          entity.client.useMultipleMongoses;
        const uri = makeConnectionString(
          config.url({ useMultipleMongoses }),
          entity.client.uriOptions
        );
        const client = new UnifiedMongoClient(uri, entity.client);
        try {
          await client.connect();
        } catch (error) {
          console.error(ejson`failed to connect entity ${entity}`);
          throw error;
        }
        map.set(entity.client.id, client);
      } else if ('database' in entity) {
        const client = map.getEntity('client', entity.database.client);
        const db = client.db(
          entity.database.databaseName,
          patchDbOptions(entity.database.databaseOptions)
        );
        map.set(entity.database.id, db);
      } else if ('collection' in entity) {
        const db = map.getEntity('db', entity.collection.database);
        const collection = db.collection(
          entity.collection.collectionName,
          patchCollectionOptions(entity.collection.collectionOptions)
        );
        map.set(entity.collection.id, collection);
      } else if ('session' in entity) {
        const client = map.getEntity('client', entity.session.client);

        const options = Object.create(null);

        if (entity.session.sessionOptions?.causalConsistency) {
          options.causalConsistency = entity.session.sessionOptions?.causalConsistency;
        }

        if (entity.session.sessionOptions?.snapshot) {
          options.snapshot = entity.session.sessionOptions.snapshot;
        }

        if (entity.session.sessionOptions?.defaultTransactionOptions) {
          options.defaultTransactionOptions = Object.create(null);
          const defaultOptions = entity.session.sessionOptions.defaultTransactionOptions;
          if (defaultOptions.readConcern) {
            options.defaultTransactionOptions.readConcern = ReadConcern.fromOptions(
              defaultOptions.readConcern
            );
          }
          if (defaultOptions.writeConcern) {
            options.defaultTransactionOptions.writeConcern =
              WriteConcern.fromOptions(defaultOptions);
          }
          if (defaultOptions.readPreference) {
            options.defaultTransactionOptions.readPreference = ReadPreference.fromOptions(
              defaultOptions.readPreference
            );
          }
          if (typeof defaultOptions.maxCommitTimeMS === 'number') {
            options.defaultTransactionOptions.maxCommitTimeMS = defaultOptions.maxCommitTimeMS;
          }
        }
        const session = client.startSession(options);
        map.set(entity.session.id, session);
      } else if ('bucket' in entity) {
        const db = map.getEntity('db', entity.bucket.database);

        const options = Object.create(null);

        if (entity.bucket.bucketOptions?.bucketName) {
          options.bucketName = entity.bucket.bucketOptions?.bucketName;
        }
        if (entity.bucket.bucketOptions?.chunkSizeBytes) {
          options.chunkSizeBytes = entity.bucket.bucketOptions?.chunkSizeBytes;
        }
        if (entity.bucket.bucketOptions?.readPreference) {
          options.readPreference = entity.bucket.bucketOptions?.readPreference;
        }

        map.set(entity.bucket.id, new GridFSBucket(db, options));
      } else if ('stream' in entity) {
        throw new Error(`Unsupported Entity ${JSON.stringify(entity)}`);
      } else {
        throw new Error(`Unsupported Entity ${JSON.stringify(entity)}`);
      }
    }
    return map;
  }
}
