import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  INITIAL_TOKEN_BUCKET_SIZE,
  type MongoClient,
  MongoServerError
} from '../../mongodb';
import { clearFailPoint, configureFailPoint, measureDuration } from '../../tools/utils';

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

      stub.returns(1);

      const { duration: durationBackoff } = await measureDuration(async () => {
        const error = await collection.insertOne({ a: 1 }).catch(e => e);
        expect(error).to.be.instanceof(MongoServerError);
      });

      expect(durationBackoff - durationNoBackoff).to.be.within(3100 - 1000, 3100 + 1000);
    }
  );

  it('Test 2: Token Bucket capacity is Enforced', async () => {
    // 1-2. Assert that the client's retry token bucket is at full capacity and that the capacity
    // is DEFAULT_RETRY_TOKEN_CAPACITY.
    const tokenBucket = client.topology.tokenBucket;
    expect(tokenBucket).to.have.property('budget', INITIAL_TOKEN_BUCKET_SIZE);
    expect(tokenBucket).to.have.property('capacity', INITIAL_TOKEN_BUCKET_SIZE);

    // 3. Execute a successful ping command.
    await client.db('admin').command({ ping: 1 });

    // 4. Assert that the successful command did not increase the number of tokens in the bucket
    // above DEFAULT_RETRY_TOKEN_CAPACITY.
    expect(tokenBucket).to.have.property('budget').that.is.at.most(INITIAL_TOKEN_BUCKET_SIZE);
  });
});
