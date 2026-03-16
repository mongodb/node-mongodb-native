import { expect } from 'chai';
import { test } from 'mocha';
import * as sinon from 'sinon';

import {
  type ClientSession,
  type Collection,
  type MongoClient,
  MongoOperationTimeoutError
} from '../../mongodb';
import {
  clearFailPoint,
  configureFailPoint,
  type FailCommandFailPoint,
  measureDuration
} from '../../tools/utils';

const failCommand: FailCommandFailPoint = {
  configureFailPoint: 'failCommand',
  mode: {
    times: 13
  },
  data: {
    failCommands: ['commitTransaction'],
    errorCode: 251 // no such transaction
  }
};

describe('Retry Backoff is Enforced', function () {
  // 1. let client be a MongoClient
  let client: MongoClient;

  // 2. let coll be a collection
  let collection: Collection;

  beforeEach(async function () {
    client = this.configuration.newClient();
    collection = client.db('foo').collection('bar');
  });

  afterEach(async function () {
    sinon.restore();
    await client?.close();
  });

  test(
    'works',
    {
      requires: {
        mongodb: '>=4.4', // failCommand
        topology: '!single' // transactions can't run on standalone servers
      }
    },
    async function () {
      const randomStub = sinon.stub(Math, 'random');

      // 3.i Configure the random number generator used for jitter to always return 0
      randomStub.returns(0);

      // 3.ii Configure a fail point that forces 13 retries
      await configureFailPoint(this.configuration, failCommand);

      // 3.iii
      const callback = async (s: ClientSession) => {
        await collection.insertOne({}, { session: s });
      };

      // 3.iv Let no_backoff_time be the duration of the withTransaction API call
      const { duration: noBackoffTime } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(callback);
        });
      });

      // 4.i Configure the random number generator used for jitter to always return 1.
      randomStub.returns(1);

      // 4.ii Configure a fail point that forces 13 retries like in step 3.2.
      await configureFailPoint(this.configuration, failCommand);

      // 4.iii Use the same callback defined in 3.3.
      // 4.iv Let with_backoff_time be the duration of the withTransaction API call
      const { duration: fullBackoffDuration } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(callback);
        });
      });

      // 5. Compare the two time between the two runs.
      // The sum of 13 backoffs is roughly 1.8 seconds. There is a half-second window to account for potential variance between the two runs.
      expect(fullBackoffDuration).to.be.within(
        noBackoffTime + 1800 - 500,
        noBackoffTime + 1800 + 500
      );
    }
  );
});

describe('Retry Timeout is Enforced', function () {
  // Drivers should test that withTransaction enforces a non-configurable timeout before retrying
  // both commits and entire transactions.
  //
  // We stub performance.now() to simulate elapsed time exceeding the 120-second retry limit,
  // as recommended by the spec: "This might be done by internally modifying the timeout value
  // used by withTransaction with some private API or using a mock timer."
  //
  // The error SHOULD be propagated as a timeout error if the language allows to expose the
  // underlying error as a cause of a timeout error.

  let client: MongoClient;
  let collection: Collection;
  let timeOffset: number;

  beforeEach(async function () {
    client = this.configuration.newClient();
    collection = client.db('foo').collection('bar');

    timeOffset = 0;
    const originalNow = performance.now.bind(performance);
    sinon.stub(performance, 'now').callsFake(() => originalNow() + timeOffset);
  });

  afterEach(async function () {
    sinon.restore();
    await clearFailPoint(this.configuration);
    await client?.close();
  });

  // Case 1: If the callback raises an error with the TransientTransactionError label and the retry
  // timeout has been exceeded, withTransaction should propagate the error to its caller.
  test(
    'callback TransientTransactionError propagated as timeout error when retry timeout exceeded',
    {
      requires: {
        mongodb: '>=4.4',
        topology: '!single'
      }
    },
    async function () {
      // 1. Configure a failpoint that fails insert with TransientTransactionError.
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['insert'],
          errorCode: 24,
          errorLabels: ['TransientTransactionError']
        }
      });

      // 2. Run withTransaction. The callback advances the clock past the 120-second retry
      //    limit before the insert fails, so the timeout is detected immediately.
      const { result } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(async session => {
            timeOffset = 120_000;
            await collection.insertOne({}, { session });
          });
        });
      });

      // 3. Assert that the error is a timeout error wrapping the TransientTransactionError.
      expect(result).to.be.instanceOf(MongoOperationTimeoutError);
      expect((result as MongoOperationTimeoutError).cause).to.be.an('error');
    }
  );

  // Case 2: If committing raises an error with the UnknownTransactionCommitResult label, and the
  // retry timeout has been exceeded, withTransaction should propagate the error to
  // its caller.
  test(
    'commit UnknownTransactionCommitResult propagated as timeout error when retry timeout exceeded',
    {
      requires: {
        mongodb: '>=4.4',
        topology: '!single'
      }
    },
    async function () {
      // 1. Configure a failpoint that fails commitTransaction with UnknownTransactionCommitResult.
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['commitTransaction'],
          errorCode: 64,
          errorLabels: ['UnknownTransactionCommitResult']
        }
      });

      // 2. Run withTransaction. The callback advances the clock past the 120-second retry
      //    limit. The insert succeeds, but the commit fails and the timeout is detected.
      const { result } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(async session => {
            timeOffset = 120_000;
            await collection.insertOne({}, { session });
          });
        });
      });

      // 3. Assert that the error is a timeout error wrapping the commit error.
      expect(result).to.be.instanceOf(MongoOperationTimeoutError);
      expect((result as MongoOperationTimeoutError).cause).to.be.an('error');
    }
  );

  // Case 3: If committing raises an error with the TransientTransactionError label and the retry
  // timeout has been exceeded, withTransaction should propagate the error to its
  // caller. This case may occur if the commit was internally retried against a new primary after a
  // failover and the second primary returned a NoSuchTransaction error response.
  test(
    'commit TransientTransactionError propagated as timeout error when retry timeout exceeded',
    {
      requires: {
        mongodb: '>=4.4',
        topology: '!single'
      }
    },
    async function () {
      // 1. Configure a failpoint that fails commitTransaction with TransientTransactionError
      //    (errorCode 251 = NoSuchTransaction).
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['commitTransaction'],
          errorCode: 251,
          errorLabels: ['TransientTransactionError']
        }
      });

      // 2. Run withTransaction. The callback advances the clock past the 120-second retry
      //    limit. The insert succeeds, but the commit fails and the timeout is detected.
      const { result } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(async session => {
            timeOffset = 120_000;
            await collection.insertOne({}, { session });
          });
        });
      });

      // 3. Assert that the error is a timeout error wrapping the TransientTransactionError.
      expect(result).to.be.instanceOf(MongoOperationTimeoutError);
      expect((result as MongoOperationTimeoutError).cause).to.be.an('error');
    }
  );
});
