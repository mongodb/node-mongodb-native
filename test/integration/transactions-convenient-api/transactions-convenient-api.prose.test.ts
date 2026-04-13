import { expect } from 'chai';
import * as sinon from 'sinon';

import { type ClientSession, type Collection, type MongoClient, MongoError } from '../../mongodb';
import {
  clearFailPoint,
  configureFailPoint,
  type FailCommandFailPoint,
  measureDuration
} from '../../tools/utils';

// Callback Raises a Custom Error
// Write a callback that raises a custom exception or error that does not include either
// UnknownTransactionCommitResult or TransientTransactionError error labels. Execute this callback
// using withTransaction and assert that the callback's error bypasses any retry logic within
// withTransaction and is propagated to the caller of withTransaction.
describe('Callback Raises a Custom Error', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client?.close();
  });

  it(
    'callback error without retry labels is propagated to the caller of withTransaction',
    {
      requires: {
        mongodb: '>=4.4',
        topology: '!single'
      }
    },
    async function () {
      // 1. Write a callback that raises a custom error without UnknownTransactionCommitResult
      //    or TransientTransactionError error labels.
      const customError = new Error('My custom error');

      // 2. Execute this callback using withTransaction.
      const thrownError = await client
        .withSession(async session => {
          await session.withTransaction(async () => {
            throw customError;
          });
        })
        .catch(error => error);

      // 3. Assert that the callback's error bypasses any retry logic within withTransaction
      //    and is propagated to the caller of withTransaction.
      expect(thrownError).to.equal(customError);
    }
  );
});

// Callback Returns a Value
// Write a callback that returns a custom value (e.g. boolean, string, object). Execute this
// callback using withTransaction and assert that the callback's return value is propagated to
// the caller of withTransaction.
describe('Callback Returns a Value', function () {
  let client: MongoClient;
  let collection: Collection;

  beforeEach(async function () {
    client = this.configuration.newClient();
    collection = client.db('foo').collection('bar');
  });

  afterEach(async function () {
    await client?.close();
  });

  it(
    'callback return value is propagated to the caller of withTransaction',
    {
      requires: {
        mongodb: '>=4.4',
        topology: '!single'
      }
    },
    async function () {
      // 1. Write a callback that returns a custom value after performing an operation.
      const returnValue = { message: 'Foo' };

      // 2. Execute this callback using withTransaction.
      const result = await client.withSession(async session => {
        return session.withTransaction(async s => {
          await collection.insertOne({}, { session: s });
          return returnValue;
        });
      });

      // 3. Assert that the callback's return value is propagated to the caller of withTransaction.
      expect(result).to.equal(returnValue);
    }
  );
});

// Retry Timeout is Enforced
// Drivers should test that withTransaction enforces a non-configurable timeout before retrying
// both commits and entire transactions. Specifically, three cases should be checked.
//
// If possible, drivers should implement these tests without requiring the test runner to block for
// the full duration of the retry timeout. This might be done by internally modifying the timeout
// value used by withTransaction with some private API or using a mock timer.
//
// We stub performance.now() to simulate elapsed time exceeding the 120-second retry limit.
// Without CSOT, the original error is propagated directly.
// With CSOT, the error is wrapped in a MongoOperationTimeoutError.
describe('Retry Timeout is Enforced', function () {
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
  it(
    'callback TransientTransactionError propagated when retry timeout exceeded',
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

      // 3. Assert that the error is the original TransientTransactionError (propagated directly
      //    in the legacy non-CSOT path).
      expect(result).to.be.instanceOf(MongoError);
      expect((result as MongoError).hasErrorLabel('TransientTransactionError')).to.be.true;
    }
  );

  // Case 2: If committing raises an error with the UnknownTransactionCommitResult label, and the
  // retry timeout has been exceeded, withTransaction should propagate the error to its caller.
  it(
    'commit UnknownTransactionCommitResult propagated when retry timeout exceeded',
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

      // 3. Assert that the error is the original commit error (propagated directly
      //    in the legacy non-CSOT path).
      expect(result).to.be.instanceOf(MongoError);
      expect((result as MongoError).hasErrorLabel('UnknownTransactionCommitResult')).to.be.true;
    }
  );

  // Case 3: If committing raises an error with the TransientTransactionError label and the retry
  // timeout has been exceeded, withTransaction should propagate the error to its caller. This case
  // may occur if the commit was internally retried against a new primary after a failover and the
  // second primary returned a NoSuchTransaction error response.
  it(
    'commit TransientTransactionError propagated when retry timeout exceeded',
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

      // 3. Assert that the error is the original commit error (propagated directly
      //    in the legacy non-CSOT path).
      expect(result).to.be.instanceOf(MongoError);
      expect((result as MongoError).hasErrorLabel('TransientTransactionError')).to.be.true;
    }
  );
});

// Retry Backoff is Enforced
// Drivers should test that retries within withTransaction do not occur immediately.
describe('Retry Backoff is Enforced', function () {
  // 1. Let client be a MongoClient.
  let client: MongoClient;

  // 2. Let coll be a collection.
  let collection: Collection;

  const failCommand: FailCommandFailPoint = {
    configureFailPoint: 'failCommand',
    mode: { times: 13 },
    data: {
      failCommands: ['commitTransaction'],
      errorCode: 251 // NoSuchTransaction
    }
  };

  beforeEach(async function () {
    client = this.configuration.newClient();
    collection = client.db('foo').collection('bar');
  });

  afterEach(async function () {
    sinon.restore();
    await client?.close();
  });

  it(
    'retries within withTransaction apply exponential backoff with jitter',
    {
      requires: {
        mongodb: '>=4.4',
        topology: '!single'
      }
    },
    async function () {
      const randomStub = sinon.stub(Math, 'random');

      // 3. Run transactions without backoff:
      //    3.1 Configure the random number generator used for jitter to always return 0
      //        -- this effectively disables backoff.
      randomStub.returns(0);

      //    3.2 Configure a fail point that forces 13 retries.
      await configureFailPoint(this.configuration, failCommand);

      //    3.3 Define the callback for the transaction.
      const callback = async (s: ClientSession) => {
        await collection.insertOne({}, { session: s });
      };

      //    3.4 Let no_backoff_time be the duration of the withTransaction API call.
      const { duration: noBackoffTime } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(callback);
        });
      });

      // 4. Now run the command with backoff:
      //    4.1 Configure the random number generator used for jitter to always return
      //        a number as close as possible to 1.
      randomStub.returns(1);

      //    4.2 Configure a fail point that forces 13 retries like in step 3.2.
      await configureFailPoint(this.configuration, failCommand);

      //    4.3 Use the same callback defined in 3.3.
      //    4.4 Let with_backoff_time be the duration of the withTransaction API call.
      const { duration: fullBackoffDuration } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(callback);
        });
      });

      // 5. Compare the durations of the two runs.
      //    The sum of 13 backoffs is roughly 1.8 seconds. There is a half-second window to
      //    account for potential variance between the two runs.
      expect(fullBackoffDuration).to.be.within(
        noBackoffTime + 1800 - 500,
        noBackoffTime + 1800 + 500
      );
    }
  );
});
