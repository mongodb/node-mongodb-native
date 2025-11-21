import { expect } from 'chai';
import { once } from 'events';

import {
  type ConnectionCheckOutFailedEvent,
  type ConnectionPoolClearedEvent,
  type MongoClient
} from '../../../src';
import {
  CONNECTION_POOL_CLEARED,
  CONNECTION_POOL_READY,
  SERVER_HEARTBEAT_FAILED,
  SERVER_HEARTBEAT_SUCCEEDED
} from '../../../src/constants';
import { sleep } from '../../tools/utils';

describe('Server Discovery and Monitoring Prose Tests', function () {
  context('Monitors sleep at least minHeartbeatFrequencyMS between checks', function () {
    /*
      This test will be used to ensure monitors sleep for an appropriate amount of time between failed server checks
      so as to not flood the server with new connection creations.

      This test requires MongoDB 4.9.0+.

      1. Enable the following failpoint:
          {
              configureFailPoint: "failCommand",
              mode: { times: 5 },
              data: {
                  failCommands: ["hello"], // or legacy hello command
                  errorCode: 1234,
                  appName: "SDAMMinHeartbeatFrequencyTest"
              }
          }
      2. Create a client with directConnection=true, appName="SDAMMinHeartbeatFrequencyTest", and serverSelectionTimeoutMS=5000.
      3. Start a timer.
      4. Execute a ping command.
      5. Stop the timer. Assert that the ping took between 2 seconds and 3.5 seconds to complete.
    */

    let client: MongoClient;
    beforeEach(async function () {
      const utilClient = this.configuration.newClient({ directConnection: true });

      // 1.
      await utilClient.db('admin').command({
        configureFailPoint: 'failCommand',
        mode: { times: 5 },
        data: {
          failCommands: ['hello', 'ismaster'],
          errorCode: 1234,
          appName: 'SDAMMinHeartbeatFrequencyTest'
        }
      });
      await utilClient.close();

      // 2.
      client = this.configuration.newClient({
        directConnection: true,
        appName: 'SDAMMinHeartbeatFrequencyTest',
        serverSelectionTimeoutMS: 5000
      });
    });

    afterEach(async function () {
      await client.db('admin').command({
        configureFailPoint: 'failCommand',
        mode: 'off',
        data: {
          failCommands: ['hello', 'ismaster'],
          errorCode: 1234,
          appName: 'SDAMMinHeartbeatFrequencyTest'
        }
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('ensure monitors sleep for an appropriate amount of time between pings', {
      metadata: { requires: { mongodb: '>=4.9.0', topology: '!load-balanced' } },
      test: async function () {
        // 3.
        const startTime = Date.now();
        // 4.
        await client.db().command({ ping: 1 });
        // 5.
        const timeTaken = Date.now() - startTime;
        const secondsTaken = timeTaken / 1000;
        expect(secondsTaken).to.be.within(2, 3.5);
      }
    });
  });

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
    let utilClient: MongoClient;
    const events: string[] = [];
    beforeEach(async function () {
      client = this.configuration.newClient({
        directConnection: true,
        appName: 'SDAMPoolManagementTest',
        heartbeatFrequencyMS: 100
      });
      utilClient = this.configuration.newClient({ directConnection: true });

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
      await utilClient.close();
    });

    it('ensure monitors properly create and unpause connection pools when they discover servers', {
      metadata: { requires: { mongodb: '>=4.2.9', topology: '!load-balanced' } },
      test: async function () {
        await client.connect();
        expect(events.shift()).to.equal(SERVER_HEARTBEAT_SUCCEEDED);
        expect(events.shift()).to.equal(CONNECTION_POOL_READY);

        expect(events).to.be.empty;

        const heartBeatFailedEvent = once(client, SERVER_HEARTBEAT_FAILED);
        await utilClient.db('admin').command({
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
        // In rare cases when using the stable API, an extra server heartbeat failed event may sneak in.
        // The test just needs to assert that at some point we have another server heartbeat suceeded
        // event followed by a connection pool ready event.
        const filteredEvents = events.filter(event => event !== SERVER_HEARTBEAT_FAILED);
        expect(filteredEvents.shift()).to.equal(SERVER_HEARTBEAT_SUCCEEDED);
        expect(filteredEvents.shift()).to.equal(CONNECTION_POOL_READY);

        expect(filteredEvents).to.be.empty;
      }
    });
  });

  context('Connection Pool Backpressure', function () {
    let client: MongoClient;
    const checkoutFailedEvents: Array<ConnectionCheckOutFailedEvent> = [];
    const poolClearedEvents: Array<ConnectionPoolClearedEvent> = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { maxConnecting: 100 });

      client.on('connectionCheckOutFailed', e => checkoutFailedEvents.push(e));
      client.on('connectionPoolCleared', e => poolClearedEvents.push(e));

      await client.connect();

      const admin = client.db('admin').admin();
      await admin.command({
        setParameter: 1,
        ingressConnectionEstablishmentRateLimiterEnabled: true
      });
      await admin.command({
        setParameter: 1,
        ingressConnectionEstablishmentRatePerSec: 20
      });
      await admin.command({
        setParameter: 1,
        ingressConnectionEstablishmentBurstCapacitySecs: 1
      });
      await admin.command({
        setParameter: 1,
        ingressConnectionEstablishmentMaxQueueDepth: 1
      });

      await client.db('test').collection('test').insertOne({});
    });

    afterEach(async function () {
      // give the time to recover from the connection storm before cleaning up.
      await sleep(1000);

      const admin = client.db('admin').admin();
      await admin.command({
        setParameter: 1,
        ingressConnectionEstablishmentRateLimiterEnabled: false
      });

      await client.close();
    });

    it(
      'does not clear the pool when connections are closed due to connection storms',
      {
        requires: {
          mongodb: '>=7.0' // rate limiting added in 7.0
        }
      },
      async function () {
        await Promise.allSettled(
          Array.from({ length: 100 }).map(() =>
            client
              .db('test')
              .collection('test')
              .findOne({ $where: 'function() { sleep(2000); return true; }' })
          )
        );

        expect(poolClearedEvents).to.be.empty;
        expect(checkoutFailedEvents.length).to.be.greaterThan(10);
      }
    );
  });
});
