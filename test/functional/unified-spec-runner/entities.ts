import { MongoClient, Db, Collection, GridFSBucket, Document } from '../../../src/index';
import { ClientSession } from '../../../src/sessions';
import { ChangeStream } from '../../../src/change_stream';
import type { ClientEntity, EntityDescription } from './schema';
import type {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from '../../../src/cmap/events';
import { patchCollectionOptions, patchDbOptions } from './unified-utils';
import { TestConfiguration } from './unified.test';

export type CommandEvent = CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent;

export class UnifiedMongoClient extends MongoClient {
  events: CommandEvent[];
  observedEvents: ('commandStarted' | 'commandSucceeded' | 'commandFailed')[];

  static EVENT_NAME_LOOKUP = {
    commandStartedEvent: 'commandStarted',
    commandSucceededEvent: 'commandSucceeded',
    commandFailedEvent: 'commandFailed'
  } as const;

  constructor(url: string, description: ClientEntity) {
    super(url, { monitorCommands: true, ...description.uriOptions });
    this.events = [];
    // apm
    this.observedEvents = (description.observeEvents ?? []).map(
      e => UnifiedMongoClient.EVENT_NAME_LOOKUP[e]
    );
    for (const eventName of this.observedEvents) {
      this.on(eventName, this.pushEvent);
    }
  }

  // NOTE: this must be an arrow function for `this` to work.
  pushEvent: (e: CommandEvent) => void = e => {
    this.events.push(e);
  };

  /** Disables command monitoring for the client and returns a list of the captured events. */
  stopCapturingEvents(): CommandEvent[] {
    for (const eventName of this.observedEvents) {
      this.off(eventName, this.pushEvent);
    }
    return this.events;
  }
}

export type Entity =
  | UnifiedMongoClient
  | Db
  | Collection
  | ClientSession
  | ChangeStream
  | GridFSBucket
  | Document; // Results from operations

export class EntitiesMap extends Map<string, Entity> {
  clients(): Map<string, UnifiedMongoClient> {
    const m = new Map<string, UnifiedMongoClient>();
    for (const [id, e] of this) {
      if (e instanceof UnifiedMongoClient) {
        m.set(id, e);
      }
    }
    return m;
  }

  getClient(key: string): UnifiedMongoClient {
    const e = this.get(key);
    if (!(e instanceof UnifiedMongoClient)) {
      throw new Error(`Entity ${key} is not a UnifiedMongoClient`);
    }
    return e;
  }

  databases(): Map<string, Db> {
    const m = new Map<string, Db>();
    for (const [id, e] of this) {
      if (e instanceof Db) {
        m.set(id, e);
      }
    }
    return m;
  }

  getDatabase(key: string): Db {
    const e = this.get(key);
    if (!(e instanceof Db)) {
      throw new Error(`Entity ${key} is not a Db`);
    }
    return e;
  }

  collections(): Map<string, Collection> {
    const m = new Map<string, Collection>();
    for (const [id, e] of this) {
      if (e instanceof Collection) {
        m.set(id, e);
      }
    }
    return m;
  }

  getCollection(key: string): Collection {
    const e = this.get(key);
    if (!(e instanceof Collection)) {
      throw new Error(`Entity ${key} is not a Collection`);
    }
    return e;
  }

  sessions(): Map<string, ClientSession> {
    const m = new Map<string, ClientSession>();
    for (const [id, e] of this) {
      if (e instanceof ClientSession) {
        m.set(id, e);
      }
    }
    return m;
  }

  getSession(key: string): ClientSession {
    const e = this.get(key);
    if (!(e instanceof ClientSession)) {
      throw new Error(`Entity ${key} is not a ClientSession`);
    }
    return e;
  }

  buckets(): Map<string, GridFSBucket> {
    const m = new Map<string, GridFSBucket>();
    for (const [id, e] of this) {
      if (e instanceof GridFSBucket) {
        m.set(id, e);
      }
    }
    return m;
  }

  streams(): Map<string, ChangeStream> {
    const m = new Map<string, ChangeStream>();
    for (const [id, e] of this) {
      if (e instanceof ChangeStream) {
        m.set(id, e);
      }
    }
    return m;
  }

  async cleanup(): Promise<void> {
    for (const [, client] of this.clients()) {
      await client.close();
    }
    for (const [, session] of this.sessions()) {
      await session.endSession();
    }
    this.clear();
  }

  static async createEntities(
    config: TestConfiguration,
    entities?: EntityDescription[]
  ): Promise<EntitiesMap> {
    const map = new EntitiesMap();
    for (const entity of entities ?? []) {
      if ('client' in entity) {
        const client = new UnifiedMongoClient(config.url(), entity.client);
        await client.connect();
        map.set(entity.client.id, client);
      } else if ('database' in entity) {
        const client = map.getClient(entity.database.client);
        const db = client.db(
          entity.database.databaseName,
          patchDbOptions(entity.database.databaseOptions)
        );
        map.set(entity.database.id, db);
      } else if ('collection' in entity) {
        const db = map.getDatabase(entity.collection.database);
        const collection = db.collection(
          entity.collection.collectionName,
          patchCollectionOptions(entity.collection.collectionOptions)
        );
        map.set(entity.collection.id, collection);
      } else if ('session' in entity) {
        map.set(entity.session.id, null);
      } else if ('bucket' in entity) {
        map.set(entity.bucket.id, null);
      } else if ('stream' in entity) {
        map.set(entity.stream.id, null);
      } else {
        throw new Error(`Unsupported Entity ${JSON.stringify(entity)}`);
      }
    }
    return map;
  }
}
