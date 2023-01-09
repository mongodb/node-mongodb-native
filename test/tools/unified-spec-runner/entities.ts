/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { EventEmitter } from 'events';

import {
  AbstractCursor,
  ChangeStream,
  ClientSession,
  Collection,
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent,
  ConnectionCheckedInEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolReadyEvent,
  ConnectionReadyEvent,
  Db,
  Document,
  GridFSBucket,
  HostAddress,
  MongoClient,
  MongoCredentials,
  ReadConcern,
  ReadPreference,
  ServerDescriptionChangedEvent,
  TopologyDescription,
  WriteConcern
} from '../../mongodb';
import { ejson, getEnvironmentalOptions } from '../../tools/utils';
import type { TestConfiguration } from '../runner/config';
import { trace } from './runner';
import type { ClientEncryption, ClientEntity, EntityDescription } from './schema';
import {
  createClientEncryption,
  makeConnectionString,
  patchCollectionOptions,
  patchDbOptions
} from './unified-utils';

export interface UnifiedChangeStream extends ChangeStream {
  eventCollector: InstanceType<typeof import('../../tools/utils')['EventCollector']>;
}

export class UnifiedThread {
  // Every function queued will have a catch handler attached to it, which will prevent `await this.#promise` from throwing
  // The potential error thrown by the functionToQueue can still be inspected on the `this.#error` property
  #promise: Promise<void>;
  #error: Error | null = null;
  #killed = false;

  id: string;

  constructor(id) {
    this.id = id;
    this.#promise = Promise.resolve();
  }

  queue(functionToQueue: () => Promise<any>) {
    if (this.#killed || this.#error) {
      return;
    }

    this.#promise = this.#promise.then(functionToQueue).catch(e => (this.#error = e));
  }

  async finish() {
    this.#killed = true;
    await this.#promise;
    if (this.#error) {
      this.#error.message = `<Thread(${this.id})>: ${this.#error.message}`;
      throw this.#error;
    }
  }
}

export type CommandEvent = CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent;
export type CmapEvent =
  | ConnectionPoolCreatedEvent
  | ConnectionPoolClosedEvent
  | ConnectionPoolReadyEvent
  | ConnectionCreatedEvent
  | ConnectionReadyEvent
  | ConnectionClosedEvent
  | ConnectionCheckOutStartedEvent
  | ConnectionCheckOutFailedEvent
  | ConnectionCheckedOutEvent
  | ConnectionCheckedInEvent
  | ConnectionPoolClearedEvent;
export type SdamEvent = ServerDescriptionChangedEvent;

function getClient(address) {
  return new MongoClient(`mongodb://${address}`, getEnvironmentalOptions());
}

export class UnifiedMongoClient extends MongoClient {
  commandEvents: CommandEvent[] = [];
  cmapEvents: CmapEvent[] = [];
  sdamEvents: SdamEvent[] = [];
  failPoints: Document[] = [];
  ignoredEvents: string[];
  observedCommandEvents: ('commandStarted' | 'commandSucceeded' | 'commandFailed')[];
  observedCmapEvents: (
    | 'connectionPoolCreated'
    | 'connectionPoolClosed'
    | 'connectionPoolReady'
    | 'connectionPoolCleared'
    | 'connectionCreated'
    | 'connectionReady'
    | 'connectionClosed'
    | 'connectionCheckOutStarted'
    | 'connectionCheckOutFailed'
    | 'connectionCheckedOut'
    | 'connectionCheckedIn'
  )[];
  observedSdamEvents: 'serverDescriptionChangedEvent'[];
  observedEventEmitter = new EventEmitter();
  _credentials: MongoCredentials | null;

  static COMMAND_EVENT_NAME_LOOKUP = {
    commandStartedEvent: 'commandStarted',
    commandSucceededEvent: 'commandSucceeded',
    commandFailedEvent: 'commandFailed'
  } as const;

  static CMAP_EVENT_NAME_LOOKUP = {
    poolCreatedEvent: 'connectionPoolCreated',
    poolClosedEvent: 'connectionPoolClosed',
    poolReadyEvent: 'connectionPoolReady',
    poolClearedEvent: 'connectionPoolCleared',
    connectionCreatedEvent: 'connectionCreated',
    connectionReadyEvent: 'connectionReady',
    connectionClosedEvent: 'connectionClosed',
    connectionCheckOutStartedEvent: 'connectionCheckOutStarted',
    connectionCheckOutFailedEvent: 'connectionCheckOutFailed',
    connectionCheckedOutEvent: 'connectionCheckedOut',
    connectionCheckedInEvent: 'connectionCheckedIn'
  } as const;

  static SDAM_EVENT_NAME_LOOKUP = {
    serverDescriptionChangedEvent: 'serverDescriptionChanged'
  } as const;

  constructor(uri: string, description: ClientEntity) {
    super(uri, {
      monitorCommands: true,
      [Symbol.for('@@mdb.skipPingOnConnect')]: true,
      ...getEnvironmentalOptions(),
      ...(description.serverApi ? { serverApi: description.serverApi } : {})
    });

    this.ignoredEvents = [
      ...(description.ignoreCommandMonitoringEvents ?? []),
      'configureFailPoint'
    ];

    this.observedCommandEvents = (description.observeEvents ?? [])
      .map(e => UnifiedMongoClient.COMMAND_EVENT_NAME_LOOKUP[e])
      .filter(e => !!e);
    this.observedCmapEvents = (description.observeEvents ?? [])
      .map(e => UnifiedMongoClient.CMAP_EVENT_NAME_LOOKUP[e])
      .filter(e => !!e);
    this.observedSdamEvents = (description.observeEvents ?? [])
      .map(e => UnifiedMongoClient.SDAM_EVENT_NAME_LOOKUP[e])
      .filter(e => !!e);
    for (const eventName of this.observedCommandEvents) {
      this.on(eventName, this.pushCommandEvent);
    }
    for (const eventName of this.observedCmapEvents) {
      this.on(eventName, this.pushCmapEvent);
    }
    for (const eventName of this.observedSdamEvents) {
      this.on(eventName, this.pushSdamEvent);
    }
  }

