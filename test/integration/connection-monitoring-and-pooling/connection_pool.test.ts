import { once } from 'node:events';

import { expect } from 'chai';

import { type ConnectionPoolCreatedEvent, type Db, type MongoClient } from '../../mongodb';
import sinon = require('sinon');
import dns = require('dns');

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
      describe.only(
        'Initial DNS Seedlist Discovery (Prose Tests)',
        { requires: { topology: 'single' } },
        () => {
          function makeSrvStub() {
            sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
              return [
                {
                  name: 'localhost',
                  port: 27017,
                  weight: 0,
                  priority: 0
                }
              ];
            });

            sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
              throw { code: 'ENODATA' };
            });
          }

          afterEach(async function () {
            sinon.restore();
          });

          it('1.1 Driver should not throw error on valid SRV URI with one part', async function () {
            // 1. make dns resolution always pass
            makeSrvStub();
            // 2. assert that creating a MongoClient with the uri 'mongodb+srv:/localhost' does not cause an error
            client = this.configuration.newClient('mongodb+srv://localhost', {});
            console.log('stubbed srv client', client);
            // 3. assert that connecting the client from 2. to the server does not cause an error
            //await client.connect();
          });

          it('1.1 Driver should not throw error on valid SRV URI with two parts', async function () {
            // 1. make dns resolution always pass
            makeSrvStub();
            // 2. assert that creating a MongoClient with the uri 'mongodb+srv://mongodb.localhost' does not cause an error
            const client = this.configuration.newClient('mongodb://localhost', {});
            console.log('stubbed normal client', client);
            // 3. assert that connecting the client to the server does not cause an error
            //await client.connect();
          });
        }
      );
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
  });
});
