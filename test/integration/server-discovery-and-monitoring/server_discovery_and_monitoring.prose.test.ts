import { expect } from 'chai';
import { once } from 'events';

import { MongoClient } from '../../../src';
import {
  CONNECTION_POOL_CLEARED,
  CONNECTION_POOL_READY,
  SERVER_HEARTBEAT_FAILED,
  SERVER_HEARTBEAT_SUCCEEDED
} from '../../../src/constants';

describe('Server Discovery and Monitoring Prose Tests', function () {
  context('Connection Pool Management', function () {
    /* 
      This test will be used to ensure monitors properly create and unpause connection pools when they discover servers.
      This test requires failCommand appName support which is only available in MongoDB 4.2.9+.
      1. Create a client with directConnection=true, appName="SDAMPoolManagementTest", and heartbeatFrequencyMS=500 (or lower if possible).
      2. Verify via SDAM and CMAP event monitoring that a ConnectionPoolReadyEvent occurs after the first ServerHeartbeatSucceededEvent event does.
      3. Enable the following failpoint:
          {
              configureFailPoint: "failCommand",
              mode: { times: 2 },
              data: {
                  failCommands: ["hello"], // or legacy hello command
                  errorCode: 1234,
                  appName: "SDAMPoolManagementTest"
              }
          }
      4. Verify that a ServerHeartbeatFailedEvent and a ConnectionPoolClearedEvent (CMAP) are emitted.
      5. Then verify that a ServerHeartbeatSucceededEvent and a ConnectionPoolReadyEvent (CMAP) are emitted.
      6. Disable the failpoint.
    */

    let client: MongoClient;
    const events: string[] = [];
    beforeEach(async function () {
      client = this.configuration.newClient({
        directConnection: true,
        appName: 'SDAMPoolManagementTest',
        heartbeatFrequencyMS: 500
      });

      for (const event of [
        CONNECTION_POOL_READY,
        SERVER_HEARTBEAT_SUCCEEDED,
        SERVER_HEARTBEAT_FAILED,
        CONNECTION_POOL_CLEARED
      ]) {
        client.on(event, () => {
          events.push(event);
        });
      }
    });

    afterEach(async function () {
      await client.db('admin').command({
        configureFailPoint: 'failCommand',
        mode: 'off',
        data: {
          failCommands: ['hello'],
          errorCode: 1234,
          appName: 'SDAMPoolManagementTest'
        }
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('ensure monitors properly create and unpause connection pools when they discover servers', {
      metadata: { requires: { mongodb: '>=4.2.9', topology: '!load-balanced' } },
      test: async function () {
        await client.connect();
        expect(events.shift()).to.equal(SERVER_HEARTBEAT_SUCCEEDED);
        expect(events.shift()).to.equal(CONNECTION_POOL_READY);

        expect(events).to.be.empty;

        const heartBeatFailedEvent = once(client, SERVER_HEARTBEAT_FAILED);
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 2 },
          data: {
            failCommands: ['hello'],
            errorCode: 1234,
            appName: 'SDAMPoolManagementTest'
          }
        });
        await heartBeatFailedEvent;
        expect(events.shift()).to.equal(SERVER_HEARTBEAT_FAILED);
        expect(events.shift()).to.equal(CONNECTION_POOL_CLEARED);

        expect(events).to.be.empty;

        await once(client, SERVER_HEARTBEAT_SUCCEEDED);
        expect(events.shift()).to.equal(SERVER_HEARTBEAT_SUCCEEDED);
        expect(events.shift()).to.equal(CONNECTION_POOL_READY);

        expect(events).to.be.empty;
      }
    });
  });
});
