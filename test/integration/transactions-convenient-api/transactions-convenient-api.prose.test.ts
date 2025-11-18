import { expect } from 'chai';
import { test } from 'mocha';
import * as sinon from 'sinon';

import { type MongoClient } from '../../../src';
import { configureFailPoint, type FailCommandFailPoint, measureDuration } from '../../tools/utils';

const failCommand: FailCommandFailPoint = {
  configureFailPoint: 'failCommand',
  mode: {
    times: 13
  },
  data: {
    failCommands: ['commitTransaction'],
    errorCode: 251
  }
};

describe('Retry Backoff is Enforced', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
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

      randomStub.returns(0);

      await configureFailPoint(this.configuration, failCommand);

      const { duration: noBackoffTime } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(async s => {
            await client.db('foo').collection('bar').insertOne({ name: 'bailey' }, { session: s });
          });
        });
      });

      randomStub.returns(1);

      await configureFailPoint(this.configuration, failCommand);

      const { duration: fullBackoffDuration } = await measureDuration(() => {
        return client.withSession(async s => {
          await s.withTransaction(async s => {
            await client.db('foo').collection('bar').insertOne({ name: 'bailey' }, { session: s });
          });
        });
      });

      expect(fullBackoffDuration).to.be.within(
        noBackoffTime + 2200 - 1000,
        noBackoffTime + 2200 + 1000
      );
    }
  );
});
