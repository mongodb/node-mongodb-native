import { expect } from 'chai';
import * as sinon from 'sinon';

import { type MongoClient, MongoServerError } from '../../mongodb';
import { clearFailPoint, configureFailPoint, measureDuration } from '../../tools/utils';
import { filterForCommands } from '../shared';

describe('Client Backpressure (Prose)', function () {
  let client: MongoClient;

  afterEach(async function () {
    sinon.restore();
    await client.close();
    client = undefined;
    await clearFailPoint(this.configuration);
  });

  it(
    'Test 1: Operation Retry Uses Exponential Backoff',
    {
      requires: {
        mongodb: '>=4.4'
      }
    },
    async function () {
      // 1. Let `client` be a `MongoClient`
      client = this.configuration.newClient();
      await client.connect();

      // 2. Let `collection` be a collection
      const collection = client.db('foo').collection('bar');

      // 3. Now, run transactions without backoff:
      //    i. Configure the random number generator used for jitter to always return `0`
      const stub = sinon.stub(Math, 'random');
      stub.returns(0);

      //    ii. Configure the following failPoint:
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          failCommands: ['insert'],
          errorCode: 2,
          errorLabels: ['SystemOverloadedError', 'RetryableError']
        }
      });

      //    iii. Insert the document `{ a: 1 }`. Expect that the command errors.
      const { duration: durationNoBackoff } = await measureDuration(async () => {
        const error = await collection.insertOne({ a: 1 }).catch(e => e);
        expect(error).to.be.instanceof(MongoServerError);
      });

      //    iv. Configure the random number generator used for jitter to always return a number as close as possible to `1`.
      stub.returns(0.99);

      //    v. Execute step iii again.
      const { duration: durationBackoff } = await measureDuration(async () => {
        const error = await collection.insertOne({ a: 1 }).catch(e => e);
        expect(error).to.be.instanceof(MongoServerError);
      });

      //    vi. Compare the time between the two runs.
      //        The sum of 2 backoffs is 0.3 seconds. There is a 0.3-second window to account for potential variance.
      expect(durationBackoff - durationNoBackoff).to.be.within(300 - 300, 300 + 300);
    }
  );

  it(
    'Test 3: Overload Errors are Retried a Maximum of MAX_RETRIES times',
    {
      requires: {
        mongodb: '>=4.4'
      }
    },
    async function () {
      // 1. Let `client` be a `MongoClient` with command event monitoring enabled.
      client = this.configuration.newClient({
        monitorCommands: true
      });
      await client.connect();

      // 2. Let `coll` be a collection.
      const collection = client.db('foo').collection('bar');
      const commandsStarted = [];
      client.on('commandStarted', filterForCommands(['find'], commandsStarted));

      // 3. Configure the following failpoint:
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          failCommands: ['find'],
          errorCode: 462,
          errorLabels: ['RetryableError', 'SystemOverloadedError']
        }
      });

      // 4. Perform a find operation with `coll` that fails.
      const error = await collection.findOne({}).catch(e => e);

      // 5. Assert that the raised error contains both the `RetryableError` and `SystemOverloadedError` error labels.
      expect(error).to.be.instanceof(MongoServerError);
      expect(error.hasErrorLabel('RetryableError')).to.be.true;
      expect(error.hasErrorLabel('SystemOverloadedError')).to.be.true;

      // 6. Assert that the total number of started commands is MAX_RETRIES + 1 (3).
      expect(commandsStarted).to.have.length(3);
    }
  );

  it(
    'Test 4: Overload Errors are Retried a Maximum of maxAdaptiveRetries times when configured',
    {
      requires: {
        mongodb: '>=4.4'
      }
    },
    async function () {
      // 1. Let `client` be a `MongoClient` with `maxAdaptiveRetries=1` and command event monitoring enabled.
      client = this.configuration.newClient({
        maxAdaptiveRetries: 1,
        monitorCommands: true
      });
      await client.connect();

      // 2. Let `coll` be a collection.
      const collection = client.db('foo').collection('bar');
      const commandsStarted = [];
      client.on('commandStarted', filterForCommands(['find'], commandsStarted));

      // 3. Configure the following failpoint:
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          failCommands: ['find'],
          errorCode: 462,
          errorLabels: ['RetryableError', 'SystemOverloadedError']
        }
      });

      // 4. Perform a find operation with `coll` that fails.
      const error = await collection.findOne({}).catch(e => e);

      // 5. Assert that the raised error contains both the `RetryableError` and `SystemOverloadedError` error labels.
      expect(error).to.be.instanceof(MongoServerError);
      expect(error.hasErrorLabel('RetryableError')).to.be.true;
      expect(error.hasErrorLabel('SystemOverloadedError')).to.be.true;

      // 6. Assert that the total number of started commands is `maxAdaptiveRetries` + 1 (2).
      expect(commandsStarted).to.have.length(2);
    }
  );
});
