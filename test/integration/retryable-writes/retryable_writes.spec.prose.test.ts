/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';

import { Collection, MongoClient, MongoError, MongoServerError } from '../../../src';

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

    for (const testTopology of ['replicaset', 'sharded']) {
      const minFailPointVersion = testTopology === 'replicaset' ? '>=4.0.0' : '>=4.1.5';
      it(`should error with the correct error message when topology is ${testTopology}`, {
        metadata: { requires: { mongodb: minFailPointVersion, topology: [testTopology as any] } },
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
    }
  });

  describe('2. Test that drivers properly retry after encountering PoolClearedErrors.', () => {
    // This test MUST be implemented by any driver that implements the CMAP specification.
    // This test requires MongoDB 4.2.9+ for blockConnection support in the failpoint.

    let cmapEvents: Array<{ name: string; event: Record<string, any> }>;
    let commandStartedEvents: Array<Record<string, any>>;
    let testCollection: Collection;
    beforeEach(async function () {
      // i. Create a client with maxPoolSize=1 and retryWrites=true.
      client = this.configuration.newClient(
        this.configuration.url({
          useMultipleMongoses: false // If testing against a sharded deployment, be sure to connect to only a single mongos.
        }),
        { maxPoolSize: 1, retryWrites: true, monitorCommands: true }
      );

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

      cmapEvents = [];
      commandStartedEvents = [];
      for (const observedEvent of [
        'connectionCheckOutStarted',
        'connectionCheckedOut',
        'connectionCheckOutFailed',
        'connectionPoolCleared'
      ]) {
        client.on(observedEvent, ev => {
          cmapEvents.push({ name: observedEvent, event: ev });
        });
      }
      client.on('commandStarted', ev => {
        commandStartedEvents.push(ev);
      });
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

        // NOTE: For the subsequent checks, we rely on the exact sequence of ALL events
        // for ease of readability; however, only the relative order matters for
        // the purposes of this test, so if this ever becomes an issue, the test
        // can be refactored to assert on relative index values instead

        // v. Via CMAP monitoring, assert that the first check out succeeds.
        expect(cmapEvents.shift()).to.have.property(
          'name',
          'connectionCheckOutStarted',
          'expected 1) checkout 1 to start'
        );
        expect(cmapEvents.shift()).to.have.property(
          'name',
          'connectionCheckOutStarted',
          'expected 2) checkout 2 to start'
        );
        expect(cmapEvents.shift()).to.have.property(
          'name',
          'connectionCheckedOut',
          'expected 3) first checkout to succeed'
        );

        // vi. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.
        expect(cmapEvents.shift()).to.have.property(
          'name',
          'connectionPoolCleared',
          'expected 4) pool to clear'
        );

        // vii. Via CMAP monitoring, assert that the second check out then fails due to a connection error.
        const nextEvent = cmapEvents.shift();
        expect(nextEvent).to.have.property(
          'name',
          'connectionCheckOutFailed',
          'expected 5) checkout 2 to fail'
        );
        expect(nextEvent!.event).to.have.property('reason', 'connectionError');

        // viii. Via Command Monitoring, assert that exactly three insert CommandStartedEvents were observed in total.
        const observedInsertCommandStartedEvents = commandStartedEvents.filter(
          ({ commandName }) => commandName === 'insert'
        );
        expect(observedInsertCommandStartedEvents).to.have.lengthOf(
          3,
          'expected 3 insert command started events'
        );
      }
    });
  });
});
