import { expect } from 'chai';
import { test } from 'mocha';
import * as sinon from 'sinon';

import { type ClientSession, type Collection, type MongoClient } from '../../../src';
import { configureFailPoint, type FailCommandFailPoint, measureDuration } from '../../tools/utils';

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
