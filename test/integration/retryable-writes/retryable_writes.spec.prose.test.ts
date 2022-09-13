import { expect } from 'chai';

import { Collection, MongoClient, MongoError, MongoServerError, TopologyType } from '../../../src';

describe('Retryable Writes Spec Prose', () => {
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

  describe('1. Test that retryable writes raise an exception when using the MMAPv1 storage engine.', () => {
    /**
     * For this test, execute a write operation, such as insertOne, which should generate an exception and the error code is 20.
     * Assert that the error message is the replacement error message:
     *
     * ```
     * This MongoDB deployment does not support retryable writes. Please add
     * retryWrites=false to your connection string.
     * ```
     * Note: Drivers that rely on serverStatus to determine the storage engine in use MAY skip this test for sharded clusters, since mongos does not report this information in its serverStatus response.
     */
    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();

      failPointName = 'failCommand';
      const failPoint = await client.db('admin').command({
        configureFailPoint: failPointName,
        mode: { times: 1 },
        data: {
          failCommands: ['insert'],
          errorCode: 20, // MMAP Error code,
          closeConnection: false
        }
      });

      expect(failPoint).to.have.property('ok', 1);
    });

    it('should error with the correct error message', {
      metadata: { requires: { mongodb: '>=4.0.0', topology: ['replicaset', 'sharded'] } },
      test: async function () {
        const error = await client
          .db('test')
          .collection('test')
          .insertOne({ a: 1 })
          .catch(error => error);

        expect(error).to.exist;
        expect(error).that.is.instanceOf(MongoServerError);
        expect(error).to.have.property('originalError').that.instanceOf(MongoError);
        expect(error.originalError).to.have.property('code', 20);
        expect(error).to.have.property(
          'message',
          'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.'
        );
      }
    });
  });

  describe('2. Test that drivers properly retry after encountering PoolClearedErrors.', () => {
    // This test MUST be implemented by any driver that implements the CMAP specification.
    // This test requires MongoDB 4.2.9+ for blockConnection support in the failpoint.

    let observedEvents: Array<{ name: string; event: Record<string, any> }>;
    let testCollection: Collection;
    beforeEach(async function () {
      // i. Create a client with maxPoolSize=1 and retryWrites=true.
      // If testing against a sharded deployment, be sure to connect to only a single mongos. <-- TODO: what does that look like?
      client = this.configuration.newClient({
        maxPoolSize: 1,
        retryWrites: true,
        monitorCommands: true
      });
      await client.connect();

      testCollection = client.db('retryable-writes-prose').collection('pool-clear-retry');
      await testCollection.drop().catch(() => null);

      // ii. Enable the following failpoint:
      // NOTE: "ix. Disable the failpoint" is done in afterEach
      failPointName = 'failCommand';
      const failPoint = await client.db('admin').command({
        configureFailPoint: failPointName,
        mode: { times: 1 },
        data: {
          failCommands: ['insert'],
          errorCode: 91,
          blockConnection: true,
          blockTimeMS: 1000,
          errorLabels: ['RetryableWriteError']
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
      metadata: { requires: { mongodb: '>=4.2.9', topology: ['replicaset', 'sharded'] } },
      test: async function () {
        // iii. Start two threads and attempt to perform an insertOne simultaneously on both.
        await Promise.all([
          testCollection.insertOne({ test: 1 }),
          testCollection.insertOne({ test: 2 })
        ]);

        client.removeAllListeners();
        // iv. Verify that both insertOne attempts succeed.
        const result = await testCollection.find().toArray();
        expect(result).to.have.lengthOf(2);
        const mappedAndSortedResult = result.map(item => item.test).sort();
        expect(mappedAndSortedResult).to.deep.equal([1, 2]);

        // v. Via CMAP monitoring, assert that the first check out succeeds.
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

        // vi. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.
        const indexOfPoolClear = observedEvents.findIndex(
          ev => ev.name === 'connectionPoolCleared'
        );
        expect(indexOfPoolClear).to.be.greaterThan(
          indexOfFirstCheckoutSuccess,
          'expected a pool cleared event to follow checkout success'
        );

        // vii. Via CMAP monitoring, assert that the second check out then fails due to a connection error.
        expect(indexOfFirstCheckoutFailure).to.be.greaterThan(
          indexOfPoolClear,
          'expected checkout failure after pool clear'
        );
        expect(observedEvents[indexOfFirstCheckoutFailure].event).to.have.property(
          'reason',
          'connectionError'
        );

        // viii. Via Command Monitoring, assert that exactly three insert CommandStartedEvents were observed in total.
        const observedInsertCommandStartedEvents = observedEvents.filter(({ name, event }) => {
          return name === 'commandStarted' && event.commandName === 'insert';
        });
        expect(observedInsertCommandStartedEvents).to.have.lengthOf(
          3,
          'expected 3 insert command started events'
        );
      }
    });
  });
});
