import { expect } from 'chai';
import { setTimeout } from 'timers/promises';

import {
  type CommandStartedEvent,
  type Connection,
  type ConnectionPool,
  type MongoClient,
  MongoOperationTimeoutError,
  now,
  TimeoutContext
} from '../../mongodb';
import {
  clearFailPoint,
  configureFailPoint,
  makeMultiBatchWrite,
  makeMultiResponseBatchModelArray
} from '../../tools/utils';
import { filterForCommands } from '../shared';

const metadata: MongoDBMetadataUI = {
  requires: {
    mongodb: '>=8.0',
    serverless: 'forbid'
  }
};

describe('Client Bulk Write', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
    await clearFailPoint(this.configuration);
  });

  describe('CSOT enabled', function () {
    describe('when timeoutMS is set on the client', function () {
      beforeEach(async function () {
        client = this.configuration.newClient({}, { timeoutMS: 300 });
        await client.connect();
        await configureFailPoint(this.configuration, {
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: { blockConnection: true, blockTimeMS: 1000, failCommands: ['bulkWrite'] }
        });
      });

      it('timeoutMS is used as the timeout for the bulk write', metadata, async function () {
        const start = now();
        const timeoutError = await client
          .bulkWrite([
            {
              name: 'insertOne',
              namespace: 'foo.bar',
              document: { age: 10 }
            }
          ])
          .catch(e => e);
        const end = now();
        expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
        expect(end - start).to.be.within(300 - 100, 300 + 100);
      });
    });

    describe('when timeoutMS is set on the bulkWrite operation', function () {
      beforeEach(async function () {
        client = this.configuration.newClient({});

        await client.connect();

        await configureFailPoint(this.configuration, {
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: { blockConnection: true, blockTimeMS: 1000, failCommands: ['bulkWrite'] }
        });
      });

      it('timeoutMS is used as the timeout for the bulk write', metadata, async function () {
        const start = now();
        const timeoutError = await client
          .bulkWrite(
            [
              {
                name: 'insertOne',
                namespace: 'foo.bar',
                document: { age: 10 }
              }
            ],
            { timeoutMS: 300 }
          )
          .catch(e => e);
        const end = now();
        expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
        expect(end - start).to.be.within(300 - 100, 300 + 100);
      });
    });

    describe('when timeoutMS is set on both the client and operation options', function () {
      beforeEach(async function () {
        client = this.configuration.newClient({}, { timeoutMS: 1500 });

        await client.connect();

        await configureFailPoint(this.configuration, {
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: { blockConnection: true, blockTimeMS: 1000, failCommands: ['bulkWrite'] }
        });
      });

      it('bulk write options take precedence over the client options', metadata, async function () {
        const start = now();
        const timeoutError = await client
          .bulkWrite(
            [
              {
                name: 'insertOne',
                namespace: 'foo.bar',
                document: { age: 10 }
              }
            ],
            { timeoutMS: 300 }
          )
          .catch(e => e);
        const end = now();
        expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
        expect(end - start).to.be.within(300 - 100, 300 + 100);
      });
    });

    describe(
      'unacknowledged writes',
      {
        requires: {
          mongodb: '>=8.0',
          topology: 'single'
        }
      },
      function () {
        let connection: Connection;
        let pool: ConnectionPool;

        beforeEach(async function () {
          client = this.configuration.newClient({}, { maxPoolSize: 1, waitQueueTimeoutMS: 2000 });

          await client.connect();

          pool = Array.from(client.topology.s.servers.values())[0].pool;
          connection = await pool.checkOut({
            timeoutContext: TimeoutContext.create({
              serverSelectionTimeoutMS: 30000,
              waitQueueTimeoutMS: 1000
            })
          });
        });

        afterEach(async function () {
          pool = Array.from(client.topology.s.servers.values())[0].pool;
          pool.checkIn(connection);
          await client.close();
        });

        it('a single batch bulk write does not take longer than timeoutMS', async function () {
          const start = now();
          let end;
          const timeoutError = client
            .bulkWrite(
              [
                {
                  name: 'insertOne',
                  namespace: 'foo.bar',
                  document: { age: 10 }
                }
              ],
              { timeoutMS: 200, writeConcern: { w: 0 }, ordered: false }
            )
            .catch(e => e)
            .then(e => {
              end = now();
              return e;
            });

          await setTimeout(250);

          expect(await timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
          expect(end - start).to.be.within(200 - 100, 200 + 100);
        });

        it(
          'timeoutMS applies to all batches',
          {
            requires: {
              mongodb: '>=8.0',
              topology: 'single'
            }
          },
          async function () {
            const models = await makeMultiBatchWrite(this.configuration);
            const start = now();
            let end;
            const timeoutError = client
              .bulkWrite(models, {
                timeoutMS: 400,
                writeConcern: { w: 0 },
                ordered: false
              })
              .catch(e => e)
              .then(r => {
                end = now();
                return r;
              });

            await setTimeout(210);

            pool.checkIn(connection);
            connection = await pool.checkOut({
              timeoutContext: TimeoutContext.create({
                serverSelectionTimeoutMS: 30000,
                waitQueueTimeoutMS: 1000
              })
            });

            await setTimeout(210);

            expect(await timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
            expect(end - start).to.be.within(400 - 100, 400 + 100);
          }
        );
      }
    );

    describe('acknowledged writes', metadata, function () {
      describe('when a bulk write command times out', function () {
        beforeEach(async function () {
          client = this.configuration.newClient({}, { timeoutMS: 1500 });

          await client.connect();

          await configureFailPoint(this.configuration, {
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { blockConnection: true, blockTimeMS: 1000, failCommands: ['bulkWrite'] }
          });
        });

        it('the operation times out', metadata, async function () {
          const start = now();
          const timeoutError = await client
            .bulkWrite(
              [
                {
                  name: 'insertOne',
                  namespace: 'foo.bar',
                  document: { age: 10 }
                }
              ],
              { timeoutMS: 300 }
            )
            .catch(e => e);
          const end = now();
          expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
          expect(end - start).to.be.within(300 - 100, 300 + 100);
        });
      });

      describe('when the timeout is reached while iterating the result cursor', function () {
        const commands: CommandStartedEvent[] = [];

        beforeEach(async function () {
          client = this.configuration.newClient({}, { monitorCommands: true, minPoolSize: 5 });
          client.on('commandStarted', filterForCommands(['getMore'], commands));
          await client.connect();

          await configureFailPoint(this.configuration, {
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { blockConnection: true, blockTimeMS: 1400, failCommands: ['getMore'] }
          });
        });

        it('the bulk write operation times out', metadata, async function () {
          const models = await makeMultiResponseBatchModelArray(this.configuration);
          const start = now();
          const timeoutError = await client
            .bulkWrite(models, {
              verboseResults: true,
              timeoutMS: 1500
            })
            .catch(e => e);

          const end = now();
          expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);

          // DRIVERS-3005 - killCursors causes cursor cleanup to extend past timeoutMS.
          // The amount of time killCursors takes is wildly variable and can take up to almost
          // 600-700ms sometimes.
          expect(end - start).to.be.within(1500, 1500 + 800);
          expect(commands).to.have.lengthOf(1);
        });
      });

      describe('if the cursor encounters an error and a killCursors is sent', function () {
        const commands: CommandStartedEvent[] = [];

        beforeEach(async function () {
          client = this.configuration.newClient({}, { monitorCommands: true });

          client.on('commandStarted', filterForCommands(['killCursors'], commands));
          await client.connect();

          await configureFailPoint(this.configuration, {
            configureFailPoint: 'failCommand',
            mode: { times: 2 },
            data: {
              blockConnection: true,
              blockTimeMS: 3000,
              failCommands: ['getMore', 'killCursors']
            }
          });
        });

        it(
          'timeoutMS is refreshed to the timeoutMS passed to the bulk write for the killCursors command',
          metadata,
          async function () {
            const models = await makeMultiResponseBatchModelArray(this.configuration);
            const timeoutError = await client
              .bulkWrite(models, { ordered: true, timeoutMS: 2800, verboseResults: true })
              .catch(e => e);

            expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);

            const [
              {
                command: { maxTimeMS }
              }
            ] = commands;
            expect(maxTimeMS).to.be.greaterThan(1000);
          }
        );
      });

      describe('when the bulk write is executed in multiple batches', function () {
        const commands: CommandStartedEvent[] = [];

        beforeEach(async function () {
          client = this.configuration.newClient({}, { monitorCommands: true });

          client.on('commandStarted', filterForCommands('bulkWrite', commands));
          await client.connect();

          await configureFailPoint(this.configuration, {
            configureFailPoint: 'failCommand',
            mode: { times: 2 },
            data: { blockConnection: true, blockTimeMS: 1010, failCommands: ['bulkWrite'] }
          });
        });

        it(
          'timeoutMS applies to the duration of all batches',
          {
            requires: {
              ...metadata.requires,
              topology: 'single'
            }
          },
          async function () {
            const models = await makeMultiBatchWrite(this.configuration);
            const start = now();
            const timeoutError = await client
              .bulkWrite(models, {
                timeoutMS: 2000
              })
              .catch(e => e);

            const end = now();
            expect(timeoutError).to.be.instanceOf(MongoOperationTimeoutError);
            expect(end - start).to.be.within(2000 - 100, 2000 + 100);
            expect(commands.length, 'Test must execute two batches.').to.equal(2);
          }
        );
      });
    });
  });
});
