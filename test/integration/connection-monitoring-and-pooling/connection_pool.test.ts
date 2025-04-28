import { once } from 'node:events';

import { expect } from 'chai';

import {
  type ConnectionCheckedInEvent,
  type ConnectionCheckedOutEvent,
  type ConnectionPoolCreatedEvent,
  type Db,
  type MongoClient
} from '../../mongodb';
import { clearFailPoint, configureFailPoint, sleep } from '../../tools/utils';

describe('Connection Pool', function () {
  let client: MongoClient;
  let db: Db;

  afterEach(async function () {
    if (client) {
      if (db) {
        await db.dropDatabase();
      }
      await client.close();
    }
  });

  describe('Events', function () {
    describe('ConnectionPoolCreatedEvent', function () {
      context('when no connection pool options are passed in', function () {
        let pConnectionPoolCreated: Promise<ConnectionPoolCreatedEvent[]>;
        let connectionPoolCreated: ConnectionPoolCreatedEvent;
        beforeEach(async function () {
          client = this.configuration.newClient({}, {});
          pConnectionPoolCreated = once(client, 'connectionPoolCreated');
          await client.connect();

          connectionPoolCreated = (await pConnectionPoolCreated)[0];
        });

        it('the options field matches the default options', function () {
          expect(connectionPoolCreated).to.have.deep.property('options', {
            waitQueueTimeoutMS: 0,
            maxIdleTimeMS: 0,
            maxConnecting: 2,
            minPoolSize: 0,
            maxPoolSize: 100
          });
        });
      });

      context('when valid non-default connection pool options are passed in', function () {
        let pConnectionPoolCreated: Promise<ConnectionPoolCreatedEvent[]>;
        let connectionPoolCreated: ConnectionPoolCreatedEvent;
        const options = {
          waitQueueTimeoutMS: 2000,
          maxIdleTimeMS: 1,
          maxConnecting: 3,
          minPoolSize: 1,
          maxPoolSize: 101
        };
        beforeEach(async function () {
          client = this.configuration.newClient({}, options);
          pConnectionPoolCreated = once(client, 'connectionPoolCreated');
          await client.connect();

          connectionPoolCreated = (await pConnectionPoolCreated)[0];
        });

        it('the options field only contains keys and values matching the non-default options', function () {
          expect(connectionPoolCreated).to.have.deep.property('options', options);
        });
      });
    });

    describe(
      'ConnectionCheckedInEvent',
      { requires: { mongodb: '>=4.4', topology: 'single' } },
      function () {
        let client: MongoClient;

        beforeEach(async function () {
          await configureFailPoint(this.configuration, {
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['insert'],
              blockConnection: true,
              blockTimeMS: 500
            }
          });

          client = this.configuration.newClient();
          await client.connect();
          await Promise.all(Array.from({ length: 100 }, () => client.db().command({ ping: 1 })));
        });

        afterEach(async function () {
          await clearFailPoint(this.configuration);
          await client.close();
        });

        describe('when a MongoClient is closed', function () {
          it(
            'a connection pool emits checked in events for closed connections',
            { requires: { mongodb: '>=4.4', topology: 'single' } },
            async () => {
              const connectionCheckedOutEvents: ConnectionCheckedOutEvent[] = [];
              client.on('connectionCheckedOut', event => connectionCheckedOutEvents.push(event));
              const connectionCheckedInEvents: ConnectionCheckedInEvent[] = [];
              client.on('connectionCheckedIn', event => connectionCheckedInEvents.push(event));

              const inserts = Promise.allSettled([
                client.db('test').collection('test').insertOne({ a: 1 }),
                client.db('test').collection('test').insertOne({ a: 1 }),
                client.db('test').collection('test').insertOne({ a: 1 })
              ]);

              // wait until all pings are pending on the server
              while (connectionCheckedOutEvents.length < 3) await sleep(1);

              const insertConnectionIds = connectionCheckedOutEvents.map(
                ({ address, connectionId }) => `${address} + ${connectionId}`
              );

              await client.close();

              const insertCheckIns = connectionCheckedInEvents.filter(({ address, connectionId }) =>
                insertConnectionIds.includes(`${address} + ${connectionId}`)
              );

              expect(insertCheckIns).to.have.lengthOf(3);

              await inserts;
            }
          );
        });
      }
    );
  });
});
