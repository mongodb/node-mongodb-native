/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as timersPromises from 'timers/promises';

import {
  type Collection,
  type CommandFailedEvent,
  type CommandSucceededEvent,
  type MongoClient,
  MongoErrorLabel,
  MongoServerError
} from '../../mongodb';
import { filterForCommands } from '../shared';

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

  describe('Retrying Reads in a Replica Set', () => {
    // These tests verify that server deprioritization on replica sets only occurs
    // for SystemOverloadedError errors.

    const TEST_METADATA: MongoDBMetadataUI = {
      requires: { mongodb: '>=4.4', topology: 'replicaset' }
    };

    describe('Retryable Reads Caused by Overload Errors Are Retried on a Different Server When enableOverloadRetargeting is enabled', () => {
      let client: MongoClient;
      const commandFailedEvents: CommandFailedEvent[] = [];
      const commandSucceededEvents: CommandSucceededEvent[] = [];

      beforeEach(async function () {
        // 1. Create a client `client` with `retryReads=true`, `readPreference=primaryPreferred`,
        //    `enableOverloadRetargeting=true`, and command event monitoring enabled.
        client = this.configuration.newClient({
          retryReads: true,
          readPreference: 'primaryPreferred',
          enableOverloadRetargeting: true,
          monitorCommands: true
        });

        client.on('commandFailed', filterForCommands('find', commandFailedEvents));
        client.on('commandSucceeded', filterForCommands('find', commandSucceededEvents));

        await client.connect();

        /*
        * 2. Configure the following fail point for `client`:
            {
                configureFailPoint: "failCommand",
                mode: { times: 1 },
                data: {
                    failCommands: ["find"],
                    errorLabels: ["RetryableError", "SystemOverloadedError"]
                    errorCode: 6
                }
            }
        * */
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['find'],
            errorCode: 6,
            errorLabels: ['RetryableError', 'SystemOverloadedError']
          }
        });

        // 3. Reset the command event monitor to clear the failpoint command from its stored events.
        commandFailedEvents.length = 0;
        commandSucceededEvents.length = 0;
      });

      afterEach(async function () {
        await client?.db('admin').command({ configureFailPoint: 'failCommand', mode: 'off' });
        await client?.close();
      });

      it('retries on a different server when SystemOverloadedError', TEST_METADATA, async () => {
        // 4. Execute a `find` command with `client`.
        await client.db('test').collection('test').find().toArray();

        // 5. Assert that one failed command event and one successful command event occurred.
        expect(commandFailedEvents).to.have.lengthOf(1);
        expect(commandSucceededEvents).to.have.lengthOf(1);

        // 6. Assert that both events occurred on different servers.
        expect(commandFailedEvents[0].address).to.not.equal(commandSucceededEvents[0].address);
      });
    });

    describe('Retryable Reads Caused by Non-Overload Errors Are Retried on the Same Server', () => {
      let client: MongoClient;
      const commandFailedEvents: CommandFailedEvent[] = [];
      const commandSucceededEvents: CommandSucceededEvent[] = [];

      beforeEach(async function () {
        // 1. Create a client `client` with `retryReads=true`, `readPreference=primaryPreferred`, and command event monitoring
        //     enabled.
        client = this.configuration.newClient({
          retryReads: true,
          readPreference: 'primaryPreferred',
          monitorCommands: true
        });

        client.on('commandFailed', filterForCommands('find', commandFailedEvents));
        client.on('commandSucceeded', filterForCommands('find', commandSucceededEvents));

        await client.connect();

        /*
        * 2. Configure the following fail point for `client`:
            {
                configureFailPoint: "failCommand",
                mode: { times: 1 },
                data: {
                    failCommands: ["find"],
                    errorLabels: ["RetryableError"]
                    errorCode: 6
                }
            }
        * */
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['find'],
            errorCode: 6,
            errorLabels: ['RetryableError']
          }
        });

        // 3. Reset the command event monitor to clear the failpoint command from its stored events.
        commandFailedEvents.length = 0;
        commandSucceededEvents.length = 0;
      });

      afterEach(async function () {
        await client?.db('admin').command({ configureFailPoint: 'failCommand', mode: 'off' });
        await client?.close();
      });

      it('retries on the same server when no SystemOverloadedError', TEST_METADATA, async () => {
        // 4. Execute a `find` command with `client`.
        await client.db('test').collection('test').find().toArray();

        // 5. Assert that one failed command event and one successful command event occurred.
        expect(commandFailedEvents).to.have.lengthOf(1);
        expect(commandSucceededEvents).to.have.lengthOf(1);

        // 6. Assert that both events occurred on the same server.
        expect(commandFailedEvents[0].address).to.equal(commandSucceededEvents[0].address);
      });
    });

    describe('Retryable Reads Caused by Overload Errors Are Retried on Same Server When enableOverloadRetargeting is disabled', () => {
      let client: MongoClient;
      const commandFailedEvents: CommandFailedEvent[] = [];
      const commandSucceededEvents: CommandSucceededEvent[] = [];

      beforeEach(async function () {
        // 1. Create a client `client` with `retryReads=true`, `readPreference=primaryPreferred`, and command event monitoring
        //     enabled.
        client = this.configuration.newClient({
          retryReads: true,
          readPreference: 'primaryPreferred',
          monitorCommands: true
        });

        client.on('commandFailed', filterForCommands('find', commandFailedEvents));
        client.on('commandSucceeded', filterForCommands('find', commandSucceededEvents));

        await client.connect();

        /*
        * 2. Configure the following fail point for `client`:
            {
                configureFailPoint: "failCommand",
                mode: { times: 1 },
                data: {
                    failCommands: ["find"],
                    errorLabels: ["RetryableError", "SystemOverloadedError"]
                    errorCode: 6
                }
            }
        * */
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['find'],
            errorCode: 6,
            errorLabels: ['RetryableError', 'SystemOverloadedError']
          }
        });

        // 3. Reset the command event monitor to clear the failpoint command from its stored events.
        commandFailedEvents.length = 0;
        commandSucceededEvents.length = 0;
      });

      afterEach(async function () {
        await client?.db('admin').command({ configureFailPoint: 'failCommand', mode: 'off' });
        await client?.close();
      });

      it(
        'retries on the same server when SystemOverloadedError and enableOverloadRetargeting is disabled',
        TEST_METADATA,
        async () => {
          // 4. Execute a `find` command with `client`.
          await client.db('test').collection('test').find().toArray();

          // 5. Assert that one failed command event and one successful command event occurred.
          expect(commandFailedEvents).to.have.lengthOf(1);
          expect(commandSucceededEvents).to.have.lengthOf(1);

          // 6. Assert that both events occurred on the same server.
          expect(commandFailedEvents[0].address).to.equal(commandSucceededEvents[0].address);
        }
      );
    });
  });

  describe('4: Test that drivers set the maximum number of retries for all retryable read errors when an overload error is encountered', () => {
    // This test MUST be executed against a MongoDB 4.4+ server that supports `retryReads=true` and has enabled the
    // `configureFailPoint` command with the `errorLabels` option.

    const TEST_METADATA: MongoDBMetadataUI = {
      requires: { mongodb: '>=4.4' }
    };
    const APP_NAME = 'retryable-reads-prose-4';

    beforeEach(async function () {
      // 1. Create a client.
      client = this.configuration.newClient({
        monitorCommands: true,
        retryReads: true,
        appName: APP_NAME
      });
      await client.connect();
    });

    afterEach(async () => {
      await client
        ?.db('admin')
        .command({ configureFailPoint: 'failCommand', mode: 'off' })
        .catch(() => null);
    });

    it(
      'should retry MAX_RETRIES times for all retryable errors after encountering an overload error',
      TEST_METADATA,
      async () => {
        // 2. Configure a fail point with error code `91` (ShutdownInProgress) with the `RetryableError` and
        //     `SystemOverloadedError` error labels.
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['find'],
            errorLabels: ['RetryableError', 'SystemOverloadedError'],
            errorCode: 91,
            appName: APP_NAME
          }
        });

        // 3. Via the command monitoring CommandFailedEvent, configure a fail point with error code `91`
        //     (ShutdownInProgress) and the `RetryableError` label. Configure the second fail point command
        //     only if the failed event is for the first error configured in step 2.
        let secondFailpointConfigured = false;
        client.on('commandFailed', async (event: CommandFailedEvent) => {
          if (secondFailpointConfigured) return;
          if (event.commandName !== 'find') return;
          secondFailpointConfigured = true;
          await client.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['find'],
              errorLabels: ['RetryableError'],
              errorCode: 91,
              appName: APP_NAME
            }
          });
        });

        const findStartedEvents: Array<Record<string, any>> = [];
        client.on('commandStarted', ev => {
          if (ev.commandName === 'find') findStartedEvents.push(ev);
        });

        // 4. Attempt a `findOne` operation on any record for any database and collection. Expect the `findOne` to fail with a
        //     server error. Assert that `MAX_RETRIES + 1` attempts were made.
        const error = await client
          .db('test')
          .collection('test')
          .findOne({})
          .catch(e => e);

        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.code).to.equal(91);
        expect(error.hasErrorLabel(MongoErrorLabel.RetryableError)).to.be.true;
        // MAX_RETRIES + 1 (default maxAdaptiveRetries is 2).
        expect(findStartedEvents).to.have.lengthOf(3);

        // 5. Disable the fail point — handled by the surrounding afterEach.
      }
    );
  });

  describe('5: Test that drivers do not apply backoff to non-overload errors', () => {
    // This test MUST be executed against a MongoDB 4.4+ server that supports `retryReads=true` and has enabled the
    // `configureFailPoint` command with the `errorLabels` option.

    const TEST_METADATA: MongoDBMetadataUI = {
      requires: { mongodb: '>=4.4' }
    };
    const APP_NAME = 'retryable-reads-prose-5';

    beforeEach(async function () {
      // 1. Create a client.
      client = this.configuration.newClient({
        monitorCommands: true,
        retryReads: true,
        appName: APP_NAME
      });
      await client.connect();
    });

    afterEach(async () => {
      sinon.restore();
      await client
        ?.db('admin')
        .command({ configureFailPoint: 'failCommand', mode: 'off' })
        .catch(() => null);
    });

    it(
      'should apply backoff only once for the initial overload error and not for subsequent non-overload retryable errors',
      TEST_METADATA,
      async function () {
        // Spy on `timers/promises.setTimeout` — the only sleep on the retry path
        // (src/operations/execute_operation.ts:337) — to count how many times backoff was applied.
        // We use a spy (not a stub) so the real sleep still happens, giving the commandFailed
        // listener below time to configure the second failpoint before the driver dispatches its
        // next retry.
        const setTimeoutSpy = sinon.spy(timersPromises, 'setTimeout');

        // 2. Configure a fail point with error code `91` (ShutdownInProgress) with the `RetryableError` and
        //     `SystemOverloadedError` error labels.
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['find'],
            errorLabels: ['RetryableError', 'SystemOverloadedError'],
            errorCode: 91,
            appName: APP_NAME
          }
        });

        // 3. Via the command monitoring CommandFailedEvent, configure a fail point with error code `91`
        //     (ShutdownInProgress) and the `RetryableError` label. Configure the second fail point command
        //     only if the failed event is for the first error configured in step 2.
        let secondFailpointConfigured = false;
        client.on('commandFailed', async (event: CommandFailedEvent) => {
          if (secondFailpointConfigured) return;
          if (event.commandName !== 'find') return;
          secondFailpointConfigured = true;
          await client.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['find'],
              errorLabels: ['RetryableError'],
              errorCode: 91,
              appName: APP_NAME
            }
          });
        });

        const findStartedEvents: Array<Record<string, any>> = [];
        client.on('commandStarted', ev => {
          if (ev.commandName === 'find') findStartedEvents.push(ev);
        });

        // 4. Attempt a `findOne` operation on any record for any database and collection. Expect the `findOne` to fail with a
        //     server error. Assert that backoff was applied only once for the initial overload error and not for the subsequent
        //     non-overload retryable errors.
        const error = await client
          .db('test')
          .collection('test')
          .findOne({})
          .catch(e => e);

        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.code).to.equal(91);
        // MAX_RETRIES + 1 (default maxAdaptiveRetries is 2) — the full retry sequence ran.
        expect(findStartedEvents).to.have.lengthOf(3);
        // Backoff was applied exactly once — for the initial overload error only.
        expect(setTimeoutSpy.callCount).to.equal(1);

        // 5. Disable the fail point — handled by the surrounding afterEach.
      }
    );
  });
});
