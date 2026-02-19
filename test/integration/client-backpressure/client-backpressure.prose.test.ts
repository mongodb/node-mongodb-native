import { expect } from 'chai';
import * as sinon from 'sinon';

import { type Collection, type MongoClient, MongoServerError } from '../../../src';
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
});
