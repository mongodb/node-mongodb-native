import { expect } from 'chai';

import { Collection, MongoClient } from '../../../src';

describe('Retryable Reads Spec Prose', () => {
  let client: MongoClient, failPointName;

  afterEach(async () => {
    try {
      if (failPointName) {
        await client.db('admin').command({ configureFailPoint: failPointName, mode: 'off' });
      }
    } finally {
      failPointName = undefined;
      await client?.close();
    }
  });

  describe('PoolClearedError Retryability Test', () => {
    // This test will be used to ensure drivers properly retry after encountering PoolClearedErrors.
    // It MUST be implemented by any driver that implements the CMAP specification.
    // This test requires MongoDB 4.2.9+ for blockConnection support in the failpoint.

    let observedEvents: Array<{ name: string; event: Record<string, any> }>;
    let testCollection: Collection;
    beforeEach(async function () {
      // 1. Create a client with maxPoolSize=1 and retryReads=true.
      // If testing against a sharded deployment, be sure to connect to only a single mongos. <-- TODO: what does that look like?
      client = this.configuration.newClient({
        maxPoolSize: 1,
        retryReads: true,
        monitorCommands: true
      });

      testCollection = client.db('retryable-reads-prose').collection('pool-clear-retry');
      await testCollection.drop().catch(() => null);
      await testCollection.insertMany([{ test: 1 }, { test: 2 }]);

      // 2. Enable the following failpoint:
      // NOTE: "9. Disable the failpoint" is done in afterEach
      failPointName = 'failCommand';
      const failPoint = await client.db('admin').command({
        configureFailPoint: failPointName,
        mode: { times: 1 },
        data: {
          failCommands: ['find'],
          errorCode: 91,
          blockConnection: true,
          blockTimeMS: 1000
        }
      });

      expect(failPoint).to.have.property('ok', 1);

      observedEvents = [];
      for (const observedEvent of [
        'connectionCheckOutStarted',
        'connectionCheckedOut',
        'connectionCheckOutFailed',
        'connectionPoolCleared',
        'commandStarted'
      ]) {
        client.on(observedEvent, ev => {
          observedEvents.push({ name: observedEvent, event: ev });
        });
      }
    });

    it('should emit events in the expected sequence', {
      metadata: { requires: { mongodb: '>=4.2.9', topology: '!load-balanced' } },
      test: async function () {
        // 3. Start two threads and attempt to perform a findOne simultaneously on both.
        const results = await Promise.all([
          testCollection.findOne({ test: 1 }),
          testCollection.findOne({ test: 2 })
        ]);

        client.removeAllListeners();
        // 4. Verify that both findOne attempts succeed.
        expect(results[0]).to.have.property('test', 1);
        expect(results[1]).to.have.property('test', 2);

        // 5. Via CMAP monitoring, assert that the first check out succeeds.
        const indexOfFirstCheckoutAttempt = observedEvents.findIndex(
          ev => ev.name === 'connectionCheckOutStarted'
        );
        expect(indexOfFirstCheckoutAttempt).to.be.greaterThan(
          -1,
          'expected a checkout started event to exist'
        );
        const indexOfFirstCheckoutSuccess = observedEvents.findIndex(
          ev => ev.name === 'connectionCheckedOut'
        );
        expect(indexOfFirstCheckoutSuccess).to.be.greaterThan(
          -1,
          'expected at least one checkout success'
        );
        const indexOfFirstCheckoutFailure = observedEvents.findIndex(
          ev => ev.name === 'connectionCheckOutFailed'
        );
        expect(indexOfFirstCheckoutFailure).to.be.greaterThan(
          -1,
          'expected at least one checkout failure'
        );

        expect(indexOfFirstCheckoutSuccess).to.be.greaterThan(
          indexOfFirstCheckoutAttempt,
          'expected checkout started before checkout success'
        );
        expect(indexOfFirstCheckoutSuccess).to.be.lessThan(
          indexOfFirstCheckoutFailure,
          'expected first connection checkout to succeed but it failed'
        );

        // 6. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.
        const indexOfPoolClear = observedEvents.findIndex(
          ev => ev.name === 'connectionPoolCleared'
        );
        expect(indexOfPoolClear).to.be.greaterThan(
          indexOfFirstCheckoutSuccess,
          'expected a pool cleared event to follow checkout success'
        );

        // 7. Via CMAP monitoring, assert that the second check out then fails due to a connection error.
        expect(indexOfFirstCheckoutFailure).to.be.greaterThan(
          indexOfPoolClear,
          'expected checkout failure after pool clear'
        );
        expect(observedEvents[indexOfFirstCheckoutFailure].event).to.have.property(
          'reason',
          'connectionError'
        );

        // 8. Via Command Monitoring, assert that exactly three find CommandStartedEvents were observed in total.
        const observedInsertCommandStartedEvents = observedEvents.filter(({ name, event }) => {
          return name === 'commandStarted' && event.commandName === 'find';
        });
        expect(observedInsertCommandStartedEvents).to.have.lengthOf(
          3,
          'expected 3 find command started events'
        );
      }
    });
  });
});
