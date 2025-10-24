/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';

import { type Collection, type MongoClient } from '../../../src';

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

    let cmapEvents: Array<{ name: string; event: Record<string, any> }>;
    let commandStartedEvents: Array<Record<string, any>>;
    let testCollection: Collection;

    beforeEach(async function () {
      // 1. Create a client with maxPoolSize=1 and retryReads=true.
      client = this.configuration.newClient(
        this.configuration.url({
          useMultipleMongoses: false // If testing against a sharded deployment, be sure to connect to only a single mongos.
        }),
        { maxPoolSize: 1, retryReads: true, monitorCommands: true }
      );

      testCollection = client.db('retryable-reads-prose').collection('pool-clear-retry');
      await testCollection.drop();
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
      metadata: { requires: { topology: '!load-balanced' } },
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

        // NOTE: For the subsequent checks, we rely on the exact sequence of ALL events
        // for ease of readability; however, only the relative order matters for
        // the purposes of this test, so if this ever becomes an issue, the test
        // can be refactored to assert on relative index values instead

        // 5. Via CMAP monitoring, assert that the first check out succeeds.
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

        // 6. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.
        expect(cmapEvents.shift()).to.have.property(
          'name',
          'connectionPoolCleared',
          'expected 4) pool to clear'
        );

        // 7. Via CMAP monitoring, assert that the second check out then fails due to a connection error.
        const nextEvent = cmapEvents.shift();
        expect(nextEvent).to.have.property(
          'name',
          'connectionCheckOutFailed',
          'expected 5) checkout 2 to fail'
        );
        expect(nextEvent!.event).to.have.property('reason', 'connectionError');

        // 8. Via Command Monitoring, assert that exactly three find CommandStartedEvents were observed in total.
        const observedFindCommandStartedEvents = commandStartedEvents.filter(
          ({ commandName }) => commandName === 'find'
        );
        expect(observedFindCommandStartedEvents).to.have.lengthOf(
          3,
          'expected 3 find command started events'
        );
      }
    });
  });
});
