import { expect } from 'chai';
import { test } from 'mocha';

import { type CommandFailedEvent, type MongoClient } from '../../mongodb';
import { configureFailPoint } from '../../tools/utils';
import { filterForCommands } from '../shared';

const COMMIT_FAIL_TIMES = 35;

describe('Retry Backoff is Enforced', function () {
  // Drivers should test that retries within `withTransaction` do not occur immediately. Optionally, set BACKOFF_INITIAL to a
  // higher value to decrease flakiness of this test. Configure a fail point that forces 30 retries. Check that the total
  // time for all retries exceeded 1.25 seconds.

  let client: MongoClient;
  let failures: Array<CommandFailedEvent>;

  beforeEach(async function () {
    client = this.configuration.newClient({}, { monitorCommands: true });

    failures = [];
    client.on('commandFailed', filterForCommands('commitTransaction', failures));

    await client.connect();

    await configureFailPoint(this.configuration, {
      configureFailPoint: 'failCommand',
      mode: {
        times: COMMIT_FAIL_TIMES
      },
      data: {
        failCommands: ['commitTransaction'],
        errorCode: 24
      }
    });
  });

  afterEach(async function () {
    await client?.close();
  });

  for (let i = 0; i < 250; ++i) {
    test.only(
      'works' + i,
      {
        requires: {
          mongodb: '>=4.4', // failCommand
          topology: '!single' // transactions can't run on standalone servers
        }
      },
      async function () {
        const start = performance.now();

        await client.withSession(async s => {
          await s.withTransaction(async s => {
            await client.db('foo').collection('bar').insertOne({ name: 'bailey' }, { session: s });
          });
        });

        const end = performance.now();

        expect(failures).to.have.lengthOf(COMMIT_FAIL_TIMES);

        expect(end - start).to.be.greaterThan(1250);
      }
    );
  }
});
