/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { once } from 'node:events';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  type MongoClient,
  MongoError,
  MongoServerError,
  MongoWriteConcernError,
  Server
} from '../../mongodb';
import { sleep } from '../../tools/utils';

describe('Retryable Writes Spec Prose', () => {
  describe('1. Test that retryable writes raise an exception when using the MMAPv1 storage engine.', () => {
    let client: MongoClient;
    let failPointName: string | undefined;
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

    for (const testTopology of ['replicaset', 'sharded'] as const) {
      it(`should error with the correct error message when topology is ${testTopology}`, {
        metadata: { requires: { topology: [testTopology] } },
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

    let client: MongoClient;
    let failPointName: string | undefined;
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

  describe('3. Test that drivers return the original error after encountering a WriteConcernError with a RetryableWriteError label', () => {
    let client: MongoClient;
    let collection: Collection<{ _id: 1 }>;

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true, retryWrites: true });
      await client
        .db()
        .collection('retryReturnsOriginal')
        .drop()
        .catch(() => null);
      collection = client.db().collection('retryReturnsOriginal');
    });

    afterEach(async function () {
      sinon.restore();
      await client.close();
    });

    /**
     * This test MUST be implemented by any driver that implements the Command Monitoring specification,
     * only run against replica sets as mongos does not propagate the NoWritesPerformed label to the drivers.
     * Additionally, this test requires drivers to set a fail point after an insertOne operation but before the subsequent retry.
     * Drivers that are unable to set a failCommand after the CommandSucceededEvent SHOULD use mocking or write a unit test to cover the same sequence of events.
     *
     * Create a client with retryWrites=true.
     *
     * Configure a fail point with error code 91 (ShutdownInProgress):
     * ```js
     * db.adminCommand({
     *   configureFailPoint: 'failCommand',
     *   mode: { times: 1 },
     *   data: {
     *     writeConcernError: {
     *       code: 91,
     *       errorLabels: ['RetryableWriteError']
     *     },
     *     failCommands: ['insert']
     *   }
     * });
     * ```
     * Via the command monitoring CommandSucceededEvent, configure a fail point with error code 10107 (NotWritablePrimary) and a NoWritesPerformed label:
     *
     * ```js
     * db.adminCommand({
     *   configureFailPoint: 'failCommand',
     *   mode: { times: 1 },
     *   data: {
     *     errorCode: 10107,
     *     errorLabels: ['RetryableWriteError', 'NoWritesPerformed'],
     *     failCommands: ['insert']
     *   }
     * });
     * ```
     * Drivers SHOULD only configure the 10107 fail point command if the the succeeded event is for the 91 error configured in step 2.
     *
     * Attempt an insertOne operation on any record for any database and collection. For the resulting error, assert that the associated error code is 91.
     */
    it(
      'when a retry attempt fails with an error labeled NoWritesPerformed, drivers MUST return the original error',
      { requires: { topology: 'replicaset', mongodb: '>=4.2.9' } },
      async () => {
        const serverCommandStub = sinon.stub(Server.prototype, 'command');
        serverCommandStub.onCall(0).rejects(
          new MongoWriteConcernError({
            errorLabels: ['RetryableWriteError'],
            writeConcernError: { errmsg: 'ShutdownInProgress error', code: 91 },
            ok: 1
          })
        );
        serverCommandStub.onCall(1).returns(
          Promise.reject(
            new MongoWriteConcernError({
              errorLabels: ['RetryableWriteError', 'NoWritesPerformed'],
              writeConcernError: { errmsg: 'NotWritablePrimary error', errorCode: 10107 }
            })
          )
        );

        const insertResult = await collection.insertOne({ _id: 1 }).catch(error => error);
        sinon.restore();

        expect(insertResult).to.be.instanceOf(MongoServerError);
        expect(insertResult).to.have.property('code', 91);
      }
    );

    // This is an extra test that is a complimentary test to prose test #3. We basically want to
    // test that in the case of a write concern error with ok: 1 in the response, that
    // a command succeeded event is emitted but that the driver still treats it as a failure
    // and retries. So for the success, we check the error code if exists, and since the retry
    // must succeed, we fail if any command failed event occurs on insert.
    it(
      'emits a command succeeded event for write concern errors with ok: 1',
      { requires: { topology: 'replicaset', mongodb: '>=4.2.9' } },
      async () => {
        // Generate a write concern error to assert that we get a command
        // suceeded event but the operation will retry because it was an
        // actual write concern error.
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            writeConcernError: {
              code: 91,
              errorLabels: ['RetryableWriteError']
            },
            failCommands: ['insert']
          }
        });

        const willBeCommandSucceeded = once(client, 'commandSucceeded').catch(error => error);
        const willBeCommandFailed = Promise.race([
          once(client, 'commandFailed'),
          sleep(1000).then(() => Promise.reject(new Error('timeout')))
        ]).catch(error => error);

        const insertResult = await collection.insertOne({ _id: 1 }).catch(error => error);

        const [commandSucceeded] = await willBeCommandSucceeded;
        expect(commandSucceeded.commandName).to.equal('insert');
        expect(commandSucceeded.reply).to.have.nested.property('writeConcernError.code', 91);
        const noCommandFailedEvent = await willBeCommandFailed;
        expect(
          noCommandFailedEvent.message,
          'expected timeout, since no failure event should emit'
        ).to.equal('timeout');
        expect(insertResult).to.deep.equal({ acknowledged: true, insertedId: 1 });
      }
    );
  });
});
