import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  INITIAL_TOKEN_BUCKET_SIZE,
  MAX_RETRIES,
  type MongoClient,
  MongoServerError
} from '../../mongodb';
import { clearFailPoint, configureFailPoint, measureDuration } from '../../tools/utils';
import { filterForCommands } from '../shared';

describe('Client Backpressure (Prose)', function () {
  let client: MongoClient;
  let collection: Collection;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();

    collection = client.db('foo').collection('bar');
  });

  afterEach(async function () {
    sinon.restore();
    await client.close();
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
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          failCommands: ['insert'],
          errorCode: 2,
          errorLabels: ['SystemOverloadedError', 'RetryableError']
        }
      });

      const stub = sinon.stub(Math, 'random');

      stub.returns(0);

      const { duration: durationNoBackoff } = await measureDuration(async () => {
        const error = await collection.insertOne({ a: 1 }).catch(e => e);
        expect(error).to.be.instanceof(MongoServerError);
      });

      stub.returns(0.99);

      const { duration: durationBackoff } = await measureDuration(async () => {
        const error = await collection.insertOne({ a: 1 }).catch(e => e);
        expect(error).to.be.instanceof(MongoServerError);
      });

      expect(durationBackoff - durationNoBackoff).to.be.within(3100 - 1000, 3100 + 1000);
    }
  );

  it('Test 2: Token Bucket capacity is Enforced', async function () {
    // 1. Let client be a MongoClient with adaptiveRetries=True.
    const client = this.configuration.newClient({
      adaptiveRetries: true
    });
    await client.connect();

    // 2. Assert that the client's retry token bucket is at full capacity and that the capacity is DEFAULT_RETRY_TOKEN_CAPACITY.
    const tokenBucket = client.topology.tokenBucket;
    expect(tokenBucket).to.have.property('budget', INITIAL_TOKEN_BUCKET_SIZE);
    expect(tokenBucket).to.have.property('capacity', INITIAL_TOKEN_BUCKET_SIZE);

    // 3. Using client, execute a successful ping command.
    await client.db('admin').command({ ping: 1 });

    // 4. Assert that the successful command did not increase the number of tokens in the bucket above DEFAULT_RETRY_TOKEN_CAPACITY.
    expect(tokenBucket).to.have.property('budget').that.is.at.most(INITIAL_TOKEN_BUCKET_SIZE);

    await client.close();
  });

  it(
    'Test 3: Overload Errors are Retried a Maximum of MAX_RETRIES times',
    {
      requires: {
        mongodb: '>=4.4'
      }
    },
    async function () {
      // 1. Let `client` be a `MongoClient` with command event monitoring enabled.
      const client = this.configuration.newClient({
        monitorCommands: true
      });
      await client.connect();

      // 2. Let `coll` be a collection.
      const collection = client.db('foo').collection('bar');
      const commandsStarted = [];
      client.on('commandStarted', filterForCommands(['find'], commandsStarted));

      /*
      * 3. Configure the following failpoint:
          {
              configureFailPoint: 'failCommand',
              mode: 'alwaysOn',
              data: {
                  failCommands: ['find'],
                  errorCode: 462,  // IngressRequestRateLimitExceeded
                  errorLabels: ['SystemOverloadedError', 'RetryableError']
              }
          }
      * */
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

      // 6. Assert that the total number of started commands is MAX_RETRIES + 1 (6).
      expect(commandsStarted).to.have.length(MAX_RETRIES + 1);

      await client.close();
    }
  );

  it(
    'Test 4: Adaptive Retries are Limited by Token Bucket Tokens',
    {
      requires: {
        mongodb: '>=4.4'
      }
    },
    async function () {
      // 1. Let `client` be a `MongoClient` with `adaptiveRetries=True` and command event monitoring enabled.
      const client = this.configuration.newClient({
        adaptiveRetries: true,
        monitorCommands: true
      });
      await client.connect();

      // 2. Set `client`'s retry token bucket to have 2 tokens.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      client.topology!.tokenBucket['budget'] = 2;

      // 3. Let `coll` be a collection.
      const collection = client.db('foo').collection('bar');
      const commandsStarted = [];
      client.on('commandStarted', filterForCommands(['find'], commandsStarted));

      /*
      * 4. Configure the following failpoint:
          {
              configureFailPoint: 'failCommand',
              mode: {times: 3},
              data: {
                  failCommands: ['find'],
                  errorCode: 462,  // IngressRequestRateLimitExceeded
                  errorLabels: ['SystemOverloadedError', 'RetryableError']
              }
          }
      * */
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 3 },
        data: {
          failCommands: ['find'],
          errorCode: 462,
          errorLabels: ['RetryableError', 'SystemOverloadedError']
        }
      });

      // 5. Perform a find operation with `coll` that fails.
      const error = await collection.findOne({}).catch(e => e);

      // 6. Assert that the raised error contains both the `RetryableError` and `SystemOverloadedError` error labels.
      expect(error).to.be.instanceof(MongoServerError);
      expect(error.hasErrorLabel('RetryableError')).to.be.true;
      expect(error.hasErrorLabel('SystemOverloadedError')).to.be.true;

      // 7. Assert that the total number of started commands is 3: one for the initial attempt and two for the retries.
      expect(commandsStarted).to.have.length(3);

      await client.close();
    }
  );
});
