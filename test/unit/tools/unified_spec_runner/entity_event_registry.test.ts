import { expect } from 'chai';

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
} from '../../../../src/constants';
import { EntitiesMap, UnifiedMongoClient } from '../../../tools/unified-spec-runner/entities';
import { EntityEventRegistry } from '../../../tools/unified-spec-runner/entity_event_registry';

describe('EntityEventRegistry', function () {
  describe('#register', function () {
    context('when storeEventsAsEntities exists on the client entity', function () {
      const clientEntity = {
        id: 'client0',
        storeEventsAsEntities: [
          {
            id: 'eventList',
            events: [
              'PoolCreatedEvent',
              'PoolReadyEvent',
              'PoolClearedEvent',
              'PoolClosedEvent',
              'ConnectionCreatedEvent',
              'ConnectionReadyEvent',
              'ConnectionClosedEvent',
              'ConnectionCheckOutStartedEvent',
              'ConnectionCheckOutFailedEvent',
              'ConnectionCheckedOutEvent',
              'ConnectionCheckedInEvent',
              'CommandStartedEvent',
              'CommandSucceededEvent',
              'CommandFailedEvent'
            ]
          }
        ]
      };
      const entitesMap = new EntitiesMap();
      const uri = 'mongodb://127.0.0.1:27017';
      const client = new UnifiedMongoClient(uri, clientEntity, {});
      const registry = new EntityEventRegistry(client, clientEntity, entitesMap);

      before(function () {
        registry.register();
      });

      it('initializes the events in the entities map', function () {
        expect(entitesMap.getEntity('events', 'eventList')).to.deep.equal([]);
      });

      it('maps PoolCreatedEvent to connectionPoolCreated', function () {
        expect(client.listeners(CONNECTION_POOL_CREATED)).to.have.length(1);
      });

      it('maps PoolReadyEvent to connectionPoolReady', function () {
        expect(client.listeners(CONNECTION_POOL_READY)).to.have.length(1);
      });

      it('maps PoolClearedEvent to connectionPoolCleared', function () {
        expect(client.listeners(CONNECTION_POOL_CLEARED)).to.have.length(1);
      });

      it('maps PoolClosedEvent to connectionPoolClosed', function () {
        expect(client.listeners(CONNECTION_POOL_CLOSED)).to.have.length(1);
      });

      it('maps ConnectionCreatedEvent to connectionCreated', function () {
        expect(client.listeners(CONNECTION_CREATED)).to.have.length(1);
      });

      it('maps ConnectionReadyEvent to connectionReady', function () {
        expect(client.listeners(CONNECTION_READY)).to.have.length(1);
      });

      it('maps ConnectionClosedEvent to connectionClosed', function () {
        expect(client.listeners(CONNECTION_CLOSED)).to.have.length(1);
      });

      it('maps ConnectionCheckOutStartedEvent to connectionCheckoutStarted', function () {
        expect(client.listeners(CONNECTION_CHECK_OUT_STARTED)).to.have.length(1);
      });

      it('maps ConnectionCheckOutFailedEvent to connectionCheckoutFailed', function () {
        expect(client.listeners(CONNECTION_CHECK_OUT_FAILED)).to.have.length(1);
      });

      it('maps ConnectionCheckedOutEvent to connectionCheckedOut', function () {
        expect(client.listeners(CONNECTION_CHECKED_OUT)).to.have.length(1);
      });

      it('maps ConnectionCheckedInEvent to connectionCheckedIn', function () {
        expect(client.listeners(CONNECTION_CHECKED_IN)).to.have.length(1);
      });

      it('maps CommandStartedEvent to commandStarted', function () {
        expect(client.listeners(COMMAND_STARTED)).to.have.length(1);
      });

      it('maps CommandSucceededEvent to commandSucceeded', function () {
        expect(client.listeners(COMMAND_SUCCEEDED)).to.have.length(1);
      });

      it('maps CommandFailedEvent to commandFailed', function () {
        expect(client.listeners(COMMAND_FAILED)).to.have.length(1);
      });
    });

    context('when storeEventsAsEntities does not exist on the client entity', function () {
      const clientEntity = { id: 'client0' };
      const entitesMap = new EntitiesMap();
      const uri = 'mongodb://127.0.0.1:27017';
      const client = new UnifiedMongoClient(uri, clientEntity, {});
      const registry = new EntityEventRegistry(client, clientEntity, entitesMap);

      before(function () {
        registry.register();
      });

      it('does not listen for connectionPoolCreated', function () {
        expect(client.listeners(CONNECTION_POOL_CREATED)).to.be.empty;
      });

      it('does not listen for connectionPoolReady', function () {
        expect(client.listeners(CONNECTION_POOL_READY)).to.be.empty;
      });

      it('does not listen for connectionPoolCleared', function () {
        expect(client.listeners(CONNECTION_POOL_CLEARED)).to.be.empty;
      });

      it('does not listen for connectionPoolClosed', function () {
        expect(client.listeners(CONNECTION_POOL_CLOSED)).to.be.empty;
      });

      it('mdoes not listen for connectionCreated', function () {
        expect(client.listeners(CONNECTION_CREATED)).to.be.empty;
      });

      it('does not listen for connectionReady', function () {
        expect(client.listeners(CONNECTION_READY)).to.be.empty;
      });

      it('does not listen for connectionClosed', function () {
        expect(client.listeners(CONNECTION_CLOSED)).to.be.empty;
      });

      it('does not listen for connectionCheckoutStarted', function () {
        expect(client.listeners(CONNECTION_CHECK_OUT_STARTED)).to.be.empty;
      });

      it('does not listen for connectionCheckoutFailed', function () {
        expect(client.listeners(CONNECTION_CHECK_OUT_FAILED)).to.be.empty;
      });

      it('does not listen for connectionCheckedOut', function () {
        expect(client.listeners(CONNECTION_CHECKED_OUT)).to.be.empty;
      });

      it('does not listen for connectionCheckedIn', function () {
        expect(client.listeners(CONNECTION_CHECKED_IN)).to.be.empty;
      });

      it('does not listen for commandStarted', function () {
        expect(client.listeners(COMMAND_STARTED)).to.be.empty;
      });

      it('does not listen for commandSucceeded', function () {
        expect(client.listeners(COMMAND_SUCCEEDED)).to.be.empty;
      });

      it('does not listen for commandFailed', function () {
        expect(client.listeners(COMMAND_FAILED)).to.be.empty;
      });
    });
  });
});
