import { once } from 'node:events';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type ConnectionPoolCreatedEvent,
  type Db,
  type MongoClient,
  type Server
} from '../../../src';
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

    const metadata: MongoDBMetadataUI = { requires: { mongodb: '>=4.4', topology: 'single' } };

    describe('ConnectionCheckedInEvent', metadata, function () {
      let client: MongoClient;

      beforeEach(async function () {
        if (!this.configuration.filters.MongoDBVersionFilter.filter({ metadata })) {
          return;
        }
        if (!this.configuration.filters.MongoDBTopologyFilter.filter({ metadata })) {
          return;
        }

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
        if (this.configuration.filters.MongoDBVersionFilter.filter({ metadata })) {
          await clearFailPoint(this.configuration);
        }
        await client.close();
      });

      describe('when a MongoClient is closed', function () {
        it(
          'a connection pool emits checked in events for closed connections',
          metadata,
          async () => {
            const allClientEvents = [];
            const pushToClientEvents = e => allClientEvents.push(e);

            client
              .on('connectionCheckedOut', pushToClientEvents)
              .on('connectionCheckedIn', pushToClientEvents)
              .on('connectionClosed', pushToClientEvents);

            const inserts = Promise.allSettled([
              client.db('test').collection('test').insertOne({ a: 1 }),
              client.db('test').collection('test').insertOne({ a: 1 }),
              client.db('test').collection('test').insertOne({ a: 1 })
            ]);

            // wait until all pings are pending on the server
            while (allClientEvents.filter(e => e.name === 'connectionCheckedOut').length < 3) {
              await sleep(1);
            }

            const insertConnectionIds = allClientEvents
              .filter(e => e.name === 'connectionCheckedOut')
              .map(({ address, connectionId }) => `${address} + ${connectionId}`);

            await client.close();

            const insertCheckInAndCloses = allClientEvents
              .filter(e => e.name === 'connectionCheckedIn' || e.name === 'connectionClosed')
              .filter(({ address, connectionId }) =>
                insertConnectionIds.includes(`${address} + ${connectionId}`)
              );

            expect(insertCheckInAndCloses).to.have.lengthOf(6);

            // check that each check-in is followed by a close (not proceeded by one)
            expect(insertCheckInAndCloses.map(e => e.name)).to.deep.equal(
              Array.from({ length: 3 }, () => ['connectionCheckedIn', 'connectionClosed']).flat(1)
            );

            await inserts;
          }
        );
      });
    });
  });

  describe(
    'background task cleans up connections when minPoolSize=0',
    { requires: { topology: 'single' } },
    function () {
      let server: Server;
      let ensureMinPoolSizeSpy: sinon.SinonSpy;

      beforeEach(async function () {
        client = this.configuration.newClient(
          {},
          {
            maxConnecting: 10,
            minPoolSize: 0,
            maxIdleTimeMS: 100
          }
        );

        await client.connect();

        await Promise.all(
          Array.from({ length: 10 }).map(() => {
            return client.db('foo').collection('bar').insertOne({ a: 1 });
          })
        );

        server = Array.from(client.topology.s.servers.entries())[0][1];
        expect(
          server.pool.availableConnectionCount,
          'pool was not filled with connections'
        ).to.be.greaterThan(0);

        ensureMinPoolSizeSpy = sinon.spy(server.pool, 'ensureMinPoolSize');
      });

      it(
        'prunes idle connections when minPoolSize=0',
        { requires: { topology: 'single' } },
        async function () {
          await sleep(500);
          expect(server.pool.availableConnectionCount).to.equal(0);

          expect(ensureMinPoolSizeSpy).to.have.been.called;
        }
      );
    }
  );
});
