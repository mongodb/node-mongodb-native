import { AssertionError } from 'chai';

import {
  COMMAND_FAILED,
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  CONNECTION_CHECK_OUT_FAILED,
  CONNECTION_CHECK_OUT_STARTED,
  CONNECTION_CHECKED_IN,
  CONNECTION_CHECKED_OUT,
  CONNECTION_CLOSED,
  CONNECTION_CREATED,
  CONNECTION_POOL_CLEARED,
  CONNECTION_POOL_CLOSED,
  CONNECTION_POOL_CREATED,
  CONNECTION_POOL_READY,
  CONNECTION_READY
} from '../../../src/constants';
import { type EntitiesMap, type UnifiedMongoClient } from './entities';
import { type ClientEntity } from './schema';

/**
 * Maps the names of the events the unified runner passes and maps
 * them to the names of the events emitted in the driver.
 */
const MAPPINGS = {
  PoolCreatedEvent: CONNECTION_POOL_CREATED,
  PoolReadyEvent: CONNECTION_POOL_READY,
  PoolClearedEvent: CONNECTION_POOL_CLEARED,
  PoolClosedEvent: CONNECTION_POOL_CLOSED,
  ConnectionCreatedEvent: CONNECTION_CREATED,
  ConnectionReadyEvent: CONNECTION_READY,
  ConnectionClosedEvent: CONNECTION_CLOSED,
  ConnectionCheckOutStartedEvent: CONNECTION_CHECK_OUT_STARTED,
  ConnectionCheckOutFailedEvent: CONNECTION_CHECK_OUT_FAILED,
  ConnectionCheckedOutEvent: CONNECTION_CHECKED_OUT,
  ConnectionCheckedInEvent: CONNECTION_CHECKED_IN,
  CommandStartedEvent: COMMAND_STARTED,
  CommandSucceededEvent: COMMAND_SUCCEEDED,
  CommandFailedEvent: COMMAND_FAILED
};

/**
 * Registers events that need to be stored in the entities map, since
 * the UnifiedMongoClient does not contain a cyclical dependency on the
 * entities map itself.
 */
export class EntityEventRegistry {
  constructor(
    private client: UnifiedMongoClient,
    private clientEntity: ClientEntity,
    private entitiesMap: EntitiesMap
  ) {
    this.client = client;
    this.clientEntity = clientEntity;
    this.entitiesMap = entitiesMap;
  }

  /**
   * Connect the event listeners on the client and the entities map.
   */
  register(): void {
    if (this.clientEntity.storeEventsAsEntities) {
      for (const { id, events } of this.clientEntity.storeEventsAsEntities) {
        if (this.entitiesMap.has(id) || this.clientEntity.id === id) {
          throw new AssertionError(`Duplicate id ${id} found while storing events as entities`);
        }
        this.entitiesMap.set(id, []);
        for (const eventName of events) {
          // Need to map the event names to the Node event names.
          this.client.on(MAPPINGS[eventName], () => {
            const events = this.entitiesMap.getEntity('events', id);
            events.push({
              name: eventName,
              observedAt: Date.now()
            });
          });
        }
      }
    }
  }
}
