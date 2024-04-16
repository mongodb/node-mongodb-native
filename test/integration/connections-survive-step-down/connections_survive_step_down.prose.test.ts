import { expect } from 'chai';

import {
  type Collection,
  type ConnectionPoolClearedEvent,
  type FindCursor,
  type MongoClient,
  MONGODB_ERROR_CODES,
  MongoServerError,
  ReadPreference
} from '../../mongodb';
import { type FailPoint } from '../../tools/utils';

describe('Connections Survive Primary Step Down - prose', function () {
  let client: MongoClient;
  let collection: Collection;
  let poolClearedEvents: ConnectionPoolClearedEvent[];

  afterEach(() => client.close());

  afterEach(async function () {
    const utilClient = this.configuration.newClient();
    await utilClient.db('admin').command({ configureFailPoint: 'failCommand', mode: 'off' });
    await utilClient.close();
    poolClearedEvents = [];
  });

  beforeEach(async function () {
    // For each test, make sure the following steps have been completed before running the actual test:

    // - Create a ``MongoClient`` with ``retryWrites=false``
    client = this.configuration.newClient({ retryWrites: false, heartbeatFrequencyMS: 500 });
    // - Create a collection object from the ``MongoClient``, using ``step-down`` for the database and collection name.
    collection = client.db('step-down').collection('step-down');
    // - Drop the test collection, using ``writeConcern`` "majority".
    await collection.drop({ writeConcern: { w: 'majority' } }).catch(() => null);
    // - Execute the "create" command to recreate the collection, using writeConcern: "majority".
    collection = await client
      .db('step-down')
      .createCollection('step-down', { writeConcern: { w: 'majority' } });

    poolClearedEvents = [];
    client.on('connectionPoolCleared', poolClearEvent => poolClearedEvents.push(poolClearEvent));
  });

  context('getMore Iteration', { requires: { mongodb: '>4.2', topology: ['replicaset'] } }, () => {
    // This test requires a replica set with server version 4.2 or higher.

    let cursor: FindCursor;
    afterEach(() => cursor.close());

    it('survives after primary step down', async () => {
      // - Insert 5 documents into a collection with a majority write concern.
      await collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }], {
        writeConcern: { w: 'majority' }
      });
      // - Start a find operation on the collection with a batch size of 2, and retrieve the first batch of results.
      cursor = collection.find({}, { batchSize: 2 });
      expect(await cursor.next()).to.have.property('a', 1);
      expect(await cursor.next()).to.have.property('a', 2);
      // - Send a `{replSetFreeze: 0}` command to any secondary and verify that the command succeeded.
      // This command will unfreeze (because it is set to zero) the secondary and ensure that it will be eligible to be elected immediately.
      await client
        .db('admin')
        .command({ replSetFreeze: 0 }, { readPreference: ReadPreference.secondary });
      // - Send a ``{replSetStepDown: 30, force: true}`` command to the current primary and verify that the command succeeded.
      await client.db('admin').command({ replSetStepDown: 5, force: true });
      // - Retrieve the next batch of results from the cursor obtained in the find operation, and verify that this operation succeeded.
      expect(await cursor.next()).to.have.property('a', 3);
      // - If the driver implements the `CMAP`_ specification, verify that no new `PoolClearedEvent`_ has been
      //   published. Otherwise verify that `connections.totalCreated`_ in `serverStatus`_ has not changed.
      expect(poolClearedEvents).to.be.empty;

      // Referenced python's implementation. Changes from spec:
      //   replSetStepDown: 5 instead of 30
      //   Run these inserts to clear NotWritablePrimary issue
      //   Create client with heartbeatFrequencyMS=500 instead of default of 10_000

      // Attempt insertion to mark server description as stale and prevent a
      // NotPrimaryError on the subsequent operation.
      const error = await collection.insertOne({ a: 6 }).catch(error => error);
      expect(error)
        .to.be.instanceOf(MongoServerError)
        .to.have.property('code', MONGODB_ERROR_CODES.NotWritablePrimary);

      // Next insert should succeed on the new primary without clearing pool.
      await collection.insertOne({ a: 7 });

      expect(poolClearedEvents).to.be.empty;
    });
  });

  context(
    'Not Primary - Keep Connection Pool',
    { requires: { mongodb: '>4.2', topology: ['replicaset'] } },
    () => {
      // This test requires a replica set with server version 4.2 or higher.

      // - Set the following fail point: ``{configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 10107}}``
      const failPoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: { failCommands: ['insert'], errorCode: 10107 }
      };

      it('survives after primary step down', async () => {
        await client.db('admin').command(failPoint);
        // - Execute an insert into the test collection of a ``{test: 1}`` document.
        const error = await collection.insertOne({ test: 1 }).catch(error => error);
        // - Verify that the insert failed with an operation failure with 10107 code.
        expect(error).to.be.instanceOf(MongoServerError).and.has.property('code', 10107);
        // - Execute an insert into the test collection of a ``{test: 1}`` document and verify that it succeeds.
        await collection.insertOne({ test: 1 });
        // - If the driver implements the `CMAP`_ specification, verify that no new `PoolClearedEvent`_ has been
        //   published. Otherwise verify that `connections.totalCreated`_ in `serverStatus`_ has not changed.
        expect(poolClearedEvents).to.be.empty;
      });
    }
  );

  context(
    'Not Primary - Reset Connection Pool',
    { requires: { mongodb: '>=4.0.0 <4.2.0', topology: ['replicaset'] } },
    () => {
      // This test requires a replica set with server version 4.0.

      // - Set the following fail point: ``{configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 10107}}``
      const failPoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: { failCommands: ['insert'], errorCode: 10107 }
      };

      it('survives after primary step down', async () => {
        await client.db('admin').command(failPoint);
        // - Execute an insert into the test collection of a ``{test: 1}`` document.
        const error = await collection.insertOne({ test: 1 }).catch(error => error);
        // - Verify that the insert failed with an operation failure with 10107 code.
        expect(error).to.be.instanceOf(MongoServerError).and.has.property('code', 10107);
        // - If the driver implements the `CMAP`_ specification, verify that a `PoolClearedEvent`_ has been published
        expect(poolClearedEvents).to.have.lengthOf(1);
        // - Execute an insert into the test collection of a ``{test: 1}`` document and verify that it succeeds.
        await collection.insertOne({ test: 1 });
        // - If the driver does NOT implement the `CMAP`_ specification, use the `serverStatus`_ command to verify `connections.totalCreated`_ has increased by 1.
      });
    }
  );

  context(
    'Shutdown in progress - Reset Connection Pool',
    { requires: { mongodb: '>=4.0', topology: ['replicaset'] } },
    () => {
      // This test should be run on all server versions >= 4.0.

      // - Set the following fail point: ``{configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 91}}``
      const failPoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: { failCommands: ['insert'], errorCode: 91 }
      };

      it('survives after primary step down', async () => {
        await client.db('admin').command(failPoint);
        // - Execute an insert into the test collection of a ``{test: 1}`` document.
        const error = await collection.insertOne({ test: 1 }).catch(error => error);
        // - Verify that the insert failed with an operation failure with 91 code.
        expect(error).to.be.instanceOf(MongoServerError).and.has.property('code', 91);
        // - If the driver implements the `CMAP`_ specification, verify that a `PoolClearedEvent`_ has been published
        expect(poolClearedEvents).to.have.lengthOf(1);
        // - Execute an insert into the test collection of a ``{test: 1}`` document and verify that it succeeds.
        await collection.insertOne({ test: 1 });
        // - If the driver does NOT implement the `CMAP`_ specification, use the `serverStatus`_ command to verify `connections.totalCreated`_ has increased by 1.
      });
    }
  );

  context(
    'Interrupted at shutdown - Reset Connection Pool',
    { requires: { mongodb: '>=4.0', topology: ['replicaset'] } },
    () => {
      // This test should be run on all server versions >= 4.0.

      // - Set the following fail point: ``{configureFailPoint: "failCommand", mode: {times: 1}, data: {failCommands: ["insert"], errorCode: 11600}}``
      const failPoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: { failCommands: ['insert'], errorCode: 11600 }
      };

      it('survives after primary step down', async () => {
        await client.db('admin').command(failPoint);
        // - Execute an insert into the test collection of a ``{test: 1}`` document.
        const error = await collection.insertOne({ test: 1 }).catch(error => error);
        // - Verify that the insert failed with an operation failure with 11600 code.
        expect(error).to.be.instanceOf(MongoServerError).and.has.property('code', 11600);
        // - If the driver implements the `CMAP`_ specification, verify that a `PoolClearedEvent`_ has been published
        expect(poolClearedEvents).to.have.lengthOf(1);
        // - Execute an insert into the test collection of a ``{test: 1}`` document and verify that it succeeds.
        await collection.insertOne({ test: 1 });
        // - If the driver does NOT implement the `CMAP`_ specification, use the `serverStatus`_ command to verify `connections.totalCreated`_ has increased by 1.
      });
    }
  );
});
