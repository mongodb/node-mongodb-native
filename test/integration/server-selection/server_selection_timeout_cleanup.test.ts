import { expect } from 'chai';
import * as process from 'process';
import { setTimeout } from 'timers/promises';

import { type Collection, type MongoClient } from '../../mongodb';

describe.only('server selection timeout cleanup', function () {
  let client: MongoClient;
  let collection: Collection;
  let utilClients: MongoClient[];

  describe(
    'timeout cleanup on retries',
    { requires: { topology: 'sharded', mongodb: '>=4.4' } },
    function () {
      beforeEach(async function () {
        client = this.configuration.newClient({ serverSelectionTimeoutMS: 500, retryWrites: true });
        await client.connect();

        collection = client.db('server_selection').collection('timeout_cleanup');

        // we need to configure failpoint for every mongos as we don't know where the session will be pinned to
        const seeds = client.topology.s.seedlist.map(address => address.toString());
        for (const seed of seeds) {
          const c = this.configuration.newClient(`mongodb://${seed}`, {
            directConnection: true
          });
          await c.connect();
          await c.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: {
              failCommands: ['insert'],
              errorCode: 6,
              errorsLabels: ['RetryableWriteError'],
              closeConnection: false
            }
          });
          utilClients.push(c);
        }
      });

      afterEach(async function () {
        for (const c of utilClients) {
          await c.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: 'off',
            data: {
              failCommands: ['insert'],
              errorCode: 6,
              errorsLabels: ['RetryableWriteError'],
              closeConnection: false
            }
          });
          await c.close();
        }
        await client.close();
      });

      it('does not leak timeout when retrying inside a sharded transaction', async function () {
        const unhandlerRejections = [];
        const handler = reason => unhandlerRejections.push(reason);
        process.on('unhandledRejection', handler);

        try {
          const session = client.startSession();
          try {
            session.startTransaction();
            await collection.find({}, { session }).toArray();
            await collection.insertOne({ foo: 'bar' }, { session });
            await session.commitTransaction();
          } finally {
            await session.endSession();
          }
          await setTimeout(1000);
          expect(unhandlerRejections.length).to.have.lengthOf(0);
        } finally {
          process.removeListener('unhandledRejection', handler);
        }
      });
    }
  );
});