  isIgnored(e: CommandEvent): boolean {
    return this.ignoredEvents.includes(e.commandName);
  }

  getCapturedEvents(
    eventType: 'command' | 'cmap' | 'sdam'
  ): CommandEvent[] | CmapEvent[] | SdamEvent[];
  getCapturedEvents(eventType: 'all'): (CommandEvent | CmapEvent | SdamEvent)[];
  getCapturedEvents(
    eventType: 'command' | 'cmap' | 'sdam' | 'all'
  ): (CommandEvent | CmapEvent | SdamEvent)[] {
    switch (eventType) {
      case 'command':
        return this.commandEvents;
      case 'cmap':
        return this.cmapEvents;
      case 'sdam':
        return this.sdamEvents;
      case 'all':
        return [...this.commandEvents, ...this.cmapEvents, ...this.sdamEvents];
      default:
        throw new Error(`Unknown eventType: ${eventType}`);
    }
  }

  // NOTE: pushCommandEvent must be an arrow function
  pushCommandEvent: (e: CommandEvent) => void = e => {
    if (!this.isIgnored(e)) {
      this.commandEvents.push(e);
      this.observedEventEmitter.emit('observedEvent');
    }
  };

  // NOTE: pushCmapEvent must be an arrow function
  pushCmapEvent: (e: CmapEvent) => void = e => {
    this.cmapEvents.push(e);
    this.observedEventEmitter.emit('observedEvent');
  };

  // NOTE: pushSdamEvent must be an arrow function
  pushSdamEvent: (e: SdamEvent) => void = e => {
    this.sdamEvents.push(e);
    this.observedEventEmitter.emit('observedEvent');
  };

  /** Disables command monitoring for the client and returns a list of the captured events. */
  stopCapturingEvents(): void {
    for (const eventName of this.observedCommandEvents) {
      this.off(eventName, this.pushCommandEvent);
    }
    for (const eventName of this.observedCmapEvents) {
      this.off(eventName, this.pushCmapEvent);
    }
    for (const eventName of this.observedSdamEvents) {
      this.off(eventName, this.pushSdamEvent);
    }
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
      address = client.topology!.s.seedlist.join(',');
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
  | ClientEncryption
  | TopologyDescription // From recordTopologyDescription operation
  | Document; // Results from operations

export type EntityCtor =
  | typeof UnifiedMongoClient
  | typeof Db
  | typeof Collection
  | typeof ClientSession
  | typeof ChangeStream
  | typeof AbstractCursor
  | typeof GridFSBucket
  | typeof UnifiedThread
  | ClientEncryption;

export type EntityTypeId =
  | 'client'
  | 'db'
  | 'collection'
  | 'session'
  | 'bucket'
  | 'thread'
  | 'cursor'
  | 'stream'
  | 'clientEncryption';

const ENTITY_CTORS = new Map<EntityTypeId, EntityCtor>();
ENTITY_CTORS.set('client', UnifiedMongoClient);
ENTITY_CTORS.set('db', Db);
ENTITY_CTORS.set('collection', Collection);
ENTITY_CTORS.set('session', ClientSession);
ENTITY_CTORS.set('bucket', GridFSBucket);
ENTITY_CTORS.set('thread', UnifiedThread);
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
  mapOf(type: 'clientEncryption'): EntitiesMap<ClientEncryption>;
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
  getEntity(type: 'thread', key: string, assertExists?: boolean): UnifiedThread;
  getEntity(type: 'cursor', key: string, assertExists?: boolean): AbstractCursor;
  getEntity(type: 'stream', key: string, assertExists?: boolean): UnifiedChangeStream;
  getEntity(type: 'clientEncryption', key: string, assertExists?: boolean): ClientEncryption;
  getEntity(type: EntityTypeId, key: string, assertExists = true): Entity | undefined {
    const entity = this.get(key);
    if (!entity) {
      if (assertExists) throw new Error(`Entity '${key}' does not exist`);
      return;
    }
    if (type === 'clientEncryption') {
      // we do not have instanceof checking here since csfle might not be installed
      return entity;
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
    entities?: EntityDescription[],
    entityMap?: EntitiesMap
  ): Promise<EntitiesMap> {
    const map = entityMap ?? new EntitiesMap();
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
      } else if ('thread' in entity) {
        map.set(entity.thread.id, new UnifiedThread(entity.thread.id));
      } else if ('stream' in entity) {
        throw new Error(`Unsupported Entity ${JSON.stringify(entity)}`);
      } else if ('clientEncryption' in entity) {
        const clientEncryption = createClientEncryption(map, entity.clientEncryption);

        map.set(entity.clientEncryption.id, clientEncryption);
      } else {
        throw new Error(`Unsupported Entity ${JSON.stringify(entity)}`);
      }
    }
    return map;
  }
}
